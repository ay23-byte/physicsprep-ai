
import { lazy, Suspense, useCallback, useEffect, useState } from "react";

const QuestionReview = lazy(() => import("./pages/QuestionReview.jsx"));
const Generator = lazy(() => import("./pages/Generator.jsx"));
const PDFLibrary = lazy(() => import("./pages/PDFLibrary.jsx"));
const ExportQuestions = lazy(() => import("./pages/ExportQuestions.jsx"));
const QuestionBank = lazy(() => import("./pages/QuestionBank.jsx"));
const CoverageTracker = lazy(() => import("./pages/CoverageTracker.jsx"));
const StudentPractice = lazy(() => import("./pages/StudentPractice.jsx"));
const SettingsPage = lazy(() => import("./pages/SettingsPage.jsx"));
const Billing = lazy(() => import("./pages/Billing.jsx"));
const AuthScreen = lazy(() => import("./pages/AuthScreen.jsx"));
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  Atom,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  CreditCard,
  FileText,
  FlaskConical,
  FolderOpen,
  GraduationCap,
  Gauge,
  LayoutDashboard,
  Library,
  Menu,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  Upload,
  X,
  Zap,
} from "lucide-react";
import "./App.css";

const API_URL = `${import.meta.env.VITE_API_BASE_URL || ""}/api/dashboard/stats`;
const QUESTION_TARGET = 450;

const navigation = [
  { label: "Overview", icon: LayoutDashboard, section: "WORKSPACE" },
  { label: "Plans & Billing", icon: CreditCard, section: "WORKSPACE" },
  { label: "PDF Library", icon: FolderOpen, section: "WORKSPACE" },
  { label: "AI Generator", icon: Sparkles, section: "WORKSPACE" },
  { label: "Question Review", icon: CheckCircle2, section: "WORKSPACE" },
  { label: "Question Bank", icon: Library, section: "CONTENT" },
  { label: "Student Practice", icon: GraduationCap, section: "CONTENT" },
  { label: "Export Questions", icon: ArrowDownToLine, section: "CONTENT" },
  { label: "Coverage Tracker", icon: Target, section: "CONTENT" },
];

const subjectDefinitions = [
  { name: "Mathematical Physics", short: "MP", color: "violet", icon: Atom },
  { name: "Classical Mechanics", short: "CM", color: "blue", icon: Gauge },
  { name: "Quantum Mechanics", short: "QM", color: "purple", icon: BrainCircuit },
  { name: "Electromagnetic Theory", short: "EM", color: "amber", icon: Zap },
  {
    name: "Thermodynamics & Statistical Physics",
    short: "TS",
    color: "green",
    icon: Activity,
  },
  { name: "Atomic & Molecular Physics", short: "AM", color: "pink", icon: Atom },
  { name: "Solid State Physics", short: "SS", color: "cyan", icon: FlaskConical },
  { name: "Nuclear & Particle Physics", short: "NP", color: "orange", icon: Atom },
  { name: "Electronics", short: "EL", color: "red", icon: Zap },
];

const activities = [
  {
    title: "Open question review",
    detail: "Question review",
    time: "Check pending questions",
    status: "Review",
    color: "violet",
  },
  {
    title: "Browse saved questions",
    detail: "Question bank",
    time: "Explore your database",
    status: "Browse",
    color: "blue",
  },
  {
    title: "Manage source documents",
    detail: "PDF Library",
    time: "View uploaded PDFs",
    status: "Documents",
    color: "amber",
  },
];

