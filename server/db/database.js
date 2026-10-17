
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(currentDir, "..", "data");

fs.mkdirSync(dataDir, { recursive: true });

const databasePath = path.join(dataDir, "physicsprep.sqlite");
const db = new Database(databasePath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function ensureColumn(tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();

  if (!columns.some((column) => column.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

// Store uploaded PDF documents.
db.exec(`
  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    pages INTEGER NOT NULL DEFAULT 0,
    characters INTEGER NOT NULL DEFAULT 0,
    extracted_text TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Store generated questions and their review status.
db.exec(`
  CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    document_id INTEGER NOT NULL,
    topic TEXT NOT NULL DEFAULT '',
    difficulty TEXT NOT NULL
      CHECK (difficulty IN ('Easy', 'Medium', 'Hard')),
    question_type TEXT NOT NULL
      CHECK (question_type IN ('MCQ', 'Numerical')),

    question_text TEXT NOT NULL,
    options_json TEXT NOT NULL DEFAULT '[]',
    answer TEXT NOT NULL DEFAULT '',
    explanation TEXT NOT NULL DEFAULT '',
    source_evidence TEXT NOT NULL DEFAULT '',

    evidence_status TEXT NOT NULL DEFAULT 'unverified'
      CHECK (evidence_status IN ('verified', 'partial', 'unverified', 'missing')),

    review_status TEXT NOT NULL DEFAULT 'pending'
      CHECK (review_status IN ('pending', 'approved', 'rejected')),

    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),

    FOREIGN KEY (document_id)
      REFERENCES documents(id)
      ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_questions_document
  ON questions(document_id);

  CREATE INDEX IF NOT EXISTS idx_questions_review_status
  ON questions(review_status);
`);

// Safe for databases created before evidence_status existed.
ensureColumn(
  "questions",
  "evidence_status",
  "TEXT NOT NULL DEFAULT 'unverified'"
);

export default db;
