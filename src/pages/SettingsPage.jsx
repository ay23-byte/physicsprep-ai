import { useEffect, useState } from "react";
import { Check, Settings as SettingsIcon, RotateCcw } from "lucide-react";

const DEFAULTS = {
  displayName: "PhysicsPrep Student",
  targetQuestions: 450,
  defaultDifficulty: "Medium",
  defaultQuestionCount: 5,
  compactLayout: false,
};

function readPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem("physicsprep.preferences") || "{}");
    return { ...DEFAULTS, ...saved };
  } catch {
    return { ...DEFAULTS };
  }
}

export default function SettingsPage() {
  const [preferences, setPreferences] = useState(readPreferences);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSaved(false);
  }, [preferences]);

  function update(key, value) {
    setPreferences((current) => ({ ...current, [key]: value }));
  }

  function save() {
    localStorage.setItem("physicsprep.preferences", JSON.stringify(preferences));
    setSaved(true);
  }

  function reset() {
    setPreferences({ ...DEFAULTS });
    localStorage.removeItem("physicsprep.preferences");
    setSaved(false);
  }

  return (
    <div className="page-content subpage-content">
      <div className="eyebrow"><SettingsIcon size={14} /> WORKSPACE PREFERENCES</div>
      <h1>Settings</h1>
      <p className="page-description">
        Set your local workspace defaults. These preferences stay in this browser and do not change your saved question records.
      </p>

      <section className="panel" style={{ padding: 24, maxWidth: 820 }}>
        <h2 style={{ marginTop: 0 }}>Study workspace</h2>
        <label style={{ display: "block", marginBottom: 18 }}>
          <span style={{ display: "block", fontWeight: 600, marginBottom: 7 }}>Display name</span>
          <input
            value={preferences.displayName}
            onChange={(event) => update("displayName", event.target.value)}
            maxLength={60}
            style={{ width: "100%", maxWidth: 480, padding: 11, border: "1px solid #dfe2eb", borderRadius: 9 }}
          />
        </label>

        <label style={{ display: "block", marginBottom: 18 }}>
          <span style={{ display: "block", fontWeight: 600, marginBottom: 7 }}>Question target</span>
          <input
            type="number"
            min="1"
            max="100000"
            value={preferences.targetQuestions}
            onChange={(event) => update("targetQuestions", Math.max(1, Math.min(100000, Number(event.target.value) || 1)))}
            style={{ width: 180, padding: 11, border: "1px solid #dfe2eb", borderRadius: 9 }}
          />
        </label>

        <h2>AI generator defaults</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 16 }}>
          <label>
            <span style={{ display: "block", fontWeight: 600, marginBottom: 7 }}>Default difficulty</span>
            <select
              value={preferences.defaultDifficulty}
              onChange={(event) => update("defaultDifficulty", event.target.value)}
              style={{ width: "100%", padding: 11, border: "1px solid #dfe2eb", borderRadius: 9, background: "white" }}
            >
              <option>Easy</option><option>Medium</option><option>Hard</option>
            </select>
          </label>
          <label>
            <span style={{ display: "block", fontWeight: 600, marginBottom: 7 }}>Questions per generation</span>
            <select
              value={preferences.defaultQuestionCount}
              onChange={(event) => update("defaultQuestionCount", Number(event.target.value))}
              style={{ width: "100%", padding: 11, border: "1px solid #dfe2eb", borderRadius: 9, background: "white" }}
            >
              {[1, 3, 5, 8, 10].map((count) => <option key={count} value={count}>{count}</option>)}
            </select>
          </label>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 22 }}>
          <input
            type="checkbox"
            checked={preferences.compactLayout}
            onChange={(event) => update("compactLayout", event.target.checked)}
          />
          <span>Prefer a compact workspace layout</span>
        </label>

        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12, marginTop: 26 }}>
          <button type="button" className="primary-button" onClick={save}>Save preferences</button>
          <button type="button" className="text-action" onClick={reset}><RotateCcw size={15} /> Reset defaults</button>
          {saved && <span role="status" style={{ color: "#16803d", display: "inline-flex", alignItems: "center", gap: 5 }}><Check size={16} /> Saved in this browser</span>}
        </div>
        <p style={{ color: "#73788c", fontSize: 13, marginTop: 18 }}>
          Note: preferences are browser-local. Account sync is not enabled in this version.
        </p>
      </section>
    </div>
  );
}
