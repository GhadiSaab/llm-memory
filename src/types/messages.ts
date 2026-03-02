// Message types — raw storage, Layer 1 scoring output, and structural signals.

import type { UUID, UnixMs } from "./core.js";

export type MessageRole = "user" | "assistant";

export type MessageType = "decision" | "goal" | "error" | "conclusion" | "noise";

export type PatternType = "confirmation" | "error_retry" | "iteration" | "struggle";

export interface KeywordScore {
  category: MessageType;
  confidence: number;       // 0.0 to 1.0
  matchedSignals: string[]; // which phrases matched, useful for debugging
}

// ─── Raw message (opt-in storage) ────────────────────────────────────────────

export interface Message {
  id: UUID;
  session_id: UUID;
  role: MessageRole;
  content: string;
  index: number;       // position in conversation
  timestamp: UnixMs;
}

// ─── Layer 1 output ───────────────────────────────────────────────────────────

/** Signals extracted from a single message's text. */
export interface StructuralFeatures {
  length: number;
  hasCodeBlock: boolean;
  hasFilePath: boolean;
  hasUrl: boolean;
  hasError: boolean;
  hasDecisionPhrase: boolean;
  hasGoalPhrase: boolean;
  questionCount: number;
  imperativeCount: number;
  sentenceCount: number;
  startsWithVerb: boolean;
  isShortConfirmation: boolean;
  positionalWeight: number;    // 0–1 based on position in conversation
}

/** A message annotated with its computed importance score and classification. */
export interface WeightedMessage {
  message: Message;
  weight: number;              // final 0–1 importance score
  type: MessageType;           // dominant category from keyword scoring
  features: StructuralFeatures;
}

/** A pattern spanning multiple messages — detected at conversation level. */
export interface ConversationPattern {
  type: PatternType;
  messageIndexes: number[];
  extractedDecision: string | null;
  confidence: number;
  summary: string;
}
