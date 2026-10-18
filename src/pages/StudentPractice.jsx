import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, CircleHelp, RotateCcw, Target } from "lucide-react";

const API_URL = `${import.meta.env.VITE_API_BASE_URL || ""}/api/questions`;

const panelStyle = {
  background: "var(--panel-bg, #fff)",
  border: "1px solid var(--border-color, #e2e8f0)",
  borderRadius: 14,
  padding: 20,
};

function plainText(value, fallback = "") {
  if (value == null || value === "") return fallback;
  if (typeof value === "object") return String(value.text ?? value.value ?? value.label ?? "");
  return String(value);
}

function getStatus(question) {
  return plainText(question.reviewStatus ?? question.review_status ?? question.status, "pending").toLowerCase();
}

function getEvidenceStatus(question) {
  return plainText(question.evidenceStatus ?? question.evidence_status, "missing").toLowerCase();
}

function getQuestion(question) {
  return plainText(question.question ?? question.questionText ?? question.question_text, "Question text unavailable");
}

function getOptions(question) {
  const raw = question.options ?? question.choices ?? question.answerOptions ?? question.answer_options;
  if (Array.isArray(raw)) {
    return raw.map((item, index) => {
      const label = String.fromCharCode(65 + index);
      if (item && typeof item === "object") return { key: plainText(item.label ?? item.key, label), text: plainText(item.text ?? item.value ?? item.content, "") };
      return { key: label, text: plainText(item) };
    });
  }
  if (raw && typeof raw === "object") return Object.entries(raw).map(([key, value]) => ({ key, text: plainText(value) }));
  return [];
}

function getAnswer(question) {
  return plainText(question.answer ?? question.correctAnswer ?? question.correct_answer, "");
}

function getExplanation(question) {
  return plainText(question.explanation ?? question.solution, "No explanation has been provided for this question.");
}

function isCorrect(question, selected) {
  const answer = getAnswer(question).trim().toLowerCase();
  const choice = String(selected ?? "").trim().toLowerCase();
  if (!answer || !choice) return false;
  const option = getOptions(question).find((item) => item.key.toLowerCase() === choice || item.text.trim().toLowerCase() === choice);
  const candidates = [answer, ...answer.split(/[,;|]/).map((item) => item.trim())];
  return candidates.some((candidate) => candidate === choice || candidate === option?.key.toLowerCase() || candidate === option?.text.trim().toLowerCase());
}

