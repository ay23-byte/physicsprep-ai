
import express from "express";
import db from "../db/database.js";
import { generatePhysicsQuestions } from "../services/geminiService.js";
import { verifyQuestionEvidence } from "../services/sourceVerification.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const {
      documentId,
      topic = "",
      count = 5,
      difficulty = "Medium",
      questionType = "MCQ",
    } = req.body || {};

    const parsedId = Number(documentId);
    const parsedCount = Number(count);

    // Validate the selected PDF
    if (!Number.isSafeInteger(parsedId) || parsedId < 1) {
      return res.status(400).json({
        error: "Select a saved PDF first.",
      });
    }

    // Validate question count
    if (!Number.isInteger(parsedCount) || parsedCount < 1 || parsedCount > 10) {
      return res.status(400).json({
        error: "Question count must be between 1 and 10.",
      });
    }

    // Validate difficulty
    if (!["Easy", "Medium", "Hard"].includes(difficulty)) {
      return res.status(400).json({
        error: "Invalid difficulty.",
      });
    }

    // Validate question type
    if (!["MCQ", "Numerical"].includes(questionType)) {
      return res.status(400).json({
        error: "Invalid question type.",
      });
    }

    // Retrieve the selected PDF from the database
    const document = db
      .prepare(`
        SELECT id, filename, extracted_text AS text
        FROM documents
        WHERE id = ?
      `)
      .get(parsedId);

    if (!document) {
      return res.status(404).json({
        error: "Saved PDF not found.",
      });
    }

    if (!document.text?.trim()) {
      return res.status(422).json({
        error: "This PDF does not contain usable extracted text.",
      });
    }
    const generationStart = Date.now();
    // Generate questions using the selected PDF's extracted text
    const questions = await generatePhysicsQuestions({
      sourceText: document.text,
      topic: String(topic).slice(0, 150),
      count: parsedCount,
      difficulty,
      questionType,
    });
    console.log(
      `Gemini generation took ${Date.now() - generationStart} ms`
    );
    // Check each question's supporting quotation against the PDF text
    const verificationStart = Date.now();
    const verifiedQuestions = questions.map((question) => {
      const evidenceCheck = verifyQuestionEvidence(
        question,
        document.text
      );

      return {
        ...question,
        sourceEvidence:
          typeof question.sourceEvidence === "string"
            ? question.sourceEvidence.trim()
            : "",
        evidenceStatus: "unverified",
        evidenceCheck,
      };
    });
    console.log(
      `Source verification took ${Date.now() - verificationStart} ms`
    );
    // Return questions along with their source-verification results
    return res.json({
      sourceDocument: {
        id: document.id,
        filename: document.filename,
      },
      questions: verifiedQuestions,
    });
  } catch (error) {
    console.error("Question generation failed:", error);

    return res.status(500).json({
      error: error.message?.includes("GEMINI_API_KEY")
        ? error.message
        : "Question generation failed. Check the backend terminal and Gemini API configuration.",
    });
  }
});

export default router;
