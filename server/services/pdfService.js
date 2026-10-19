
import fs from "node:fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export async function extractPdfText(filePath) {
  const buffer = fs.readFileSync(filePath);

  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
  });

  let pdf;

  try {
    pdf = await loadingTask.promise;
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
    if (pdf) {
      await loadingTask.destroy();
    }
  }
}
