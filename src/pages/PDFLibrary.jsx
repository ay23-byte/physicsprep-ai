
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Upload,
  FileText,
  Search,
  RefreshCw,
  Eye,
  Trash2,
  Copy,
  Check,
  AlertCircle,
  FileUp,
  X,
  Database,
  Clock3,
  Files,
} from "lucide-react";

import "../App.css";

const API_URL = `${import.meta.env.VITE_API_BASE_URL || ""}/api/pdf`;

export default function PDFLibrary() {
  const fileInputRef = useRef(null);

  const [documents, setDocuments] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [loadingDocuments, setLoadingDocuments] = useState(true);
  const [openingId, setOpeningId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);

  const loadDocuments = useCallback(async () => {
    setLoadingDocuments(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/documents`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not load saved documents.");
      }

      setDocuments(data.documents || []);
    } catch (err) {
      setError(
        err.message ||
          "Could not connect to the backend. Make sure the server is running on port 3001."
      );
    } finally {
      setLoadingDocuments(false);
    }
  }, []);

  useEffect(() => {
    // Async request is triggered here; response state updates happen after awaiting fetch.
    // eslint-disable-next-line react/set-state-in-effect
    loadDocuments();
  }, [loadDocuments]);

  async function handleUpload(event) {
    const file = event.target.files?.[0];

    // Allow selecting the same file again later.
    event.target.value = "";

    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Please choose a PDF file.");
      return;
    }

    setUploading(true);
    setError("");
    setNotice("");

    try {
      const formData = new FormData();
      formData.append("pdf", file);

      const response = await fetch(`${API_URL}/extract`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "PDF upload failed.");
      }

      setSelectedDocument({
        id: data.id,
        filename: data.filename,
        pages: data.pages,
        characters: data.characters,
        createdAt: data.createdAt,
        text: data.text || "",
      });

      setNotice(`"${data.filename}" was extracted and saved successfully.`);
      await loadDocuments();
    } catch (err) {
      setError(
        err.message ||
          "Upload failed. Check that the backend is running."
      );
    } finally {
      setUploading(false);
    }
  }

  async function handleOpen(document) {
    setOpeningId(document.id);
    setError("");
    setNotice("");
    setSelectedDocument(null);

    try {
      const response = await fetch(
        `${API_URL}/documents/${document.id}`
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not open this document.");
      }

      setSelectedDocument(data.document);
    } catch (err) {
      setError(err.message || "Could not open this document.");
    } finally {
      setOpeningId(null);
    }
  }

  async function handleDelete(document) {
    const confirmed = window.confirm(
      `Delete "${document.filename}" from your saved documents? This cannot be undone.`
    );

    if (!confirmed) return;

    setDeletingId(document.id);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `${API_URL}/documents/${document.id}`,
        { method: "DELETE" }
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not delete this document.");
      }

      setDocuments((current) =>
        current.filter((item) => item.id !== document.id)
      );

      if (selectedDocument?.id === document.id) {
        setSelectedDocument(null);
      }

      setNotice(`"${document.filename}" was deleted.`);
    } catch (err) {
      setError(err.message || "Delete failed.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleCopy() {
    if (!selectedDocument?.text) return;

    try {
      await navigator.clipboard.writeText(selectedDocument.text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Copy failed. Please select the text and copy it manually.");
    }
  }

  const filteredDocuments = documents.filter((document) =>
    document.filename.toLowerCase().includes(search.trim().toLowerCase())
  );

  const totalPages = documents.reduce(
    (total, document) => total + (Number(document.pages) || 0),
    0
  );

  const totalCharacters = documents.reduce(
    (total, document) => total + (Number(document.characters) || 0),
    0
  );

  function formatDate(dateString) {
    if (!dateString) return "Date unavailable";

    const date = new Date(
      dateString.includes("T") ? dateString : dateString.replace(" ", "T") + "Z"
    );

    if (Number.isNaN(date.getTime())) return dateString;

    return date.toLocaleString();
  }

  return (
    <div className="pdf-library-page">
      <div className="pdf-library-heading">
        <div>
          <div className="pdf-library-eyebrow">
            <Database size={15} />
            DOCUMENT STORAGE
          </div>
          <h1>PDF Library</h1>
          <p>
            Upload question papers, save extracted text, and reopen your
            documents whenever you need them.
          </p>
        </div>

        <button
          className="pdf-primary-button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <RefreshCw className="pdf-spinning" size={18} />
          ) : (
            <Upload size={18} />
          )}
          {uploading ? "Uploading PDF..." : "Upload PDF"}
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          onChange={handleUpload}
          hidden
        />
      </div>

      {error && (
        <div className="pdf-message pdf-message-error" role="alert">
          <AlertCircle size={18} />
          <span>{error}</span>
          <button
            className="pdf-message-close"
            onClick={() => setError("")}
            aria-label="Dismiss error"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {notice && (
        <div className="pdf-message pdf-message-success" role="status">
          <Check size={18} />
          <span>{notice}</span>
          <button
            className="pdf-message-close"
            onClick={() => setNotice("")}
            aria-label="Dismiss message"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div className="pdf-stats-grid">
        <div className="pdf-stat-card">
          <div className="pdf-stat-icon">
            <Files size={20} />
          </div>
          <div>
            <span>Saved documents</span>
            <strong>{documents.length}</strong>
          </div>
        </div>

        <div className="pdf-stat-card">
          <div className="pdf-stat-icon">
            <FileText size={20} />
          </div>
          <div>
            <span>Total pages</span>
            <strong>{totalPages.toLocaleString()}</strong>
          </div>
        </div>

        <div className="pdf-stat-card">
          <div className="pdf-stat-icon">
            <Database size={20} />
          </div>
          <div>
            <span>Extracted characters</span>
            <strong>{totalCharacters.toLocaleString()}</strong>
          </div>
        </div>
      </div>

      <section className="pdf-library-panel">
        <div className="pdf-panel-heading">
          <div>
            <h2>Saved Documents</h2>
            <p>These records are loaded from your SQLite database.</p>
          </div>

          <button
            className="pdf-secondary-button"
            onClick={loadDocuments}
            disabled={loadingDocuments}
          >
            <RefreshCw
              size={16}
              className={loadingDocuments ? "pdf-spinning" : ""}
            />
            Refresh
          </button>
        </div>

        <div className="pdf-search-box">
          <Search size={18} />
          <input
            type="search"
            placeholder="Search by PDF filename..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search saved documents"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              aria-label="Clear search"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {loadingDocuments ? (
          <div className="pdf-empty-state">
            <RefreshCw className="pdf-spinning" size={25} />
            <p>Loading saved documents...</p>
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div className="pdf-empty-state">
            <FileUp size={34} />
            <h3>{search ? "No matching PDFs" : "No saved documents yet"}</h3>
            <p>
              {search
                ? "Try another filename or clear your search."
                : "Upload a PDF to extract its text and save it in your library."}
            </p>
            {!search && (
              <button
                className="pdf-primary-button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <Upload size={17} />
                Upload your first PDF
              </button>
            )}
          </div>
        ) : (
          <div className="pdf-document-list">
            {filteredDocuments.map((document) => (
              <article className="pdf-document-row" key={document.id}>
                <div className="pdf-document-icon">
                  <FileText size={23} />
                </div>

                <div className="pdf-document-details">
                  <h3>{document.filename}</h3>
                  <div className="pdf-document-meta">
                    <span>{document.pages} pages</span>
                    <span className="pdf-meta-dot">•</span>
                    <span>
                      {Number(document.characters || 0).toLocaleString()}{" "}
                      characters
                    </span>
                    <span className="pdf-meta-dot">•</span>
                    <span>
                      <Clock3 size={13} />
                      {formatDate(document.createdAt)}
                    </span>
                  </div>
                  <span className="pdf-saved-label">
                    <Check size={12} />
                    Saved in database · ID {document.id}
                  </span>
                </div>

                <div className="pdf-document-actions">
                  <button
                    className="pdf-open-button"
                    onClick={() => handleOpen(document)}
                    disabled={
                      openingId === document.id || deletingId === document.id
                    }
                    title="Open extracted text"
                  >
                    {openingId === document.id ? (
                      <RefreshCw className="pdf-spinning" size={16} />
                    ) : (
                      <Eye size={16} />
                    )}
                    Open
                  </button>

                  <button
                    className="pdf-delete-button"
                    onClick={() => handleDelete(document)}
                    disabled={
                      deletingId === document.id || openingId === document.id
                    }
                    title="Delete saved document"
                    aria-label={`Delete ${document.filename}`}
                  >
                    {deletingId === document.id ? (
                      <RefreshCw className="pdf-spinning" size={17} />
                    ) : (
                      <Trash2 size={17} />
                    )}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {selectedDocument && (
        <section className="pdf-preview-panel">
          <div className="pdf-preview-heading">
            <div className="pdf-preview-title">
              <div className="pdf-document-icon">
                <FileText size={22} />
              </div>
              <div>
                <h2>{selectedDocument.filename}</h2>
                <p>
                  {selectedDocument.pages} pages ·{" "}
                  {Number(selectedDocument.characters || 0).toLocaleString()}{" "}
                  characters
                </p>
              </div>
            </div>

            <div className="pdf-preview-actions">
              <button
                className="pdf-secondary-button"
                onClick={handleCopy}
                disabled={!selectedDocument.text}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? "Copied" : "Copy text"}
              </button>
              <button
                className="pdf-icon-button"
                onClick={() => setSelectedDocument(null)}
                aria-label="Close document preview"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="pdf-extracted-text">
            {selectedDocument.text ? (
              selectedDocument.text
            ) : (
              "This saved document has no extracted text available."
            )}
          </div>
        </section>
      )}
    </div>
  );
}
