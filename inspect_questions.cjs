const Database = require("better-sqlite3");
const path = require("path");

const { getDuplicateMcqOptions } = require("./server/utils/mcqValidation.cjs");

const dbPath = path.join(
  __dirname,
  "server",
  "data",
  "physicsprep.sqlite"
);

console.log("Database path:", dbPath);

const db = new Database(dbPath, { readonly: true });

const questions = db.prepare(`
  SELECT id, question_text, question_type, options_json,
         answer, source_evidence, evidence_status, review_status
  FROM questions
  WHERE id IN (2, 3, 4, 5)
  ORDER BY id
`).all();

for (const q of questions) {
  console.log("\n================================");
  console.log("ID:", q.id);
  console.log("Question:", q.question_text);
  console.log("Question type:", q.question_type);
  console.log("Raw options:", q.options_json);

  let options = [];

  try {
    options = JSON.parse(q.options_json || "[]");
  } catch (error) {
    console.log("JSON parsing error:", error.message);
  }

  console.log("Parsed options:", options);

  console.log("Duplicate options:", getDuplicateMcqOptions(options));

  console.log("Answer:", q.answer);
  console.log("Source evidence:", q.source_evidence);
  console.log("Evidence status:", q.evidence_status);
  console.log("Review status:", q.review_status);
}

db.close();
