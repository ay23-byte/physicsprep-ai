
import express from "express";
import db from "../db/database.js";

const router = express.Router();

// GET /api/dashboard/stats
router.get("/stats", (req, res) => {
  try {
    const questionStats = db.prepare(`
      SELECT
        COUNT(*) AS totalQuestions,
        SUM(CASE WHEN review_status = 'approved' THEN 1 ELSE 0 END) AS approved,
        SUM(CASE WHEN review_status = 'pending' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN review_status = 'rejected' THEN 1 ELSE 0 END) AS rejected
      FROM questions
    `).get();

    const documentStats = db.prepare(`
      SELECT COUNT(*) AS totalDocuments
      FROM documents
    `).get();

    const topicStats = db.prepare(`
      SELECT
        CASE
          WHEN TRIM(topic) = '' THEN 'Uncategorized'
          ELSE topic
        END AS topic,
        COUNT(*) AS count
      FROM questions
      GROUP BY
        CASE
          WHEN TRIM(topic) = '' THEN 'Uncategorized'
          ELSE topic
        END
      ORDER BY count DESC, topic ASC
    `).all();

    res.json({
      success: true,
      totalQuestions: questionStats.totalQuestions ?? 0,
      approved: questionStats.approved ?? 0,
      pending: questionStats.pending ?? 0,
      rejected: questionStats.rejected ?? 0,
      totalDocuments: documentStats.totalDocuments ?? 0,
      topics: topicStats
    });
  } catch (error) {
    console.error("Dashboard statistics error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to load dashboard statistics."
    });
  }
});

export default router;
