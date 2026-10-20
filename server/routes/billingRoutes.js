import express from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import db from "../db/database.js";
import requireAuth from "../middleware/requireAuth.js";

const router = express.Router();
const PLANS = [
  { key: "starter", name: "Starter", price: 0, currency: "INR", interval: "forever", description: "Explore the core workspace", features: ["PDF library", "Question review and question bank", "Manual exports"] },
  { key: "pro_monthly", name: "Pro Monthly", price: Number(process.env.BILLING_PRO_MONTHLY_PRICE || 49900), currency: "INR", interval: "monthly", description: "For regular exam preparation", features: ["Everything in Starter", "Higher AI generation allowance", "Priority workflow features"] },
  { key: "pro_yearly", name: "Pro Yearly", price: Number(process.env.BILLING_PRO_YEARLY_PRICE || 499900), currency: "INR", interval: "yearly", description: "One year of Pro access", features: ["Everything in Pro Monthly", "Annual billing"] },
];
const planIdFor = (key) => key === "pro_monthly"
  ? process.env.RAZORPAY_PLAN_PRO_MONTHLY
  : key === "pro_yearly" ? process.env.RAZORPAY_PLAN_PRO_YEARLY : null;
const configured = () => Boolean(
  process.env.RAZORPAY_KEY_ID &&
  process.env.RAZORPAY_KEY_SECRET &&
  process.env.RAZORPAY_WEBHOOK_SECRET &&
  planIdFor("pro_monthly") &&
  planIdFor("pro_yearly")
);

