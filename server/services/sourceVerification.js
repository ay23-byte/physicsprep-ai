
function normalizeWhitespace(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}
  
export function verifyQuestionEvidence(question, sourceText) {
    if (typeof question?.sourceEvidence !== "string") {
      return {
        verified: false,
        status: "unverified",
        message: "Supporting quotation is missing or malformed; it must be text copied from the selected PDF."
      };
    }

    const evidence = normalizeWhitespace(question.sourceEvidence);
    const source = normalizeWhitespace(sourceText);
  
    if (!evidence) {
      return {
        verified: false,
        status: "unverified",
        message: "No exact supporting quotation was provided."
      };
    }
  
    if (source.includes(evidence)) {
      return {
        verified: true,
        status: "verified",
        message: "Supporting quotation found in the selected PDF text."
      };
    }
  
    return {
      verified: false,
      status: "unverified",
      message: "Supporting quotation was not found in the extracted PDF text."
    };
  }
  
