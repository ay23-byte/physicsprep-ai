import express from "express";
import { randomBytes, scryptSync, timingSafeEqual, createHmac } from "node:crypto";
import db from "../db/database.js";
const router = express.Router();
const COOKIE = "physicsprep_session";
const TTL = 7 * 24 * 60 * 60;
function secret() { const value = process.env.SESSION_SECRET; if (!value || value.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters."); return value; }
function hashPassword(password, salt = randomBytes(16).toString("hex")) { return { salt, hash: scryptSync(password, salt, 64).toString("hex") }; }
function sign(payload) { const body = Buffer.from(JSON.stringify(payload)).toString("base64url"); const sig = createHmac("sha256", secret()).update(body).digest("base64url"); return body + "." + sig; }
export function verifySession(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split("."); if (parts.length !== 2) return null;
  const expected = createHmac("sha256", secret()).update(parts[0]).digest("base64url");
  const a = Buffer.from(parts[1]); const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try { const p = JSON.parse(Buffer.from(parts[0], "base64url").toString()); return Number.isSafeInteger(p.userId) && p.exp > Math.floor(Date.now()/1000) ? p : null; } catch { return null; }
}
function cookieFor(userId) { const now = Math.floor(Date.now()/1000); const token = sign({ userId, exp: now + TTL }); return COOKIE + "=" + token + "; HttpOnly; SameSite=Lax; Path=/; Max-Age=" + TTL + (process.env.NODE_ENV === "production" ? "; Secure" : ""); }
function validEmail(email) { return typeof email === "string" && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
router.post("/register", (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : ""; const password = req.body?.password;
  if (!validEmail(email) || typeof password !== "string" || password.length < 8 || password.length > 128) return res.status(400).json({ error: "Provide a valid email and a password of 8–128 characters." });
  try { const p = hashPassword(password); const result = db.prepare("INSERT INTO users (email, password_salt, password_hash) VALUES (?, ?, ?)").run(email, p.salt, p.hash); return res.status(201).json({ user: { id: Number(result.lastInsertRowid), email } }); }
  catch (error) { if (String(error.message).includes("UNIQUE")) return res.status(409).json({ error: "An account with this email already exists." }); console.error("Registration failed:", error.message); return res.status(500).json({ error: "Could not create account." }); }
});
router.post("/login", (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : ""; const password = req.body?.password;
  if (!email || typeof password !== "string") return res.status(400).json({ error: "Email and password are required." });
  try { const user = db.prepare("SELECT id, email, password_salt, password_hash FROM users WHERE email = ?").get(email); const candidate = user ? hashPassword(password, user.password_salt).hash : ""; const a = Buffer.from(candidate, "hex"); const b = Buffer.from(user?.password_hash || "", "hex"); if (!user || a.length !== b.length || !timingSafeEqual(a, b)) return res.status(401).json({ error: "Email or password is incorrect." }); res.setHeader("Set-Cookie", cookieFor(user.id)); return res.json({ user: { id: user.id, email: user.email } }); }
  catch (error) { console.error("Login failed:", error.message); return res.status(500).json({ error: "Could not log in." }); }
});
router.post("/logout", (_req, res) => { res.setHeader("Set-Cookie", COOKIE + "=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0" + (process.env.NODE_ENV === "production" ? "; Secure" : "")); return res.json({ message: "Logged out." }); });
router.get("/me", (req, res) => { const token = (req.headers.cookie || "").split(";").map(x => x.trim()).find(x => x.startsWith(COOKIE + "="))?.slice(COOKIE.length + 1); let session; try { session = verifySession(token); } catch { return res.status(500).json({ error: "Session authentication is not configured." }); } if (!session) return res.status(401).json({ error: "Authentication required." }); const user = db.prepare("SELECT id, email FROM users WHERE id = ?").get(session.userId); return user ? res.json({ user }) : res.status(401).json({ error: "Authentication required." }); });
export default router;