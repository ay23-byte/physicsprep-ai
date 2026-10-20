import { CreditCard, ShieldCheck, CircleHelp } from "lucide-react";

const features = [
  "PDF library and selectable-text extraction",
  "AI-assisted question generation (API key required)",
  "Question review and source-evidence checks",
  "Question bank, practice, and exports",
];

export default function Billing() {
  return (
    <div className="page-content subpage-content">
      <div className="eyebrow"><CreditCard size={14} /> PLAN & ACCOUNT</div>
      <h1>Plans & Billing</h1>
      <p className="page-description">
        Review what is available in your local workspace and what is needed before online payments can be enabled.
      </p>

      <section className="panel" style={{ padding: 24, maxWidth: 900 }}>
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: "#eeeaff", color: "#6548dc", display: "grid", placeItems: "center" }}>
            <ShieldCheck size={25} />
          </div>
          <div style={{ flex: "1 1 280px" }}>
            <p style={{ margin: "0 0 6px", color: "#73788c", fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>CURRENT WORKSPACE</p>
            <h2 style={{ margin: "0 0 8px" }}>Local development</h2>
            <p style={{ margin: 0, color: "#73788c", lineHeight: 1.6 }}>
              PhysicsPrep currently runs against your local backend and SQLite database. No subscription is being charged.
            </p>
          </div>
          <span style={{ padding: "7px 10px", borderRadius: 999, background: "#f0f2f6", color: "#53596b", fontSize: 12, fontWeight: 700 }}>Payments off</span>
        </div>

        <hr style={{ border: 0, borderTop: "1px solid #e9eaf1", margin: "24px 0" }} />
        <h3>Included in the workspace</h3>
        <ul style={{ paddingLeft: 22, lineHeight: 1.9, color: "#454a5e" }}>
          {features.map((feature) => <li key={feature}>{feature}</li>)}
        </ul>

        <div style={{ marginTop: 24, padding: 18, borderRadius: 12, background: "#f8f7ff", border: "1px solid #e5dfff" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <CircleHelp size={19} color="#6548dc" />
            <div>
              <strong>Online checkout is not connected yet</strong>
              <p style={{ margin: "7px 0 0", color: "#64697c", lineHeight: 1.6 }}>
                This page intentionally does not simulate payments or display fake invoices. To activate subscriptions, we must select a provider (such as Razorpay for India or Stripe where available), configure its secret keys and webhook, and test successful, failed, cancelled, and refunded payments before enabling checkout.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