function safeEqualHex(actual, expected) {
  if (
    typeof actual !== "string" ||
    typeof expected !== "string" ||
    !/^[a-f0-9]{64}$/i.test(actual) ||
    !/^[a-f0-9]{64}$/i.test(expected)
  ) return false;

  const a = Buffer.from(actual, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

async function razorpay(path, method = "GET", payload) {
  const response = await fetch("https://api.razorpay.com/v1" + path, {
    method,
    headers: {
      Authorization: "Basic " + Buffer.from(
        process.env.RAZORPAY_KEY_ID + ":" + process.env.RAZORPAY_KEY_SECRET
      ).toString("base64"),
      ...(payload ? { "Content-Type": "application/json" } : {}),
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error?.description || "Payment provider request failed.");
    error.status = response.status;
    throw error;
  }
  return body;
}

function currentSubscription(userId) {
  return db.prepare(`
    SELECT id, plan_key AS planKey,
      provider_subscription_id AS providerSubscriptionId,
      status, current_period_start AS currentPeriodStart,
      current_period_end AS currentPeriodEnd,
      cancel_at_period_end AS cancelAtPeriodEnd,
      created_at AS createdAt, updated_at AS updatedAt
    FROM billing_subscriptions
    WHERE user_id = ?
    ORDER BY id DESC LIMIT 1
  `).get(userId) || null;
}

function unixDate(value) {
  return Number.isSafeInteger(value) && value > 0
    ? new Date(value * 1000).toISOString()
    : null;
}

router.get("/plans", (_req, res) => {
  // The key ID is the provider's public checkout identifier; secrets never leave the server.
  res.json({
    provider: "razorpay",
    configured: configured(),
    keyId: process.env.RAZORPAY_KEY_ID || null,
    plans: PLANS,
  });
});

router.get("/subscription", requireAuth, (req, res) => {
  res.json({ subscription: currentSubscription(req.user.id), configured: configured() });
});

router.get("/history", requireAuth, (req, res) => {
  const invoices = db.prepare(`
    SELECT id, provider_payment_id AS providerPaymentId,
      amount, currency, status, description,
      paid_at AS paidAt, created_at AS createdAt
    FROM billing_payments
    WHERE user_id = ? ORDER BY id DESC LIMIT 50
  `).all(req.user.id);
  res.json({ invoices });
});

router.post("/checkout", requireAuth, async (req, res) => {
  const planKey = req.body?.planKey;
  if (!["pro_monthly", "pro_yearly"].includes(planKey)) {
    return res.status(400).json({ error: "Choose a valid paid plan." });
  }
  if (!configured()) {
    return res.status(503).json({
      error: "Online billing is not configured yet. Add Razorpay API keys, webhook secret, and both subscription plan IDs to the server .env file.",
    });
  }

  const previous = currentSubscription(req.user.id);
  const blockingStatuses = new Set(["created", "authenticated", "active", "pending", "paused"]);
  if (previous && blockingStatuses.has(String(previous.status).toLowerCase())) {
    return res.status(409).json({
      error: "A subscription is already in progress or active. Refresh your billing page before starting another checkout.",
      subscription: previous,
    });
  }

  try {
    const user = db.prepare("SELECT id, email FROM users WHERE id = ?").get(req.user.id);
    if (!user) return res.status(401).json({ error: "Authentication required." });

    const plan = PLANS.find((item) => item.key === planKey);
    const providerPlanId = planIdFor(planKey);

    // Never charge a customer against a provider plan whose amount differs from the price shown in-app.
    const providerPlan = await razorpay("/plans/" + encodeURIComponent(providerPlanId));
    if (
      Number(providerPlan.amount) !== plan.price ||
      String(providerPlan.currency || "").toUpperCase() !== plan.currency
    ) {
      console.error("Razorpay plan amount/currency mismatch for", planKey);
      return res.status(503).json({
        error: "The payment provider plan does not match the price shown in PhysicsPrep. Please contact the administrator; no checkout was created.",
      });
    }

    const created = await razorpay("/subscriptions", "POST", {
      plan_id: providerPlanId,
      // Razorpay subscriptions require a finite billing count. Keep this explicit in the provider plan.
      total_count: planKey === "pro_monthly" ? 100 : 10,
      customer_notify: 1,
      notes: { physicsprep_user_id: String(user.id), plan_key: planKey },
    });

    db.prepare(`
      INSERT INTO billing_subscriptions
        (user_id, plan_key, provider_subscription_id, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(user.id, planKey, created.id, created.status || "created");

    return res.status(201).json({
      subscriptionId: created.id,
      shortUrl: created.short_url || null,
      keyId: process.env.RAZORPAY_KEY_ID,
      email: user.email,
      plan,
      providerStatus: created.status,
    });
  } catch (error) {
    console.error("Create billing subscription failed:", error.message);
    return res.status(502).json({
      error: "Could not create a subscription with the payment provider. Please retry in a moment.",
    });
  }
});

router.post("/cancel", requireAuth, async (req, res) => {
  const subscription = currentSubscription(req.user.id);
  if (!subscription?.providerSubscriptionId) {
    return res.status(404).json({ error: "No paid subscription was found." });
  }
  if (!configured()) return res.status(503).json({ error: "Razorpay billing is not configured." });
  if (["cancelled", "completed"].includes(String(subscription.status).toLowerCase())) {
    return res.status(409).json({ error: "This subscription is already ended." });
  }

  try {
    const result = await razorpay(
      "/subscriptions/" + encodeURIComponent(subscription.providerSubscriptionId) + "/cancel",
      "POST",
      { cancel_at_cycle_end: 1 },
    );
    db.prepare(`
      UPDATE billing_subscriptions
      SET status = ?, cancel_at_period_end = 1, updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).run(result.status || subscription.status, subscription.id, req.user.id);
    return res.json({
      message: "Cancellation requested for the end of the billing cycle.",
      subscription: currentSubscription(req.user.id),
    });
  } catch (error) {
    console.error("Cancel billing subscription failed:", error.message);
    return res.status(502).json({ error: "Could not cancel the subscription with the payment provider." });
  }
});

// server/index.js preserves the exact JSON request bytes as req.rawBody for signature verification.
router.post("/webhook", (req, res) => {
  const signature = req.headers["x-razorpay-signature"];
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !Buffer.isBuffer(req.rawBody)) {
    return res.status(503).json({ error: "Webhook is not configured." });
  }

  const expected = createHmac("sha256", secret).update(req.rawBody).digest("hex");
  if (!safeEqualHex(signature, expected)) {
    return res.status(401).json({ error: "Invalid webhook signature." });
  }

  let event;
  try {
    event = JSON.parse(req.rawBody.toString("utf8"));
  } catch {
    return res.status(400).json({ error: "Invalid webhook payload." });
  }

  const subscription = event.payload?.subscription?.entity;
  const payment = event.payload?.payment?.entity;
  const subscriptionId = subscription?.id || payment?.subscription_id;
  const eventStatus = event.event;
  const statusMap = {
    "subscription.activated": "active",
    "subscription.authenticated": "authenticated",
    "subscription.pending": "pending",
    "subscription.halted": "halted",
    "subscription.cancelled": "cancelled",
    "subscription.completed": "completed",
    "subscription.paused": "paused",
    "subscription.resumed": "active",
    "subscription.charged": "active",
  };

  const transaction = db.transaction(() => {
    if (subscriptionId && statusMap[eventStatus]) {
      db.prepare(`
        UPDATE billing_subscriptions
        SET status = ?,
          current_period_start = COALESCE(?, current_period_start),
          current_period_end = COALESCE(?, current_period_end),
          updated_at = datetime('now')
        WHERE provider_subscription_id = ?
      `).run(
        statusMap[eventStatus],
        unixDate(subscription?.current_start),
        unixDate(subscription?.current_end),
        subscriptionId,
      );

      if (["subscription.cancelled", "subscription.completed"].includes(eventStatus)) {
        db.prepare("UPDATE billing_subscriptions SET cancel_at_period_end = 1 WHERE provider_subscription_id = ?")
          .run(subscriptionId);
      }
    }

    if (payment?.id && subscriptionId && ["payment.captured", "subscription.charged"].includes(eventStatus)) {
      const owned = db.prepare(
        "SELECT user_id, plan_key FROM billing_subscriptions WHERE provider_subscription_id = ?"
      ).get(subscriptionId);
      if (owned) {
        db.prepare(`
          INSERT OR IGNORE INTO billing_payments
            (user_id, provider_payment_id, provider_subscription_id, amount, currency, status, description, paid_at, created_at)
          VALUES (?, ?, ?, ?, ?, 'paid', ?, datetime('now'), datetime('now'))
        `).run(
          owned.user_id,
          payment.id,
          subscriptionId,
          Number.isSafeInteger(payment.amount) && payment.amount >= 0 ? payment.amount : 0,
          payment.currency || "INR",
          "PhysicsPrep " + owned.plan_key + " subscription",
        );
      }
    }

    if (payment?.id && subscriptionId && eventStatus === "payment.failed") {
      const owned = db.prepare(
        "SELECT user_id, plan_key FROM billing_subscriptions WHERE provider_subscription_id = ?"
      ).get(subscriptionId);
      if (owned) {
        db.prepare(`
          INSERT OR IGNORE INTO billing_payments
            (user_id, provider_payment_id, provider_subscription_id, amount, currency, status, description, created_at)
          VALUES (?, ?, ?, ?, ?, 'failed', ?, datetime('now'))
        `).run(
          owned.user_id,
          payment.id,
          subscriptionId,
          Number.isSafeInteger(payment.amount) && payment.amount >= 0 ? payment.amount : 0,
          payment.currency || "INR",
          "Failed " + owned.plan_key + " subscription payment",
        );
      }
    }
  });

  try {
    transaction();
    return res.json({ received: true });
  } catch (error) {
    console.error("Process Razorpay webhook failed:", error.message);
    return res.status(500).json({ error: "Webhook processing failed." });
  }
});

export default router;
