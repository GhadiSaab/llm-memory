// Codex session reader — extracts messages and tool events from Codex's
// local SQLite + rollout JSONL files after a session ends.
//
// Codex stores sessions in:
//   ~/.codex/state_5.sqlite  — threads table with metadata
//   ~/.codex/sessions/**/*.jsonl  — per-thread rollout with all events
//
// We match threads by cwd + started_at timestamp, then parse the rollout
// to extract messages and tool events for the Layer 1 pipeline.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import DatabaseConstructor from "better-sqlite3";
import type { Message, UUID, UnixMs } from "../types/index.js";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CodexThread {
  id: string;
  rollout_path: string;
  cwd: string;
  created_at: number; // unix seconds
  title: string;
}

interface RolloutEvent {
  type: string;
  timestamp?: string;
  payload?: Record<string, unknown>;
}

export interface RawCodexEvent {
  tool: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
  success: boolean;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export interface CodexSessionData {
  messages: Message[];
  events: RawCodexEvent[];
}

/**
 * Reads Codex session data for the given project cwd, filtered to threads
 * that started at or after sessionStartMs.
 *
 * Returns null if Codex state DB doesn't exist or no matching thread found.
 */
export function readCodexSession(
  cwd: string,
  sessionStartMs: number
): CodexSessionData | null {
  const dbPath = join(homedir(), ".codex", "state_5.sqlite");
  if (!existsSync(dbPath)) return null;

  let codexDb: ReturnType<typeof DatabaseConstructor> | null = null;
  try {
    codexDb = new DatabaseConstructor(dbPath, { readonly: true, fileMustExist: true });

    // Find the most recent thread matching cwd that started after our session
    const sessionStartSec = Math.floor(sessionStartMs / 1000) - 5; // 5s tolerance
    const thread = codexDb
      .prepare<[string, number], CodexThread>(
        `SELECT id, rollout_path, cwd, created_at, title
         FROM threads
         WHERE cwd = ? AND created_at >= ?
         ORDER BY created_at DESC
         LIMIT 1`
      )
      .get(cwd, sessionStartSec);

    if (!thread) return null;

    return parseRollout(thread.rollout_path, thread.id);
  } catch {
    return null;
  } finally {
    codexDb?.close();
  }
}

// ─── Rollout parser ───────────────────────────────────────────────────────────

function parseRollout(rolloutPath: string, codexSessionId: string): CodexSessionData {
  const messages: Message[] = [];
  const events: RawCodexEvent[] = [];

  if (!existsSync(rolloutPath)) return { messages, events };

  let raw: string;
  try {
    raw = readFileSync(rolloutPath, "utf8");
  } catch {
    return { messages, events };
  }

  const fakeSessionId = codexSessionId as UUID;
  const now = Date.now() as UnixMs;

  // Build a call_id → function_call map for pairing with outputs
  const callMap = new Map<string, { name: string; args: Record<string, unknown> }>();

  let messageIndex = 0;

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let obj: RolloutEvent;
    try {
      obj = JSON.parse(trimmed) as RolloutEvent;
    } catch {
      continue;
    }

    // ── event_msg: user and agent messages ────────────────────────────────────
    if (obj.type === "event_msg") {
      const p = obj.payload ?? {};
      const eventType = p["type"] as string | undefined;

      if (eventType === "user_message") {
        const text = (p["message"] as string | undefined) ?? "";
        if (text.trim()) {
          messages.push({
            id: randomUUID() as UUID,
            session_id: fakeSessionId,
            role: "user",
            content: text,
            index: messageIndex++,
            timestamp: now,
          });
        }
      } else if (eventType === "agent_message") {
        const text = (p["message"] as string | undefined) ?? "";
        const phase = (p["phase"] as string | undefined) ?? "";
        // Only capture final_answer and commentary phases (skip intermediate)
        if (text.trim() && phase !== "thinking") {
          messages.push({
            id: randomUUID() as UUID,
            session_id: fakeSessionId,
            role: "assistant",
            content: text,
            index: messageIndex++,
            timestamp: now,
          });
        }
      }
    }

    // ── response_item: function calls and outputs ─────────────────────────────
    if (obj.type === "response_item") {
      const p = obj.payload ?? {};
      const itemType = p["type"] as string | undefined;

      if (itemType === "function_call") {
        const name = (p["name"] as string | undefined) ?? "unknown";
        const callId = (p["call_id"] as string | undefined) ?? "";
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse((p["arguments"] as string | undefined) ?? "{}") as Record<string, unknown>;
        } catch { /* ignore */ }
        if (callId) callMap.set(callId, { name, args });
      }

      if (itemType === "function_call_output") {
        const callId = (p["call_id"] as string | undefined) ?? "";
        const output = (p["output"] as string | undefined) ?? "";
        const call = callMap.get(callId);
        if (!call) continue;

        // Parse exit code from output string: "Process exited with code N"
        const exitMatch = output.match(/Process exited with code (\d+)/);
        const exitCode = exitMatch ? parseInt(exitMatch[1], 10) : null;
        const success = exitCode === 0;

        events.push({
          tool: classifyCodexTool(call.name),
          args: call.args,
          result: { output: output.slice(0, 500), exit_code: exitCode },
          success,
        });
      }
    }
  }

  return { messages, events };
}

// ─── Tool name mapping ────────────────────────────────────────────────────────

function classifyCodexTool(codexToolName: string): string {
  // Map Codex internal tool names to our RawToolEvent tool names
  switch (codexToolName) {
    case "exec_command":
      return "bash";
    case "write_file":
    case "create_file":
      return "write";
    case "read_file":
      return "read";
    case "patch_file":
    case "edit_file":
      return "edit";
    default:
      return codexToolName;
  }
}
