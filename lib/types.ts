export type KeyTerm = { term: string; definition: string };
export type Flashcard = { front: string; back: string; hint?: string };
export type QuizQuestion = {
  question: string;
  options: string[];
  answer_index: number;
  explanation?: string;
};

export type StudySet = {
  title: string;
  language: string;
  summary_md: string;
  study_guide_md: string;
  key_terms: KeyTerm[];
  flashcards: Flashcard[];
  quiz: QuizQuestion[];
};

export type DeckRecord = StudySet & {
  id: string;
  source_name: string;
  source_size: number;
  created_at: string;
};

export type GenerateErrorCode =
  | "too-large"
  | "unsupported"
  | "no-text"
  | "ai-failed"
  | "rate-limited"
  | "network"
  | "default";
