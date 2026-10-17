
import "dotenv/config";
import express from "express";
import cors from "cors";

import generatorRoutes from "./routes/generatorRoutes.js";
import pdfRoutes from "./routes/pdfRoutes.js";
import questionRoutes from "./routes/questionRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json({ limit: "1mb" }));

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    application: "PhysicsPrep AI",
    service: "backend",
  });
});

// Existing routes
app.use("/api/generate", generatorRoutes);
app.use("/api/pdf", pdfRoutes);

// New question-management routes
app.use("/api/questions", questionRoutes);
app.use("/api/dashboard", dashboardRoutes);

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Unexpected server error." });
});

app.listen(PORT, () => {
  console.log(`PhysicsPrep API running at http://localhost:${PORT}`);
});
