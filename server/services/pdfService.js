
import fs from "node:fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export const MAX_PDF_PAGES = 300;

export async function extractPdfText(filePath) {
  const buffer = fs.readFileSync(filePath);

  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
  });

  let pdf;

  try {
    pdf = await loadingTask.promise;

    if (pdf.numPages > MAX_PDF_PAGES) {
      const error = new Error(
        `PDF exceeds the maximum limit of ${MAX_PDF_PAGES} pages.`
      );
      error.code = "PDF_PAGE_LIMIT_EXCEEDED";
      throw error;
    }

    const pageTexts = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();

      const text = content.items
        .filter((item) => "str" in item)
        .map((item) => item.str)
        .join(" ");

      pageTexts.push(text);
    }

    return {
      text: pageTexts.join("\n\n"),
      pages: pdf.numPages,
      info: {},
    };
  } finally {
    try {
      await loadingTask.destroy();
    } finally {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  }
}
