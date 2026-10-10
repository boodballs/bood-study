import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import {
  BIG_DOC_THRESHOLD,
  chaptersFromPageMarks,
  chaptersFromRunningHeaders,
  detectChapters,
  type Chapter,
} from "./chapters";
import { normalizeText as normalize, truncateForAi } from "./text";

export { truncateForAi };

export const MAX_FILE_BYTES = 15 * 1024 * 1024;

export type ExtractResult = {
  text: string;
  kind: string;
  chapters?: Chapter[];
};

function looksBinary(text: string): boolean {
  const sample = text.slice(0, 2048);
  if (sample.includes("\u0000")) return true;
  let weird = 0;
  for (const ch of sample) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 9 || (code > 13 && code < 32)) weird++;
  }
  return weird / Math.max(sample.length, 1) > 0.05;
}

// Resolve a pdf.js outline destination (string named dest or explicit array)
// to a 0-based page index. Returns -1 when it cannot be resolved.
async function destToPageIndex(pdf: unknown, dest: unknown): Promise<number> {
  try {
    let explicit = dest;
    if (typeof dest === "string") {
      explicit = await (pdf as {
        getDestination: (s: string) => Promise<unknown[]>;
      }).getDestination(dest);
    }
    if (!Array.isArray(explicit) || explicit.length === 0) return -1;
    const pageIndex = await (pdf as {
      getPageIndex: (ref: unknown) => Promise<number>;
    }).getPageIndex(explicit[0]);
    return Number.isInteger(pageIndex) ? pageIndex : -1;
  } catch {
    return -1;
  }
}

async function extractPdf(bytes: Uint8Array): Promise<ExtractResult> {
  const pdf = await getDocumentProxy(bytes);
  const { text: rawPages } = await extractText(pdf, { mergePages: false });
  const pageTexts = (Array.isArray(rawPages) ? rawPages : [String(rawPages)]).map(
    (p) => normalize(String(p)),
  );

  const pageOffsets: number[] = [];
  let acc = 0;
  for (const p of pageTexts) {
    pageOffsets.push(acc);
    acc += p.length + 2; // pages are joined with "\n\n"
  }
  const text = pageTexts.join("\n\n");

  let chapters: Chapter[] | undefined;
  if (text.length > BIG_DOC_THRESHOLD) {
    // Prefer the PDF's own bookmarks; fall back to heading patterns.
    let marks: { title: string; page: number }[] = [];
    try {
      const outline = (await (
        pdf as { getOutline: () => Promise<{ title?: string; dest?: unknown }[] | null> }
      ).getOutline()) as { title?: string; dest?: unknown }[] | null;
      if (outline && outline.length >= 2) {
        for (const item of outline) {
          const title = (item.title ?? "").replace(/\s+/g, " ").trim().slice(0, 90);
          if (!title) continue;
          const page = await destToPageIndex(pdf, item.dest);
          marks.push({ title, page });
        }
      }
    } catch {
      /* no outline — fall back to text scanning */
    }
    chapters = chaptersFromPageMarks(marks, pageTexts, pageOffsets);
    if (chapters.length < 2) chapters = chaptersFromRunningHeaders(pageTexts);
    if (chapters.length < 2) chapters = detectChapters(text);
    if (chapters.length >= 2) {
      // Keep the list manageable for the picker UI.
      chapters = chapters.slice(0, 60).map((c, i) => ({ ...c, index: i }));
    } else {
      chapters = undefined;
    }
  }

  return { text, kind: "pdf", chapters };
}

export async function extractTextFromFile(file: File): Promise<ExtractResult> {
  if (file.size > MAX_FILE_BYTES) throw new Error("too-large");
  const name = file.name.toLowerCase();
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    return extractPdf(bytes);
  }

  if (name.endsWith(".docx")) {
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    const text = normalize(value);
    return {
      text,
      kind: "docx",
      chapters: text.length > BIG_DOC_THRESHOLD ? detectChapters(text) || undefined : undefined,
    };
  }

  if (name.endsWith(".doc")) {
    throw new Error("unsupported-doc");
  }

  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (looksBinary(text)) throw new Error("unsupported");
  const normalized = normalize(text);
  return {
    text: normalized,
    kind: name.endsWith(".md") || name.endsWith(".markdown") ? "md" : "txt",
    chapters:
      normalized.length > BIG_DOC_THRESHOLD ? detectChapters(normalized) || undefined : undefined,
  };
}