export default function StudentPractice() {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [topic, setTopic] = useState("all");
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState({});
  const [checked, setChecked] = useState({});
  const [session, setSession] = useState(0);

  const loadQuestions = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(API_URL);
      if (!response.ok) throw new Error(`Questions API returned HTTP ${response.status}`);
      const data = await response.json();
      const list = Array.isArray(data) ? data : data.questions ?? data.data;
      if (!Array.isArray(list)) throw new Error("The questions API did not return a list.");
      const ready = list.filter((q) => {
        const status = getStatus(q);
        const evidence = getEvidenceStatus(q);
        return (status === "approved" || status === "accepted") && evidence === "verified";
      });
      setQuestions(ready);
      setIndex(0);
      setSelected({});
      setChecked({});
    } catch (err) {
      setError("Could not load approved, source-verified questions. Check that the backend is running, then retry.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQuestions();
  }, [loadQuestions]);

  const topics = useMemo(() => [...new Set(questions.map((q) => plainText(q.topic, "Uncategorized")))].sort(), [questions]);
  const filtered = useMemo(() => topic === "all" ? questions : questions.filter((q) => plainText(q.topic, "Uncategorized") === topic), [questions, topic]);
  const question = filtered[index] ?? null;
  const questionId = question ? String(question.id ?? question.questionId ?? index) : "";
  const chosen = selected[questionId] ?? "";
  const wasChecked = Boolean(checked[questionId]);
  const score = filtered.reduce((total, q, i) => {
    const id = String(q.id ?? q.questionId ?? i);
    return total + (checked[id] && isCorrect(q, selected[id]) ? 1 : 0);
  }, 0);
  const answered = Object.keys(checked).filter((id) => checked[id] && filtered.some((q, i) => String(q.id ?? q.questionId ?? i) === id)).length;

  function changeTopic(value) {
    setTopic(value);
    setIndex(0);
  }

  function next() {
    setIndex((value) => Math.min(value + 1, filtered.length - 1));
  }

  function previous() {
    setIndex((value) => Math.max(value - 1, 0));
  }

  function restart() {
    setIndex(0);
    setSelected({});
    setChecked({});
    setSession((value) => value + 1);
  }

  if (loading) return <div className="page-content"><div style={panelStyle}>Loading verified practice questions…</div></div>;

  return (
    <div className="page-content" key={session}>
      <section style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 22 }}>
        <div>
          <div className="eyebrow"><Target size={14} /> STUDY MODE</div>
          <h1 style={{ margin: "8px 0" }}>Student Practice</h1>
          <p className="page-description">Practice approved questions with verified source evidence. Your answers are checked locally and do not change the question bank.</p>
        </div>
        <button type="button" onClick={restart} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 13px", borderRadius: 9, border: "1px solid var(--border-color, #d1d5db)", background: "var(--panel-bg, white)", color: "inherit", cursor: "pointer" }}><RotateCcw size={16} /> Restart session</button>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 18 }}>
        <div style={panelStyle}><div style={{ color: "var(--muted-text, #64748b)", fontSize: 12 }}>Available questions</div><strong style={{ display: "block", fontSize: 25, marginTop: 8 }}>{filtered.length}</strong></div>
        <div style={panelStyle}><div style={{ color: "var(--muted-text, #64748b)", fontSize: 12 }}>Answered</div><strong style={{ display: "block", fontSize: 25, marginTop: 8 }}>{answered}</strong></div>
        <div style={panelStyle}><div style={{ color: "var(--muted-text, #64748b)", fontSize: 12 }}>Correct</div><strong style={{ display: "block", fontSize: 25, marginTop: 8 }}>{score}</strong></div>
        <div style={panelStyle}><div style={{ color: "var(--muted-text, #64748b)", fontSize: 12 }}>Accuracy</div><strong style={{ display: "block", fontSize: 25, marginTop: 8 }}>{answered ? Math.round(score / answered * 100) : 0}%</strong></div>
      </div>

      {error && <div role="alert" style={{ ...panelStyle, marginBottom: 16, color: "#b91c1c" }}>{error} <button type="button" onClick={loadQuestions} style={{ marginLeft: 8 }}>Retry</button></div>}

      {!error && questions.length === 0 && <div style={panelStyle}><h2>No practice questions available yet</h2><p>Student Practice only shows questions marked approved and source-verified. Review questions in Question Review and verify their source evidence first.</p><button type="button" onClick={loadQuestions}>Refresh questions</button></div>}

      {questions.length > 0 && <>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>Topic
            <select value={topic} onChange={(event) => changeTopic(event.target.value)} style={{ display: "block", marginTop: 6, minWidth: 220, padding: 10, borderRadius: 8, border: "1px solid var(--border-color, #d1d5db)", background: "var(--panel-bg, white)", color: "inherit" }}>
              <option value="all">All topics</option>{topics.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <span style={{ color: "var(--muted-text, #64748b)", fontSize: 13 }}>Question {filtered.length ? index + 1 : 0} of {filtered.length}</span>
        </div>

        {question && <section style={panelStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            <span style={{ fontSize: 12, color: "var(--muted-text, #64748b)" }}>{plainText(question.topic, "Uncategorized")} · {plainText(question.difficulty, "Difficulty not specified")}</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "#15803d", fontSize: 12 }}><CheckCircle2 size={14} /> Verified source</span>
          </div>
          <h2 style={{ fontSize: 19, lineHeight: 1.6, margin: "0 0 18px", whiteSpace: "pre-wrap" }}>{getQuestion(question)}</h2>
          {getOptions(question).length > 0 ? <div style={{ display: "grid", gap: 10 }}>
            {getOptions(question).map((option) => {
              const active = chosen === option.key;
              const correct = wasChecked && isCorrect(question, option.key);
              const wrong = wasChecked && active && !correct;
              return <button key={option.key} type="button" disabled={wasChecked} onClick={() => setSelected((old) => ({ ...old, [questionId]: option.key }))} style={{ textAlign: "left", padding: 13, borderRadius: 10, border: `1px solid ${correct ? "#16a34a" : wrong ? "#dc2626" : active ? "#6366f1" : "var(--border-color, #d1d5db)"}`, background: correct ? "#16a34a12" : wrong ? "#dc262612" : active ? "#6366f112" : "transparent", color: "inherit", cursor: wasChecked ? "default" : "pointer" }}>
                <strong style={{ marginRight: 9 }}>{option.key}.</strong>{option.text}
              </button>;
            })}
          </div> : <label style={{ display: "block", fontSize: 13, fontWeight: 600 }}>Your answer
            <input value={chosen} disabled={wasChecked} onChange={(event) => setSelected((old) => ({ ...old, [questionId]: event.target.value }))} placeholder="Enter your answer" style={{ display: "block", boxSizing: "border-box", width: "100%", marginTop: 8, padding: 12, borderRadius: 9, border: "1px solid var(--border-color, #d1d5db)", background: "var(--panel-bg, white)", color: "inherit" }} />
          </label>}

          {wasChecked && <div role="status" style={{ marginTop: 18, padding: 14, borderRadius: 10, background: isCorrect(question, chosen) ? "#16a34a12" : "#f59e0b12" }}>
            <strong>{isCorrect(question, chosen) ? "Correct!" : "Not quite — review the answer below."}</strong>
            <p style={{ marginBottom: 6 }}><strong>Correct answer:</strong> {getAnswer(question) || "No answer recorded"}</p>
            <p style={{ marginBottom: 0, whiteSpace: "pre-wrap" }}><strong>Explanation:</strong> {getExplanation(question)}</p>
          </div>}

          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginTop: 22 }}>
            <button type="button" onClick={previous} disabled={index === 0} style={{ padding: "10px 13px", borderRadius: 9, border: "1px solid var(--border-color, #d1d5db)", background: "var(--panel-bg, white)", color: "inherit", cursor: index === 0 ? "not-allowed" : "pointer", opacity: index === 0 ? 0.5 : 1 }}><ChevronLeft size={16} style={{ verticalAlign: "middle" }} /> Previous</button>
            {!wasChecked ? <button type="button" onClick={() => setChecked((old) => ({ ...old, [questionId]: true }))} disabled={!String(chosen).trim()} style={{ padding: "10px 15px", borderRadius: 9, border: 0, background: "#4f46e5", color: "white", cursor: String(chosen).trim() ? "pointer" : "not-allowed", opacity: String(chosen).trim() ? 1 : 0.5 }}><CircleHelp size={16} style={{ verticalAlign: "middle" }} /> Check answer</button> : <button type="button" onClick={next} disabled={index >= filtered.length - 1} style={{ padding: "10px 13px", borderRadius: 9, border: "1px solid var(--border-color, #d1d5db)", background: "var(--panel-bg, white)", color: "inherit", cursor: index >= filtered.length - 1 ? "not-allowed" : "pointer", opacity: index >= filtered.length - 1 ? 0.5 : 1 }}>Next question <ChevronRight size={16} style={{ verticalAlign: "middle" }} /></button>}
          </div>
        </section>}
      </>}
    </div>
  );
}
