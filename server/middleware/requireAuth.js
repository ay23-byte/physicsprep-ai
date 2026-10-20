import { verifySession } from "../routes/authRoutes.js";
export default function requireAuth(req, res, next) {
  const name = "physicsprep_session";
  const token = (req.headers.cookie || "").split(";").map(x => x.trim()).find(x => x.startsWith(name + "="))?.slice(name.length + 1);
  let session; try { session = verifySession(token); } catch { return res.status(500).json({ error: "Session authentication is not configured." }); }
  if (!session) return res.status(401).json({ error: "Authentication required." });
  req.user = { id: session.userId }; return next();
}