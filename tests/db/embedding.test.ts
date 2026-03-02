import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../../src/db/connection.js";
import {
  loadEmbedder,
  embedText,
  storeEmbedding,
  searchSimilar,
} from "../../src/db/embedding.js";
import { clearDb, seedProject, seedSession } from "./helpers.js";

// Load the model once before all tests — ~1-3s from cache
await loadEmbedder();

beforeEach(clearDb);

describe("embedText", () => {
  it("returns a Float32Array of dimension 384", async () => {
    const vec = await embedText("refactor the auth module");
    expect(vec).toBeInstanceOf(Float32Array);
    expect(vec.length).toBe(384);
  });

  it("is normalized — L2 norm is approximately 1", async () => {
    const vec = await embedText("fix the login bug");
    const norm = Math.sqrt(vec.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1.0, 2);
  });

  it("produces different vectors for semantically different texts", async () => {
    const v1 = await embedText("fix the login bug");
    const v2 = await embedText("add dark mode to the UI");
    // dot product of two normalized vectors
    const dot = v1.reduce((s, x, i) => s + x * (v2[i] ?? 0), 0);
    // They should not be identical
    expect(dot).toBeLessThan(0.999);
  });

  it("produces similar vectors for semantically similar texts", async () => {
    const v1 = await embedText("refactor authentication code");
    const v2 = await embedText("rewrite auth logic");
    const dot = v1.reduce((s, x, i) => s + x * (v2[i] ?? 0), 0);
    // Semantically close → cosine similarity well above 0.5
    expect(dot).toBeGreaterThan(0.5);
  });
});

describe("storeEmbedding", () => {
  it("inserts a row in session_embeddings with the correct rowid", () => {
    const project = seedProject();
    const session = seedSession(project.id);

    const vec = new Float32Array(384).fill(0);
    vec[0] = 1.0;

    storeEmbedding(session.id, vec);

    const row = db.prepare<[string], { rowid: number }>(
      "SELECT rowid FROM sessions WHERE id = ?"
    ).get(session.id)!;

    const embRow = db.prepare<[number], { embedding: Buffer }>(
      "SELECT embedding FROM session_embeddings WHERE rowid = ?"
    ).get(row.rowid);

    expect(embRow).toBeTruthy();
    const stored = new Float32Array(
      embRow!.embedding.buffer,
      embRow!.embedding.byteOffset,
      embRow!.embedding.byteLength / 4
    );
    expect(stored[0]).toBeCloseTo(1.0, 5);
  });

  it("also persists the vector in sessions.embedding", () => {
    const project = seedProject();
    const session = seedSession(project.id);

    const vec = new Float32Array(384).fill(0.5 / Math.sqrt(384));

    storeEmbedding(session.id, vec);

    const row = db.prepare<[string], { embedding: Buffer | null }>(
      "SELECT embedding FROM sessions WHERE id = ?"
    ).get(session.id)!;

    expect(row.embedding).toBeTruthy();
  });

  it("throws when the session does not exist", () => {
    const vec = new Float32Array(384);
    expect(() => storeEmbedding("non-existent-id", vec)).toThrow();
  });
});

describe("searchSimilar", () => {
  it("returns sessions ordered closest-first within the project", () => {
    const project = seedProject();
    const close = seedSession(project.id);
    const far = seedSession(project.id);

    // Use real embed-like vectors: orthogonal unit vectors
    const vClose = new Float32Array(384);
    vClose[0] = 1.0;
    const vFar = new Float32Array(384);
    vFar[100] = 1.0;

    storeEmbedding(close.id, vClose);
    storeEmbedding(far.id, vFar);

    const results = searchSimilar(vClose, project.id, 5);

    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results[0].sessionId).toBe(close.id);
    expect(results[0].distance).toBeLessThan(results[1].distance);
  });

  it("respects the limit parameter", () => {
    const project = seedProject();
    const sessions = [
      seedSession(project.id),
      seedSession(project.id),
      seedSession(project.id),
    ];
    sessions.forEach((s, i) => {
      const v = new Float32Array(384);
      v[i * 10] = 1.0;
      storeEmbedding(s.id, v);
    });

    const query = new Float32Array(384);
    query[0] = 1.0;
    const results = searchSimilar(query, project.id, 2);
    expect(results).toHaveLength(2);
  });

  it("filters to the given project only", () => {
    const p1 = seedProject({ path_hash: "ph1" });
    const p2 = seedProject({ path_hash: "ph2" });
    const s1 = seedSession(p1.id);
    const s2 = seedSession(p2.id);

    const v = new Float32Array(384);
    v[0] = 1.0;
    storeEmbedding(s1.id, v);
    storeEmbedding(s2.id, v);

    const results = searchSimilar(v, p1.id, 10);
    expect(results.every((r) => r.sessionId === s1.id)).toBe(true);
    expect(results.map((r) => r.sessionId)).not.toContain(s2.id);
  });

  it("returns empty array when no embeddings exist for the project", () => {
    const project = seedProject();
    seedSession(project.id); // no embedding stored

    const query = new Float32Array(384);
    query[0] = 1.0;
    const results = searchSimilar(query, project.id, 5);
    expect(results).toEqual([]);
  });

  it("returns distance alongside sessionId", () => {
    const project = seedProject();
    const session = seedSession(project.id);

    const v = new Float32Array(384);
    v[0] = 1.0;
    storeEmbedding(session.id, v);

    const results = searchSimilar(v, project.id, 5);
    expect(results).toHaveLength(1);
    expect(typeof results[0].distance).toBe("number");
    expect(results[0].distance).toBeGreaterThanOrEqual(0);
  });
});