function WorkspaceApp() {
  const [activePage, setActivePage] = useState("Overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [dashboardStats, setDashboardStats] = useState(null);
  const [statsError, setStatsError] = useState("");

  const loadDashboardStats = useCallback(async () => {
    try {
      const response = await fetch(API_URL);

      if (!response.ok) {
        throw new Error(`Dashboard API returned ${response.status}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message || "Unable to load statistics.");
      }

      setDashboardStats(data);
      setStatsError("");
    } catch (error) {
      console.error("Dashboard statistics error:", error);
      setStatsError(
        "Could not load live statistics. Check that your backend is running."
      );
    }
  }, []);

  useEffect(() => {
    // Async request is triggered here; response state updates happen after awaiting fetch.
    // eslint-disable-next-line react/set-state-in-effect
    loadDashboardStats();

    const intervalId = setInterval(loadDashboardStats, 15000);

    return () => clearInterval(intervalId);
  }, [loadDashboardStats]);

  const actualQuestions = dashboardStats?.totalQuestions ?? 0;
  const pendingQuestions = dashboardStats?.pending ?? 0;

  const progressPercentage = Math.min(
    100,
    Math.round((actualQuestions / QUESTION_TARGET) * 100)
  );

  const subjects = subjectDefinitions.map((subject) => {
    const matchedTopic = dashboardStats?.topics?.find(
      (topic) =>
        topic.topic.trim().toLowerCase() === subject.name.toLowerCase()
    );

    return {
      ...subject,
      count: matchedTopic?.count ?? 0,
    };
  });

  function navigate(page) {
    setActivePage(page);
    setSidebarOpen(false);

    if (page === "Overview") {
      loadDashboardStats();
    }
  }

  return (
    <div className="app-shell">
      {sidebarOpen && (
        <button
          type="button"
          className="mobile-overlay"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">
            <Atom size={25} strokeWidth={2.2} />
          </div>

          <div>
            <div className="brand-name">
              PhysicsPrep<span> AI</span>
            </div>
            <div className="brand-subtitle">QUESTION WORKSPACE</div>
          </div>

          <button
            type="button"
            className="icon-button mobile-close"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation"
          >
            <X size={19} />
          </button>
        </div>

        <div className="workspace-selector">
          <div className="workspace-avatar">PP</div>
          <div className="workspace-info">
            <strong>PhysicsPrep</strong>
            <span>Personal workspace</span>
          </div>
          <ChevronDown size={16} className="muted-icon" />
        </div>

        <nav className="sidebar-nav">
          {["WORKSPACE", "CONTENT", "PREFERENCES"].map((section) => (
            <div className="nav-section" key={section}>
              <div className="nav-heading">{section}</div>

              {navigation
                .filter((item) => item.section === section)
                .map((item) => {
                  const Icon = item.icon;

                  return (
                    <button
                      type="button"
                      key={item.label}
                      className={`nav-link ${
                        activePage === item.label ? "active" : ""
                      }`}
                      onClick={() => navigate(item.label)}
                    >
                      <Icon size={18} />
                      <span>{item.label}</span>

                      {item.label === "Question Review" &&
                        pendingQuestions > 0 && (
                          <span className="nav-count">
                            {pendingQuestions}
                          </span>
                        )}
                    </button>
                  );
                })}

              {section === "PREFERENCES" && (
                <button
                  type="button"
                  className={`nav-link ${
                    activePage === "Settings" ? "active" : ""
                  }`}
                  onClick={() => navigate("Settings")}
                >
                  <Settings size={18} />
                  <span>Settings</span>
                </button>
              )}
            </div>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="storage-card">
            <div className="storage-heading">
              <span>Workspace progress</span>
              <Activity size={16} />
            </div>

            <div className="storage-bar">
              <span style={{ width: `${progressPercentage}%` }} />
            </div>

            <div className="storage-caption">
              <span>
                {actualQuestions} / {QUESTION_TARGET} questions
              </span>
              <span>{progressPercentage}%</span>
            </div>

            <p>Build your complete GATE Physics practice bank.</p>
          </div>

          <div className="profile-row">
            <div className="profile-avatar">A</div>
            <div className="profile-info">
              <strong>Workspace Owner</strong>
              <span>Local development</span>
            </div>
            <Settings size={17} className="muted-icon" />
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="icon-button mobile-menu"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={21} />
            </button>

            <div className="breadcrumbs">
              <span>Workspace</span>
              <span className="breadcrumb-divider">/</span>
              <strong>{activePage}</strong>
            </div>
          </div>

          <div className="topbar-actions">
            <label className="search-box">
              <Search size={17} />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search workspace..."
                aria-label="Search workspace subjects"
              />
              <kbd>Ctrl K</kbd>
            </label>

            <div className="status-pill">
              <span />
              System ready
            </div>
          </div>
        </header>

        {statsError && (
          <div className="dashboard-api-error" role="alert">
            {statsError}
            <button type="button" onClick={loadDashboardStats}>
              Retry
            </button>
          </div>
        )}

        <Suspense
          fallback={
            <div className="page-content" role="status" aria-live="polite">
              <p>Loading workspace page…</p>
            </div>
          }
        >
          {activePage === "Overview" ? (
            <Dashboard
              stats={dashboardStats}
              subjects={subjects}
              searchQuery={searchQuery}
              onNavigate={navigate}
              onRefresh={loadDashboardStats}
            />
          ) : activePage === "PDF Library" ? (
            <PDFLibrary />
          ) : activePage === "AI Generator" ? (
            <Generator />
          ) : activePage === "Question Review" ? (
            <QuestionReview />
          ) : activePage === "Question Bank" ? (
            <QuestionBank onNavigate={navigate} />
          ) : activePage === "Student Practice" ? (
            <StudentPractice />
          ) : activePage === "Export Questions" ? (
            <ExportQuestions />
          ) : activePage === "Coverage Tracker" ? (
            <CoverageTracker />
          ) : activePage === "Settings" ? (
            <SettingsPage />
          ) : activePage === "Plans & Billing" ? (
            <Billing />
          ) : (
            <WorkspacePage page={activePage} onNavigate={navigate} />
          )}
        </Suspense>
      </main>
    </div>
  );
}

function Dashboard({ stats, subjects, searchQuery, onNavigate, onRefresh }) {
  const filteredSubjects = subjects.filter((subject) =>
    subject.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalQuestions = stats?.totalQuestions ?? 0;
  const totalDocuments = stats?.totalDocuments ?? 0;
  const pendingQuestions = stats?.pending ?? 0;
  const approvedQuestions = stats?.approved ?? 0;
  const topics = stats?.topics ?? [];

  const verifiedQuestions = topics.length ? stats?.verified ?? 0 : 0;

  return (
    <div className="page-content">
      <section className="welcome-row">
        <div>
          <div className="eyebrow">
            <Sparkles size={14} /> YOUR PHYSICS WORKSPACE
          </div>

          <h1>Build your question bank.</h1>

          <p className="page-description">
            Import papers, generate practice questions, and organize your GATE
            Physics preparation.
          </p>
        </div>

        <button
          type="button"
          className="primary-button"
          onClick={() => onNavigate("AI Generator")}
        >
          <Plus size={18} /> Create questions
        </button>
      </section>

      <section className="hero-banner">
        <div className="hero-content">
          <div className="hero-label">
            <BrainCircuit size={16} /> AI-POWERED WORKFLOW
          </div>

          <h2>
            From research papers to
            <br />
            ready-to-review questions.
          </h2>

          <p>
            Bring your PDFs into one workspace. Extract, generate, verify, and
            export questions with a consistent format.
          </p>

          <div className="hero-actions">
            <button
              type="button"
              className="hero-button"
              onClick={() => onNavigate("PDF Library")}
            >
              <Upload size={17} /> Import a PDF <ArrowRight size={16} />
            </button>

            <button
              type="button"
              className="hero-text-button"
              onClick={() => onNavigate("AI Generator")}
            >
              Explore generator
            </button>
          </div>
        </div>

        <div className="hero-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="orbit orbit-three" />

          <div className="atom-core">
            <Atom size={57} strokeWidth={1.3} />
          </div>

          <div className="floating-card floating-card-top">
            <FileText size={17} />
            <span>PDF extraction</span>
            <CheckCircle2 size={16} />
          </div>

          <div className="floating-card floating-card-bottom">
            <Sparkles size={17} />
            <span>Question generation</span>
            <span className="mini-spark">✦</span>
          </div>
        </div>
      </section>

      <section className="stats-grid">
        <StatCard
          icon={Library}
          label="Total questions"
          value={totalQuestions}
          note="All saved questions"
          color="violet"
        />

        <StatCard
          icon={FolderOpen}
          label="PDF documents"
          value={totalDocuments}
          note="Documents in your library"
          color="blue"
        />

        <StatCard
          icon={CircleHelp}
          label="Awaiting review"
          value={pendingQuestions}
          note="Questions awaiting approval"
          color="amber"
        />

        <StatCard
          icon={ShieldCheck}
          label="Approved questions"
          value={approvedQuestions}
          note="Approved for practice"
          color="green"
        />
      </section>

      <section className="content-grid">
        <div className="panel subjects-panel">
          <div className="panel-heading">
            <div>
              <h3>Subject coverage</h3>
              <p>Questions grouped by their saved topic</p>
            </div>

            <button
              type="button"
              className="text-action"
              onClick={() => onNavigate("Question Bank")}
            >
              View bank <ArrowRight size={15} />
            </button>
          </div>

          <div className="subject-list">
            {filteredSubjects.length > 0 ? (
              filteredSubjects.map((subject) => {
                const Icon = subject.icon;

                return (
                  <button
                    type="button"
                    className="subject-row"
                    key={subject.name}
                    onClick={() => onNavigate("Question Bank")}
                  >
                    <div className={`subject-icon ${subject.color}`}>
                      <Icon size={19} />
                    </div>

                    <div className="subject-details">
                      <div className="subject-name">{subject.name}</div>
                      <div className="subject-progress">
                        <span
                          style={{
                            width: `${Math.min(
                              (subject.count / 50) * 100,
                              100
                            )}%`,
                          }}
                        />
                      </div>
                    </div>

                    <span className="subject-count">
                      {subject.count}
                      <span> questions</span>
                    </span>

                    <ArrowRight size={15} className="subject-arrow" />
                  </button>
                );
              })
            ) : (
              <div className="empty-state">
                No subjects match “{searchQuery}”.
              </div>
            )}
          </div>

          <div className="coverage-footer">
            <span>
              <span className="legend-dot" /> Questions saved
            </span>
            <span>Target: {QUESTION_TARGET} practice questions</span>
          </div>
        </div>

        <div className="right-column">
          <div className="panel activity-panel">
            <div className="panel-heading">
              <div>
                <h3>Workspace shortcuts</h3>
                <p>Quick access to your work</p>
              </div>

              <Activity size={18} className="muted-icon" />
            </div>

            <div className="activity-list">
              {activities.map((activity) => (
                <div className="activity-row" key={activity.title}>
                  <div className={`activity-icon ${activity.color}`}>
                    <FileText size={17} />
                  </div>

                  <div className="activity-details">
                    <strong>{activity.title}</strong>
                    <span>
                      {activity.detail} · {activity.time}
                    </span>
                  </div>

                  <button
                    type="button"
                    className="activity-status"
                    onClick={() =>
                      onNavigate(
                        activity.status === "Review"
                          ? "Question Review"
                          : activity.status === "Browse"
                            ? "Question Bank"
                            : "PDF Library"
                      )
                    }
                  >
                    {activity.status}
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              className="panel-bottom-link"
              onClick={() => onNavigate("Question Review")}
            >
              Open review queue <ArrowRight size={15} />
            </button>
          </div>

          <div className="tip-card">
            <div className="tip-icon">
              <Zap size={20} />
            </div>

            <div>
              <h3>Keep questions trustworthy</h3>

              <p>
                Review answers and explanations before using generated
                questions in practice papers. Check source evidence before
                treating a question as verified.
              </p>

              <button
                type="button"
                onClick={() => onNavigate("Question Bank")}
              >
                Review question bank <ArrowRight size={15} />
              </button>
            </div>
          </div>
        </div>
      </section>

      <div className="dashboard-refresh-row">
        <span>
          {verifiedQuestions} verified questions · Live database statistics
        </span>
        <button type="button" className="text-action" onClick={onRefresh}>
          Refresh statistics
        </button>
      </div>

      <footer className="page-footer">
        <span>
          PhysicsPrep AI <span className="footer-separator">·</span> Question
          workspace
        </span>

        <span>
          <span className="footer-dot" /> Local development environment
        </span>
      </footer>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, note, color }) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span>{label}</span>
        <div className={`stat-icon ${color}`}>
          <Icon size={19} />
        </div>
      </div>

      <div className="stat-value">{value}</div>
      <div className="stat-note">{note}</div>
    </div>
  );
}

function WorkspacePage({ page, onNavigate }) {
  const pageInfo = {
    "Question Review": {
      icon: CheckCircle2,
      eyebrow: "QUALITY CONTROL",
      title: "Review questions",
      description:
        "Inspect question wording, answers, and explanations before approval.",
      action: "Open question bank",
      message: "Your review queue",
      detail:
        "Use the Question Bank to inspect saved questions. The sidebar review badge reflects the live pending count.",
    },
    Settings: {
      icon: Settings,
      eyebrow: "WORKSPACE CONFIGURATION",
      title: "Settings",
      description: "Configure your question-building workspace.",
      action: "Return to overview",
      message: "Workspace settings",
      detail:
        "AI provider configuration, storage, and application preferences can be added here.",
    },
  };

  const info = pageInfo[page] || pageInfo.Settings;
  const Icon = info.icon;

  return (
    <div className="page-content subpage-content">
      <div className="eyebrow">
        <Icon size={14} /> {info.eyebrow}
      </div>

      <h1>{info.title}</h1>
      <p className="page-description">{info.description}</p>

      <div className="panel placeholder-panel">
        <div className="placeholder-icon">
          <Icon size={30} />
        </div>

        <h2>{info.message}</h2>
        <p>{info.detail}</p>

        <button
          type="button"
          className="primary-button"
          onClick={() =>
            onNavigate(page === "Settings" ? "Overview" : "Question Bank")
          }
        >
          {info.action} <ArrowRight size={17} />
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  useEffect(() => {
    let active = true;
    fetch('/api/auth/me').then(async (response) => {
      if (!response.ok) return null;
      const body = await response.json();
      return body.user || null;
    }).catch(() => null).then((currentUser) => {
      if (active) { setUser(currentUser); setCheckingSession(false); }
    });
    return () => { active = false; };
  }, []);
  if (checkingSession) return <main style={{minHeight:'100vh',display:'grid',placeItems:'center'}}>Loading your secure workspace…</main>;
  if (!user) return <Suspense fallback={<div>Loading sign-in…</div>}><AuthScreen onAuthenticated={setUser} /></Suspense>;
  return <WorkspaceApp />;
}
