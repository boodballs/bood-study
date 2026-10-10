// Chapter detection for big documents (books, long compilations).
// Two strategies: PDF outline/bookmarks (reliable) and heading-pattern
// scanning of the text (fallback). Chapters are char ranges into the
// normalized full text, so they can be sliced later without re-parsing.

export type Chapter = {
  index: number;
  title: string;
  start: number;
  end: number;
};

export const BIG_DOC_THRESHOLD = 50_000;
export const MAX_CHAPTERS_PER_DECK = 3;
const MIN_CHAPTER_CHARS = 2500;

const HEADING_PATTERNS = [
  // "Fejezet 3: Cím" / "Chapter 12 — Title" / "3. fejezet"
  /^\s*(?:fejezet|chapter|ch\.)\s*[:.\-–—]?\s*([0-9]{1,3}|[ivxlcdm]{1,6})\b[\.\:]?\s*[-–—]?\s*([^\n]{0,90})$/i,
  // "1. fejezet — Cím" / "12. Chapter: Title" — number before the word
  /^\s*([0-9]{1,3})[\.\:]?\s*(?:fejezet|chapter|ch\.)\b[\.\:]?\s*[-–—]?\s*([^\n]{0,90})$/i,
  // "12. Cím" / "12: Cím" — numbered heading with a capitalized title
  /^\s*([0-9]{1,2})[\.\:]\s+([A-ZÖÜÓŐÚÉÁÍ][^\n]{2,80})$/,
  // "XII. Cím" — roman numeral heading
  /^\s*([IVXLCDM]{1,5})[\.\:]\s+([A-ZÖÜÓŐÚÉÁÍ][^\n]{2,80})$/,
];

function isHeadingLine(line: string): string | null {
  const trimmed = line.trim();
  if (trimmed.length < 3 || trimmed.length > 100) return null;
  for (const re of HEADING_PATTERNS) {
    const m = trimmed.match(re);
    if (!m) continue;
    let title = trimmed;
    if (m[2] && m[1] && !/fejezet|chapter/i.test(trimmed)) {
      title = `${m[1]}. ${m[2]}`;
    }
    title = title.replace(/\s+/g, " ").trim();
    // Headings rarely end with sentence punctuation (list items do).
    if (/[.!?:;,]$/.test(title) && !/^(?:\d+\.\s*)?(?:fejezet|chapter)/i.test(title)) continue;
    return title.slice(0, 90);
  }
  return null;
}

export function detectChapters(text: string): Chapter[] {
  if (text.length <= BIG_DOC_THRESHOLD) return [];
  const lines = text.split("\n");
  const marks: { start: number; title: string }[] = [];
  let offset = 0;
  for (const line of lines) {
    const title = isHeadingLine(line);
    if (
      title &&
      (!marks.length || offset - marks[marks.length - 1].start > 200)
    ) {
      marks.push({ start: offset, title });
    }
    offset += line.length + 1;
  }

  const chapters: Chapter[] = [];
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? marks[i + 1].start : text.length;
    if (end - marks[i].start >= MIN_CHAPTER_CHARS) {
      chapters.push({
        index: chapters.length,
        title: marks[i].title,
        start: marks[i].start,
        end,
      });
    }
  }
  if (chapters.length > 60) return [];
  return chapters.length >= 2 ? chapters : [];
}

// Build chapters from PDF outline items already resolved to page indices.
export function chaptersFromPageMarks(
  marks: { title: string; page: number }[],
  pageTexts: string[],
  pageOffsets: number[],
): Chapter[] {
  const totalLength =
    pageOffsets.length && pageTexts.length
      ? pageOffsets[pageOffsets.length - 1] + pageTexts[pageTexts.length - 1].length
      : 0;
  return buildFromMarks(
    marks
      .filter((m) => m.title && m.page >= 0 && m.page < pageTexts.length)
      .map((m) => ({ start: pageOffsets[m.page], title: m.title })),
    totalLength,
  );
}

// Many ebooks carry no bookmarks but print the chapter name as an ALL-CAPS
// running header on every page (often glued to the page number, e.g.
// "25RESTLESS BREATHING"). A caps title repeating across pages IS a chapter.
const RUNNING_HEADER_RE = /^\s*(\d{1,3})?\s*([A-Z][A-Z\s'&\-]{3,60})\s*$/;
const HEADER_EXCLUDE = /^(INDEX|TABLE OF CONTENTS|CONTENTS|COVER|COPYRIGHT)\b/i;

export function chaptersFromRunningHeaders(pages: string[]): Chapter[] {
  const occurrences = new Map<string, number[]>();
  const distinctTitlesPerPage: number[] = [];
  pages.forEach((p, i) => {
    const lines = p.split("\n");
    // Running headers live at the very top or very bottom of a page.
    const candidates = [...lines.slice(0, 4), ...lines.slice(-4)];
    const titlesOnPage = new Set<string>();
    for (const line of candidates) {
      const m = line.match(RUNNING_HEADER_RE);
      if (!m) continue;
      const title = m[2].trim().replace(/\s+/g, " ");
      if (HEADER_EXCLUDE.test(title)) continue;
      titlesOnPage.add(title);
      const arr = occurrences.get(title) ?? [];
      arr.push(i);
      occurrences.set(title, arr);
    }
    distinctTitlesPerPage.push(titlesOnPage.size);
  });

  // A page listing many chapter titles is the table of contents — its
  // mentions don't mark chapter starts.
  const isTocPage = distinctTitlesPerPage.map((n) => n >= 3);

  const offsets = pageOffsetsOf(pages);
  const marks = [...occurrences.entries()]
    .filter(([, pg]) => pg.length >= 2) // repeats on multiple pages = running header
    .map(([title, pg]) => {
      const startPage = pg.find((p) => !isTocPage[p]) ?? pg[0];
      return {
        title: title
          .toLowerCase()
          .replace(/\b[a-z]/g, (c) => c.toUpperCase()),
        start: offsets[startPage] ?? 0,
      };
    })
    .sort((a, b) => a.start - b.start);

  const totalLength = pages.length
    ? (offsets.at(-1) ?? 0) + (pages[pages.length - 1]?.length ?? 0)
    : 0;
  return buildFromMarks(marks, totalLength);
}

function pageOffsetsOf(pages: string[]): number[] {
  const offsets: number[] = [];
  let acc = 0;
  for (const p of pages) {
    offsets.push(acc);
    acc += p.length + 2; // pages are joined with "\n\n"
  }
  return offsets;
}

export function buildFromMarks(
  marks: { start: number; title: string }[],
  totalLength: number,
): Chapter[] {
  const sorted = marks
    .filter((m, i) => i === 0 || m.start > marks[i - 1].start)
    .sort((a, b) => a.start - b.start);
  const chapters: Chapter[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const end = i + 1 < sorted.length ? sorted[i + 1].start : totalLength;
    if (end - sorted[i].start >= MIN_CHAPTER_CHARS) {
      chapters.push({
        index: chapters.length,
        title: sorted[i].title,
        start: sorted[i].start,
        end,
      });
    }
  }
  return chapters.length >= 2 ? chapters : [];
}

export function sliceChapters(
  text: string,
  chapters: Chapter[],
  selected: number[],
): { title: string; text: string }[] {
  return selected
    .filter((i) => i >= 0 && i < chapters.length)
    .map((i) => ({
      title: chapters[i].title,
      text: text.slice(chapters[i].start, chapters[i].end),
    }));
}
