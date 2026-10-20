
import "dotenv/config";
import express from "express";
import cors from "cors";

import generatorRoutes from "./routes/generatorRoutes.js";
import pdfRoutes from "./routes/pdfRoutes.js";
import questionRoutes from "./routes/questionRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import billingRoutes from "./routes/billingRoutes.js";

const app = express();
const PORT = process.env.PORT || 3001;

const configuredOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOrigins = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  ...configuredOrigins,
]);

app.use(cors({
  origin(origin, callback) {
    // Allow non-browser clients (such as local scripts) without an Origin header.
    if (!origin || allowedOrigins.has(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Origin is not allowed by CORS."));
  },
}));
app.use(express.json({ limit: "1mb", verify(req, res, buffer) { req.rawBody = Buffer.from(buffer); } }));

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    application: "PhysicsPrep AI",
    service: "backend",
  });
});

// Authentication and existing routes
app.use("/api/auth", authRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/generate", generatorRoutes);
app.use("/api/pdf", pdfRoutes);

// New question-management routes
app.use("/api/questions", questionRoutes);
app.use("/api/dashboard", dashboardRoutes);

// Error handler: report client input errors without misclassifying them as
// server failures, and avoid returning stack traces or secrets to the browser.
app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  if (err?.type === "entity.parse.failed" || (err instanceof SyntaxError && err?.status === 400)) {
    return res.status(400).json({
      error: "Request body contains invalid JSON.",
    });
  }

  if (err?.message === "Origin is not allowed by CORS.") {
    return res.status(403).json({
      error: "This origin is not allowed to access the API.",
    });
  }

  console.error("Unhandled API error:", err?.message || err);
  return res.status(500).json({
    error: "Unexpected server error.",
  });
});

app.listen(PORT, () => {
  console.log(`PhysicsPrep API running at http://localhost:${PORT}`);
});
