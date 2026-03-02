// Tests for the hook receiver logic.
// We test processHookPayload() — the pure core — not the stdin/argv plumbing.

import { describe, it, expect, beforeEach } from "vitest";
import { clearDb, seedProject, seedSession } from "../db/helpers.js";
import { processHookPayload } from "../../src/hooks/receiver.js";
import { getEventsBySession } from "../../src/db/index.js";
import type { UUID } from "../../src/types/index.js";

beforeEach(() => {
  clearDb();
});

// ─── Claude Code stdin shape ──────────────────────────────────────────────────
// Claude Code sends: { tool_name, tool_input, tool_response }

describe("processHookPayload — Claude Code format", () => {
  it("inserts a file_created event for a write_file call", () => {
    const project = seedProject();
    const session = seedSession(project.id);

    const payload = {
      tool_name: "write_file",
      tool_input: { path: "src/auth.ts", content: "..." },
      tool_response: { success: true },
    };

    processHookPayload(session.id, payload);

    const events = getEventsBySession(session.id as UUID);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("file_created");
    expect((events[0].payload as any).path).toBe("src/auth.ts");
  });

  it("inserts a commit event for a git commit bash call", () => {
    const project = seedProject();
    const session = seedSession(project.id);

    const payload = {
      tool_name: "bash",
      tool_input: { command: "git commit -m 'add auth'" },
      tool_response: { stdout: "abc1234 add auth", exitCode: 0 },
    };

    processHookPayload(session.id, payload);

    const events = getEventsBySession(session.id as UUID);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("commit");
  });

  it("inserts a dependency_added event for npm install", () => {
    const project = seedProject();
    const session = seedSession(project.id);

    processHookPayload(session.id, {
      tool_name: "bash",
      tool_input: { command: "npm install express" },
      tool_response: { exitCode: 0 },
    });

    const events = getEventsBySession(session.id as UUID);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("dependency_added");
  });

  it("marks source as 'hook'", () => {
    const project = seedProject();
    const session = seedSession(project.id);

    processHookPayload(session.id, {
      tool_name: "write_file",
      tool_input: { path: "README.md" },
      tool_response: {},
    });

    const events = getEventsBySession(session.id as UUID);
    expect(events[0].source).toBe("hook");
  });
});

// ─── Gemini / OpenCode shape ──────────────────────────────────────────────────
// Gemini sends: { tool, args, result }

describe("processHookPayload — Gemini/OpenCode format", () => {
  it("handles { tool, args, result } shape from Gemini", () => {
    const project = seedProject();
    const session = seedSession(project.id);

    processHookPayload(session.id, {
      tool: "write_file",
      args: { path: "src/main.ts" },
      result: {},
    });

    const events = getEventsBySession(session.id as UUID);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("file_created");
  });
});

// ─── Unknown / unclassifiable tools ──────────────────────────────────────────

describe("processHookPayload — unknown tools", () => {
  it("inserts nothing for an unknown tool name", () => {
    const project = seedProject();
    const session = seedSession(project.id);

    processHookPayload(session.id, {
      tool_name: "unknown_tool_xyz",
      tool_input: {},
      tool_response: {},
    });

    expect(getEventsBySession(session.id as UUID)).toHaveLength(0);
  });

  it("returns false when classifier returns null", () => {
    const project = seedProject();
    const session = seedSession(project.id);

    const result = processHookPayload(session.id, {
      tool_name: "not_a_real_tool",
      tool_input: {},
      tool_response: {},
    });

    expect(result).toBe(false);
  });

  it("returns true when an event is successfully stored", () => {
    const project = seedProject();
    const session = seedSession(project.id);

    const result = processHookPayload(session.id, {
      tool_name: "write_file",
      tool_input: { path: "src/x.ts" },
      tool_response: {},
    });

    expect(result).toBe(true);
  });
});

// ─── Robustness ───────────────────────────────────────────────────────────────

describe("processHookPayload — robustness", () => {
  it("does not throw on completely empty payload", () => {
    const project = seedProject();
    const session = seedSession(project.id);
    expect(() => processHookPayload(session.id, {})).not.toThrow();
  });

  it("does not throw when tool_input is missing", () => {
    const project = seedProject();
    const session = seedSession(project.id);
    expect(() =>
      processHookPayload(session.id, { tool_name: "bash" })
    ).not.toThrow();
  });

  it("does not throw on null values in payload", () => {
    const project = seedProject();
    const session = seedSession(project.id);
    expect(() =>
      processHookPayload(session.id, { tool_name: null, tool_input: null, tool_response: null })
    ).not.toThrow();
  });
});
