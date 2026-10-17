
import { useCallback, useEffect, useState } from "react";

const API_URL = "http://localhost:3001/api/dashboard/stats";

function StatCard({ label, value, description }) {
  return (
    <div className="dashboard-stat-card">
      <p className="dashboard-stat-label">{label}</p>
      <h2 className="dashboard-stat-value">{value}</h2>
      {description && (
        <p className="dashboard-stat-description">{description}</p>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(API_URL);

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message || "Could not load statistics.");
      }

      setStats(data);
    } catch (err) {
      console.error("Dashboard loading error:", err);
      setError(
        "Could not load live statistics. Check that the backend is running."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const topics = stats?.topics ?? [];

  return (
    <div className="dashboard-page">
      <div className="dashboard-heading">
        <div>
          <p className="dashboard-eyebrow">YOUR WORKSPACE</p>
          <h1>Overview</h1>
          <p>Track your real question bank and review progress.</p>
        </div>

        <button
          type="button"
          className="dashboard-refresh-button"
          onClick={loadStats}
          disabled={loading}
        >
          {loading ? "Loading..." : "Refresh statistics"}
        </button>
      </div>

      {error && (
        <div className="dashboard-error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={loadStats}>
            Try again
          </button>
        </div>
      )}

      {loading && !stats ? (
        <p>Loading your database statistics...</p>
      ) : stats ? (
        <>
          <div className="dashboard-stats-grid">
            <StatCard
              label="Total questions"
              value={stats.totalQuestions}
              description="All saved questions"
            />

            <StatCard
              label="Approved"
              value={stats.approved}
              description="Ready for practice papers"
            />

            <StatCard
              label="Pending review"
              value={stats.pending}
              description="Awaiting your review"
            />

            <StatCard
              label="Rejected"
              value={stats.rejected}
              description="Not approved for use"
            />

            <StatCard
              label="PDF documents"
              value={stats.totalDocuments}
              description="Documents in your library"
            />
          </div>

          <section className="dashboard-section">
            <h2>Questions by topic</h2>

            {topics.length === 0 ? (
              <p>No questions have been saved yet.</p>
            ) : (
              <div className="dashboard-topic-list">
                {topics.map((item) => (
                  <div className="dashboard-topic-row" key={item.topic}>
                    <span>{item.topic}</span>
                    <strong>{item.count}</strong>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
