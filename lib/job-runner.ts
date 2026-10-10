// Shared background job runners. POST handlers create the job row and hand
// off here so the request can return immediately (Cloudflare's ~100s proxy
// timeout kills long synchronous responses).

import { generateStudySet } from "./ai";
import { truncateForAi } from "./text";
import {
  bumpDailyCounter,
  bumpWeeklyUsage,
  failJob,
  finishJob,
  insertDeck,
  setJobProgress,
  setJobStatus,
} from "./db";
import type { StudySet } from "./types";

const runningJobs = new Set<string>();

export type Part = { title: string; text: string };

export function isJobRunning(jobId: string): boolean {
  return runningJobs.has(jobId);
}

export function markJobStarted(jobId: string): boolean {
  if (runningJobs.has(jobId)) return false;
  runningJobs.add(jobId);
  setJobStatus(jobId, "running");
  return true;
}

export function markJobEnded(jobId: string): void {
  runningJobs.delete(jobId);
}

export async function runSingleJob(
  jobId: string,
  text: string,
  sourceName: string,
  sourceSize: number,
  quotaKey: string,
  userId: number | null,
): Promise<void> {
  if (!markJobStarted(jobId)) return;
  try {
    const set = await generateStudySet(text, sourceName);
    const deckId = insertDeck(set, { name: sourceName, size: sourceSize }, userId);
    bumpWeeklyUsage(quotaKey);
    bumpDailyCounter("global");
    finishJob(jobId, deckId, set.title);
  } catch (err) {
    console.error(`[job ${jobId}] generation failed:`, err);
    failJob(jobId, "ai-failed");
  } finally {
    markJobEnded(jobId);
  }
}

// One AI call per part, run in PARALLEL, merged into a single deck.
export async function runPartsJob(
  jobId: string,
  parts: Part[],
  sourceName: string,
  sourceSize: number,
  quotaKey: string,
  userId: number | null,
): Promise<void> {
  if (!markJobStarted(jobId)) return;
  try {
    let done = 0;
    const settled = await Promise.all(
      parts.map(async (part) => {
        const set = await generateStudySet(
          truncateForAi(part.text),
          `${sourceName} — ${part.title}`,
        );
        done += 1;
        setJobProgress(jobId, `${done}/${parts.length}`);
        return { title: part.title, set };
      }),
    );
    const merged = mergeSets(settled);
    const deckId = insertDeck(merged, { name: sourceName, size: sourceSize }, userId);
    bumpWeeklyUsage(quotaKey);
    bumpDailyCounter("global", parts.length);
    finishJob(jobId, deckId, merged.title);
  } catch (err) {
    console.error(`[job ${jobId}] chapter generation failed:`, err);
    failJob(jobId, "ai-failed");
  } finally {
    markJobEnded(jobId);
  }
}

function mergeSets(parts: { title: string; set: StudySet }[]): StudySet {
  const first = parts[0].set;
  if (parts.length === 1) return first;

  const summary = parts
    .map((p) => `## ${p.title}\n\n${p.set.summary_md.trim()}`)
    .join("\n\n");
  const guide = parts
    .map((p) => `## ${p.title}\n\n${p.set.study_guide_md.trim()}`)
    .join("\n\n");

  const title = `${first.title} · ${parts[1].set.title}${
    parts.length > 2 ? ` +${parts.length - 2}` : ""
  }`.slice(0, 120);

  return {
    title,
    language: first.language,
    summary_md: summary,
    study_guide_md: guide,
    key_terms: first.key_terms.concat(...parts.slice(1).map((p) => p.set.key_terms)).slice(0, 24),
    flashcards: first.flashcards
      .concat(...parts.slice(1).map((p) => p.set.flashcards))
      .slice(0, 48),
    quiz: first.quiz.concat(...parts.slice(1).map((p) => p.set.quiz)).slice(0, 30),
  };
}
