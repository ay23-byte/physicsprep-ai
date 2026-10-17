
import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  LoaderCircle,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import "./QuestionReview.css";

const API_URL = "http://localhost:3001/api/questions";

function getStatus(question) {
  return (
    question.reviewStatus ??
    question.review_status ??
    question.status ??
    "pending"
  ).toLowerCase();
}

function getQuestionText(question) {
  return question.questionText ?? question.question_text ?? question.question ?? "";
}

function getOptions(question) {
  const value = question.options ?? question.options_json ?? [];

  if (Array.isArray(value)) return value;

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

function getAnswer(question) {
  return question.answer ?? "";
}

function getExplanation(question) {
  return question.explanation ?? "";
}

function getTopic(question) {
  return question.topic || "Uncategorized";
}

function getId(question) {
  return question.id ?? question.questionId;
}

function getEvidence(question) {
  return (
    question.sourceEvidence ??
    question.source_evidence ??
    ""
  );
}

function getEvidenceStatus(question) {
  const status = (
    question.evidenceStatus ??
    question.evidence_status ??
    (getEvidence(question).trim() ? "unverified" : "missing")
  ).toLowerCase();

  // A legacy database label can say "verified" even when the server's
  // check against the linked PDF fails. Show the effective state instead.
  if (status === "verified" && question.evidenceValid === false) {
    return "invalid";
  }

  return status;
}

function getDocumentName(question) {
  return (
    question.filename ??
    question.sourcePdf ??
    question.documentName ??
    question.document_name ??
    (question.documentId || question.document_id
      ? `Document ${question.documentId ?? question.document_id}`
      : "Source document unavailable")
  );
}

export default function QuestionReview() {
  const [questions, setQuestions] = useState([]);
  const [filter, setFilter] = useState("pending");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadQuestions = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
    }
    setError("");

    try {
      const response = await fetch(API_URL);

      if (!response.ok) {
        throw new Error(`Could not load questions (${response.status}).`);
      }

      const data = await response.json();

      const list = Array.isArray(data)
        ? data
        : data.questions ?? data.data ?? [];

      if (!Array.isArray(list)) {
        throw new Error("The questions API returned an unexpected format.");
      }

      setQuestions(list);
    } catch (err) {
      setError(err.message || "Unable to load questions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQuestions();
  }, [loadQuestions]);

  const counts = {
    all: questions.length,
    pending: questions.filter((q) => getStatus(q) === "pending").length,
    approved: questions.filter((q) => getStatus(q) === "approved").length,
    rejected: questions.filter((q) => getStatus(q) === "rejected").length,
  };

  const filteredQuestions = questions.filter((question) => {
    const matchesStatus =
      filter === "all" || getStatus(question) === filter;

    const searchableText = [
      getQuestionText(question),
      getTopic(question),
      getAnswer(question),
      getExplanation(question),
      getDocumentName(question),
    ]
      .join(" ")
      .toLowerCase();

    return matchesStatus && searchableText.includes(search.toLowerCase());
  });

  function startEditing(question) {
    setEditingId(getId(question));
    setExpandedId(getId(question));

    setEditForm({
      questionText: getQuestionText(question),
      options: getOptions(question).map((option) =>
        typeof option === "string" ? option : JSON.stringify(option)
      ),
      answer: getAnswer(question),
      explanation: getExplanation(question),
      sourceEvidence: getEvidence(question),
      topic: getTopic(question) === "Uncategorized" ? "" : getTopic(question),
    });

    setNotice("");
  }

  function updateField(field, value) {
    setEditForm((current) => ({ ...current, [field]: value }));
  }

  function updateOption(index, value) {
    setEditForm((current) => ({
      ...current,
      options: current.options.map((option, i) =>
        i === index ? value : option
      ),
    }));
  }

  async function saveEdit(question) {
    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`${API_URL}/${getId(question)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionText: editForm.questionText,
          question: editForm.questionText,
          question_text: editForm.questionText,
          options: editForm.options,
          answer: editForm.answer,
          explanation: editForm.explanation,
          sourceEvidence: editForm.sourceEvidence,
          topic: editForm.topic.trim() || "Uncategorized",
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          result.error || result.message || "Could not save the question."
        );
      }

      setEditingId(null);
      setEditForm(null);
      setNotice("Question updated successfully.");
      await loadQuestions();
    } catch (err) {
      setError(err.message || "Could not save the question.");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(question, status) {
    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `${API_URL}/${getId(question)}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status,
            reviewStatus: status,
            review_status: status,
          }),
        }
      );

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          result.error || result.message || `Could not ${status} question.`
        );
      }

      setEditingId(null);
      setEditForm(null);
      setExpandedId(null);
      setNotice(
        status === "approved"
          ? "Question approved successfully."
          : status === "rejected"
            ? "Question rejected."
            : "Question returned to pending review."
      );

      await loadQuestions();
    } catch (err) {
      setError(err.message || "Unable to update review status.");
    } finally {
      setSaving(false);
    }
  }

  async function changeEvidenceStatus(question, evidenceStatus) {
    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `${API_URL}/${getId(question)}/evidence`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ evidenceStatus }),
        }
      );

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          result.error ||
            result.message ||
            "Could not update evidence status."
        );
      }

      setNotice(
        result.message ||
          (evidenceStatus === "verified"
            ? "Evidence marked as verified."
            : "Evidence returned to unverified.")
      );

      await loadQuestions({ silent: true });
    } catch (err) {
      setError(err.message || "Unable to update evidence status.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="qr-page">
      <header className="qr-header">
        <div>
          <div className="qr-eyebrow">
            <ShieldCheck size={14} /> QUALITY CONTROL
          </div>
          <h1>Question Review</h1>
          <p>
            Check question wording, answers, explanations, and source evidence
            before approval.
          </p>
        </div>

        <button
          type="button"
          className="qr-button qr-secondary"
          onClick={loadQuestions}
          disabled={loading || saving}
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </header>

      <div className="qr-stats">
        <Stat label="All questions" count={counts.all} />
        <Stat label="Pending review" count={counts.pending} />
        <Stat label="Approved" count={counts.approved} />
        <Stat label="Rejected" count={counts.rejected} />
      </div>

      {error && (
        <div className="qr-message qr-error" role="alert">
          {error}
        </div>
      )}

      {notice && (
        <div className="qr-message qr-success" role="status">
          {notice}
        </div>
      )}

      <section className="qr-panel">
        <div className="qr-panel-heading">
          <div>
            <h2>Review queue</h2>
            <p>Choose a status to inspect the corresponding questions.</p>
          </div>
          <Clock size={20} />
        </div>

        <div className="qr-toolbar">
          <label className="qr-search">
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search questions, topics, answers..."
            />
          </label>

          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            aria-label="Filter questions by review status"
          >
            <option value="pending">Pending review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="all">All questions</option>
          </select>
        </div>

        {loading ? (
          <div className="qr-empty">
            <LoaderCircle className="qr-spinner" size={26} />
            <p>Loading questions from your database...</p>
          </div>
        ) : filteredQuestions.length === 0 ? (
          <div className="qr-empty">
            <CheckCircle2 size={32} />
            <h3>
              {filter === "pending"
                ? "You're all caught up!"
                : "No matching questions"}
            </h3>
            <p>
              {filter === "pending"
                ? "There are no questions waiting for review. Generate or save a question for review to see it here."
                : "Try another review status or change your search."}
            </p>
            {filter !== "all" && (
              <button
                type="button"
                className="qr-button qr-secondary"
                onClick={() => setFilter("all")}
              >
                Show all questions
              </button>
            )}
          </div>
        ) : (
          <div className="qr-question-list">
            {filteredQuestions.map((question) => {
              const id = getId(question);
              const status = getStatus(question);
              const evidenceStatus = getEvidenceStatus(question);
              const isExpanded = expandedId === id;
              const isEditing = editingId === id;
              const options = getOptions(question);

              return (
                <article className="qr-question-card" key={id}>
                  <div className="qr-question-top">
                    <div className="qr-question-meta">
                      <span>Question #{id}</span>
                      <span className={`qr-status qr-status-${status}`}>
                        Review: {status}
                      </span>
                      <span
                        className={`qr-status qr-evidence-${evidenceStatus}`}
                      >
                        Evidence: {evidenceStatus}
                      </span>
                    </div>

                    <button
                      type="button"
                      className="qr-icon-button"
                      aria-label={isExpanded ? "Collapse details" : "Expand details"}
                      onClick={() =>
                        setExpandedId(isExpanded ? null : id)
                      }
                    >
                      {isExpanded ? (
                        <ChevronUp size={19} />
                      ) : (
                        <ChevronDown size={19} />
                      )}
                    </button>
                  </div>

                  <h3>{getQuestionText(question) || "Untitled question"}</h3>

                  <div className="qr-tags">
                    <span>{getTopic(question)}</span>
                    <span>{question.difficulty || "Difficulty not set"}</span>
                    <span>
                      {question.questionType ??
                        question.question_type ??
                        "Question"}
                    </span>
                  </div>

                  <p className="qr-source">
                    Source PDF: {getDocumentName(question)}
                  </p>

                  {isExpanded && (
                    <div className="qr-details">
                      {isEditing && editForm ? (
                        <div className="qr-edit-form">
                          <label>
                            Topic
                            <input
                              value={editForm.topic}
                              onChange={(event) =>
                                updateField("topic", event.target.value)
                              }
                            />
                          </label>

                          <label>
                            Question text
                            <textarea
                              rows={4}
                              value={editForm.questionText}
                              onChange={(event) =>
                                updateField("questionText", event.target.value)
                              }
                            />
                          </label>

                          {editForm.options.length > 0 && (
                            <div className="qr-options-edit">
                              <strong>Options</strong>
                              {editForm.options.map((option, index) => (
                                <label key={index}>
                                  Option {index + 1}
                                  <input
                                    value={option}
                                    onChange={(event) =>
                                      updateOption(index, event.target.value)
                                    }
                                  />
                                </label>
                              ))}
                            </div>
                          )}

                          <label>
                            Correct answer
                            <input
                              value={editForm.answer}
                              onChange={(event) =>
                                updateField("answer", event.target.value)
                              }
                            />
                          </label>

                          <label>
                            Explanation
                            <textarea
                              rows={4}
                              value={editForm.explanation}
                              onChange={(event) =>
                                updateField("explanation", event.target.value)
                              }
                            />
                          </label>

                          <label>
                            Source evidence quotation
                            <textarea
                              rows={4}
                              value={editForm.sourceEvidence}
                              onChange={(event) =>
                                updateField("sourceEvidence", event.target.value)
                              }
                              placeholder="Paste an exact quotation from the linked source PDF"
                            />
                            <span className="qr-evidence-hint">
                              Use text copied from the source PDF. Saving changes resets review and evidence verification; verify the quotation again afterward.
                            </span>
                          </label>

                          <div className="qr-actions">
                            <button
                              type="button"
                              className="qr-button qr-primary"
                              onClick={() => saveEdit(question)}
                              disabled={saving || !editForm.questionText.trim()}
                            >
                              <Save size={16} />
                              {saving ? "Saving..." : "Save changes"}
                            </button>

                            <button
                              type="button"
                              className="qr-button qr-secondary"
                              onClick={() => {
                                setEditingId(null);
                                setEditForm(null);
                              }}
                              disabled={saving}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {options.length > 0 && (
                            <div className="qr-detail-block">
                              <strong>Options</strong>
                              <ol>
                                {options.map((option, index) => (
                                  <li key={index}>
                                    {typeof option === "string"
                                      ? option
                                      : `${option.label ?? option.key ?? ""} ${
                                          option.text ?? option.value ?? JSON.stringify(option)
                                        }`}
                                  </li>
                                ))}
                              </ol>
                            </div>
                          )}

                          <div className="qr-detail-block">
                            <strong>Correct answer</strong>
                            <p>{getAnswer(question) || "No answer provided."}</p>
                          </div>

                          <div className="qr-detail-block">
                            <strong>Explanation</strong>
                            <p>
                              {getExplanation(question) ||
                                "No explanation provided."}
                            </p>
                          </div>

                          <div className="qr-detail-block">
                            <strong>Source evidence</strong>
                            <p>
                              {getEvidence(question) ||
                                "No source evidence recorded."}
                            </p>
                            <span
                              className={`qr-evidence-status qr-evidence-${evidenceStatus}`}
                            >
                              Evidence status: {evidenceStatus}
                            </span>
                            {question.evidenceValid === false && (
                              <p className="qr-evidence-hint" role="alert">
                                The stored evidence does not currently pass verification against the linked PDF. Edit the quotation and save it, then verify it again.
                              </p>
                            )}
                            <p className="qr-evidence-hint">
                              Mark evidence verified only after checking this
                              quotation against the original PDF. Approval does
                              not verify evidence.
                            </p>
                          </div>

                          <div className="qr-evidence-actions">
                            {evidenceStatus !== "verified" && (
                              <button
                                type="button"
                                className="qr-button qr-primary"
                                onClick={() =>
                                  changeEvidenceStatus(question, "verified")
                                }
                                disabled={saving}
                              >
                                <ShieldCheck size={16} />
                                {saving
                                  ? "Updating..."
                                  : "Mark evidence verified"}
                              </button>
                            )}

                            {evidenceStatus === "verified" && (
                              <button
                                type="button"
                                className="qr-button qr-secondary"
                                onClick={() =>
                                  changeEvidenceStatus(question, "unverified")
                                }
                                disabled={saving}
                              >
                                {saving
                                  ? "Updating..."
                                  : "Return evidence to unverified"}
                              </button>
                            )}
                          </div>

                          <div className="qr-actions">
                            <button
                              type="button"
                              className="qr-button qr-secondary"
                              onClick={() => startEditing(question)}
                              disabled={saving}
                            >
                              Edit question
                            </button>

                            {status !== "approved" && (
                              <button
                                type="button"
                                className="qr-button qr-primary"
                                onClick={() =>
                                  changeStatus(question, "approved")
                                }
                                disabled={saving}
                              >
                                <CheckCircle2 size={16} />
                                Approve
                              </button>
                            )}

                            {status !== "rejected" && (
                              <button
                                type="button"
                                className="qr-button qr-danger"
                                onClick={() =>
                                  changeStatus(question, "rejected")
                                }
                                disabled={saving}
                              >
                                <XCircle size={16} />
                                Reject
                              </button>
                            )}

                            {status !== "pending" && (
                              <button
                                type="button"
                                className="qr-button qr-secondary"
                                onClick={() =>
                                  changeStatus(question, "pending")
                                }
                                disabled={saving}
                              >
                                Return to pending
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, count }) {
  return (
    <div className="qr-stat-card">
      <span>{label}</span>
      <strong>{count}</strong>
    </div>
  );
}
