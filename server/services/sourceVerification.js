function normalizeForEvidenceMatch(text) {
  return String(text ?? "")
    // PDF extraction commonly introduces line breaks, ligatures, and typographic
    // variants that do not change the words printed in the source.
    .normalize("NFKC")
    // Convert common mathematical glyphs into their spoken/plain-text forms.
    .replace(/ω/g, "omega")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/-\s+/g, "")
    .replace(/[\u00AD\u200B\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("en")
    .replace(/^['"]+|['"]+$/g, "");
}

export function verifyQuestionEvidence(question, sourceText) {
  if (typeof question?.sourceEvidence !== "string") {
    return {
      verified: false,
      status: "unverified",
      message: "Supporting quotation is missing or malformed; it must be text copied from the selected PDF.",
    };
  }

  const evidence = normalizeForEvidenceMatch(question.sourceEvidence);
  const source = normalizeForEvidenceMatch(sourceText);

  if (!evidence) {
    return {
      verified: false,
      status: "unverified",
      message: "No exact supporting quotation was provided.",
    };
  }

  if (!source) {
    return {
      verified: false,
      status: "unverified",
      message: "The linked PDF has no usable extracted text. Re-upload a text-readable PDF or use OCR for a scanned PDF.",
    };
  }

  // Some PDF text extractors insert or drop punctuation around equations and
  // convert math glyphs differently. Fall back to a strict, contiguous sequence
  // of words/numbers while retaining order; never accept a bag-of-words match.
  const toWords = (text) => text.replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const evidenceWords = toWords(evidence);
  const sourceWords = toWords(source);
  let hasContinuousWordRun = false;

  // Require at least six consecutive words/numbers from the quotation to occur
  // in the source. This tolerates changed equation glyphs without accepting
  // paraphrases or a quotation made only of common short fragments.
  for (let i = 0; i <= evidenceWords.length - 6 && !hasContinuousWordRun; i += 1) {
    const run = evidenceWords.slice(i, i + 6).join(" ");
    for (let j = 0; j <= sourceWords.length - 6; j += 1) {
      if (sourceWords.slice(j, j + 6).join(" ") === run) {
        hasContinuousWordRun = true;
        break;
      }
    }
  }

  if (source.includes(evidence) || hasContinuousWordRun) {
    return {
      verified: true,
      status: "verified",
      message: "Supporting quotation found in the selected PDF text (case and PDF typography normalized).",
    };
  }

  return {
    verified: false,
    status: "unverified",
    message: "Supporting quotation was not found in the extracted PDF text. Copy a short, continuous passage from the linked PDF; check spelling, symbols, and whether the PDF is scanned.",
  };
}
