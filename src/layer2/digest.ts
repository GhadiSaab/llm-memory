// Layer 2 digest generator — pure transformation, no I/O, never throws.

import type { Layer1Output, Layer2Digest } from "../types/index.js";
import type { SessionOutcome } from "../types/index.js";
import { randomUUID } from "node:crypto";

// ─── Token budget ─────────────────────────────────────────────────────────────

const BUDGET = 500;

function estimateTokens(digest: Omit<Layer2Digest, "id" | "session_id" | "created_at">): number {
  return Math.ceil(JSON.stringify(digest).length / 4);
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function generateDigest(
  layer1: Layer1Output,
  outcome: SessionOutcome,
  exitCode: number | null
): Layer2Digest {
  try {
    // goal
    const goal =
      layer1.goal ??
      layer1.decisions[0] ??
      "No goal detected";

    // files_modified — deduplicated paths from file_created | file_modified events
    const seenPaths = new Set<string>();
    const filesModified: string[] = [];
    for (const e of layer1.events ?? []) {
      if (e.type === "file_created" || e.type === "file_modified") {
        const path = (e.payload as any).path as string;
        if (path && !seenPaths.has(path)) {
          seenPaths.add(path);
          filesModified.push(path);
        }
      }
    }

    let decisions = [...(layer1.decisions ?? [])];
    let errors = [...(layer1.errors ?? [])];
    let keywords = [...(layer1.keywords ?? [])];
    let files = [...filesModified];
    let goalStr = goal;

    // Token budget enforcement
    const makeDraft = (g: string, fi: string[], d: string[], e: string[], k: string[]) => ({
      goal: g, files_modified: fi, decisions: d, errors_encountered: e,
      keywords: k, outcome, estimated_tokens: 0,
    });

    let tokens = estimateTokens(makeDraft(goalStr, files, decisions, errors, keywords));

    if (tokens > BUDGET) {
      decisions = decisions.slice(0, 5).map(d => d.length > 120 ? d.slice(0, 120) + "…" : d);
      errors = errors.slice(0, 3).map(e => e.length > 120 ? e.slice(0, 120) + "…" : e);
      files = files.slice(0, 10);
      keywords = keywords.slice(0, 10);
      tokens = estimateTokens(makeDraft(goalStr, files, decisions, errors, keywords));

      if (tokens > BUDGET) {
        goalStr = goalStr.length > 150 ? goalStr.slice(0, 149) + "…" : goalStr;
        decisions = decisions.slice(0, 3).map(d => d.length > 80 ? d.slice(0, 80) + "…" : d);
        errors = errors.slice(0, 2).map(e => e.length > 80 ? e.slice(0, 80) + "…" : e);
        tokens = estimateTokens(makeDraft(goalStr, files, decisions, errors, keywords));
      }
    }

    return {
      id: randomUUID() as any,
      session_id: layer1.session_id,
      goal: goalStr,
      files_modified: files,
      decisions,
      errors_encountered: errors,
      outcome,
      keywords,
      estimated_tokens: tokens,
      created_at: Date.now() as any,
    };
  } catch {
    // Minimal valid digest for crashed/malformed sessions
    return {
      id: randomUUID() as any,
      session_id: layer1?.session_id ?? ("" as any),
      goal: "No goal detected",
      files_modified: [],
      decisions: [],
      errors_encountered: [],
      outcome,
      keywords: [],
      estimated_tokens: 0,
      created_at: Date.now() as any,
    };
  }
}
