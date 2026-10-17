
import { useEffect, useState } from "react";
import { InlineMath, BlockMath } from "react-katex";
import "katex/dist/katex.min.css";

const API = "http://localhost:3001";

const fieldStyle = {
  display: "block",
  width: "100%",
  boxSizing: "border-box",
  padding: 10,
  marginTop: 6,
  marginBottom: 16,
};

const buttonStyle = {
  padding: "9px 14px",
  marginRight: 8,
  marginTop: 6,
  cursor: "pointer",
};

function MathText({ text }) {
  if (text === null || text === undefined || text === "") {
    return null;
  }

  const parts = String(text).split(
    /(\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$\$[\s\S]*?\$\$|\$[^$\n]+?\$)/g
  );

  return parts.map((part, index) => {
    try {
      if (
        (part.startsWith("\\[") && part.endsWith("\\]")) ||
        (part.startsWith("$$") && part.endsWith("$$"))
      ) {
        return (
          <BlockMath key={index} math={part.slice(2, -2).trim()} />
        );
      }

      if (
        (part.startsWith("\\(") && part.endsWith("\\)")) ||
        (part.startsWith("$") && part.endsWith("$"))
      ) {
        const math = part.startsWith("$")
          ? part.slice(1, -1)
          : part.slice(2, -2);

        return <InlineMath key={index} math={math.trim()} />;
      }

      return <span key={index}>{part}</span>;
    } catch {
      return <span key={index}>{part}</span>;
    }
  });
}

function getQuestionText(question) {
  return question.question ?? question.text ?? "";
}

function getOptionText(option) {
  return typeof option === "string" ? option : option?.text ?? "";
}

function getOptions(question) {
  return Array.isArray(question.options)
    ? question.options.map(getOptionText)
    : [];
}

function getAnswer(question) {
  const answer = question.answer ?? question.correctAnswer ?? "";
  return typeof answer === "string" ? answer : String(answer);
}

function getSourceEvidence(question) {
  return typeof question.sourceEvidence === "string"
    ? question.sourceEvidence
    : "";
}

