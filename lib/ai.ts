import { Agent, setGlobalDispatcher } from "undici";
import { truncateForAi } from "./extract";
import type { Flashcard, KeyTerm, QuizQuestion, StudySet } from "./types";

// GLM reasoning can take minutes before the first byte — raise undici's
// default 300s header/body timeouts so long generations survive.
setGlobalDispatcher(new Agent({ headersTimeout: 600000, bodyTimeout: 600000 }));

// Any OpenAI-compatible provider works: set AI_BASE_URL + AI_API_KEY + AI_MODEL
// (defaults point at Together.ai; legacy TOGETHER_* names still honored).
const BASE_URL = process.env.AI_BASE_URL || "https://api.together.xyz/v1";
const ENDPOINT = `${BASE_URL.replace(/\/$/, "")}/chat/completions`;
const MODEL = process.env.AI_MODEL || process.env.TOGETHER_MODEL || "zai-org/GLM-5.3-Flash";

const SYSTEM_PROMPT = `You are an expert study-materials author for university students. You receive the text of a document (lecture notes, slides, a textbook chapter, an article) and produce a complete study kit as STRICT JSON.

Rules:
- Write ALL content in the SAME LANGUAGE as the document. Hungarian document -> everything in Hungarian. English document -> everything in English. Never translate or mix languages.
- Base everything ONLY on the document text. Never invent facts. If the text is truncated, work with what is there.
- summary_md: a structured markdown summary, roughly 300-500 words. Start with a one-paragraph overview, then "## " sections with tight bullets. Bold key terms on first use. Use a markdown table when the material compares things.
- study_guide_md: a structured markdown study guide, roughly 400-700 words, with these sections: "## Big picture", "## Key concepts explained" (for each concept: what it is, why it matters, one memorable analogy), "## Common traps and misconceptions", "## Self-check questions" (each followed by a bold "Answer:" line).
- key_terms: 8-12 items. term + a one-sentence definition.
- flashcards: 14-20 items. front = a question or term prompt; back = a concise answer (1-2 sentences). One fact per card, atomic. hint is optional and short.
- quiz: 8-10 multiple-choice questions. Exactly 4 options each. answer_index = the 0-based index of the correct option. explanation = 1-2 sentences why the answer is right. Distractors must be plausible, not jokes.
- title: a short title for the material, in the document's language.

Return ONLY a JSON object — no markdown fences, no commentary before or after. Schema:
{"title": string, "language": string, "summary_md": string, "study_guide_md": string, "key_terms": [{"term": string, "definition": string}], "flashcards": [{"front": string, "back": string, "hint": string}], "quiz": [{"question": string, "options": [string, string, string, string], "answer_index": number, "explanation": string}]}`;

function extractJson(raw: string): unknown {
  const s = raw.trim();
  try {
    return JSON.parse(s);
  } catch {
    /* fall through */
  }
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(s.slice(start, end + 1));
  }
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return JSON.parse(fence[1].trim());
  throw new Error("no json in response");
}

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function validateStudySet(parsed: unknown): StudySet {
  const o = parsed as Record<string, unknown>;
  const summary = asString(o.summary_md);
  const guide = asString(o.study_guide_md);
  if (!summary || !guide) throw new Error("missing markdown fields");

  const keyTerms: KeyTerm[] = Array.isArray(o.key_terms)
    ? (o.key_terms as Record<string, unknown>[])
        .map((t) => ({ term: asString(t.term), definition: asString(t.definition) }))
        .filter((t) => t.term && t.definition)
    : [];

  const flashcards: Flashcard[] = Array.isArray(o.flashcards)
    ? (o.flashcards as Record<string, unknown>[])
        .map((c) => ({
          front: asString(c.front),
          back: asString(c.back),
          hint: asString(c.hint) || undefined,
        }))
        .filter((c) => c.front && c.back)
    : [];
  if (flashcards.length < 4) throw new Error("too few flashcards");

  const quiz: QuizQuestion[] = Array.isArray(o.quiz)
    ? (o.quiz as Record<string, unknown>[])
        .map((q) => {
          const options = Array.isArray(q.options)
            ? (q.options as unknown[]).map((x) => asString(x)).filter(Boolean)
            : [];
          const idx = Math.trunc(Number(q.answer_index));
          return {
            question: asString(q.question),
            options,
            answer_index: idx,
            explanation: asString(q.explanation) || undefined,
          };
        })
        .filter(
          (q) =>
            q.question &&
            q.options.length >= 2 &&
            q.answer_index >= 0 &&
            q.answer_index < q.options.length,
        )
    : [];
  if (quiz.length < 4) throw new Error("too few quiz questions");

  return {
    title: asString(o.title) || "Study set",
    language: asString(o.language) || "en",
    summary_md: summary,
    study_guide_md: guide,
    key_terms: keyTerms,
    flashcards,
    quiz,
  };
}

async function callTogether(messages: unknown[]): Promise<{ raw: string; finishReason: string }> {
  const key = process.env.AI_API_KEY || process.env.TOGETHER_API_KEY;
  if (!key) throw new Error("no api key");
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.4,
      max_tokens: 32000,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Together.ai ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string; reasoning_content?: string }; finish_reason?: string }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  const usage = data.usage;
  if (usage) {
    console.log(
      `[ai] usage: prompt=${usage.prompt_tokens} completion=${usage.completion_tokens} total=${usage.total_tokens} (${MODEL})`,
    );
  }
  const choice = data.choices?.[0];
  const msg = choice?.message;
  const content = msg?.content?.trim();
  if (content) return { raw: content, finishReason: choice?.finish_reason ?? "" };
  // Reasoning models sometimes bury the payload in the reasoning stream.
  const reasoning = msg?.reasoning_content ?? "";
  const start = reasoning.indexOf("{");
  const end = reasoning.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return { raw: reasoning.slice(start, end + 1), finishReason: choice?.finish_reason ?? "" };
  }
  throw new Error("empty completion");
}

export async function generateStudySet(
  docText: string,
  sourceName: string,
): Promise<StudySet> {
  const text = truncateForAi(docText);
  const userMessage = `Document file: ${sourceName}\n\nDocument text:\n"""\n${text}\n"""`;

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { raw, finishReason } = await callTogether([
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content:
            attempt === 0
              ? userMessage
              : `${userMessage}\n\nIMPORTANT: your previous reply was not valid JSON matching the schema. Return ONLY the JSON object, nothing else.`,
        },
      ]);
      try {
        return validateStudySet(extractJson(raw));
      } catch (err) {
        // Keep the raw response for debugging, then rethrow to trigger the retry.
        try {
          const { mkdirSync, writeFileSync } = await import("fs");
          mkdirSync("data", { recursive: true });
          writeFileSync(
            `data/ai-debug-${Date.now()}.txt`,
            `finish_reason: ${finishReason}\n\n${raw}`,
          );
        } catch {
          /* ignore */
        }
        throw err;
      }
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("ai-failed");
}
