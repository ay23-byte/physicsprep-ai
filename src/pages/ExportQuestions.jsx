
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  CheckCircle2,
  FileText,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  RotateCcw,
  FileSpreadsheet,
} from "lucide-react";

const API_URL = `${import.meta.env.VITE_API_BASE_URL || ""}/api/questions`;

const selectStyle = {
  display: "block",
  width: "100%",
  marginTop: 8,
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid var(--border-color, #d1d5db)",
  background: "var(--panel-bg, white)",
  color: "inherit",
};

function getText(value, fallback = "") {
  if (value == null || value === "") return fallback;

  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => getText(item)).join(", ");
  }

  if (typeof value === "object") {
    return String(
      value.text ?? value.value ?? value.label ?? JSON.stringify(value)
    );
  }

  return String(value);
}

function getQuestionText(question) {
  return getText(
    question.question ??
      question.questionText ??
      question.question_text,
    "Question text missing"
  );
}

function getQuestionType(question) {
  return getText(
    question.questionType ??
      question.question_type ??
      question.type,
    ""
  ).trim().toUpperCase();
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

      if (typeof option === "string" || typeof option === "number") {
        return `${letter}. ${option}`;
      }

      const label = getText(option.label ?? option.key, letter);
      const content = getText(
        option.text ?? option.value ?? option.content,
        ""
      );

      return `${label}. ${content}`;
    });
  }

  if (options && typeof options === "object") {
    return Object.entries(options).map(
      ([key, value]) => `${key}. ${getText(value)}`
    );
  }

  return [];
}

function getAnswer(question) {
  return getText(
    question.answer ??
      question.correctAnswer ??
      question.correct_answer,
    "Not provided"
  );
}

function getExplanation(question) {
  return getText(
    question.explanation ?? question.solution,
    "No explanation provided."
  );
}

function getDocumentId(question) {
  const id = question.documentId ?? question.document_id;
  return id == null ? "" : String(id);
}


function getDocumentName(question) {
    return getText(
      question.filename ??
        question.sourcePdf ??
        question.source_pdf ??
        question.documentName ??
        question.document_name ??
        question.sourceName ??
        question.source_name,
      getDocumentId(question)
        ? `Document ${getDocumentId(question)}`
        : "General questions"
    );
}
  

function getTopic(question) {
  return getText(question.topic, "").trim();
}

function getDifficulty(question) {
  return getText(question.difficulty, "").trim();
}

function getEvidenceStatus(question) {
  return getText(
    question.evidenceStatus ?? question.evidence_status,
    "not recorded"
  );
}

function getSourceEvidence(question) {
  return getText(
    question.sourceEvidence ?? question.source_evidence,
    ""
  );
}

function isApproved(question) {
  return (
    String(
      question.reviewStatus ??
        question.review_status ??
        question.status ??
        ""
    ).toLowerCase() === "approved"
  );
}
function hasValidEvidence(question) {
  // Trust the server's verification against the linked PDF, not just the
  // database status label. Old records may incorrectly say "verified".
  if (question.evidenceValid !== true && question.evidence_valid !== true) {
    return false;
  }

  const evidence = getSourceEvidence(question).trim();
  const evidenceStatus = getEvidenceStatus(question).toLowerCase();

  if (!evidence || evidenceStatus !== "verified") {
    return false;
  }

  const placeholderPattern =
    /no supporting quotation was provided|test question for checking the save and review workflow/i;

  return !placeholderPattern.test(evidence);
}
function normalizeType(type) {
  const value = String(type || "").trim().toUpperCase();

  if (value === "MULTIPLE CHOICE") return "MCQ";
  if (value === "MULTIPLE SELECT") return "MSQ";
  if (value === "NUMERICAL") return "NAT";

  return value;
}

function getSafeFilename(value) {
  return String(value)
    .trim()
    // eslint-disable-next-line no-control-regex -- Remove Windows-invalid filename control characters.
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 70) || "Practice-Paper";
}

