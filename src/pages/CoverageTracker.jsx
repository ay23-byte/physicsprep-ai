
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  RefreshCw,
  Search,
  Target,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
} from "lucide-react";
import "./CoverageTracker.css";

const API_URL = "http://localhost:3001/api/questions";
const DEFAULT_TARGET = 50;

function getTopic(question) {
  const value =
    question.topic ??
    question.subject ??
    question.chapter ??
    question.unit ??
    "";

  return String(value).trim() || "Uncategorized";
}

function StatCard({ title, value, subtitle, icon: Icon }) {
  return (
    <article className="coverage-card">
      <div className="coverage-stat-title">{title}</div>
      <div className="coverage-stat-value">{value}</div>
      <p className="coverage-muted">{subtitle}</p>
      <div style={{ marginTop: 14, color: "#635bdb" }}>
        <Icon size={22} aria-hidden="true" />
      </div>
    </article>
  );
}

export default function CoverageTracker() {
  const [questions, setQuestions] = useState([]);
  const [targets, setTargets] = useState({});
  const [search, setSearch] = useState("");
  const [coverageFilter, setCoverageFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(API_URL);

      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}.`);
      }

      const data = await response.json();

      const rows = Array.isArray(data)
        ? data
        : Array.isArray(data.questions)
          ? data.questions
          : Array.isArray(data.data)
            ? data.data
            : null;

      if (!rows) {
        throw new Error(
          "Unexpected API response. Expected a list of questions."
        );
      }

      setQuestions(rows);
      setLastUpdated(new Date());
    } catch (err) {
      setError(
        err.message ||
          "Could not load questions. Check whether your backend is running."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  const topicStats = useMemo(() => {
    const groups = new Map();

    questions.forEach((question) => {
      const topic = getTopic(question);

      if (!groups.has(topic)) {
        groups.set(topic, {
          topic,
          total: 0,
          approved: 0,
          pending: 0,
          rejected: 0,
        });
      }

      const group = groups.get(topic);
      group.total += 1;

      const status = String(
        question.reviewStatus ?? question.status ?? "pending"
      )
        .trim()
        .toLowerCase();

      if (status === "approved") {
        group.approved += 1;
      } else if (status === "rejected") {
        group.rejected += 1;
      } else {
        group.pending += 1;
      }
    });

    return Array.from(groups.values())
      .map((group) => {
        const savedTarget = targets[group.topic];
        const target =
          savedTarget === undefined || savedTarget === ""
            ? DEFAULT_TARGET
            : Number(savedTarget);

        const safeTarget =
          Number.isFinite(target) && target >= 1 ? target : DEFAULT_TARGET;

        const percentage = Math.min(
          100,
          Math.round((group.total / safeTarget) * 100)
        );

        return {
          ...group,
          target: safeTarget,
          percentage,
          remaining: Math.max(0, safeTarget - group.total),
          complete: group.total >= safeTarget,
        };
      })
      .sort((a, b) => a.topic.localeCompare(b.topic));
  }, [questions, targets]);

  const totalQuestions = questions.length;
  const totalTopics = topicStats.length;

  const completedTopics = topicStats.filter(
    (topic) => topic.complete
  ).length;

  const overallTarget = topicStats.reduce(
    (sum, topic) => sum + topic.target,
    0
  );

  const overallProgress =
    overallTarget > 0
      ? Math.min(
          100,
          Math.round((totalQuestions / overallTarget) * 100)
        )
      : 0;

  const filteredTopics = topicStats.filter((topic) => {
    const matchesSearch = topic.topic
      .toLowerCase()
      .includes(search.toLowerCase().trim());

    const matchesFilter =
      coverageFilter === "all" ||
      (coverageFilter === "complete" && topic.complete) ||
      (coverageFilter === "incomplete" && !topic.complete);

    return matchesSearch && matchesFilter;
  });

  function updateTarget(topic, value) {
    if (value === "") {
      setTargets((previous) => ({
        ...previous,
        [topic]: "",
      }));
      return;
    }

    const parsed = Number(value);

    if (
      !Number.isInteger(parsed) ||
      parsed < 1 ||
      parsed > 100000
    ) {
      return;
    }

    setTargets((previous) => ({
      ...previous,
      [topic]: parsed,
    }));
  }

  function resetTargets() {
    setTargets({});
  }

  return (
    <main className="coverage-page">
      <header className="coverage-header">
        <div>
          <h1>
            <Target
              size={27}
              style={{
                display: "inline",
                verticalAlign: "middle",
                marginRight: 10,
                color: "#635bdb",
              }}
            />
            Topic Coverage Tracker
          </h1>
          <p className="coverage-muted">
            Track your question bank against your topic-wise targets.
          </p>
        </div>

        <button
          type="button"
          className="coverage-button"
          onClick={fetchQuestions}
          disabled={loading}
        >
          <RefreshCw
            size={16}
            className={loading ? "coverage-spin" : ""}
          />
          {loading ? "Refreshing..." : "Refresh Questions"}
        </button>
      </header>

      {error && (
        <div className="coverage-error" role="alert">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontWeight: 700,
            }}
          >
            <AlertCircle size={19} />
            Unable to load questions
          </div>
          <p style={{ marginBottom: 0 }}>{error}</p>
          <p style={{ marginBottom: 0 }}>
            Check that the backend is running at localhost:3001.
          </p>
          <button
            type="button"
            className="coverage-button"
            style={{ marginTop: 12 }}
            onClick={fetchQuestions}
          >
            Try again
          </button>
        </div>
      )}

      <section className="coverage-stats">
        <StatCard
          title="Total Questions"
          value={totalQuestions}
          subtitle="Questions currently loaded"
          icon={BookOpen}
        />

        <StatCard
          title="Topics Found"
          value={totalTopics}
          subtitle="Topics represented in your data"
          icon={Target}
        />

        <StatCard
          title="Targets Reached"
          value={`${completedTopics} / ${totalTopics}`}
          subtitle="Topics at or above their target"
          icon={CheckCircle2}
        />

        <StatCard
          title="Overall Progress"
          value={`${overallProgress}%`}
          subtitle="Questions compared with combined targets"
          icon={TrendingUp}
        />
      </section>

      <section className="coverage-panel">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 20,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h2>Overall Question Coverage</h2>
            <p className="coverage-muted">
              {totalQuestions} questions out of a combined target of{" "}
              {overallTarget}.
            </p>
          </div>

          <strong
            style={{
              fontSize: 25,
              color: "#635bdb",
            }}
          >
            {overallProgress}%
          </strong>
        </div>

        <div
          className="coverage-progress-track"
          role="progressbar"
          aria-label="Overall question coverage"
          aria-valuenow={overallProgress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="coverage-progress-fill"
            style={{ width: `${overallProgress}%` }}
          />
        </div>

        <p className="coverage-muted">
          Overall progress is capped at 100%. Individual topic counts may
          exceed their targets.
        </p>
      </section>

      <section className="coverage-panel">
        <div className="coverage-filters">
          <div style={{ position: "relative" }}>
            <Search
              size={17}
              style={{
                position: "absolute",
                left: 13,
                top: "50%",
                transform: "translateY(-50%)",
                color: "#94a3b8",
                pointerEvents: "none",
              }}
            />
            <input
              className="coverage-input"
              style={{ paddingLeft: 40 }}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search topics..."
              aria-label="Search topics"
            />
          </div>

          <select
            className="coverage-select"
            value={coverageFilter}
            onChange={(event) => setCoverageFilter(event.target.value)}
            aria-label="Filter topics by coverage"
          >
            <option value="all">All topics</option>
            <option value="complete">Target reached</option>
            <option value="incomplete">Needs more questions</option>
          </select>
        </div>
      </section>

      <section className="coverage-panel" style={{ padding: 0 }}>
        <div style={{ padding: "23px 24px" }}>
          <h2>Coverage by Topic</h2>
          <p className="coverage-muted">
            Set targets and monitor question counts and review status.
          </p>
        </div>

        {loading && questions.length === 0 ? (
          <div className="coverage-empty">
            Loading your question bank...
          </div>
        ) : filteredTopics.length === 0 ? (
          <div className="coverage-empty">
            <BookOpen
              size={38}
              style={{ margin: "0 auto 12px", opacity: 0.5 }}
            />
            <h2>No topics found</h2>
            <p>
              {questions.length === 0
                ? "Generate or import questions first. Topics are created from existing question data."
                : "Try changing your search or filter."}
            </p>
          </div>
        ) : (
          <>
            <div className="coverage-table-wrap">
              <table className="coverage-table">
                <thead>
                  <tr>
                    <th>Topic</th>
                    <th>Questions</th>
                    <th>Target</th>
                    <th>Progress</th>
                    <th>Remaining</th>
                    <th>Review Status</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredTopics.map((topic) => (
                    <tr key={topic.topic}>
                      <td>
                        <strong>{topic.topic}</strong>
                      </td>

                      <td>
                        <strong>{topic.total}</strong>
                      </td>

                      <td>
                        <input
                          className="coverage-input"
                          type="number"
                          min="1"
                          max="100000"
                          step="1"
                          value={
                            targets[topic.topic] === ""
                              ? ""
                              : topic.target
                          }
                          onChange={(event) =>
                            updateTarget(topic.topic, event.target.value)
                          }
                          onBlur={() => {
                            if (targets[topic.topic] === "") {
                              setTargets((previous) => ({
                                ...previous,
                                [topic.topic]: DEFAULT_TARGET,
                              }));
                            }
                          }}
                          aria-label={`Target for ${topic.topic}`}
                        />
                      </td>

                      <td style={{ minWidth: 150 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                          }}
                        >
                          <div
                            className="coverage-progress-track"
                            style={{
                              width: 85,
                              height: 7,
                              marginTop: 0,
                            }}
                          >
                            <div
                              className="coverage-progress-fill"
                              style={{
                                width: `${topic.percentage}%`,
                                background: topic.complete
                                  ? "#16a34a"
                                  : "#635bdb",
                              }}
                            />
                          </div>
                          <strong>{topic.percentage}%</strong>
                        </div>
                      </td>

                      <td>
                        <strong
                          style={{
                            color: topic.remaining === 0
                              ? "#15803d"
                              : "#b7791f",
                          }}
                        >
                          {topic.remaining === 0
                            ? "Target reached"
                            : `${topic.remaining} left`}
                        </strong>
                      </td>

                      <td>
                        <span className="coverage-status status-approved">
                          {topic.approved} approved
                        </span>
                        <span className="coverage-status status-pending">
                          {topic.pending} pending
                        </span>
                        {topic.rejected > 0 && (
                          <span className="coverage-status status-rejected">
                            {topic.rejected} rejected
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div
              className="coverage-footer"
              style={{
                borderTop: "1px solid #edf0f4",
                padding: "17px 22px",
              }}
            >
              <span>
                Showing {filteredTopics.length} of {totalTopics} topics
              </span>

              <button
                type="button"
                className="coverage-button"
                onClick={resetTargets}
              >
                Reset targets to {DEFAULT_TARGET}
              </button>
            </div>
          </>
        )}
      </section>

      {lastUpdated && (
        <p
          className="coverage-muted"
          style={{ textAlign: "right", fontSize: 12 }}
        >
          Last refreshed: {lastUpdated.toLocaleTimeString()}
        </p>
      )}
    </main>
  );
}
