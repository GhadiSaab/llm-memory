// Tests for deleteSession — the DB primitive used by signalSessionEnd's session guard.

import { describe, it, expect, beforeEach } from "vitest";
import { clearDb, seedProject, seedSession } from "../db/helpers.js";
import { deleteSession, getSessionById } from "../../src/db/index.js";
import type { UUID } from "../../src/types/index.js";

beforeEach(() => {
  clearDb();
});

describe("deleteSession", () => {
  it("removes the session row from the DB", () => {
    const project = seedProject();
    const session = seedSession(project.id);

    expect(getSessionById(session.id)).not.toBeNull();

    deleteSession(session.id as UUID);

    expect(getSessionById(session.id)).toBeNull();
  });

  it("does not throw when deleting a non-existent session", () => {
    expect(() => deleteSession("non-existent-id" as UUID)).not.toThrow();
  });
});
