import { describe, it, expect, beforeEach } from "vitest";
import {
  batchInsertEvents,
  getEventsBySession,
  getEventsBySessionAndType,
  insertEvent,
} from "../../src/db/index.js";
import { clearDb, seedProject, seedSession } from "./helpers.js";
import type { DecisionPayload, ErrorPayload, FilePayload } from "../../src/types/index.js";

beforeEach(clearDb);

describe("insertEvent", () => {
  it("stores and returns the event with the correct payload", () => {
    const project = seedProject();
    const session = seedSession(project.id);

    const payload: DecisionPayload = {
      type: "decision",
      content: "Use SQLite over Postgres",
      confidence: 0.9,
      triggeredByPattern: "iteration",
    };

    const event = insertEvent({
      session_id: session.id,
      type: "decision",
      payload,
      weight: 0.8,
      source: "hook",
    });

    expect(event.id).toBeTypeOf("string");
    expect(event.session_id).toBe(session.id);
    expect(event.type).toBe("decision");
    expect(event.weight).toBe(0.8);
    expect(event.source).toBe("hook");
    expect(event.payload).toEqual(payload);
    expect(event.timestamp).toBeGreaterThan(0);
  });

  it("defaults weight to 0.5 when not provided", () => {
    const project = seedProject();
    const session = seedSession(project.id);

    const event = insertEvent({
      session_id: session.id,
      type: "commit",
      payload: { type: "commit", message: "initial commit", hash: null },
      source: "mcp",
    });

    expect(event.weight).toBe(0.5);
  });
});

describe("batchInsertEvents", () => {
  it("inserts all events atomically and returns them in input order", () => {
    const project = seedProject();
    const session = seedSession(project.id);

    const filePayload: FilePayload = {
      type: "file_modified",
      path: "/src/index.ts",
      operation: "edit",
      diffSummary: null,
    };
    const errorPayload: ErrorPayload = {
      type: "error",
      message: "Cannot find module",
      command: "tsc",
      exitCode: 1,
    };
    const decisionPayload: DecisionPayload = {
      type: "decision",
      content: "Switched to ESM",
      confidence: 0.8,
      triggeredByPattern: "iteration",
    };

    const inserted = batchInsertEvents([
      { session_id: session.id, type: "file_modified", payload: filePayload, source: "hook" },
      { session_id: session.id, type: "error", payload: errorPayload, source: "hook", weight: 0.9 },
      { session_id: session.id, type: "decision", payload: decisionPayload, source: "mcp" },
    ]);

    expect(inserted).toHaveLength(3);
    expect(inserted[0].type).toBe("file_modified");
    expect(inserted[1].type).toBe("error");
    expect(inserted[1].weight).toBe(0.9);
    expect(inserted[2].type).toBe("decision");

    const ids = inserted.map((e) => e.id);
    expect(new Set(ids).size).toBe(3);
  });

  it("rolls back entirely if one event is invalid", () => {
    const project = seedProject();
    const session = seedSession(project.id);

    const fakeSessionId = "00000000-0000-0000-0000-000000000000" as any;
    expect(() =>
      batchInsertEvents([
        {
          session_id: session.id,
          type: "commit",
          payload: { type: "commit", message: "ok", hash: null },
          source: "mcp",
        },
        {
          session_id: fakeSessionId,
          type: "commit",
          payload: { type: "commit", message: "bad", hash: null },
          source: "mcp",
        },
      ])
    ).toThrow();

    expect(getEventsBySession(session.id)).toHaveLength(0);
  });
});

describe("getEventsBySession", () => {
  it("returns events ordered by timestamp ASC", () => {
    const project = seedProject();
    const session = seedSession(project.id);

    batchInsertEvents([
      { session_id: session.id, type: "commit", payload: { type: "commit", message: "first", hash: null }, source: "hook" },
      { session_id: session.id, type: "commit", payload: { type: "commit", message: "second", hash: null }, source: "hook" },
      { session_id: session.id, type: "commit", payload: { type: "commit", message: "third", hash: null }, source: "hook" },
    ]);

    const events = getEventsBySession(session.id);
    expect(events).toHaveLength(3);
    for (let i = 1; i < events.length; i++) {
      expect(events[i].timestamp).toBeGreaterThanOrEqual(events[i - 1].timestamp);
    }
  });

  it("returns empty array for a session with no events", () => {
    const project = seedProject();
    const session = seedSession(project.id);
    expect(getEventsBySession(session.id)).toEqual([]);
  });
});

describe("getEventsBySessionAndType", () => {
  it("filters to only the requested event type", () => {
    const project = seedProject();
    const session = seedSession(project.id);

    batchInsertEvents([
      { session_id: session.id, type: "decision", payload: { type: "decision", content: "use SQLite", confidence: 0.9, triggeredByPattern: "iteration" }, source: "hook" },
      { session_id: session.id, type: "error", payload: { type: "error", message: "oops", command: null, exitCode: null }, source: "hook" },
      { session_id: session.id, type: "decision", payload: { type: "decision", content: "use ESM", confidence: 0.8, triggeredByPattern: "confirmation" }, source: "hook" },
    ]);

    const decisions = getEventsBySessionAndType(session.id, "decision");
    expect(decisions).toHaveLength(2);
    expect(decisions.every((e) => e.type === "decision")).toBe(true);
  });
});