function StatusLabel({ status }) {
  const colors = {
    pending: "#8a5a00",
    approved: "#18723a",
    rejected: "#b42318",
  };

  return (
    <span
      style={{
        display: "inline-block",
        padding: "4px 9px",
        borderRadius: 12,
        background: "#f2f2f2",
        color: colors[status] ?? "#444",
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      {status?.toUpperCase() ?? "UNKNOWN"}
    </span>
  );
}

export default function Generator() {
  const [documents, setDocuments] = useState([]);
  const [documentId, setDocumentId] = useState("");
  const [topic, setTopic] = useState("Classical Mechanics");
  const [count, setCount] = useState(3);
  const [difficulty, setDifficulty] = useState("Medium");
  const [questionType, setQuestionType] = useState("MCQ");

  const [questions, setQuestions] = useState([]);
  const [savedQuestions, setSavedQuestions] = useState([]);

  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    loadDocuments();
    loadSavedQuestions();
  }, []);

  async function requestJson(url, options = {}) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data.error || `Request failed with status ${response.status}.`
      );
    }

    return data;
  }

  async function loadDocuments() {
    try {
      const data = await requestJson(`${API}/api/pdf/documents`);
      const list = data.documents || [];

      setDocuments(list);
      setDocumentId((current) => {
        if (current && list.some((doc) => String(doc.id) === current)) {
          return current;
        }

        return list.length ? String(list[0].id) : "";
      });
    } catch (err) {
      setError(err.message || "Failed to load PDFs.");
    }
  }

  async function loadSavedQuestions() {
    try {
      const data = await requestJson(`${API}/api/questions`);
      setSavedQuestions(data.questions || []);
    } catch (err) {
      setError(err.message || "Failed to load saved questions.");
    }
  }

  async function generateQuestions(event) {
    event.preventDefault();

    setLoading(true);
    setError("");
    setNotice("");
    setQuestions([]);

    try {
      const data = await requestJson(`${API}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: Number(documentId),
          topic,
          count,
          difficulty,
          questionType,
        }),
      });

      setQuestions(data.questions || []);
      setNotice(`Generated ${(data.questions || []).length} question(s).`);
    } catch (err) {
      setError(err.message || "Could not generate questions.");
    } finally {
      setLoading(false);
    }
  }

  async function saveQuestion(question, index) {
    setSavingId(index);
    setError("");
    setNotice("");

    try {
      const payload = {
        documentId: Number(documentId),
        topic,
        difficulty: question.difficulty || difficulty,
        questionType: question.questionType || questionType,
        question: getQuestionText(question),
        options: getOptions(question),
        answer: getAnswer(question),
        explanation: question.explanation ?? "",
        sourceEvidence: getSourceEvidence(question),
        evidenceStatus: "unverified",
      };

      const data = await requestJson(`${API}/api/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      setSavedQuestions((current) => [
        data.question,
        ...current.filter((item) => item.id !== data.question.id),
      ]);

      setQuestions((current) =>
        current.map((item, i) =>
          i === index ? { ...item, savedQuestionId: data.question.id } : item
        )
      );

      setNotice("Question saved for review.");
    } catch (err) {
      setError(err.message || "Could not save the question.");
    } finally {
      setSavingId(null);
    }
  }

  async function changeReviewStatus(id, status) {
    setBusyId(id);
    setError("");
    setNotice("");

    try {
      const data = await requestJson(`${API}/api/questions/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      setSavedQuestions((current) =>
        current.map((question) =>
          question.id === id ? data.question : question
        )
      );

      setNotice(`Question ${status}.`);
    } catch (err) {
      setError(err.message || "Could not update review status.");
    } finally {
      setBusyId(null);
    }
  }

  function startEditing(question) {
    setEditingId(question.id);
    setEditDraft({
      topic: question.topic,
      difficulty: question.difficulty,
      questionType: question.questionType,
      question: question.question,
      options: [...question.options],
      answer: question.answer,
      explanation: question.explanation,
      sourceEvidence: question.sourceEvidence,
    });

    setError("");
    setNotice("");
  }

  function updateDraft(field, value) {
    setEditDraft((current) => ({ ...current, [field]: value }));
  }

  function updateOption(index, value) {
    setEditDraft((current) => ({
      ...current,
      options: current.options.map((option, i) =>
        i === index ? value : option
      ),
    }));
  }

  async function saveEditedQuestion(event) {
    event.preventDefault();

    if (!editingId || !editDraft) return;

    setBusyId(editingId);
    setError("");
    setNotice("");

    try {
      const data = await requestJson(`${API}/api/questions/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editDraft),
      });

      setSavedQuestions((current) =>
        current.map((question) =>
          question.id === editingId ? data.question : question
        )
      );

      setEditingId(null);
      setEditDraft(null);
      setNotice("Question updated. It is pending review again.");
    } catch (err) {
      setError(err.message || "Could not update the question.");
    } finally {
      setBusyId(null);
    }
  }

  const selectedDocument = documents.find(
    (doc) => String(doc.id) === documentId
  );

  return (
    <main style={{ maxWidth: 900, margin: "30px auto", padding: 20 }}>
      <h1>AI Question Generator</h1>
      <p>Generate physics questions from your uploaded PDF.</p>

      {error && (
        <p role="alert" style={{ color: "crimson", whiteSpace: "pre-wrap" }}>
          Error: {error}
        </p>
      )}

      {notice && (
        <p role="status" style={{ color: "#18723a" }}>
          {notice}
        </p>
      )}

      <form
        onSubmit={generateQuestions}
        style={{ padding: 20, border: "1px solid #ddd", borderRadius: 8 }}
      >
        <label>
          Source PDF
          <select
            style={fieldStyle}
            value={documentId}
            onChange={(event) => setDocumentId(event.target.value)}
            required
          >
            <option value="">Select a PDF</option>
            {documents.map((doc) => (
              <option key={doc.id} value={doc.id}>
                {doc.filename}
                {doc.pages ? ` (${doc.pages} pages)` : ""}
              </option>
            ))}
          </select>
        </label>

        <label>
          Topic
          <input
            style={fieldStyle}
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            required
          />
        </label>

        <label>
          Number of questions
          <select
            style={fieldStyle}
            value={count}
            onChange={(event) => setCount(Number(event.target.value))}
          >
            {[1, 3, 5, 10].map((number) => (
              <option key={number} value={number}>
                {number}
              </option>
            ))}
          </select>
        </label>

        <label>
          Difficulty
          <select
            style={fieldStyle}
            value={difficulty}
            onChange={(event) => setDifficulty(event.target.value)}
          >
            {["Easy", "Medium", "Hard"].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <label>
          Question type
          <select
            style={fieldStyle}
            value={questionType}
            onChange={(event) => setQuestionType(event.target.value)}
          >
            <option value="MCQ">MCQ</option>
            <option value="Numerical">Numerical</option>
          </select>
        </label>

        <button
          type="submit"
          style={buttonStyle}
          disabled={loading || !documentId}
        >
          {loading ? "Generating questions..." : "Generate Questions"}
        </button>

        {loading && (
          <p role="status">
            Please wait while the AI generates your questions.
          </p>
        )}
      </form>

      {questions.length > 0 && (
        <section style={{ marginTop: 30 }}>
          <h2>Newly Generated Questions</h2>
          <p>Save each question you want to send for human review.</p>

          {questions.map((question, index) => (
            <article
              key={question.id ?? index}
              style={{
                marginTop: 20,
                padding: 20,
                border: "1px solid #ddd",
                borderRadius: 8,
              }}
            >
              <h3>Question {index + 1}</h3>

              <div>
                <MathText text={getQuestionText(question)} />
              </div>

              {getOptions(question).map((option, i) => (
                <p key={i}>
                  <strong>{String.fromCharCode(65 + i)}.</strong>{" "}
                  <MathText text={option} />
                </p>
              ))}

              <details style={{ marginTop: 12 }}>
                <summary style={{ cursor: "pointer" }}>
                  Show answer and explanation
                </summary>

                <p>
                  <strong>Answer:</strong>{" "}
                  <MathText text={getAnswer(question) || "Not provided"} />
                </p>

                <p>
                  <strong>Explanation:</strong>{" "}
                  <MathText text={question.explanation || "Not provided"} />
                </p>

                {question.evidenceCheck && (
                  <div
                    style={{
                      marginTop: 12,
                      padding: 10,
                      borderRadius: 6,
                      background: "#f5f5f5",
                    }}
                  >
                    <strong>Source verification: </strong>
                    {question.evidenceCheck.status === "verified"
                      ? "Verified"
                      : question.evidenceCheck.status === "partial"
                        ? "Partial match — review"
                        : "Unverified — review"}

                    <p>{question.evidenceCheck.message}</p>

                    {question.sourceEvidence && (
                      <p>
                        <strong>Source evidence: </strong>
                        <MathText text={question.sourceEvidence} />
                      </p>
                    )}
                  </div>
                )}
              </details>

              {question.savedQuestionId ? (
                <p>
                  <StatusLabel status="pending" /> Saved for review (ID:{" "}
                  {question.savedQuestionId})
                </p>
              ) : (
                <button
                  type="button"
                  style={buttonStyle}
                  disabled={savingId === index || !selectedDocument}
                  onClick={() => saveQuestion(question, index)}
                >
                  {savingId === index ? "Saving..." : "Save for Review"}
                </button>
              )}
            </article>
          ))}
        </section>
      )}

      <section style={{ marginTop: 40 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <h2>Saved Questions &amp; Review</h2>
          <button
            type="button"
            style={buttonStyle}
            onClick={loadSavedQuestions}
          >
            Reload Saved Questions
          </button>
        </div>

        <p>
          Approve questions only after checking their physics, answer, and
          source evidence.
        </p>

        {savedQuestions.length === 0 && (
          <p>No saved questions yet. Generate a question and choose Save for Review.</p>
        )}

        {savedQuestions.map((question) => (
          <article
            key={question.id}
            style={{
              marginTop: 16,
              padding: 20,
              border: "1px solid #ddd",
              borderRadius: 8,
            }}
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
              <h3 style={{ marginTop: 0 }}>Saved Question #{question.id}</h3>
              <StatusLabel status={question.reviewStatus} />
            </div>

            {editingId === question.id && editDraft ? (
              <form onSubmit={saveEditedQuestion}>
                <label>
                  Topic
                  <input
                    style={fieldStyle}
                    value={editDraft.topic}
                    onChange={(event) =>
                      updateDraft("topic", event.target.value)
                    }
                    required
                  />
                </label>

                <label>
                  Difficulty
                  <select
                    style={fieldStyle}
                    value={editDraft.difficulty}
                    onChange={(event) =>
                      updateDraft("difficulty", event.target.value)
                    }
                  >
                    {["Easy", "Medium", "Hard"].map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Question type
                  <select
                    style={fieldStyle}
                    value={editDraft.questionType}
                    onChange={(event) =>
                      updateDraft("questionType", event.target.value)
                    }
                  >
                    <option value="MCQ">MCQ</option>
                    <option value="Numerical">Numerical</option>
                  </select>
                </label>

                <label>
                  Question
                  <textarea
                    style={fieldStyle}
                    rows={3}
                    value={editDraft.question}
                    onChange={(event) =>
                      updateDraft("question", event.target.value)
                    }
                    required
                  />
                </label>

                {editDraft.questionType === "MCQ" && (
                  <>
                    <h4>Options</h4>
                    {editDraft.options.map((option, index) => (
                      <label key={index}>
                        Option {String.fromCharCode(65 + index)}
                        <input
                          style={fieldStyle}
                          value={option}
                          onChange={(event) =>
                            updateOption(index, event.target.value)
                          }
                          required
                        />
                      </label>
                    ))}
                  </>
                )}

                <label>
                  Answer
                  <textarea
                    style={fieldStyle}
                    rows={2}
                    value={editDraft.answer}
                    onChange={(event) =>
                      updateDraft("answer", event.target.value)
                    }
                  />
                </label>

                <label>
                  Explanation
                  <textarea
                    style={fieldStyle}
                    rows={4}
                    value={editDraft.explanation}
                    onChange={(event) =>
                      updateDraft("explanation", event.target.value)
                    }
                  />
                </label>

                <label>
                  Source evidence
                  <textarea
                    style={fieldStyle}
                    rows={3}
                    value={editDraft.sourceEvidence}
                    onChange={(event) =>
                      updateDraft("sourceEvidence", event.target.value)
                    }
                  />
                </label>

                <button
                  type="submit"
                  style={buttonStyle}
                  disabled={busyId === question.id}
                >
                  {busyId === question.id ? "Saving..." : "Save Changes"}
                </button>

                <button
                  type="button"
                  style={buttonStyle}
                  onClick={() => {
                    setEditingId(null);
                    setEditDraft(null);
                  }}
                >
                  Cancel
                </button>
              </form>
            ) : (
              <>
                <p>
                  <strong>Topic:</strong> {question.topic} |{" "}
                  <strong>Difficulty:</strong> {question.difficulty} |{" "}
                  <strong>Type:</strong> {question.questionType}
                </p>

                <div>
                  <MathText text={question.question} />
                </div>

                {question.options.map((option, index) => (
                  <p key={index}>
                    <strong>{String.fromCharCode(65 + index)}.</strong>{" "}
                    <MathText text={option} />
                  </p>
                ))}

                <details style={{ marginTop: 12 }}>
                  <summary style={{ cursor: "pointer" }}>
                    Show answer, explanation, and evidence
                  </summary>
                  <p>
                    <strong>Answer:</strong>{" "}
                    <MathText text={question.answer || "Not provided"} />
                  </p>
                  <p>
                    <strong>Explanation:</strong>{" "}
                    <MathText text={question.explanation || "Not provided"} />
                  </p>
                  <p>
                    <strong>Evidence status:</strong> {question.evidenceStatus}
                  </p>
                  <p>
                    <strong>Source evidence:</strong>{" "}
                    <MathText text={question.sourceEvidence || "Not provided"} />
                  </p>
                </details>

                <button
                  type="button"
                  style={buttonStyle}
                  onClick={() => startEditing(question)}
                  disabled={busyId === question.id}
                >
                  Edit
                </button>

                <button
                  type="button"
                  style={buttonStyle}
                  onClick={() => changeReviewStatus(question.id, "approved")}
                  disabled={
                    busyId === question.id ||
                    question.reviewStatus === "approved"
                  }
                >
                  Approve
                </button>

                <button
                  type="button"
                  style={buttonStyle}
                  onClick={() => changeReviewStatus(question.id, "rejected")}
                  disabled={
                    busyId === question.id ||
                    question.reviewStatus === "rejected"
                  }
                >
                  Reject
                </button>
              </>
            )}
          </article>
        ))}
      </section>
    </main>
  );
}
