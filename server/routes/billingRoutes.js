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
const planIdFor = (key) => key === "pro_monthly" ? process.env.RAZORPAY_PLAN_PRO_MONTHLY : key === "pro_yearly" ? process.env.RAZORPAY_PLAN_PRO_YEARLY : null;
const configured = () => Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET && process.env.RAZORPAY_WEBHOOK_SECRET && planIdFor("pro_monthly") && planIdFor("pro_yearly"));
function safeEqualHex(actual, expected) {
  if (!actual || !expected || !/^[a-f0-9]+$/i.test(actual) || !/^[a-f0-9]+$/i.test(expected)) return false;
  const a = Buffer.from(actual, "hex"); const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
async function razorpay(path, method = "GET", payload) {
  const response = await fetch("https://api.razorpay.com/v1" + path, {
    method,
    headers: {
      Authorization: "Basic " + Buffer.from(process.env.RAZORPAY_KEY_ID + ":" + process.env.RAZORPAY_KEY_SECRET).toString("base64"),
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
  return db.prepare(`SELECT id, plan_key AS planKey, provider_subscription_id AS providerSubscriptionId, status, current_period_start AS currentPeriodStart, current_period_end AS currentPeriodEnd, cancel_at_period_end AS cancelAtPeriodEnd, created_at AS createdAt, updated_at AS updatedAt FROM billing_subscriptions WHERE user_id = ? ORDER BY id DESC LIMIT 1`).get(userId) || null;
}
router.get("/plans", (_req, res) => {
  res.json({ provider: "razorpay", configured: configured(), keyId: process.env.RAZORPAY_KEY_ID || null, plans: PLANS });
});
router.get("/subscription", requireAuth, (req, res) => {
  res.json({ subscription: currentSubscription(req.user.id), configured: configured() });
});
router.get("/history", requireAuth, (req, res) => {
  const invoices = db.prepare(`SELECT id, provider_payment_id AS providerPaymentId, amount, currency, status, description, paid_at AS paidAt, created_at AS createdAt FROM billing_payments WHERE user_id = ? ORDER BY id DESC LIMIT 50`).all(req.user.id);
  res.json({ invoices });
});
router.post("/checkout", requireAuth, async (req, res) => {
  const planKey = req.body?.planKey;
  if (!["pro_monthly", "pro_yearly"].includes(planKey)) return res.status(400).json({ error: "Choose a valid paid plan." });
  if (!configured()) return res.status(503).json({ error: "Online billing is not configured yet. Add Razorpay API keys, webhook secret, and both subscription plan IDs to the server .env file." });
  try {
    const user = db.prepare("SELECT id, email FROM users WHERE id = ?").get(req.user.id);
    if (!user) return res.status(401).json({ error: "Authentication required." });
    const providerPlanId = planIdFor(planKey);
    const created = await razorpay("/subscriptions", "POST", {
      plan_id: providerPlanId,
      total_count: planKey === "pro_monthly" ? 120 : 10,
      customer_notify: 1,
      notes: { physicsprep_user_id: String(user.id), plan_key: planKey },
    });
    db.prepare(`INSERT INTO billing_subscriptions (user_id, plan_key, provider_subscription_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`).run(user.id, planKey, created.id, created.status || "created");
    res.status(201).json({ subscriptionId: created.id, shortUrl: created.short_url || null, keyId: process.env.RAZORPAY_KEY_ID, email: user.email, plan: PLANS.find((plan) => plan.key === planKey), providerStatus: created.status });
  } catch (error) {
    console.error("Create billing subscription failed:", error.message);
    res.status(502).json({ error: error.message || "Could not create a subscription with the payment provider." });
  }
});
router.post("/cancel", requireAuth, async (req, res) => {
  const subscription = currentSubscription(req.user.id);
  if (!subscription?.providerSubscriptionId) return res.status(404).json({ error: "No paid subscription was found." });
  if (!configured()) return res.status(503).json({ error: "Razorpay billing is not configured." });
  try {
    const result = await razorpay("/subscriptions/" + encodeURIComponent(subscription.providerSubscriptionId) + "/cancel", "POST", { cancel_at_cycle_end: 1 });
    db.prepare("UPDATE billing_subscriptions SET status = ?, cancel_at_period_end = 1, updated_at = datetime('now') WHERE id = ? AND user_id = ?").run(result.status || "authenticated", subscription.id, req.user.id);
    res.json({ message: "Cancellation requested for the end of the billing cycle.", subscription: currentSubscription(req.user.id) });
  } catch (error) {
    console.error("Cancel billing subscription failed:", error.message);
    res.status(502).json({ error: error.message || "Could not cancel the subscription." });
  }
});
// Configure express.json with a verify callback in server/index.js so the exact bytes
// received from Razorpay can be checked before trusting a webhook event.
router.post("/webhook", express.raw({ type: "application/json" }), (req, res) => {
  const signature = req.headers["x-razorpay-signature"];
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !Buffer.isBuffer(req.body)) return res.status(503).json({ error: "Webhook is not configured." });
  const expected = createHmac("sha256", secret).update(req.body).digest("hex");
  if (!safeEqualHex(signature, expected)) return res.status(401).json({ error: "Invalid webhook signature." });
  let event;
  try { event = JSON.parse(req.body.toString("utf8")); } catch { return res.status(400).json({ error: "Invalid webhook payload." }); }
  const subscription = event.payload?.subscription?.entity;
  const payment = event.payload?.payment?.entity;
  const subscriptionId = subscription?.id || payment?.subscription_id;
  const eventStatus = event.event;
  const statusMap = { "subscription.activated": "active", "subscription.authenticated": "authenticated", "subscription.pending": "pending", "subscription.halted": "halted", "subscription.cancelled": "cancelled", "subscription.completed": "completed", "subscription.paused": "paused", "subscription.resumed": "active" };
  const transaction = db.transaction(() => {
    if (subscriptionId && statusMap[eventStatus]) {
      db.prepare("UPDATE billing_subscriptions SET status = ?, current_period_start = COALESCE(?, current_period_start), current_period_end = COALESCE(?, current_period_end), updated_at = datetime('now') WHERE provider_subscription_id = ?")
        .run(statusMap[eventStatus], subscription?.current_start ? new Date(subscription.current_start * 1000).toISOString() : null, subscription?.current_end ? new Date(subscription.current_end * 1000).toISOString() : null, subscriptionId);
      if (["subscription.cancelled", "subscription.completed"].includes(eventStatus)) db.prepare("UPDATE billing_subscriptions SET cancel_at_period_end = 1 WHERE provider_subscription_id = ?").run(subscriptionId);
    }
    if (payment?.id && subscriptionId && ["payment.captured", "subscription.charged"].includes(eventStatus)) {
      const owned = db.prepare("SELECT user_id, plan_key FROM billing_subscriptions WHERE provider_subscription_id = ?").get(subscriptionId);
      if (owned) db.prepare(`INSERT OR IGNORE INTO billing_payments (user_id, provider_payment_id, provider_subscription_id, amount, currency, status, description, paid_at, created_at) VALUES (?, ?, ?, ?, ?, 'paid', ?, datetime('now'), datetime('now'))`)
        .run(owned.user_id, payment.id, subscriptionId, Number(payment.amount || 0), payment.currency || "INR", "PhysicsPrep " + owned.plan_key + " subscription");
    }
    if (payment?.id && subscriptionId && ["payment.failed", "subscription.pending"].includes(eventStatus)) {
      const owned = db.prepare("SELECT user_id, plan_key FROM billing_subscriptions WHERE provider_subscription_id = ?").get(subscriptionId);
      if (owned) db.prepare(`INSERT OR IGNORE INTO billing_payments (user_id, provider_payment_id, provider_subscription_id, amount, currency, status, description, created_at) VALUES (?, ?, ?, ?, ?, 'failed', ?, datetime('now'))`)
        .run(owned.user_id, payment.id, subscriptionId, Number(payment.amount || 0), payment.currency || "INR", "Failed " + owned.plan_key + " subscription payment");
    }
  });
  try { transaction(); return res.json({ received: true }); }
  catch (error) { console.error("Process Razorpay webhook failed:", error.message); return res.status(500).json({ error: "Webhook processing failed." }); }
});
export default router;
