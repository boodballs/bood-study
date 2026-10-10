// Pure text helpers shared by the server (extraction, AI) and the client
// (in-browser PDF extraction). No Node dependencies.

export const MAX_CHARS = 48000;

export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ")
    .replace(/\n{4,}/g, "\n\n\n")
    .replace(/[ \t]{3,}/g, "  ")
    .trim();
}

export function truncateForAi(text: string, maxChars: number = MAX_CHARS): string {
  if (text.length <= maxChars) return text;
  const head = Math.floor(maxChars * 0.7);
  const tail = maxChars - head;
  return `${text.slice(0, head)}\n\n[... middle of the document omitted ...]\n\n${text.slice(-tail)}`;
}
