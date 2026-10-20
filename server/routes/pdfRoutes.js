
import express from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import db from "../db/database.js";
import { extractPdfText } from "../services/pdfService.js";
import requireAuth from "../middleware/requireAuth.js";

const router = express.Router();

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.join(currentDir, "..", "uploads");

fs.mkdirSync(uploadDir, { recursive: true });

const MAX_FILE_SIZE = 15 * 1024 * 1024;

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
  },
  fileFilter: (req, file, callback) => {
    const isPdf =
      file.mimetype === "application/pdf" &&
      path.extname(file.originalname).toLowerCase() === ".pdf";

    if (!isPdf) {
      return callback(new Error("Please upload a PDF file."));
    }

    callback(null, true);
  },
});

function parseDocumentId(value) {
  const id = Number(value);

  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function removeTemporaryFile(filePath) {
  if (!filePath) return;

  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error("Temporary PDF cleanup failed:", error.message);
  }
}

// POST /api/pdf/extract
// Upload a PDF, extract its text, and save its metadata and text in SQLite.
router.post("/extract", requireAuth, (req, res) => {
  upload.single("pdf")(req, res, async (uploadError) => {
    if (uploadError) {
      const status = uploadError instanceof multer.MulterError
        ? 400
        : 400;

      return res.status(status).json({
        error: uploadError.message || "PDF upload failed.",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        error: "Select a PDF file first.",
      });
    }

    try {
      // MIME type and extension can be spoofed. Reject files without the PDF
      // magic header before passing them to the parser.
      const signature = fs.readFileSync(req.file.path).subarray(0, 5).toString("ascii");
      if (signature !== "%PDF-") {
        return res.status(400).json({
          error: "Please upload a valid PDF file.",
        });
      }

      let extracted;

      try {
        extracted = await extractPdfText(req.file.path);
      } catch (error) {
        if (error?.code === "PDF_PAGE_LIMIT_EXCEEDED") {
          return res.status(400).json({
            error: "PDF exceeds the 300-page limit.",
          });
        }

        console.error("PDF parser failed:", error?.stack || error);
        return res.status(422).json({
          error: "This PDF could not be parsed. Please try another PDF.",
        });
      }

      if (
        !extracted ||
        typeof extracted.text !== "string" ||
        !extracted.text.trim()
      ) {
        return res.status(422).json({
          error:
            "No selectable text was found. This PDF may be scanned; OCR support is needed.",
          pages: extracted?.pages ?? 0,
        });
      }

      const characters = extracted.text.length;

      const result = db.prepare(`
        INSERT INTO documents (
          owner_id, filename, pages, characters, extracted_text
        ) VALUES (?, ?, ?, ?, ?)
      `).run(
        req.user.id, req.file.originalname, extracted.pages ?? 0,
        characters, extracted.text
      );

      const document = db.prepare(`
        SELECT
          id,
          filename,
          pages,
          characters,
          created_at AS createdAt
        FROM documents
        WHERE id = ?
      `).get(result.lastInsertRowid);

      return res.status(201).json({
        ...document,
        text: extracted.text,
        message: "PDF extracted and saved successfully.",
      });
    } catch (error) {
      console.error("PDF extraction failed:", error);

      return res.status(500).json({
        error: "Unable to extract and save this PDF.",
      });
    } finally {
      removeTemporaryFile(req.file?.path);
    }
  });
});

// GET /api/pdf/documents
// List saved documents without returning their full extracted text.
router.get("/documents", requireAuth, (req, res) => {
  try {
    const documents = db.prepare(`
      SELECT
        id,
        filename,
        pages,
        characters,
        created_at AS createdAt
      FROM documents
      WHERE owner_id = ?
      ORDER BY id DESC
    `).all(req.user.id);

    return res.json({ documents });
  } catch (error) {
    console.error("List documents failed:", error);

    return res.status(500).json({
      error: "Could not load saved documents.",
    });
  }
});

// GET /api/pdf/documents/:id
// Retrieve one saved document, including its extracted text.
router.get("/documents/:id", requireAuth, (req, res) => {
  const id = parseDocumentId(req.params.id);

  if (!id) {
    return res.status(400).json({
      error: "Invalid document ID.",
    });
  }

  try {
    const document = db.prepare(`
      SELECT
        id,
        filename,
        pages,
        characters,
        extracted_text AS text,
        created_at AS createdAt
      FROM documents
      WHERE id = ? AND owner_id = ?
    `).get(id, req.user.id);

    if (!document) {
      return res.status(404).json({
        error: "Document not found.",
      });
    }

    return res.json({ document });
  } catch (error) {
    console.error("Get document failed:", error);

    return res.status(500).json({
      error: "Could not retrieve the document.",
    });
  }
});

// GET /api/pdf/documents/:id/questions
// Return questions belonging to a particular PDF.
// Useful for showing the actual source filename with exported questions.
router.get("/documents/:id/questions", requireAuth, (req, res) => {
  const id = parseDocumentId(req.params.id);

  if (!id) {
    return res.status(400).json({
      error: "Invalid document ID.",
    });
  }

  try {
    const document = db.prepare(`
      SELECT id, filename, pages, created_at AS createdAt
      FROM documents
      WHERE id = ? AND owner_id = ?
    `).get(id, req.user.id);

    if (!document) {
      return res.status(404).json({
        error: "Document not found.",
      });
    }

    const questions = db.prepare(`
      SELECT
        id,
        document_id AS documentId,
        topic,
        difficulty,
        question_type AS questionType,
        question_text AS question,
        options_json AS optionsJson,
        answer,
        explanation,
        source_evidence AS sourceEvidence,
        evidence_status AS evidenceStatus,
        review_status AS reviewStatus,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM questions
      WHERE document_id = ?
      ORDER BY created_at DESC, id DESC
    `).all(id).map((question) => ({
      ...question,
      options: JSON.parse(question.optionsJson || "[]"),
      sourcePdf: document.filename,
      optionsJson: undefined,
    }));

    return res.json({
      document,
      questions,
    });
  } catch (error) {
    console.error("Get document questions failed:", error);

    return res.status(500).json({
      error: "Could not load questions for this document.",
    });
  }
});

// DELETE /api/pdf/documents/:id
// Delete a document record. Its related questions are deleted only if
// the database foreign key is configured with ON DELETE CASCADE.
router.delete("/documents/:id", requireAuth, (req, res) => {
  const id = parseDocumentId(req.params.id);

  if (!id) {
    return res.status(400).json({
      error: "Invalid document ID.",
    });
  }

  try {
    const result = db.prepare(
      "DELETE FROM documents WHERE id = ? AND owner_id = ?"
    ).run(id, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({
        error: "Document not found.",
      });
    }

    return res.json({
      message: "Document deleted successfully.",
      id,
    });
  } catch (error) {
    console.error("Delete document failed:", error);

    return res.status(500).json({
      error: "Could not delete the document.",
    });
  }
});

export default router;
