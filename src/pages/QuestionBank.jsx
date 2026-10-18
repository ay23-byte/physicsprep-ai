
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Search,
  RefreshCw,
  LoaderCircle,
  BookOpen,
  Filter,
  Pencil,
  CheckCircle2,
  Clock3,
  XCircle,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  FileText,
  ShieldCheck,
  CircleHelp,
} from "lucide-react";

const API_URL = `${import.meta.env.VITE_API_BASE_URL || ""}/api/questions`;

const controlStyle = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid var(--border-color, #d1d5db)",
  borderRadius: 9,
  background: "var(--panel-bg, white)",
  color: "inherit",
  marginTop: 6,
  boxSizing: "border-box",
  font: "inherit",
  fontSize: 13,
};

const buttonStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
  padding: "9px 13px",
  border: "1px solid var(--border-color, #d1d5db)",
  borderRadius: 9,
  background: "var(--panel-bg, white)",
  color: "inherit",
  cursor: "pointer",
  font: "inherit",
  fontSize: 13,
  fontWeight: 500,
};

const mutedText = {
  fontSize: 12,
  color: "var(--muted-text, #6b7280)",
};

function text(value, fallback = "") {
  if (value == null || value === "") return fallback;

  if (typeof value === "object") {
    return String(
      value.text ?? value.value ?? value.label ?? JSON.stringify(value)
    );
  }

  return String(value);
}

function getQuestion(question) {
  return text(
    question.question ??
      question.questionText ??
      question.question_text,
    "Question text unavailable"
  );
}

function getTopic(question) {
  return text(question.topic, "Uncategorized");
}

function getDifficulty(question) {
  return text(question.difficulty, "Not specified");
}

function getType(question) {
  const raw = text(
    question.questionType ??
      question.question_type ??
      question.type,
    "Not specified"
  )
    .trim()
    .toUpperCase();

  if (raw === "MULTIPLE CHOICE") return "MCQ";
  if (raw === "MULTIPLE SELECT") return "MSQ";
  if (raw === "NUMERICAL") return "NAT";

  return raw;
}

function getStatus(question) {
  const raw = text(
    question.reviewStatus ??
      question.review_status ??
      question.status,
    "pending"
  )
    .trim()
    .toLowerCase();

  if (raw === "accepted") return "approved";
  if (raw === "declined") return "rejected";

  return raw;
}

function getEvidenceStatus(question) {
  const raw = text(
    question.evidenceStatus ?? question.evidence_status,
    "missing"
  )
    .trim()
    .toLowerCase();

  if (raw === "partially verified" || raw === "partial") return "partial";
  if (raw === "not verified" || raw === "unverified") return "unverified";
  if (raw === "not recorded" || raw === "") return "missing";

  return raw;
}

function getDocumentId(question) {
  return text(question.documentId ?? question.document_id, "");
}

function getDocumentName(question) {
  return text(
    question.documentName ??
      question.document_name ??
      question.filename ??
      question.sourceName ??
      question.source_name,
    getDocumentId(question)
      ? `Document ${getDocumentId(question)}`
      : "General questions"
  );
}

function getOptions(question) {
  const options =
    question.options ??
    question.choices ??
    question.answerOptions ??
    question.answer_options;

  if (Array.isArray(options)) {
    return options.map((option, index) => {
      const letter = String.fromCharCode(65 + index);

      if (typeof option !== "object" || option === null) {
        return `${letter}. ${text(option)}`;
      }

      return `${text(option.label ?? option.key, letter)}. ${text(
        option.text ?? option.value ?? option.content
      )}`;
    });
  }

  if (options && typeof options === "object") {
    return Object.entries(options).map(
      ([key, value]) => `${key}. ${text(value)}`
    );
  }

  return [];
}

function getAnswer(question) {
  return text(
    question.answer ??
      question.correctAnswer ??
      question.correct_answer,
    "Not provided"
  );
}

function getExplanation(question) {
  return text(
    question.explanation ?? question.solution,
    "No explanation provided."
  );
}

function getYear(question) {
  return text(
    question.examYear ??
      question.exam_year ??
      question.year,
    "—"
  );
}

function getMarks(question) {
  return text(
    question.marks ??
      question.questionMarks ??
      question.question_marks,
    "—"
  );
}

function statusColor(status) {
  if (status === "approved") return "#15803d";
  if (status === "rejected") return "#b91c1c";
  return "#a16207";
}

