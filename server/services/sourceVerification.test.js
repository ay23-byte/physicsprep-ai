
function normalizeEvidenceText(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function isPlaceholderEvidence(value) {
  const quotation = normalizeEvidenceText(value);

  if (!quotation) {
    return true;
  }

  return /no supporting quotation was provided|test question for checking the save and review workflow/i.test(
    quotation
  );
}

export function verifyQuestionEvidence(question, sourceText) {
  if (!question || typeof question !== "object" || Array.isArray(question)) {
    return {
      verified: false,
      status: "unverified",
      message: "Source evidence is missing or malformed.",
    };
  }

  const rawQuotation = Object.hasOwn(question, "sourceEvidence")
    ? question.sourceEvidence
    : question.source_evidence;

  if (typeof rawQuotation !== "string") {
    return {
      verified: false,
      status: "unverified",
      message: "Source evidence is missing or malformed.",
    };
  }

  const quotation = normalizeEvidenceText(rawQuotation);

  if (isPlaceholderEvidence(quotation)) {
    return {
      verified: false,
      status: "unverified",
      message: "No exact supporting quotation was provided.",
    };
  }

  if (typeof sourceText !== "string" || !normalizeEvidenceText(sourceText)) {
    return {
      verified: false,
      status: "unverified",
      message: "Source text is missing or empty.",
    };
  }

  const normalizedSource = normalizeEvidenceText(sourceText);

  if (!normalizedSource.includes(quotation)) {
    return {
      verified: false,
      status: "unverified",
      message: "The supporting quotation was not found in the source text.",
    };
  }

  return {
    verified: true,
    status: "verified",
    message: "The supporting quotation was found in the source text.",
  };
}