// CSV escaping for commas, quotes, and multiline text.
function csvCell(value) {
  let text = getText(value);

  // Protect spreadsheet users from formula injection.
  if (/^[\s]*[=+\-@]/.test(text)) {
    text = "'" + text;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement("a");

  link.href = url;
  link.download = filename;

  window.document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ExportQuestions() {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [documentFilter, setDocumentFilter] = useState("all");
  const [topicFilter, setTopicFilter] = useState("all");
  const [difficultyFilter, setDifficultyFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [includeAnswers, setIncludeAnswers] = useState(true);

  const loadQuestions = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(API_URL);

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
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
        throw new Error(
          "The API response did not contain a questions array."
        );
      }

      setQuestions(list);
    } catch (err) {
      console.error("Could not load questions:", err);
      setError(
        "Could not load saved questions. Check that the backend is running on port 3001."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Async request is triggered here; response state updates happen after awaiting fetch.
    // eslint-disable-next-line react/set-state-in-effect
    loadQuestions();
  }, [loadQuestions]);

  // Only approved questions are eligible for export.
  const approvedQuestions = useMemo(
    () =>
      questions.filter(
        (question) => isApproved(question) && hasValidEvidence(question)
      ),
    [questions]
  );

  const documents = useMemo(() => {
    const uniqueDocuments = new Map();

    approvedQuestions.forEach((question) => {
      const id = getDocumentId(question);
      const name = getDocumentName(question);
      const key = id || name;

      if (!uniqueDocuments.has(key)) {
        uniqueDocuments.set(key, { id: key, name });
      }
    });

    return Array.from(uniqueDocuments.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [approvedQuestions]);

  const topics = useMemo(() => {
    const uniqueTopics = new Set(
      approvedQuestions.map(getTopic).filter(Boolean)
    );

    return Array.from(uniqueTopics).sort((a, b) =>
      a.localeCompare(b)
    );
  }, [approvedQuestions]);

  const filteredQuestions = useMemo(() => {
    return approvedQuestions.filter((question) => {
      const id = getDocumentId(question);
      const documentKey = id || getDocumentName(question);
      const difficulty = getDifficulty(question).toLowerCase();
      const topic = getTopic(question);
      const type = normalizeType(getQuestionType(question));

      return (
        (documentFilter === "all" || documentKey === documentFilter) &&
        (topicFilter === "all" || topic === topicFilter) &&
        (difficultyFilter === "all" ||
          difficulty === difficultyFilter.toLowerCase()) &&
        (typeFilter === "all" ||
          type === normalizeType(typeFilter))
      );
    });
  }, [
    approvedQuestions,
    documentFilter,
    topicFilter,
    difficultyFilter,
    typeFilter,
  ]);

  function resetFilters() {
    setDocumentFilter("all");
    setTopicFilter("all");
    setDifficultyFilter("all");
    setTypeFilter("all");
    setIncludeAnswers(true);
    setError("");
  }

  function getFilename(extension) {
    const parts = ["PhysicsPrep"];

    if (topicFilter !== "all") {
      parts.push(getSafeFilename(topicFilter));
    }

    parts.push("GATE-Practice-Paper");

    return `${parts.join("-")}.${extension}`;
  }

  // Export the currently filtered, approved questions to CSV.
  function exportCSV() {
    if (filteredQuestions.length === 0) {
      setError("No approved questions match the selected filters.");
      return;
    }

    try {
      setError("");

      const headers = [
        "Question ID",
        "Document ID",
        "Topic",
        "Difficulty",
        "Question Type",
        "Question",
        "Options",
        ...(includeAnswers ? ["Answer", "Explanation"] : []),
        "Source Evidence",
        "Evidence Status",
        "Review Status",
      ];

      const rows = filteredQuestions.map((question) => {
        const row = [
          question.id ?? "",
          getDocumentId(question),
          getDocumentName(question),
          getTopic(question),
          getDifficulty(question),
          getQuestionType(question),
          getQuestionText(question),
          getOptions(question).join(" | "),
        ];

        if (includeAnswers) {
          row.push(getAnswer(question), getExplanation(question));
        }

        row.push(
          getSourceEvidence(question),
          getEvidenceStatus(question),
          getText(
            question.reviewStatus ?? question.review_status,
            ""
          )
        );

        return row;
      });

      const csv = [
        headers.map(csvCell).join(","),
        ...rows.map((row) => row.map(csvCell).join(",")),
      ].join("\r\n");

      // UTF-8 BOM improves compatibility with Excel.
      const blob = new Blob(["\uFEFF", csv], {
        type: "text/csv;charset=utf-8;",
      });

      downloadBlob(blob, getFilename("csv"));
    } catch (err) {
      console.error("CSV export failed:", err);
      setError("CSV export failed. Check the browser console.");
    }
  }

  function addWrappedText(doc, text, x, y, maxWidth, lineHeight = 5) {
    const lines = doc.splitTextToSize(getText(text), maxWidth);
    const pageHeight = doc.internal.pageSize.getHeight();

    for (const line of lines) {
      if (y > pageHeight - 18) {
        doc.addPage();
        y = 18;
      }

      doc.text(line, x, y);
      y += lineHeight;
    }

    return y;
  }

  async function exportPDF() {
    if (filteredQuestions.length === 0) {
      setError("No approved questions match the selected filters.");
      return;
    }

    try {
      setError("");

      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const margin = 18;
      const pageWidth = doc.internal.pageSize.getWidth();
      const maxWidth = pageWidth - margin * 2;
      let y = 20;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.text("PhysicsPrep AI", margin, y);
      y += 9;

      doc.setFontSize(13);
      doc.text("GATE Physics Practice Paper", margin, y);
      y += 8;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);

      doc.text(`Total questions: ${filteredQuestions.length}`, margin, y);
      y += 6;

      const selectedDocument =
        documentFilter === "all"
          ? "All documents"
          : documents.find((item) => item.id === documentFilter)?.name ||
            "Selected document";

      doc.text(`Source: ${selectedDocument}`, margin, y);
      y += 6;

      if (topicFilter !== "all") {
        y = addWrappedText(
          doc,
          `Topic: ${topicFilter}`,
          margin,
          y,
          maxWidth,
          5
        );
      }

      y += 7;
      doc.text("Prepared from approved questions", margin, y);
      y += 12;

      filteredQuestions.forEach((question, index) => {
        if (y > doc.internal.pageSize.getHeight() - 25) {
          doc.addPage();
          y = 18;
        }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);

        y = addWrappedText(
          doc,
          `${index + 1}. ${getQuestionText(question)}`,
          margin,
          y,
          maxWidth,
          6
        );

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);

        const options = getOptions(question);

        options.forEach((option) => {
          y = addWrappedText(
            doc,
            option,
            margin + 5,
            y,
            maxWidth - 5,
            5
          );
        });

        if (options.length === 0) {
          y = addWrappedText(
            doc,
            "Working / answer: ______________________________",
            margin + 5,
            y + 2,
            maxWidth - 5,
            5
          );
        }

        y += 7;
      });

      if (includeAnswers) {
        doc.addPage();
        y = 20;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.text("Answer Key and Explanations", margin, y);
        y += 12;

        filteredQuestions.forEach((question, index) => {
          if (y > doc.internal.pageSize.getHeight() - 28) {
            doc.addPage();
            y = 18;
          }

          doc.setFont("helvetica", "bold");
          doc.setFontSize(10);

          y = addWrappedText(
            doc,
            `${index + 1}. Answer: ${getAnswer(question)}`,
            margin,
            y,
            maxWidth,
            5
          );

          doc.setFont("helvetica", "normal");

          y = addWrappedText(
            doc,
            `Explanation: ${getExplanation(question)}`,
            margin + 3,
            y,
            maxWidth - 3,
            5
          );

          const evidenceStatus = getEvidenceStatus(question);

          if (evidenceStatus.toLowerCase() !== "verified") {
            y = addWrappedText(
              doc,
              `Evidence status: ${evidenceStatus}`,
              margin + 3,
              y,
              maxWidth - 3,
              5
            );
          }

          y += 5;
        });
      }

      doc.save(getFilename("pdf"));
    } catch (err) {
      console.error("PDF export failed:", err);
      setError("PDF creation failed. Check the browser console for details.");
    }
  }

  async function exportDOCX() {
    if (filteredQuestions.length === 0) {
      setError("No approved questions match the selected filters.");
      return;
    }

    try {
      setError("");
      const { Document, HeadingLevel, Packer, Paragraph, TextRun, PageBreak } =
        await import("docx");

      const selectedDocument =
        documentFilter === "all"
          ? "All documents"
          : documents.find((item) => item.id === documentFilter)?.name ||
            "Selected document";

      const children = [
        new Paragraph({
          text: "PhysicsPrep AI",
          heading: HeadingLevel.TITLE,
          spacing: { after: 200 },
        }),
        new Paragraph({
          text: "GATE Physics Practice Paper",
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: `Total questions: ${filteredQuestions.length}`,
              italics: true,
            }),
          ],
          spacing: { after: 150 },
        }),
        new Paragraph({
          text: `Source: ${selectedDocument}`,
          spacing: { after: 150 },
        }),
      ];

      if (topicFilter !== "all") {
        children.push(
          new Paragraph({
            text: `Topic: ${topicFilter}`,
            spacing: { after: 150 },
          })
        );
      }

      children.push(
        new Paragraph({
          text: "Prepared from approved questions",
          spacing: { after: 300 },
        })
      );

      filteredQuestions.forEach((question, index) => {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `${index + 1}. ${getQuestionText(question)}`,
                bold: true,
              }),
            ],
            spacing: { before: 180, after: 120 },
          })
        );

        const options = getOptions(question);

        options.forEach((option) => {
          children.push(
            new Paragraph({
              text: option,
              indent: { left: 360 },
              spacing: { after: 80 },
            })
          );
        });

        if (options.length === 0) {
          children.push(
            new Paragraph({
              text: "Working / answer: ______________________________",
              indent: { left: 360 },
              spacing: { after: 100 },
            })
          );
        }

        children.push(
          new Paragraph({
            text: `Topic: ${getTopic(question) || "Not specified"} | Difficulty: ${getDifficulty(question) || "Not specified"} | Type: ${getQuestionType(question) || "Not specified"}`,
            spacing: { after: 160 },
          })
        );
      });

      if (includeAnswers) {
        children.push(
          new Paragraph({
            children: [new PageBreak()],
          }),
          new Paragraph({
            text: "Answer Key and Explanations",
            heading: HeadingLevel.HEADING_1,
            spacing: { after: 300 },
          })
        );

        filteredQuestions.forEach((question, index) => {
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `${index + 1}. Answer: ${getAnswer(question)}`,
                  bold: true,
                }),
              ],
              spacing: { before: 180, after: 100 },
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: "Explanation: ",
                  bold: true,
                }),
                new TextRun({
                  text: getExplanation(question),
                }),
              ],
              spacing: { after: 120 },
            })
          );

          const evidenceStatus = getEvidenceStatus(question);

          if (evidenceStatus.toLowerCase() !== "verified") {
            children.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: `Evidence status: ${evidenceStatus}`,
                    italics: true,
                  }),
                ],
                spacing: { after: 180 },
              })
            );
          }
        });
      }

      const wordDocument = new Document({
        creator: "PhysicsPrep AI",
        title: "GATE Physics Practice Paper",
        description: "Approved practice questions and answer key",
        sections: [
          {
            properties: {},
            children,
          },
        ],
      });

      const blob = await Packer.toBlob(wordDocument);
      downloadBlob(blob, getFilename("docx"));
    } catch (err) {
      console.error("Word export failed:", err);
      setError("Word document creation failed. Check the browser console.");
    }
  }

  return (
    <div className="page-content subpage-content">
      <div className="eyebrow">
        <ArrowDownToLine size={14} /> QUESTION EXPORT
      </div>

      <h1>Export questions</h1>

      <p className="page-description">
        Build a printable practice paper from reviewed and approved questions.
      </p>

      <div className="panel" style={{ padding: 24, marginTop: 24 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div className="placeholder-icon">
            <ShieldCheck size={28} />
          </div>

          <div>
            <h2 style={{ margin: 0 }}>Approved questions only</h2>
            <p style={{ marginTop: 6 }}>
              Pending and rejected questions are excluded automatically.
            </p>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
            gap: 16,
            marginTop: 24,
          }}
        >
          <label>
            <span>Source document</span>
            <select
              value={documentFilter}
              onChange={(event) => setDocumentFilter(event.target.value)}
              style={selectStyle}
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
            <span>Topic</span>
            <select
              value={topicFilter}
              onChange={(event) => setTopicFilter(event.target.value)}
              style={selectStyle}
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
            <span>Difficulty</span>
            <select
              value={difficultyFilter}
              onChange={(event) => setDifficultyFilter(event.target.value)}
              style={selectStyle}
            >
              <option value="all">All difficulties</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </label>

          <label>
            <span>Question type</span>
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              style={selectStyle}
            >
              <option value="all">All types</option>
              <option value="MCQ">MCQ</option>
              <option value="MSQ">MSQ</option>
              <option value="NAT">NAT / Numerical</option>
            </select>
          </label>
        </div>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginTop: 22,
          }}
        >
          <input
            type="checkbox"
            checked={includeAnswers}
            onChange={(event) => setIncludeAnswers(event.target.checked)}
          />
          Include a separate answer key and explanations
        </label>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
            marginTop: 24,
          }}
        >
          <div>
            <strong>{filteredQuestions.length}</strong>{" "}
            approved question(s) match your filters.
          </div>

          <button
            type="button"
            className="primary-button"
            onClick={exportPDF}
            disabled={loading || filteredQuestions.length === 0}
          >
            <ArrowDownToLine size={17} />
            Download PDF
          </button>

          <button
            type="button"
            className="primary-button"
            onClick={exportDOCX}
            disabled={loading || filteredQuestions.length === 0}
          >
            <FileText size={17} />
            Download Word
          </button>

          <button
            type="button"
            className="primary-button"
            onClick={exportCSV}
            disabled={loading || filteredQuestions.length === 0}
          >
            <FileSpreadsheet size={17} />
            Download CSV
          </button>

          <button
            type="button"
            className="text-action"
            onClick={resetFilters}
            disabled={loading}
          >
            <RotateCcw size={15} />
            Reset filters
          </button>

          <button
            type="button"
            className="text-action"
            onClick={loadQuestions}
            disabled={loading}
          >
            {loading ? (
              <LoaderCircle size={15} />
            ) : (
              <RefreshCw size={15} />
            )}
            Refresh
          </button>
        </div>

        {loading && (
          <p style={{ marginTop: 18 }}>
            <LoaderCircle size={16} /> Loading saved questions...
          </p>
        )}

        {error && (
          <p role="alert" style={{ color: "#c0392b", marginTop: 16 }}>
            {error}
          </p>
        )}

        {!loading && !error && filteredQuestions.length === 0 && (
          <p style={{ marginTop: 18 }}>
            <FileText size={17} /> No approved questions match these filters.
            Try resetting the filters or approving a question in Question Review.
          </p>
        )}

        {!loading && filteredQuestions.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <h3>Questions included ({filteredQuestions.length})</h3>

            {filteredQuestions.map((question, index) => (
              <div
                key={question.id ?? index}
                style={{
                  padding: "14px 0",
                  borderBottom: "1px solid var(--border-color, #e5e7eb)",
                }}
              >
                <div style={{ display: "flex", gap: 8, alignItems: "start" }}>
                  <CheckCircle2
                    size={17}
                    color="#16a34a"
                    style={{ flexShrink: 0, marginTop: 3 }}
                  />

                  <div>
                    <strong>
                      {index + 1}. {getQuestionText(question)}
                    </strong>

                    <p style={{ margin: "6px 0 0", fontSize: 13 }}>
                      {getTopic(question) || "Topic not set"} ·{" "}
                      {getDifficulty(question) || "Difficulty not set"} ·{" "}
                      {getQuestionType(question) || "Type not set"}
                    </p>

                    <p style={{ margin: "4px 0 0", fontSize: 12 }}>
                      Source: {getDocumentName(question)} · Evidence:{" "}
                      {getEvidenceStatus(question)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
