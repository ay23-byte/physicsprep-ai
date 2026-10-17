
import express from "express";
import db from "../db/database.js";
import mcqValidation from "../utils/mcqValidation.cjs";

const { validateMcqOptions } = mcqValidation;

const router = express.Router();

const DIFFICULTIES = ["Easy", "Medium", "Hard"];
const QUESTION_TYPES = ["MCQ", "Numerical"];
const REVIEW_STATUSES = ["pending", "approved", "rejected"];
const EVIDENCE_STATUSES = [
  "verified",
  "partial",
  "unverified",
  "missing",
];
const HUMAN_EVIDENCE_STATUSES = ["missing", "unverified", "verified"];

function hasSourceEvidence(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function coerceIncomingEvidenceStatus(evidenceStatus, sourceEvidence) {
  // AI/source matching must never persist a human "verified" state.
  if (evidenceStatus === "verified" || evidenceStatus === "partial") {
    return hasSourceEvidence(sourceEvidence) ? "unverified" : "missing";
  }

  if (!EVIDENCE_STATUSES.includes(evidenceStatus)) {
    return null;
  }

  return evidenceStatus;
}

function parseId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function serializeQuestion(row) {
  let options = [];

  try {
    options = JSON.parse(row.options_json || "[]");
    if (!Array.isArray(options)) options = [];
  } catch {
    options = [];
  }

  return {
    id: row.id,
    documentId: row.document_id,
    filename: row.filename || "",
    sourcePdf: row.filename || "",
    topic: row.topic,
    difficulty: row.difficulty,
    questionType: row.question_type,
    question: row.question_text,
    options,
    answer: row.answer,
    explanation: row.explanation,
    sourceEvidence: row.source_evidence,
    evidenceStatus: row.evidence_status,
    reviewStatus: row.review_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Include the source document filename with each question.
const QUESTION_SELECT = `
  SELECT
    q.*,
    d.filename AS filename
  FROM questions q
  LEFT JOIN documents d ON d.id = q.document_id
`;

function getQuestion(id) {
  return db.prepare(`
    ${QUESTION_SELECT}
    WHERE q.id = ?
  `).get(id);
}

// GET /api/questions
// Optional filters: ?documentId=1&status=approved
router.get("/", (req, res) => {
  try {
    const conditions = [];
    const values = [];

    if (req.query.documentId !== undefined) {
      const documentId = parseId(req.query.documentId);

      if (!documentId) {
        return res.status(400).json({ error: "Invalid document ID." });
      }

      conditions.push("q.document_id = ?");
      values.push(documentId);
    }

    if (req.query.status !== undefined) {
      if (!REVIEW_STATUSES.includes(req.query.status)) {
        return res.status(400).json({ error: "Invalid review status." });
      }

      conditions.push("q.review_status = ?");
      values.push(req.query.status);
    }

    const where = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const rows = db.prepare(`
      ${QUESTION_SELECT}
      ${where}
      ORDER BY q.created_at DESC, q.id DESC
    `).all(...values);

    return res.json({
      questions: rows.map(serializeQuestion),
    });
  } catch (error) {
    console.error("List questions failed:", error);
    return res.status(500).json({
      error: "Could not load saved questions.",
    });
  }
});

// POST /api/questions
// Save a generated question for review.
router.post("/", (req, res) => {
  try {
    const {
      documentId,
      topic = "",
      difficulty,
      questionType,
      question,
      options = [],
      answer = "",
      explanation = "",
      sourceEvidence = "",
      evidenceStatus = "unverified",
    } = req.body || {};

    const parsedDocumentId = parseId(documentId);

    if (!parsedDocumentId) {
      return res.status(400).json({ error: "Invalid document ID." });
    }

    const document = db.prepare(
      "SELECT id FROM documents WHERE id = ?"
    ).get(parsedDocumentId);

    if (!document) {
      return res.status(404).json({ error: "Source PDF not found." });
    }

    if (!DIFFICULTIES.includes(difficulty)) {
      return res.status(400).json({ error: "Invalid difficulty." });
    }

    if (!QUESTION_TYPES.includes(questionType)) {
      return res.status(400).json({ error: "Invalid question type." });
    }

    if (typeof question !== "string" || !question.trim()) {
      return res.status(400).json({ error: "Question text is required." });
    }

    if (
      !Array.isArray(options) ||
      options.length > 20 ||
      !options.every((option) => typeof option === "string")
    ) {
      return res.status(400).json({
        error: "Options must be an array of strings.",
      });
    }

    if (questionType === "MCQ") {
      const mcqOptions = validateMcqOptions(options, answer);

      if (!mcqOptions.hasExactlyFourOptions) {
        return res.status(400).json({
          error: "MCQs must contain exactly four options.",
        });
      }

      if (mcqOptions.hasBlankOrInvalidOption) {
        return res.status(400).json({
          error: "MCQ options cannot be blank.",
        });
      }

      if (mcqOptions.hasDuplicateOptions) {
        return res.status(400).json({
          error: "MCQ options must be unique.",
        });
      }

      if (!mcqOptions.answerMatchesOption) {
        return res.status(400).json({
          error: "The answer must match one of the MCQ options.",
        });
      }
    }

    const persistedEvidenceStatus = coerceIncomingEvidenceStatus(
      evidenceStatus,
      sourceEvidence
    );

    if (!persistedEvidenceStatus) {
      return res.status(400).json({ error: "Invalid evidence status." });
    }

    for (const [name, value] of Object.entries({
      topic,
      answer,
      explanation,
      sourceEvidence,
    })) {
      if (typeof value !== "string") {
        return res.status(400).json({
          error: `${name} must be text.`,
        });
      }
    }

    const result = db.prepare(`
      INSERT INTO questions (
        document_id,
        topic,
        difficulty,
        question_type,
        question_text,
        options_json,
        answer,
        explanation,
        source_evidence,
        evidence_status,
        review_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(
      parsedDocumentId,
      topic.slice(0, 150),
      difficulty,
      questionType,
      question.trim(),
      JSON.stringify(options),
      answer,
      explanation,
      sourceEvidence,
      persistedEvidenceStatus
    );

    return res.status(201).json({
      message: "Question saved for review.",
      question: serializeQuestion(getQuestion(result.lastInsertRowid)),
    });
  } catch (error) {
    console.error("Save question failed:", error);
    return res.status(500).json({
      error: "Could not save question.",
    });
  }
});

// PATCH /api/questions/:id
// Edit question content. Edited questions return to pending review.
router.patch("/:id", (req, res) => {
  try {
    const id = parseId(req.params.id);

    if (!id) {
      return res.status(400).json({ error: "Invalid question ID." });
    }

    const existing = getQuestion(id);

    if (!existing) {
      return res.status(404).json({ error: "Question not found." });
    }

    const {
      topic,
      difficulty,
      questionType,
      question,
      options,
      answer,
      explanation,
      sourceEvidence,
    } = req.body || {};

    const next = {
      topic: topic ?? existing.topic,
      difficulty: difficulty ?? existing.difficulty,
      questionType: questionType ?? existing.question_type,
      question: question ?? existing.question_text,
      options: options ?? JSON.parse(existing.options_json || "[]"),
      answer: answer ?? existing.answer,
      explanation: explanation ?? existing.explanation,
      sourceEvidence: sourceEvidence ?? existing.source_evidence,
    };

    if (
      typeof next.topic !== "string" ||
      next.topic.length > 150 ||
      !DIFFICULTIES.includes(next.difficulty) ||
      !QUESTION_TYPES.includes(next.questionType) ||
      typeof next.question !== "string" ||
      !next.question.trim() ||
      typeof next.answer !== "string" ||
      typeof next.explanation !== "string" ||
      typeof next.sourceEvidence !== "string" ||
      !Array.isArray(next.options) ||
      !next.options.every((option) => typeof option === "string") ||
      next.options.length > 20
    ) {
      return res.status(400).json({
        error: "Invalid question fields. Check MCQ options and text fields.",
      });
    }

    if (next.questionType === "MCQ") {
      const mcqOptions = validateMcqOptions(
        next.options,
        next.answer
      );

      if (
        !mcqOptions.hasExactlyFourOptions ||
        mcqOptions.hasBlankOrInvalidOption
      ) {
        return res.status(400).json({
          error: "MCQs must contain exactly four non-empty options.",
        });
      }

      if (mcqOptions.hasDuplicateOptions) {
        return res.status(400).json({
          error: "MCQ options must be unique.",
        });
      }

      if (!mcqOptions.answerMatchesOption) {
        return res.status(400).json({
          error: "The answer must match one of the MCQ options.",
        });
      }
    }

    db.prepare(`
      UPDATE questions SET
        topic = ?,
        difficulty = ?,
        question_type = ?,
        question_text = ?,
        options_json = ?,
        answer = ?,
        explanation = ?,
        source_evidence = ?,
        review_status = 'pending',
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      next.topic,
      next.difficulty,
      next.questionType,
      next.question.trim(),
      JSON.stringify(next.options),
      next.answer,
      next.explanation,
      next.sourceEvidence,
      id
    );

    return res.json({
      message: "Question updated. Please review it again.",
      question: serializeQuestion(getQuestion(id)),
    });
  } catch (error) {
    console.error("Edit question failed:", error);
    return res.status(500).json({
      error: "Could not update question.",
    });
  }
});

// PATCH /api/questions/:id/status
// Approve or reject a question.
router.patch("/:id/status", (req, res) => {
  try {
    const id = parseId(req.params.id);
    const { status } = req.body || {};

    if (!id) {
      return res.status(400).json({ error: "Invalid question ID." });
    }

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({
        error: "Status must be approved or rejected.",
      });
    }

    const result = db.prepare(`
      UPDATE questions
      SET review_status = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(status, id);

    if (result.changes === 0) {
      return res.status(404).json({ error: "Question not found." });
    }

    return res.json({
      message: `Question ${status}.`,
      question: serializeQuestion(getQuestion(id)),
    });
  } catch (error) {
    console.error("Review question failed:", error);
    return res.status(500).json({
      error: "Could not update review status.",
    });
  }
});

// PATCH /api/questions/:id/evidence
// Human-only source verification. Does not change review_status.
router.patch("/:id/evidence", (req, res) => {
  try {
    const id = parseId(req.params.id);
    const { evidenceStatus } = req.body || {};

    if (!id) {
      return res.status(400).json({ error: "Invalid question ID." });
    }

    if (!HUMAN_EVIDENCE_STATUSES.includes(evidenceStatus)) {
      return res.status(400).json({
        error: "Evidence status must be missing, unverified, or verified.",
      });
    }

    const result = db.prepare(`
      UPDATE questions
      SET evidence_status = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(evidenceStatus, id);

    if (result.changes === 0) {
      return res.status(404).json({ error: "Question not found." });
    }

    return res.json({
      message:
        evidenceStatus === "verified"
          ? "Evidence marked as verified."
          : evidenceStatus === "missing"
            ? "Evidence marked as missing."
            : "Evidence returned to unverified.",
      question: serializeQuestion(getQuestion(id)),
    });
  } catch (error) {
    console.error("Update evidence status failed:", error);
    return res.status(500).json({
      error: "Could not update evidence status.",
    });
  }
});

export default router;
