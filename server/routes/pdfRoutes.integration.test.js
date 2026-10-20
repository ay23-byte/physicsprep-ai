
import { jsPDF } from "jspdf";
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address.port;

      server.close((error) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
  });
}

async function readBody(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

/**
 * Generates a valid PDF containing selectable text.
 */
async function createTextPdf(
  text = "Selectable PhysicsPrep test text."
) {
  const pdfDoc = new jsPDF({
    unit: "pt",
    format: "letter",
  });

  pdfDoc.setFont("helvetica", "normal");
  pdfDoc.setFontSize(18);
  pdfDoc.text(text, 72, 72);

  return Buffer.from(pdfDoc.output("arraybuffer"));
}

async function createMultiPagePdf(pageCount) {
  const pdfDoc = new jsPDF({
    unit: "pt",
    format: "letter",
  });

  for (let i = 1; i < pageCount; i += 1) {
    pdfDoc.addPage("letter", "portrait");
  }

  return Buffer.from(pdfDoc.output("arraybuffer"));
}

test(
  "PDF API requires authentication, isolates ownership, and validates uploads",
  async (t) => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "physicsprep-pdf-")
    );

    const databasePath = path.join(
      tempDir,
      "integration.sqlite"
    );

    const port = await getFreePort();

    const serverProcess = spawn(
      process.execPath,
      ["server/index.js"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          NODE_ENV: "test",
          PORT: String(port),
          PHYSICSPREP_DB_PATH: databasePath,
          SESSION_SECRET:
            "pdf-test-session-secret-minimum-32-characters",
        },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    let serverOutput = "";

    serverProcess.stdout.on("data", (chunk) => {
      serverOutput += chunk.toString();
    });

    serverProcess.stderr.on("data", (chunk) => {
      serverOutput += chunk.toString();
    });

    t.after(async () => {
      if (
        serverProcess.exitCode === null &&
        !serverProcess.killed
      ) {
        const exited = once(serverProcess, "exit");
        serverProcess.kill();

        await Promise.race([
          exited,
          new Promise((resolve) => setTimeout(resolve, 3000)),
        ]);
      }

      for (const file of [
        databasePath,
        `${databasePath}-wal`,
        `${databasePath}-shm`,
        `${databasePath}.sessions.sqlite`,
        `${databasePath}.sessions.sqlite-wal`,
        `${databasePath}.sessions.sqlite-shm`,
      ]) {
        try {
          fs.rmSync(file, { force: true });
        } catch {
          // Temporary test cleanup only.
        }
      }

      fs.rmSync(tempDir, {
        recursive: true,
        force: true,
      });
    });

    const baseUrl = `http://127.0.0.1:${port}`;
    let ready = false;

    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (serverProcess.exitCode !== null) {
        assert.fail(
          `Test server exited early.\n${serverOutput}`
        );
      }

      try {
        const response = await fetch(`${baseUrl}/api/health`);

        if (response.ok) {
          ready = true;
          break;
        }
      } catch {
        // Server is still starting.
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    assert.equal(
      ready,
      true,
      `Test server did not start.\n${serverOutput}`
    );

    async function createUser(email) {
      const registerResponse = await fetch(
        `${baseUrl}/api/auth/register`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email,
            password: "test-password-123",
          }),
        }
      );

      assert.equal(
        registerResponse.status,
        201,
        `Registration failed: ${await registerResponse.text()}`
      );

      const loginResponse = await fetch(
        `${baseUrl}/api/auth/login`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email,
            password: "test-password-123",
          }),
        }
      );

      assert.equal(loginResponse.status, 200);

      const cookie =
        loginResponse.headers.getSetCookie?.()
          .map((value) => value.split(";")[0])
          .join("; ") ||
        loginResponse.headers.get("set-cookie")?.split(";")[0];

      assert.ok(cookie, "Login did not set a session cookie.");

      return cookie;
    }

    async function apiFetch(route, options = {}) {
      const { cookie, ...fetchOptions } = options;

      return fetch(`${baseUrl}${route}`, {
        ...fetchOptions,
        headers: {
          ...(fetchOptions.headers || {}),
          ...(cookie ? { Cookie: cookie } : {}),
        },
      });
    }

    async function uploadPdf(
      cookie,
      filename,
      bytes,
      contentType = "application/pdf"
    ) {
      const form = new FormData();

      form.append(
        "pdf",
        new Blob([bytes], { type: contentType }),
        filename
      );

      return apiFetch("/api/pdf/extract", {
        method: "POST",
        cookie,
        body: form,
      });
    }

    const uploadDir = path.join(
      process.cwd(),
      "server",
      "uploads"
    );

    function currentUploadFiles() {
      if (!fs.existsSync(uploadDir)) return [];
      return fs.readdirSync(uploadDir).sort();
    }

    const cookieA = await createUser(
      "pdf-user-a@example.test"
    );

    const cookieB = await createUser(
      "pdf-user-b@example.test"
    );

    const seedDb = new Database(databasePath);

    const insertDocument = seedDb.prepare(`
      INSERT INTO documents (
        owner_id, filename, pages, characters, extracted_text
      )
      VALUES (?, ?, ?, ?, ?)
    `);

    const documentA = insertDocument.run(
      1,
      "user-a.pdf",
      2,
      40,
      "User A's private source text."
    ).lastInsertRowid;

    const documentB = insertDocument.run(
      2,
      "user-b.pdf",
      1,
      25,
      "User B's private source text."
    ).lastInsertRowid;

    seedDb.close();

    await t.test(
      "rejects unauthenticated PDF API requests",
      async () => {
        const response = await apiFetch(
          "/api/pdf/documents"
        );

        assert.equal(response.status, 401);
      }
    );

    await t.test(
      "rejects PDF uploads without authentication",
      async () => {
        const response = await uploadPdf(
          null,
          "sample.pdf",
          await createTextPdf()
        );

        assert.equal(response.status, 401);
      }
    );

    await t.test(
      "accepts a valid text PDF and saves it to the user's account",
      async () => {
        const before = currentUploadFiles();

        const response = await uploadPdf(
          cookieA,
          "physics-test.pdf",
          await createTextPdf(
            "Selectable PhysicsPrep test text."
          )
        );

        const body = await readBody(response);

        assert.equal(
            response.status,
            201,
            `Upload failed: ${JSON.stringify(body)}\nServer logs:\n${serverOutput}`
          );

        assert.equal(body.filename, "physics-test.pdf");
        assert.match(
          body.text,
          /Selectable PhysicsPrep test text/
        );
        assert.equal(body.pages, 1);

        assert.ok(
          body.id !== undefined,
          "Response should include the document ID."
        );

        const verifyDb = new Database(databasePath, {
          readonly: true,
        });

        try {
          const saved = verifyDb.prepare(`
            SELECT owner_id, filename, extracted_text
            FROM documents
            WHERE id = ?
          `).get(body.id);

          assert.ok(saved, "Uploaded document should be stored.");
          assert.equal(saved.owner_id, 1);
          assert.equal(saved.filename, "physics-test.pdf");
          assert.match(
            saved.extracted_text,
            /Selectable PhysicsPrep test text/
          );
        } finally {
          verifyDb.close();
        }

        assert.deepEqual(
          currentUploadFiles(),
          before,
          "Temporary PDF files should be removed after successful upload."
        );
      }
    );

    await t.test(
      "rejects a non-PDF file renamed with a PDF extension",
      async () => {
        const before = currentUploadFiles();

        const response = await uploadPdf(
          cookieA,
          "fake.pdf",
          Buffer.from("This is not a PDF.")
        );

        assert.equal(response.status, 400);

        assert.deepEqual(
          currentUploadFiles(),
          before,
          "Rejected fake uploads should not leave temporary files."
        );
      }
    );

    await t.test(
      "handles a malformed PDF with a PDF signature safely",
      async () => {
        const before = currentUploadFiles();

        const response = await uploadPdf(
          cookieA,
          "malformed.pdf",
          Buffer.from(
            "%PDF-1.4\nThis is not a complete PDF document."
          )
        );

        assert.ok(
          [400, 422, 500].includes(response.status),
          `Unexpected response status: ${response.status}`
        );

        assert.deepEqual(
          currentUploadFiles(),
          before,
          "Malformed PDF uploads should not leave temporary files."
        );
      }
    );

    await t.test(
      "rejects PDFs exceeding the 300-page limit and cleans up temporary files",
      async () => {
        const before = currentUploadFiles();
        const pdfBytes = await createMultiPagePdf(301);

        const response = await uploadPdf(
          cookieA,
          "too-many-pages.pdf",
          pdfBytes
        );

        const body = await readBody(response);

        assert.equal(response.status, 400);
        assert.match(body.error, /300-page limit/i);

        assert.deepEqual(
          currentUploadFiles(),
          before,
          "Rejected page-limit uploads should not leave temporary files."
        );
      }
    );

    await t.test(
      "rejects uploads exceeding the 15 MB limit",
      async () => {
        const before = currentUploadFiles();

        const oversized = Buffer.alloc(
          15 * 1024 * 1024 + 1,
          0x41
        );

        const response = await uploadPdf(
          cookieA,
          "oversized.pdf",
          oversized
        );

        assert.equal(response.status, 400);

        assert.deepEqual(
          currentUploadFiles(),
          before,
          "Oversized uploads should not leave temporary files."
        );
      }
    );

    await t.test(
      "each user only sees their own document list",
      async () => {
        const responseA = await apiFetch(
          "/api/pdf/documents",
          { cookie: cookieA }
        );

        const responseB = await apiFetch(
          "/api/pdf/documents",
          { cookie: cookieB }
        );

        assert.equal(responseA.status, 200);
        assert.equal(responseB.status, 200);

        const bodyA = await readBody(responseA);
        const bodyB = await readBody(responseB);

        assert.deepEqual(
          bodyA.documents.map((document) => document.filename).sort(),
          ["physics-test.pdf", "user-a.pdf"]
        );

        assert.deepEqual(
          bodyB.documents.map((document) => document.filename).sort(),
          ["user-b.pdf"]
        );
      }
    );

    await t.test(
      "blocks cross-account document and question reads",
      async () => {
        const documentResponse = await apiFetch(
          `/api/pdf/documents/${documentA}`,
          { cookie: cookieB }
        );

        const questionsResponse = await apiFetch(
          `/api/pdf/documents/${documentA}/questions`,
          { cookie: cookieB }
        );

        assert.equal(documentResponse.status, 404);
        assert.equal(questionsResponse.status, 404);
      }
    );

    await t.test(
      "blocks cross-account deletion and preserves the document",
      async () => {
        const deleteResponse = await apiFetch(
          `/api/pdf/documents/${documentA}`,
          {
            method: "DELETE",
            cookie: cookieB,
          }
        );

        assert.equal(deleteResponse.status, 404);

        const verifyDb = new Database(databasePath, {
          readonly: true,
        });

        try {
          const preserved = verifyDb.prepare(
            "SELECT id, filename FROM documents WHERE id = ?"
          ).get(documentA);

          assert.ok(
            preserved,
            "User A's document was unexpectedly deleted."
          );
          assert.equal(preserved.filename, "user-a.pdf");
        } finally {
          verifyDb.close();
        }
      }
    );

    await t.test(
      "allows an owner to delete their own document",
      async () => {
        const response = await apiFetch(
          `/api/pdf/documents/${documentB}`,
          {
            method: "DELETE",
            cookie: cookieB,
          }
        );

        assert.equal(response.status, 200);

        assert.equal(
          (await readBody(response)).message,
          "Document deleted successfully."
        );
      }
    );
  }
);
