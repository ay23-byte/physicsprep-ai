
import express from "express";
import db from "../db/database.js";
import mcqValidation from "../utils/mcqValidation.cjs";
import { verifyQuestionEvidence } from "../services/sourceVerification.js";

const { validateMcqOptions } = mcqValidation;
const router = express.Router();

const DIFFICULTIES = ["Easy", "Medium", "Hard"];
const QUESTION_TYPES = ["MCQ", "Numerical"];
const REVIEW_STATUSES = ["pending", "approved", "rejected"];
const EVIDENCE_STATUSES = ["verified", "partial", "unverified", "missing"];
const HUMAN_EVIDENCE_STATUSES = ["missing", "unverified", "verified"];

function hasSourceEvidence(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isPlaceholderEvidence(value) {
  if (!hasSourceEvidence(value)) return true;

  return /no supporting quotation was provided|test question for checking the save and review workflow/i.test(
    value.trim()
  );
}

function coerceIncomingEvidenceStatus(evidenceStatus, sourceEvidence) {
  // Generated content cannot declare itself human-verified.
  if (evidenceStatus === "verified" || evidenceStatus === "partial") {
    return hasSourceEvidence(sourceEvidence) ? "unverified" : "missing";
  }

  return EVIDENCE_STATUSES.includes(evidenceStatus)
    ? evidenceStatus
    : null;
}

function parseId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function parseOptions(value) {
  if (Array.isArray(value)) return value;

  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const QUESTION_SELECT = `
  SELECT q.*, d.filename AS filename
  FROM questions q
  LEFT JOIN documents d ON d.id = q.document_id
`;

function getQuestion(id) {
  return db.prepare(`
    ${QUESTION_SELECT}
    WHERE q.id = ?
  `).get(id);
}

/**
 * Check whether the evidence is a genuine quotation found in the linked PDF.
 * This verifies quotation matching, not the scientific correctness of the
 * question or its answer.
 */
function checkEvidence(row) {
  if (
    !row ||
    !row.document_id ||
    !hasSourceEvidence(row.source_evidence) ||
    isPlaceholderEvidence(row.source_evidence)
  ) {
    return {
      valid: false,
      message: "Source evidence is missing or is a placeholder.",
    };
  }

  if (row.evidence_status !== "verified") {
    return {
      valid: false,
      message: "Evidence has not been marked verified.",
    };
  }

  const document = db.prepare(`
    SELECT extracted_text
    FROM documents
    WHERE id = ?
  `).get(row.document_id);

  if (!document || typeof document.extracted_text !== "string") {
    return {
      valid: false,
      message: "The linked source PDF text could not be found.",
    };
  }

  const verification = verifyQuestionEvidence(
    { sourceEvidence: row.source_evidence },
    document.extracted_text
  );

  return {
    valid: Boolean(verification.verified),
    message: verification.verified
      ? "Quotation matches the linked PDF."
      : verification.message || "Quotation does not match the linked PDF.",
  };
}

function serializeQuestion(row) {
  const options = parseOptions(row.options_json);
  const evidenceCheck = checkEvidence(row);

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
    evidenceValid: evidenceCheck.valid,
    evidenceMessage: evidenceCheck.message,
    reviewStatus: row.review_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function auditQuestionQuality(row) {
  const issues = [];
  const question = (row.question_text || "").trim();
  const topic = (row.topic || "").trim();
  const answer = (row.answer || "").trim();
  const explanation = (row.explanation || "").trim();
  const sourceEvidence = (row.source_evidence || "").trim();
  const options = parseOptions(row.options_json);

  let optionsValid = true;

  try {
    optionsValid = Array.isArray(JSON.parse(row.options_json || "[]"));
  } catch {
    optionsValid = false;
  }

  if (!optionsValid) issues.push("Invalid options JSON");
  if (!question) issues.push("Missing question text");
  if (!topic) issues.push("Missing topic");
  if (!answer) issues.push("Missing answer");
  if (!explanation) issues.push("Missing explanation");

  if (!row.document_id) {
    issues.push("Missing source document");
  } else if (!row.filename) {
    issues.push("Source document record or filename is missing");
  }

  if (!sourceEvidence) {
    issues.push("Missing source evidence");
  } else if (isPlaceholderEvidence(sourceEvidence)) {
    issues.push("Source evidence is a placeholder");
  }

  if (!DIFFICULTIES.includes(row.difficulty)) {
    issues.push("Invalid difficulty");
  }

  if (!QUESTION_TYPES.includes(row.question_type)) {
    issues.push("Invalid question type");
  }

  if (row.question_type === "MCQ") {
    const result = validateMcqOptions(options, answer);

    if (!result.hasExactlyFourOptions) {
      issues.push("MCQ must have exactly four options");
    }

    if (result.hasBlankOrInvalidOption) {
      issues.push("MCQ contains a blank or invalid option");
    }

    if (result.hasDuplicateOptions) {
      issues.push("MCQ contains duplicate options");
    }

    if (answer && !result.answerMatchesOption) {
      issues.push("Answer does not match an MCQ option");
    }
  }

  if (!REVIEW_STATUSES.includes(row.review_status)) {
    issues.push("Invalid review status");
  }

  if (!EVIDENCE_STATUSES.includes(row.evidence_status)) {
    issues.push("Invalid evidence status");
  }

  const evidenceCheck = checkEvidence(row);

  if (!evidenceCheck.valid) {
    issues.push(`Invalid source evidence: ${evidenceCheck.message}`);
  }

  if (row.review_status === "approved" && !evidenceCheck.valid) {
    issues.push("Approved question has invalid source evidence");
  }

  return issues;
}

// GET /api/questions/quality-audit
// Read-only: does not change database records.
router.get("/quality-audit", (req, res) => {
  try {
    const rows = db.prepare(`
      ${QUESTION_SELECT}
      ORDER BY q.id ASC
    `).all();

    const normalizedQuestions = new Map();

    for (const row of rows) {
      const normalized = (row.question_text || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");

      if (!normalized) continue;

      if (!normalizedQuestions.has(normalized)) {
        normalizedQuestions.set(normalized, []);
      }

      normalizedQuestions.get(normalized).push(row.id);
    }

    const results = rows.map((row) => {
      const issues = auditQuestionQuality(row);
      const normalized = (row.question_text || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");

      const duplicateIds = normalized
        ? normalizedQuestions.get(normalized) || []
        : [];

      if (duplicateIds.length > 1) {
        issues.push(
          `Possible duplicate question; matching IDs: ${duplicateIds.join(", ")}`
        );
      }

      return {
        id: row.id,
        question: row.question_text,
        topic: row.topic,
        difficulty: row.difficulty,
        questionType: row.question_type,
        reviewStatus: row.review_status,
        evidenceStatus: row.evidence_status,
        evidenceValid: checkEvidence(row).valid,
        issueCount: issues.length,
        issues,
      };
    });

    const flagged = results.filter((item) => item.issueCount > 0);

    return res.json({
      readOnly: true,
      totalQuestions: results.length,
      cleanQuestions: results.length - flagged.length,
      flaggedQuestions: flagged.length,
      results,
    });
  } catch (error) {
    console.error("Question quality audit failed:", error);
    return res.status(500).json({
      error: "Could not audit question quality.",
    });
  }
});

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
    return res.status(500).json({ error: "Could not load questions." });
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
      typeof topic !== "string" ||
      typeof answer !== "string" ||
      typeof explanation !== "string" ||
      typeof sourceEvidence !== "string"
    ) {
      return res.status(400).json({
        error: "Topic, answer, explanation, and source evidence must be text.",
      });
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
      const result = validateMcqOptions(options, answer);

      if (!result.hasExactlyFourOptions) {
        return res.status(400).json({
          error: "MCQs must contain exactly four options.",
        });
      }

      if (result.hasBlankOrInvalidOption) {
        return res.status(400).json({
          error: "MCQ options cannot be blank.",
        });
      }

      if (result.hasDuplicateOptions) {
        return res.status(400).json({
          error: "MCQ options must be unique.",
        });
      }

      if (!result.answerMatchesOption) {
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

    const result = db.prepare(`
      INSERT INTO questions (
        document_id, topic, difficulty, question_type,
        question_text, options_json, answer, explanation,
        source_evidence, evidence_status, review_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(
      parsedDocumentId,
      topic.trim().slice(0, 150),
      difficulty,
      questionType,
      question.trim(),
      JSON.stringify(options),
      answer.trim(),
      explanation.trim(),
      sourceEvidence.trim(),
      persistedEvidenceStatus
    );

    return res.status(201).json({
      message: "Question saved for review.",
      question: serializeQuestion(getQuestion(result.lastInsertRowid)),
    });
  } catch (error) {
    console.error("Save question failed:", error);
    return res.status(500).json({ error: "Could not save question." });
  }
});

// PATCH /api/questions/:id
// Edit question content; edits reset evidence and review status.
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
      topic: topic ?? existing.topic ?? "",
      difficulty: difficulty ?? existing.difficulty,
      questionType: questionType ?? existing.question_type,
      question: question ?? existing.question_text,
      options: options ?? parseOptions(existing.options_json),
      answer: answer ?? existing.answer ?? "",
      explanation: explanation ?? existing.explanation ?? "",
      sourceEvidence: sourceEvidence ?? existing.source_evidence ?? "",
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
      next.options.length > 20 ||
      !next.options.every((option) => typeof option === "string")
    ) {
      return res.status(400).json({
        error: "Invalid question fields. Check text fields and options.",
      });
    }

    if (next.questionType === "MCQ") {
      const result = validateMcqOptions(next.options, next.answer);

      if (!result.hasExactlyFourOptions || result.hasBlankOrInvalidOption) {
        return res.status(400).json({
          error: "MCQs must contain exactly four non-empty options.",
        });
      }

      if (result.hasDuplicateOptions) {
        return res.status(400).json({
          error: "MCQ options must be unique.",
        });
      }

      if (!result.answerMatchesOption) {
        return res.status(400).json({
          error: "The answer must match one of the MCQ options.",
        });
      }
    }

    db.prepare(`
      UPDATE questions SET
        topic = ?, difficulty = ?, question_type = ?,
        question_text = ?, options_json = ?, answer = ?,
        explanation = ?, source_evidence = ?,
        evidence_status = 'unverified',
        review_status = 'pending',
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      next.topic.trim(),
      next.difficulty,
      next.questionType,
      next.question.trim(),
      JSON.stringify(next.options),
      next.answer.trim(),
      next.explanation.trim(),
      next.sourceEvidence.trim(),
      id
    );

    return res.json({
      message: "Question updated. Verify its evidence and review it again.",
      question: serializeQuestion(getQuestion(id)),
    });
  } catch (error) {
    console.error("Edit question failed:", error);
    return res.status(500).json({ error: "Could not update question." });
  }
});

// PATCH /api/questions/:id/status
// Approval requires valid fields and a verified quotation in the linked PDF.
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

    const row = getQuestion(id);

    if (!row) {
      return res.status(404).json({ error: "Question not found." });
    }

    if (status === "approved") {
      const missingFields = [];

      if (!row.question_text?.trim()) missingFields.push("question text");
      if (!row.topic?.trim()) missingFields.push("topic");
      if (!row.answer?.trim()) missingFields.push("answer");
      if (!row.explanation?.trim()) missingFields.push("explanation");
      if (!row.document_id || !row.filename) missingFields.push("source PDF");
      if (!DIFFICULTIES.includes(row.difficulty)) {
        missingFields.push("valid difficulty");
      }
      if (!QUESTION_TYPES.includes(row.question_type)) {
        missingFields.push("valid question type");
      }

      const options = parseOptions(row.options_json);

      if (row.question_type === "MCQ") {
        const result = validateMcqOptions(options, row.answer);

        if (!result.hasExactlyFourOptions || result.hasBlankOrInvalidOption) {
          missingFields.push("four non-empty MCQ options");
        } else {
          if (result.hasDuplicateOptions) {
            return res.status(400).json({
              error: "Cannot approve: MCQ options contain duplicates.",
            });
          }

          if (!result.answerMatchesOption) {
            return res.status(400).json({
              error: "Cannot approve: answer must match one of the MCQ options.",
            });
          }
        }
      }

      if (missingFields.length > 0) {
        return res.status(400).json({
          error: "Cannot approve an incomplete question.",
          missingFields,
        });
      }

      const evidenceCheck = checkEvidence(row);

      if (!evidenceCheck.valid) {
        return res.status(400).json({
          error: `Cannot approve: ${evidenceCheck.message}`,
          evidenceStatus: "unverified",
        });
      }
    }

    db.prepare(`
      UPDATE questions
      SET review_status = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(status, id);

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
// Verifies quotation against the linked PDF before accepting "verified".
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

    const row = getQuestion(id);

    if (!row) {
      return res.status(404).json({ error: "Question not found." });
    }

    if (evidenceStatus === "verified") {
      if (isPlaceholderEvidence(row.source_evidence)) {
        return res.status(400).json({
          error: "Add a genuine quotation from the source PDF first.",
        });
      }

      const document = db.prepare(`
        SELECT extracted_text
        FROM documents
        WHERE id = ?
      `).get(row.document_id);

      if (!document || typeof document.extracted_text !== "string") {
        return res.status(400).json({
          error: "The linked source PDF text could not be found.",
        });
      }

      const verification = verifyQuestionEvidence(
        { sourceEvidence: row.source_evidence },
        document.extracted_text
      );

      if (!verification.verified) {
        return res.status(400).json({
          error: verification.message,
          evidenceStatus: "unverified",
        });
      }
    }

    db.prepare(`
      UPDATE questions
      SET
        evidence_status = ?,
        review_status = CASE
          WHEN ? != 'verified' AND review_status = 'approved'
          THEN 'pending'
          ELSE review_status
        END,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(evidenceStatus, evidenceStatus, id);

    return res.json({
      message:
        evidenceStatus === "verified"
          ? "Quotation matches the linked PDF. Please confirm that it supports the question and answer."
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