function statusIcon(status) {
  if (status === "approved") return <CheckCircle2 size={15} />;
  if (status === "rejected") return <XCircle size={15} />;
  return <Clock3 size={15} />;
}

function statusLabel(status) {
  if (!status) return "Pending";
  return status.replace(/[_-]/g, " ");
}

function evidenceLabel(status) {
  const labels = {
    verified: "Verified",
    partial: "Partially verified",
    unverified: "Unverified",
    missing: "Missing",
  };

  return labels[status] ?? status;
}

function evidenceColor(status) {
  if (status === "verified") return "#15803d";
  if (status === "partial") return "#a16207";
  if (status === "unverified") return "#b45309";
  return "#6b7280";
}

function Badge({ children, color = "#64748b" }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "5px 9px",
        borderRadius: 7,
        border: `1px solid ${color}35`,
        background: `${color}0d`,
        color,
        fontSize: 11,
        fontWeight: 600,
        lineHeight: 1.4,
        maxWidth: "100%",
        overflowWrap: "anywhere",
      }}
    >
      {children}
    </span>
  );
}

function StatCard({ label, value, icon, color }) {
  return (
    <div
      className="panel"
      style={{
        padding: 18,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        gap: 15,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span style={{ ...mutedText, fontWeight: 500 }}>{label}</span>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 34,
            height: 34,
            borderRadius: 10,
            color,
            background: `${color}12`,
            flexShrink: 0,
          }}
        >
          {icon}
        </span>
      </div>
      <div style={{ fontSize: 27, fontWeight: 700, lineHeight: 1.1 }}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}

export default function QuestionBank({ onNavigate }) {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [topicFilter, setTopicFilter] = useState("all");
  const [difficultyFilter, setDifficultyFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [documentFilter, setDocumentFilter] = useState("all");
  const [evidenceFilter, setEvidenceFilter] = useState("all");

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [expandedId, setExpandedId] = useState(null);

  const loadQuestions = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(API_URL);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      const list = Array.isArray(data)
        ? data
        : Array.isArray(data.questions)
          ? data.questions
          : Array.isArray(data.data)
            ? data.data
            : null;

      if (!list) {
        throw new Error("The API did not return a questions array.");
      }

      setQuestions(list);
      setExpandedId(null);
    } catch (err) {
      console.error("Failed to load question bank:", err);

      setError(
        "Could not load questions. Check that your backend is running on port 3001, then try again."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Load the current question list when the page mounts.
    // This async loader updates state after its fetch completes.
    // eslint-disable-next-line react/set-state-in-effect
    loadQuestions();
  }, [loadQuestions]);

  const topics = useMemo(() => {
    return [
      ...new Set(
        questions
          .map((question) => text(question.topic).trim())
          .filter(Boolean)
      ),
    ].sort((a, b) => a.localeCompare(b));
  }, [questions]);

  const documents = useMemo(() => {
    const unique = new Map();

    questions.forEach((question) => {
      const id = getDocumentId(question);
      const name = getDocumentName(question);
      const key = id || name;

      if (!unique.has(key)) {
        unique.set(key, { id: key, name });
      }
    });

    return [...unique.values()].sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [questions]);

  const filteredQuestions = useMemo(() => {
    const query = search.trim().toLowerCase();

    return questions.filter((question) => {
      const questionText = getQuestion(question).toLowerCase();
      const topic = getTopic(question);
      const difficulty = getDifficulty(question).toLowerCase();
      const type = getType(question);
      const status = getStatus(question);
      const evidenceStatus = getEvidenceStatus(question);
      const documentId = getDocumentId(question);
      const documentKey = documentId || getDocumentName(question);

      const searchableText = [
        questionText,
        topic,
        getDocumentName(question),
        getAnswer(question),
        getExplanation(question),
        getYear(question),
        getMarks(question),
        getType(question),
        getDifficulty(question),
        getStatus(question),
        evidenceLabel(evidenceStatus),
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch =
        !query || searchableText.includes(query);

      const matchesTopic =
        topicFilter === "all" || topic === topicFilter;

      const matchesDifficulty =
        difficultyFilter === "all" ||
        difficulty === difficultyFilter.toLowerCase();

      const matchesType =
        typeFilter === "all" || type === typeFilter;

      const matchesStatus =
        statusFilter === "all" || status === statusFilter;

      const matchesDocument =
        documentFilter === "all" ||
        documentKey === documentFilter;

      const matchesEvidence =
        evidenceFilter === "all" ||
        evidenceStatus === evidenceFilter;

      return (
        matchesSearch &&
        matchesTopic &&
        matchesDifficulty &&
        matchesType &&
        matchesStatus &&
        matchesDocument &&
        matchesEvidence
      );
    });
  }, [
    questions,
    search,
    topicFilter,
    difficultyFilter,
    typeFilter,
    statusFilter,
    documentFilter,
    evidenceFilter,
  ]);

  const counts = useMemo(() => {
    return {
      total: questions.length,
      approved: questions.filter(
        (question) => getStatus(question) === "approved"
      ).length,
      pending: questions.filter(
        (question) => getStatus(question) === "pending"
      ).length,
      rejected: questions.filter(
        (question) => getStatus(question) === "rejected"
      ).length,
    };
  }, [questions]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredQuestions.length / pageSize)
  );

  const paginatedQuestions = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;

    return filteredQuestions.slice(
      startIndex,
      startIndex + pageSize
    );
  }, [filteredQuestions, currentPage, pageSize]);

  const firstVisibleQuestion =
    filteredQuestions.length === 0
      ? 0
      : (currentPage - 1) * pageSize + 1;

  const lastVisibleQuestion = Math.min(
    currentPage * pageSize,
    filteredQuestions.length
  );

  useEffect(() => {
    // Reset pagination when the user changes filters; this is derived UI state.
    // eslint-disable-next-line react/set-state-in-effect
    setCurrentPage(1);
    setExpandedId(null);
  }, [
    search,
    topicFilter,
    difficultyFilter,
    typeFilter,
    statusFilter,
    documentFilter,
    evidenceFilter,
    pageSize,
  ]);

  useEffect(() => {
    if (currentPage > totalPages) {
      // Keep the current page within the filtered result range.
      // eslint-disable-next-line react/set-state-in-effect
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  function resetFilters() {
    setSearch("");
    setTopicFilter("all");
    setDifficultyFilter("all");
    setTypeFilter("all");
    setStatusFilter("all");
    setDocumentFilter("all");
    setEvidenceFilter("all");
    setCurrentPage(1);
    setExpandedId(null);
  }

  const hasActiveFilters =
    search.trim() !== "" ||
    topicFilter !== "all" ||
    difficultyFilter !== "all" ||
    typeFilter !== "all" ||
    statusFilter !== "all" ||
    documentFilter !== "all" ||
    evidenceFilter !== "all";

  return (
    <div className="page-content subpage-content">
      <div
        className="eyebrow"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
        }}
      >
        <BookOpen size={14} />
        QUESTION DATABASE
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: 16,
          marginTop: 8,
        }}
      >
        <div>
          <h1 style={{ marginBottom: 8 }}>Question Bank</h1>
          <p
            className="page-description"
            style={{ marginTop: 0, maxWidth: 700 }}
          >
            Search, organize, and inspect questions collected from
            your study materials and GATE practice papers.
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            style={buttonStyle}
            onClick={() => onNavigate?.("Question Review")}
          >
            <Pencil size={15} />
            Review / edit questions
          </button>
          <button
            type="button"
            style={buttonStyle}
            onClick={loadQuestions}
            disabled={loading}
            aria-label="Refresh question bank"
          >
            {loading ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <RefreshCw size={16} />
            )}
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Statistics */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: 14,
          marginTop: 24,
        }}
      >
        <StatCard
          label="Total questions"
          value={counts.total}
          icon={<BookOpen size={18} />}
          color="#2563eb"
        />
        <StatCard
          label="Approved"
          value={counts.approved}
          icon={<CheckCircle2 size={18} />}
          color="#15803d"
        />
        <StatCard
          label="Pending review"
          value={counts.pending}
          icon={<Clock3 size={18} />}
          color="#a16207"
        />
        <StatCard
          label="Rejected"
          value={counts.rejected}
          icon={<XCircle size={18} />}
          color="#b91c1c"
        />
      </div>

      {/* Search and filters */}
      <section
        className="panel"
        style={{ padding: 22, marginTop: 22 }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h2
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                fontSize: 18,
                margin: 0,
              }}
            >
              <Filter size={19} />
              Search and filters
            </h2>
            <p style={{ ...mutedText, marginBottom: 0 }}>
              Narrow your question collection using the options below.
            </p>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              className="text-action"
              onClick={resetFilters}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <RotateCcw size={14} />
              Clear filters
            </button>
          )}
        </div>

        <label style={{ display: "block", marginTop: 20 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>
            Search questions
          </span>

          <div style={{ position: "relative", marginTop: 6 }}>
            <Search
              size={18}
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                opacity: 0.6,
                pointerEvents: "none",
              }}
            />

            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search question, topic, answer, or source..."
              aria-label="Search questions"
              style={{
                ...controlStyle,
                marginTop: 0,
                paddingLeft: 40,
              }}
            />
          </div>
        </label>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))",
            gap: 14,
            marginTop: 17,
          }}
        >
          <label>
            <span style={{ fontSize: 12, fontWeight: 600 }}>Topic</span>
            <select
              value={topicFilter}
              onChange={(event) => setTopicFilter(event.target.value)}
              style={controlStyle}
            >
              <option value="all">All topics</option>
              {topics.map((topic) => (
                <option key={topic} value={topic}>
                  {topic}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span style={{ fontSize: 12, fontWeight: 600 }}>
              Source document
            </span>
            <select
              value={documentFilter}
              onChange={(event) => setDocumentFilter(event.target.value)}
              style={controlStyle}
            >
              <option value="all">All documents</option>
              {documents.map((document) => (
                <option key={document.id} value={document.id}>
                  {document.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span style={{ fontSize: 12, fontWeight: 600 }}>
              Difficulty
            </span>
            <select
              value={difficultyFilter}
              onChange={(event) => setDifficultyFilter(event.target.value)}
              style={controlStyle}
            >
              <option value="all">All difficulties</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </label>

          <label>
            <span style={{ fontSize: 12, fontWeight: 600 }}>
              Question type
            </span>
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              style={controlStyle}
            >
              <option value="all">All types</option>
              <option value="MCQ">MCQ</option>
              <option value="MSQ">MSQ</option>
              <option value="NAT">NAT / Numerical</option>
            </select>
          </label>

          <label>
            <span style={{ fontSize: 12, fontWeight: 600 }}>
              Review status
            </span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              style={controlStyle}
            >
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>

          <label>
            <span style={{ fontSize: 12, fontWeight: 600 }}>
              Evidence status
            </span>
            <select
              value={evidenceFilter}
              onChange={(event) => setEvidenceFilter(event.target.value)}
              style={controlStyle}
            >
              <option value="all">All evidence statuses</option>
              <option value="verified">Verified</option>
              <option value="partial">Partially verified</option>
              <option value="unverified">Unverified</option>
              <option value="missing">Missing evidence</option>
            </select>
          </label>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            marginTop: 20,
            paddingTop: 16,
            borderTop: "1px solid var(--border-color, #e5e7eb)",
          }}
        >
          <p style={{ margin: 0, fontSize: 12 }}>
            Showing{" "}
            <strong>
              {firstVisibleQuestion}–{lastVisibleQuestion}
            </strong>{" "}
            of <strong>{filteredQuestions.length}</strong> matching
            questions
            {" "}({questions.length} total)
          </p>

          <button
            type="button"
            className="text-action"
            onClick={resetFilters}
            disabled={!hasActiveFilters}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              opacity: hasActiveFilters ? 1 : 0.5,
            }}
          >
            <RotateCcw size={14} />
            Reset filters
          </button>
        </div>
      </section>

      {/* API error */}
      {error && (
        <div
          className="panel"
          role="alert"
          style={{
            padding: 22,
            marginTop: 20,
            border: "1px solid #fecaca",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
            }}
          >
            <CircleHelp size={22} color="#dc2626" />
            <div>
              <h3 style={{ marginTop: 0, color: "#dc2626" }}>
                Unable to load questions
              </h3>
              <p>{error}</p>
              <button
                type="button"
                style={buttonStyle}
                onClick={loadQuestions}
                disabled={loading}
              >
                <RefreshCw size={15} />
                Try again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div
          className="panel"
          style={{
            padding: 32,
            marginTop: 20,
            textAlign: "center",
          }}
        >
          <LoaderCircle
            size={25}
            className="spin"
            style={{ margin: "0 auto" }}
          />
          <p style={{ marginBottom: 0 }}>Loading question bank...</p>
        </div>
      )}

      {/* Empty results */}
      {!loading && !error && filteredQuestions.length === 0 && (
        <div
          className="panel"
          style={{
            padding: 36,
            marginTop: 20,
            textAlign: "center",
          }}
        >
          <BookOpen
            size={34}
            style={{ opacity: 0.5, margin: "0 auto" }}
          />
          <h3 style={{ marginBottom: 8 }}>
            {questions.length === 0
              ? "Your question bank is empty"
              : "No matching questions"}
          </h3>
          <p style={{ ...mutedText, marginBottom: 20 }}>
            {questions.length === 0
              ? "Questions will appear here after they are added to your database."
              : "Try another search term or remove some filters."}
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              style={buttonStyle}
              onClick={resetFilters}
            >
              <RotateCcw size={15} />
              Reset filters
            </button>
          )}
        </div>
      )}

      {/* Question cards */}
      {!loading && !error && filteredQuestions.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
              marginBottom: 14,
            }}
          >
            <h2 style={{ fontSize: 17, margin: 0 }}>
              Questions
            </h2>
            <span style={mutedText}>
              {filteredQuestions.length} result
              {filteredQuestions.length === 1 ? "" : "s"}
            </span>
          </div>

          {paginatedQuestions.map((question, index) => {
            const absoluteIndex =
              (currentPage - 1) * pageSize + index;

            const status = getStatus(question);
            const evidenceStatus = getEvidenceStatus(question);
            const id =
              question.id ??
              question.questionId ??
              question.question_id ??
              `${absoluteIndex}-${getQuestion(question)}`;

            const expanded = expandedId === id;
            const options = getOptions(question);

            return (
              <article
                className="panel"
                key={id}
                style={{
                  padding: 20,
                  marginBottom: 14,
                  transition: "border-color 0.2s ease",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 14,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: "var(--muted-text, #6b7280)",
                        }}
                      >
                        QUESTION #{question.id ?? absoluteIndex + 1}
                      </span>
                      <Badge color={evidenceColor(evidenceStatus)}>
                        <ShieldCheck size={12} />
                        {evidenceLabel(evidenceStatus)}
                      </Badge>
                    </div>

                    <h3
                      style={{
                        margin: "12px 0",
                        lineHeight: 1.65,
                        fontSize: 16,
                        overflowWrap: "anywhere",
                      }}
                    >
                      {getQuestion(question)}
                    </h3>

                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                        marginTop: 12,
                      }}
                    >
                      <Badge color="#2563eb">
                        {getTopic(question)}
                      </Badge>
                      <Badge>{getDifficulty(question)}</Badge>
                      <Badge color="#7c3aed">
                        {getType(question)}
                      </Badge>
                      <Badge>Year: {getYear(question)}</Badge>
                      <Badge>Marks: {getMarks(question)}</Badge>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 7,
                        marginTop: 13,
                        ...mutedText,
                      }}
                    >
                      <FileText
                        size={14}
                        style={{ flexShrink: 0, marginTop: 1 }}
                      />
                      <span style={{ overflowWrap: "anywhere" }}>
                        Source: {getDocumentName(question)}
                      </span>
                    </div>
                  </div>

                  <Badge color={statusColor(status)}>
                    {statusIcon(status)}
                    {statusLabel(status)}
                  </Badge>
                </div>

                <div
                  style={{
                    marginTop: 16,
                    paddingTop: 13,
                    borderTop: "1px solid var(--border-color, #e5e7eb)",
                  }}
                >
                  <button
                    type="button"
                    className="text-action"
                    onClick={() =>
                      setExpandedId(expanded ? null : id)
                    }
                    aria-expanded={expanded}
                    aria-controls={`question-details-${String(id).replace(
                      /[^a-zA-Z0-9_-]/g,
                      "-"
                    )}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 7,
                    }}
                  >
                    {expanded ? (
                      <>
                        <ChevronUp size={16} />
                        Hide answer and details
                      </>
                    ) : (
                      <>
                        <ChevronDown size={16} />
                        View answer and details
                      </>
                    )}
                  </button>
                </div>

                {expanded && (
                  <div
                    id={`question-details-${String(id).replace(
                      /[^a-zA-Z0-9_-]/g,
                      "-"
                    )}`}
                    style={{
                      marginTop: 16,
                      padding: 18,
                      borderRadius: 10,
                      border: "1px solid var(--border-color, #e5e7eb)",
                      background: "var(--panel-bg, white)",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {options.length > 0 && (
                      <div style={{ marginBottom: 20 }}>
                        <h4 style={{ marginTop: 0 }}>Options</h4>
                        <ol
                          type="A"
                          style={{
                            paddingLeft: 24,
                            lineHeight: 1.8,
                          }}
                        >
                          {options.map((option, optionIndex) => (
                            <li
                              key={`${optionIndex}-${option}`}
                              style={{ marginTop: 5 }}
                            >
                              {option.replace(/^[A-Z]\.\s*/, "")}
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}

                    <div
                      style={{
                        padding: 14,
                        borderRadius: 9,
                        background: "var(--panel-bg, #f9fafb)",
                        border: "1px solid var(--border-color, #e5e7eb)",
                        marginBottom: 16,
                      }}
                    >
                      <p style={{ margin: 0 }}>
                        <strong>Answer:</strong> {getAnswer(question)}
                      </p>
                    </div>

                    <div style={{ marginBottom: 18 }}>
                      <h4 style={{ marginBottom: 7 }}>Explanation</h4>
                      <p style={{ lineHeight: 1.8, margin: 0 }}>
                        {getExplanation(question)}
                      </p>
                    </div>

                    <div style={{ marginBottom: 18 }}>
                      <h4 style={{ marginBottom: 7 }}>
                        Source evidence
                      </h4>
                      <p style={{ lineHeight: 1.8, margin: 0 }}>
                        {text(
                          question.sourceEvidence ??
                            question.source_evidence,
                          "Not provided"
                        )}
                      </p>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fit, minmax(150px, 1fr))",
                        gap: 14,
                      }}
                    >
                      <div>
                        <span style={mutedText}>Evidence status</span>
                        <p style={{ marginBottom: 0, marginTop: 5 }}>
                          <Badge color={evidenceColor(evidenceStatus)}>
                            {evidenceLabel(evidenceStatus)}
                          </Badge>
                        </p>
                      </div>

                      <div>
                        <span style={mutedText}>Exam year</span>
                        <p style={{ marginBottom: 0, marginTop: 5 }}>
                          {getYear(question)}
                        </p>
                      </div>

                      <div>
                        <span style={mutedText}>Marks</span>
                        <p style={{ marginBottom: 0, marginTop: 5 }}>
                          {getMarks(question)}
                        </p>
                      </div>

                      <div>
                        <span style={mutedText}>Created</span>
                        <p
                          style={{
                            marginBottom: 0,
                            marginTop: 5,
                            overflowWrap: "anywhere",
                          }}
                        >
                          {text(
                            question.createdAt ?? question.created_at,
                            "Not recorded"
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </article>
            );
          })}

          {/* Pagination */}
          <div
            className="panel"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 16,
              flexWrap: "wrap",
              padding: 16,
              marginTop: 18,
            }}
          >
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                flexWrap: "wrap",
                fontSize: 13,
              }}
            >
              <span>Questions per page</span>
              <select
                value={pageSize}
                onChange={(event) =>
                  setPageSize(Number(event.target.value))
                }
                style={{
                  ...controlStyle,
                  width: "auto",
                  minWidth: 80,
                  marginTop: 0,
                }}
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </label>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                style={{
                  ...buttonStyle,
                  opacity: currentPage <= 1 ? 0.45 : 1,
                  cursor: currentPage <= 1 ? "not-allowed" : "pointer",
                }}
                disabled={currentPage <= 1}
                onClick={() =>
                  setCurrentPage((page) => Math.max(1, page - 1))
                }
              >
                <ChevronLeft size={16} />
                Previous
              </button>

              <span style={{ whiteSpace: "nowrap", fontSize: 13 }}>
                Page <strong>{currentPage}</strong> of{" "}
                <strong>{totalPages}</strong>
              </span>

              <button
                type="button"
                style={{
                  ...buttonStyle,
                  opacity: currentPage >= totalPages ? 0.45 : 1,
                  cursor:
                    currentPage >= totalPages
                      ? "not-allowed"
                      : "pointer",
                }}
                disabled={currentPage >= totalPages}
                onClick={() =>
                  setCurrentPage((page) =>
                    Math.min(totalPages, page + 1)
                  )
                }
              >
                Next
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
