
const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");
const { getDuplicateMcqOptions } = require("../utils/mcqValidation.cjs");

// Find the SQLite database file in server/db.
const dbFolder = path.join(__dirname, "server", "db");

console.log("Files in server/db:");
console.log(fs.readdirSync(dbFolder));

const dbFile = fs
  .readdirSync(dbFolder)
  .find((file) => file.endsWith(".db") || file.endsWith(".sqlite"));

if (!dbFile) {
  throw new Error(
    "Database file not found. Check server/db and update the path."
  );
}

const db = new Database(path.join(dbFolder, dbFile), {
  readonly: true,
});

const questions = db
  .prepare(`
    SELECT id, question_text, options_json,
           answer, evidence_status, review_status
    FROM questions
    WHERE id IN (2, 3, 4, 5)
    ORDER BY id
  `)
  .all();

for (const q of questions) {
  console.log("\n------------------------------");
  console.log("ID:", q.id);
  console.log("Question:", q.question_text);
  console.log("Options JSON:", q.options_json);
  console.log("Parsed options:");

  try {
    const options = JSON.parse(q.options_json || "[]");
    console.log(options);

    console.log("Duplicate options:", getDuplicateMcqOptions(options));
  } catch (error) {
    console.log("Could not parse options:", error.message);
  }

  console.log("Evidence status:", q.evidence_status);
  console.log("Review status:", q.review_status);
}

db.close();
