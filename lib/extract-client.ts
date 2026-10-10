// In-browser text extraction — the file never leaves the device.
// PDF via pdf.js (the same engine browsers use), DOCX via mammoth's browser
// build, TXT/MD via FileReader. Chapter detection runs locally too, so the
// picker appears without any server round-trip.

import { normalizeText } from "./text";
import {
  BIG_DOC_THRESHOLD,
  chaptersFromPageMarks,
  chaptersFromRunningHeaders,
  detectChapters,
  type Chapter,
} from "./chapters";

export type ClientExtract = {
  text: string;
  chapters: Chapter[];
};

export async function extractFileClient(
  file: File,
  onProgress?: (done: number, total: number) => void,
): Promise<ClientExtract> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    return extractPdf(file, onProgress);
  }
  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({
      arrayBuffer: await file.arrayBuffer(),
    });
    return finish(normalizeText(value));
  }
  return finish(normalizeText(await file.text()));
}

async function extractPdf(
  file: File,
  onProgress?: (done: number, total: number) => void,
): Promise<ClientExtract> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let line = "";
    const lines: string[] = [];
    for (const item of content.items) {
      if (!("str" in item)) continue;
      line += item.str;
      if (item.hasEOL) {
        lines.push(line);
        line = "";
      }
    }
    if (line) lines.push(line);
    pages.push(lines.join("\n"));
    onProgress?.(i, doc.numPages);
  }

  const text = normalizeText(pages.join("\n\n"));

  // The picker only matters when truncation would occur — big docs only.
  // Prefer the PDF's own bookmarks (chapter titles + page numbers), fall back
  // to heading-pattern scanning of the text.
  let chapters: Chapter[] = [];
  if (text.length > BIG_DOC_THRESHOLD) {
    try {
      const outline = await doc.getOutline();
      if (outline && outline.length >= 2) {
        const marks: { title: string; page: number }[] = [];
        for (const item of outline) {
          const title = (item.title ?? "").replace(/\s+/g, " ").trim().slice(0, 90);
          if (!title) continue;
          marks.push({ title, page: await destToPageIndex(doc, item.dest) });
        }
        chapters = chaptersFromPageMarks(marks, pages, pageOffsets(pages));
      }
    } catch {
      /* no readable outline */
    }
    if (chapters.length < 2) chapters = chaptersFromRunningHeaders(pages);
    if (chapters.length < 2) chapters = detectChapters(text);
  }
  return { text, chapters: chapters.length >= 2 ? chapters.slice(0, 60) : [] };
}

function pageOffsets(pages: string[]): number[] {
  const offsets: number[] = [];
  let acc = 0;
  for (const p of pages) {
    offsets.push(acc);
    acc += p.length + 2; // pages are joined with "\n\n"
  }
  return offsets;
}

// Resolve a pdf.js outline destination (named string or explicit array) to a
// 0-based page index. Returns -1 when it cannot be resolved.
async function destToPageIndex(doc: unknown, dest: unknown): Promise<number> {
  try {
    let explicit = dest;
    if (typeof dest === "string") {
      explicit = await (doc as {
        getDestination: (s: string) => Promise<unknown[]>;
      }).getDestination(dest);
    }
    if (!Array.isArray(explicit) || explicit.length === 0) return -1;
    const pageIndex = await (doc as {
      getPageIndex: (ref: unknown) => Promise<number>;
    }).getPageIndex(explicit[0]);
    return Number.isInteger(pageIndex) ? pageIndex : -1;
  } catch {
    return -1;
  }
}

function finish(text: string): ClientExtract {
  const chapters =
    text.length > BIG_DOC_THRESHOLD ? detectChapters(text) : [];
  return { text, chapters };
}
