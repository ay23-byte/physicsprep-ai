import { useState } from "react";
import { Atom } from "lucide-react";

export default function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (mode === "register") {
        const registration = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: normalizedEmail, password }),
        });
        const registrationBody = await registration.json().catch(() => ({}));
        if (!registration.ok) throw new Error(registrationBody.error || "Could not create account.");
      }
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail, password }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not sign in.");
      onAuthenticated(body.user);
    } catch (err) {
      setError(err.message || "Authentication failed. Check that the backend is running.");
    } finally {
      setBusy(false);
    }
  }

  const fieldStyle = { display: "block", width: "100%", boxSizing: "border-box", marginTop: 7, padding: 12, border: "1px solid #dfe2eb", borderRadius: 9 };
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#f5f6fb" }}>
      <section style={{ width: "100%", maxWidth: 440, background: "#fff", border: "1px solid #e5e7ef", borderRadius: 18, padding: 30, boxShadow: "0 18px 60px rgba(30,35,70,.08)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
          <div style={{ width: 46, height: 46, borderRadius: 14, display: "grid", placeItems: "center", background: "#eeeaff", color: "#6548dc" }}><Atom size={25} /></div>
          <div><h1 style={{ margin: 0, fontSize: 24 }}>PhysicsPrep AI</h1><p style={{ margin: "4px 0 0", color: "#73788c" }}>Your personal physics workspace</p></div>
        </div>
        <h2 style={{ marginBottom: 8 }}>{mode === "login" ? "Welcome back" : "Create your account"}</h2>
        <p style={{ color: "#73788c", lineHeight: 1.6 }}>{mode === "login" ? "Sign in to access your private PDFs and question bank." : "Create an account to keep your documents and questions private."}</p>
        {error && <p role="alert" style={{ color: "#b42318", background: "#fff1f0", padding: 12, borderRadius: 8 }}>{error}</p>}
        <form onSubmit={submit}>
          <label style={{ display: "block", marginTop: 16, fontWeight: 600 }}>Email
            <input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} style={fieldStyle} />
          </label>
          <label style={{ display: "block", marginTop: 16, fontWeight: 600 }}>Password
            <input type="password" required minLength={8} maxLength={128} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={e => setPassword(e.target.value)} style={fieldStyle} />
          </label>
          <button type="submit" disabled={busy} className="primary-button" style={{ width: "100%", justifyContent: "center", marginTop: 22 }}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}</button>
        </form>
        <p style={{ marginTop: 18, textAlign: "center", color: "#73788c" }}>
          {mode === "login" ? "New to PhysicsPrep? " : "Already have an account? "}
          <button type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }} style={{ border: 0, background: "none", color: "#6548dc", fontWeight: 700, cursor: "pointer" }}>{mode === "login" ? "Create account" : "Sign in"}</button>
        </p>
        <p style={{ fontSize: 12, color: "#8b90a0", lineHeight: 1.5 }}>Use a password you do not use on another site. Your account is stored in this PhysicsPrep database.</p>
      </section>
    </main>
  );
}
