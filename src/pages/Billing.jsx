import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, CalendarClock, CircleHelp, CreditCard, ExternalLink, LoaderCircle, RefreshCw, ShieldCheck, XCircle } from "lucide-react";

const API = "/api/billing";
const money = (amount, currency = "INR") => new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format((Number(amount) || 0) / 100);
const date = (value) => value ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
const statusTone = (status) => ["active", "paid"].includes(String(status).toLowerCase()) ? "#087f5b" : ["halted", "failed", "cancelled"].includes(String(status).toLowerCase()) ? "#c2413b" : "#77728e";
const checkoutBlockingStatuses = new Set(["created", "authenticated", "active", "pending", "paused"]);

export default function Billing() {
  const [plans, setPlans] = useState([]);
  const [configured, setConfigured] = useState(false);
  const [keyId, setKeyId] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [planResponse, subscriptionResponse, historyResponse] = await Promise.all([
        fetch(API + "/plans"),
        fetch(API + "/subscription"),
        fetch(API + "/history"),
      ]);
      const planBody = await planResponse.json();
      const subscriptionBody = await subscriptionResponse.json();
      const historyBody = await historyResponse.json();
      if (!planResponse.ok) throw new Error(planBody.error || "Could not load plans.");
      if (!subscriptionResponse.ok) throw new Error(subscriptionBody.error || "Could not load subscription.");
      if (!historyResponse.ok) throw new Error(historyBody.error || "Could not load billing history.");
      setPlans(planBody.plans || []);
      setConfigured(Boolean(planBody.configured));
      setKeyId(planBody.keyId);
      setSubscription(subscriptionBody.subscription || null);
      setInvoices(historyBody.invoices || []);
    } catch (e) {
      setError(e.message || "Unable to load billing.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function checkout(planKey) {
    setBusy(planKey);
    setError("");
    setNotice("");
    try {
      const response = await fetch(API + "/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not start checkout.");

      if (!window.Razorpay) {
        const script = document.createElement("script");
        script.src = "https://checkout.razorpay.com/v1/checkout.js";
        script.async = true;
        await new Promise((resolve, reject) => {
          script.onload = resolve;
          script.onerror = () => reject(new Error("Could not load Razorpay Checkout. Check your connection and retry."));
          document.head.appendChild(script);
        });
      }

      const options = {
        key: body.keyId || keyId,
        subscription_id: body.subscriptionId,
        name: "PhysicsPrep AI",
        description: body.plan?.name || "PhysicsPrep subscription",
        prefill: { email: body.email || "" },
        theme: { color: "#6548dc" },
        handler: () => {
          setBusy("");
          setNotice("Checkout returned successfully. Your subscription status and payment history update only after Razorpay's signed webhook is verified.");
          load();
        },
        modal: {
          ondismiss: () => {
            setBusy("");
            setNotice("Checkout was closed. No successful payment has been confirmed.");
            load();
          },
        },
      };
      const checkoutWindow = new window.Razorpay(options);
      checkoutWindow.on("payment.failed", (event) => {
        setBusy("");
        setError(event.error?.description || "Payment failed. You can retry checkout.");
      });
      checkoutWindow.open();
    } catch (e) {
      setBusy("");
      setError(e.message || "Unable to start checkout.");
    }
  }

  async function cancelSubscription() {
    if (!window.confirm("Request cancellation at the end of the current billing cycle?")) return;
    setBusy("cancel");
    setError("");
    setNotice("");
    try {
      const response = await fetch(API + "/cancel", { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Cancellation failed.");
      setNotice(body.message || "Cancellation requested.");
      await load();
    } catch (e) {
      setError(e.message || "Cancellation failed.");
    } finally {
      setBusy("");
    }
  }

  const subscriptionStatus = String(subscription?.status || "").toLowerCase();
  const active = subscriptionStatus === "active";
  const checkoutBlocked = checkoutBlockingStatuses.has(subscriptionStatus);
  const canRequestCancellation = checkoutBlockingStatuses.has(subscriptionStatus) && !subscription?.cancelAtPeriodEnd;

  return (
    <div className="page-content subpage-content">
      <div className="eyebrow"><CreditCard size={14} /> PLAN & ACCOUNT</div>
      <h1>Plans & Billing</h1>
      <p className="page-description">Choose a plan, securely check out through Razorpay, and review your subscription and payment history.</p>
      {error && <div role="alert" style={{ padding: 14, borderRadius: 10, marginBottom: 16, color: "#a22d2d", background: "#fff0f0", border: "1px solid #ffd0d0" }}><XCircle size={17} style={{ verticalAlign: "middle", marginRight: 8 }} />{error}</div>}
      {notice && <div role="status" style={{ padding: 14, borderRadius: 10, marginBottom: 16, color: "#087f5b", background: "#edfbf5", border: "1px solid #c6f0df" }}>{notice}</div>}

      <section className="panel" style={{ padding: 22, maxWidth: 1040, marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 13, alignItems: "center" }}>
            <span style={{ width: 44, height: 44, borderRadius: 13, background: "#eeeaff", color: "#6548dc", display: "grid", placeItems: "center" }}><ShieldCheck size={24} /></span>
            <div><h2 style={{ margin: 0 }}>Your subscription</h2><p style={{ margin: "5px 0 0", color: "#73788c" }}>Status and renewal information from the billing database</p></div>
          </div>
          <button type="button" className="text-action" onClick={load} disabled={loading}><RefreshCw size={15} /> Refresh</button>
        </div>
        {loading ? <p style={{ display: "flex", alignItems: "center", gap: 8 }}><LoaderCircle size={17} /> Loading billing details…</p> : subscription ? <div style={{ marginTop: 20, display: "flex", flexWrap: "wrap", gap: 22, alignItems: "center" }}>
          <div><div style={{ color: "#73788c", fontSize: 12 }}>PLAN</div><strong style={{ fontSize: 19 }}>{plans.find((p) => p.key === subscription.planKey)?.name || subscription.planKey}</strong></div>
          <div><div style={{ color: "#73788c", fontSize: 12 }}>STATUS</div><strong style={{ color: statusTone(subscription.status), textTransform: "capitalize" }}>{subscription.status}</strong></div>
          <div><div style={{ color: "#73788c", fontSize: 12 }}>CURRENT PERIOD ENDS</div><strong>{date(subscription.currentPeriodEnd)}</strong></div>
          {subscription.cancelAtPeriodEnd ? <span>Cancellation scheduled</span> : canRequestCancellation && <button type="button" className="secondary-button" disabled={busy === "cancel"} onClick={cancelSubscription}>{busy === "cancel" ? "Requesting…" : "Cancel subscription"}</button>}
        </div> : <p style={{ margin: "20px 0 0", color: "#73788c" }}>No paid subscription yet. Choose a plan below; your free workspace remains available.</p>}
        {subscription && checkoutBlocked && !active && <div style={{ marginTop: 16, padding: 14, borderRadius: 10, background: "#f5f3ff", border: "1px solid #ddd6fe", color: "#51418c", lineHeight: 1.6 }}>A subscription is already in progress. Complete or cancel it before starting another checkout.</div>}
        {!configured && <div style={{ marginTop: 20, padding: 14, borderRadius: 10, background: "#fff8e8", border: "1px solid #f3dfad", color: "#795b16", lineHeight: 1.6 }}><CircleHelp size={17} style={{ verticalAlign: "middle", marginRight: 8 }} /><strong>Checkout needs server configuration.</strong> Add Razorpay API keys, webhook secret, and subscription plan IDs to the backend .env. Paid checkout stays disabled until all values are present; no fake payment will be shown.</div>}
      </section>

      <section style={{ maxWidth: 1040, marginBottom: 24 }}>
        <div style={{ marginBottom: 14 }}><h2 style={{ margin: "0 0 5px" }}>Available plans</h2><p style={{ margin: 0, color: "#73788c" }}>Prices are displayed from server configuration. The backend verifies the Razorpay plan amount and currency before creating checkout.</p></div>
        {loading ? <p>Loading plans…</p> : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(245px, 1fr))", gap: 16 }}>
          {plans.map((plan) => <article className="panel" key={plan.key} style={{ padding: 22, display: "flex", flexDirection: "column", gap: 12, border: plan.key === "pro_monthly" ? "1px solid #cfc4ff" : undefined }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><h3 style={{ margin: 0 }}>{plan.name}</h3>{plan.key === "pro_monthly" && <span style={{ fontSize: 11, fontWeight: 800, color: "#6548dc", background: "#eeeaff", borderRadius: 99, padding: "5px 8px" }}>POPULAR</span>}</div>
            <div><strong style={{ fontSize: 28 }}>{money(plan.price, plan.currency)}</strong><span style={{ color: "#73788c" }}> / {plan.interval}</span></div>
            <p style={{ color: "#73788c", margin: 0, minHeight: 42 }}>{plan.description}</p>
            <ul style={{ paddingLeft: 20, margin: 0, lineHeight: 1.9, flex: 1 }}>{plan.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
            {plan.key === "starter" ? <button type="button" className="secondary-button" disabled>Current free plan</button> : <button type="button" className="primary-button" disabled={!configured || Boolean(busy) || checkoutBlocked} onClick={() => checkout(plan.key)} style={{ justifyContent: "center" }}>{busy === plan.key ? <LoaderCircle size={17} /> : <CreditCard size={17} />}{!configured ? "Configure Razorpay to pay" : checkoutBlocked ? "Subscription in progress" : "Subscribe securely"}</button>}
          </article>)}
        </div>}
      </section>

      <section className="panel" style={{ padding: 22, maxWidth: 1040 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}><CalendarClock size={21} color="#6548dc" /><div><h2 style={{ margin: 0 }}>Payment history</h2><p style={{ margin: "5px 0 0", color: "#73788c" }}>Payments are recorded only after signed provider webhook events.</p></div></div>
        {invoices.length ? <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}><thead><tr>{["Date", "Description", "Amount", "Status", "Payment ID"].map((label) => <th key={label} style={{ padding: "10px 8px", borderBottom: "1px solid #e9eaf1", fontSize: 12, color: "#73788c" }}>{label}</th>)}</tr></thead><tbody>{invoices.map((invoice) => <tr key={invoice.id}>{[date(invoice.paidAt || invoice.createdAt), invoice.description, money(invoice.amount, invoice.currency), invoice.status, invoice.providerPaymentId].map((value, i) => <td key={i} style={{ padding: "12px 8px", borderBottom: "1px solid #f0f0f4", fontSize: 13, color: i === 3 ? statusTone(invoice.status) : undefined }}>{value || "—"}</td>)}</tr>)}</tbody></table></div> : <div style={{ padding: "22px 0", color: "#73788c", textAlign: "center" }}><BadgeCheck size={22} style={{ marginBottom: 8 }} /><p style={{ margin: 0 }}>No confirmed payments yet.</p></div>}
      </section>
      <p style={{ maxWidth: 1040, color: "#73788c", fontSize: 12, lineHeight: 1.6, marginTop: 16 }}><ExternalLink size={13} style={{ verticalAlign: "middle", marginRight: 5 }} />Checkout and billing status are handled by Razorpay. This application never stores card or UPI credentials. A paid subscription becomes active only after a verified webhook reaches the backend.</p>
    </div>
  );
}
