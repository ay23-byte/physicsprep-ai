import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
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
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

test("billing API protects account endpoints and accepts only signed Razorpay webhooks", async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "physicsprep-billing-"));
  const databasePath = path.join(tempDir, "billing.sqlite");
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const webhookSecret = "billing-webhook-test-secret";
  const server = spawn(process.execPath, ["server/index.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(port),
      PHYSICSPREP_DB_PATH: databasePath,
      SESSION_SECRET: "billing-test-session-secret-minimum-32-characters",
      RAZORPAY_WEBHOOK_SECRET: webhookSecret,
      RAZORPAY_KEY_ID: "",
      RAZORPAY_KEY_SECRET: "",
      RAZORPAY_PLAN_PRO_MONTHLY: "",
      RAZORPAY_PLAN_PRO_YEARLY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let serverOutput = "";
  server.stdout.on("data", (chunk) => { serverOutput += chunk.toString(); });
  server.stderr.on("data", (chunk) => { serverOutput += chunk.toString(); });

  t.after(async () => {
    if (server.exitCode === null && !server.killed) {
      const exited = once(server, "exit");
      server.kill();
      await Promise.race([exited, wait(2500)]);
    }
    for (const suffix of ["", "-wal", "-shm"]) {
      try { fs.rmSync(databasePath + suffix, { force: true }); } catch {}
    }
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  });

  let ready = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Billing API exited early. Output: ${serverOutput}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) { ready = true; break; }
    } catch {}
    await wait(100);
  }
  assert.equal(ready, true, `Billing API did not start. Output: ${serverOutput}`);

  const plansResponse = await fetch(`${baseUrl}/api/billing/plans`);
  assert.equal(plansResponse.status, 200);
  const plansBody = await plansResponse.json();
  assert.equal(plansBody.configured, false);
  assert.equal(plansBody.plans.find((plan) => plan.key === "pro_monthly").price, 49900);

  for (const endpoint of ["/api/billing/subscription", "/api/billing/history"]) {
    const response = await fetch(baseUrl + endpoint);
    assert.equal(response.status, 401, `${endpoint} should require a session`);
  }

  const checkoutWithoutAuth = await fetch(`${baseUrl}/api/billing/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ planKey: "pro_monthly" }),
  });
  assert.equal(checkoutWithoutAuth.status, 401);

  const registration = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "billing-test@example.test", password: "test-password-123" }),
  });
  assert.equal(registration.status, 201);
  const { user } = await registration.json();

  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "billing-test@example.test", password: "test-password-123" }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.getSetCookie?.().map((value) => value.split(";")[0]).join("; ")
    || login.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie, "Login should issue a session cookie.");

  const checkoutNotConfigured = await fetch(`${baseUrl}/api/billing/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ planKey: "pro_monthly" }),
  });
  assert.equal(checkoutNotConfigured.status, 503);

  const seedDb = new Database(databasePath);
  seedDb.prepare(`
    INSERT INTO billing_subscriptions
      (user_id, plan_key, provider_subscription_id, status)
    VALUES (?, 'pro_monthly', 'sub_test_123', 'created')
  `).run(user.id);
  seedDb.close();

  const invalidPayload = JSON.stringify({ event: "subscription.activated", payload: { subscription: { entity: { id: "sub_test_123" } } } });
  const invalidWebhook = await fetch(`${baseUrl}/api/billing/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-razorpay-signature": "invalid" },
    body: invalidPayload,
  });
  assert.equal(invalidWebhook.status, 401);

  const webhookBody = JSON.stringify({
    event: "subscription.charged",
    payload: {
      subscription: { entity: { id: "sub_test_123", current_start: 1790000000, current_end: 1792592000 } },
      payment: { entity: { id: "pay_test_123", subscription_id: "sub_test_123", amount: 49900, currency: "INR" } },
    },
  });
  const signature = createHmac("sha256", webhookSecret).update(Buffer.from(webhookBody)).digest("hex");
  const webhookResponse = await fetch(`${baseUrl}/api/billing/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-razorpay-signature": signature },
    body: webhookBody,
  });
  assert.equal(webhookResponse.status, 200, await webhookResponse.text());

  const verifiedDb = new Database(databasePath);
  const subscription = verifiedDb.prepare("SELECT status FROM billing_subscriptions WHERE provider_subscription_id = ?").get("sub_test_123");
  const payment = verifiedDb.prepare("SELECT provider_payment_id, amount, currency, status FROM billing_payments WHERE provider_payment_id = ?").get("pay_test_123");
  verifiedDb.close();

  assert.equal(subscription.status, "active");
  assert.deepEqual(payment, {
    provider_payment_id: "pay_test_123",
    amount: 49900,
    currency: "INR",
    status: "paid",
  });

  // Re-delivery of the same charge webhook must not duplicate a payment record.
  const duplicateResponse = await fetch(`${baseUrl}/api/billing/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-razorpay-signature": signature },
    body: webhookBody,
  });
  assert.equal(duplicateResponse.status, 200);
  const duplicateDb = new Database(databasePath);
  assert.equal(duplicateDb.prepare("SELECT COUNT(*) AS count FROM billing_payments WHERE provider_payment_id = ?").get("pay_test_123").count, 1);
  duplicateDb.close();
});
