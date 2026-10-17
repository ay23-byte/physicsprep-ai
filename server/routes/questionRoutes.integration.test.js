import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getFreePort() {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  await new Promise((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve())
  );
  return port;
}

test("question API blocks unsupported evidence and only approves matching quotations", async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "physicsprep-api-"));
  const databasePath = path.join(tempDir, "integration.sqlite");
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ["server/index.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      PHYSICSPREP_DB_PATH: databasePath,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let serverOutput = "";
  server.stdout.on("data", (chunk) => { serverOutput += chunk.toString(); });
  server.stderr.on("data", (chunk) => { serverOutput += chunk.toString(); });

  const cleanup = async () => {
    if (server.exitCode === null && !server.killed) {
      server.kill();
      await Promise.race([once(server, "exit"), wait(2000)]);
    }
    for (const suffix of ["", "-wal", "-shm"]) {
      try { fs.rmSync(databasePath + suffix, { force: true }); } catch {}
    }
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  };
  t.after(cleanup);

  let ready = false;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(`API server exited early. Output: ${serverOutput}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) { ready = true; break; }
    } catch {}
    await wait(100);
  }
  assert.equal(ready, true, `API server did not start. Output: ${serverOutput}`);

  const sourceText = "For an isolated system, total energy is conserved.";
  const seedDb = new Database(databasePath);
  const doc = seedDb.prepare(
    "INSERT INTO documents (filename, pages, characters, extracted_text) VALUES (?, ?, ?, ?)"
  ).run("integration-source.pdf", 1, sourceText.length, sourceText);
  seedDb.close();

  const payload = {
    documentId: doc.lastInsertRowid,
    topic: "Mechanics",
    difficulty: "Easy",
    questionType: "MCQ",
    question: "Which statement describes energy in an isolated system?",
    options: [
      "Total energy is conserved",
      "Total energy always increases",
      "Energy is destroyed",
      "Energy has no relation to the system",
    ],
    answer: "Total energy is conserved",
    explanation: "An isolated system conserves total energy.",
    sourceEvidence: "A made-up quotation that is not in the PDF.",
    evidenceStatus: "verified",
  };

  const saveResponse = await fetch(`${baseUrl}/api/questions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  assert.equal(saveResponse.status, 201);
  const saved = await saveResponse.json();
  const questionId = saved.question.id;
  assert.equal(saved.question.evidenceStatus, "unverified",
    "API must not trust a generated 'verified' evidence status");

  await t.test("rejects marking a quotation verified when it is absent from the source", async () => {
    const response = await fetch(`${baseUrl}/api/questions/${questionId}/evidence`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ evidenceStatus: "verified" }),
    });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.evidenceStatus, "unverified");
  });

  await t.test("rejects approval while evidence is unverified", async () => {
    const response = await fetch(`${baseUrl}/api/questions/${questionId}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "approved" }),
    });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /Cannot approve/);
  });

  await t.test("accepts a source-matching quotation but keeps approval as a separate action", async () => {
    const editResponse = await fetch(`${baseUrl}/api/questions/${questionId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sourceEvidence: "total energy is conserved",
      }),
    });
    assert.equal(editResponse.status, 200);
    const edited = await editResponse.json();
    assert.equal(edited.question.evidenceStatus, "unverified");
    assert.equal(edited.question.reviewStatus, "pending");

    const verifyResponse = await fetch(`${baseUrl}/api/questions/${questionId}/evidence`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ evidenceStatus: "verified" }),
    });
    assert.equal(verifyResponse.status, 200);
    const verified = await verifyResponse.json();
    assert.equal(verified.question.evidenceValid, true);
    assert.match(verified.message, /Please confirm that it supports the question and answer/);
    assert.equal(verified.question.reviewStatus, "pending",
      "matching a quotation must not approve the question automatically");

    const approveResponse = await fetch(`${baseUrl}/api/questions/${questionId}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "approved" }),
    });
    assert.equal(approveResponse.status, 200);
    assert.equal((await approveResponse.json()).question.reviewStatus, "approved");
  });

  await t.test("editing an approved question returns it to pending and invalidates old evidence verification", async () => {
    const response = await fetch(`${baseUrl}/api/questions/${questionId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ explanation: "Updated explanation." }),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.question.reviewStatus, "pending");
    assert.equal(body.question.evidenceStatus, "unverified");
    assert.equal(body.question.evidenceValid, false);
  });
});
