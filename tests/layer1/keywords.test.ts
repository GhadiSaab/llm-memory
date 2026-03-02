import { describe, it, expect } from "vitest";
import {
  scoreKeywords,
  DECISION_SIGNALS,
  GOAL_SIGNALS,
  FAILURE_SIGNALS,
  CONCLUSION_SIGNALS,
} from "../../src/layer1/keywords.js";

// ─── Noise ────────────────────────────────────────────────────────────────────

describe("noise", () => {
  it("returns noise with confidence 0 for empty string", () => {
    const s = scoreKeywords("");
    expect(s.category).toBe("noise");
    expect(s.confidence).toBe(0);
    expect(s.matchedSignals).toEqual([]);
  });

  it("returns noise for content with no matching phrases", () => {
    const s = scoreKeywords("The weather today is quite pleasant.");
    expect(s.category).toBe("noise");
    expect(s.confidence).toBe(0);
    expect(s.matchedSignals).toEqual([]);
  });
});

// ─── Decision ─────────────────────────────────────────────────────────────────

describe("decision category", () => {
  it("detects a clear decision phrase", () => {
    const s = scoreKeywords("I think we should go with SQLite for now.");
    expect(s.category).toBe("decision");
    expect(s.confidence).toBeGreaterThan(0);
    expect(s.matchedSignals.length).toBeGreaterThan(0);
  });

  it("detects multiple decision signals", () => {
    const s = scoreKeywords("Agreed, that makes sense. Let's go with the current approach.");
    expect(s.category).toBe("decision");
    expect(s.matchedSignals.length).toBeGreaterThanOrEqual(2);
  });

  it("matching is case-insensitive", () => {
    const s = scoreKeywords("DECIDED TO refactor the module.");
    expect(s.category).toBe("decision");
  });

  it("matches substring inside a longer sentence", () => {
    const s = scoreKeywords("After reviewing everything, we decided to drop the old library.");
    expect(s.matchedSignals).toContain("decided to");
  });

  it("confidence is ratio of matched phrases to dictionary size, capped at 1", () => {
    // Single match → confidence = 1 / DECISION_SIGNALS.length
    const s = scoreKeywords("let's go with the simpler approach");
    expect(s.confidence).toBeCloseTo(1 / DECISION_SIGNALS.length, 5);
    expect(s.confidence).toBeLessThanOrEqual(1.0);
  });
});

// ─── Goal ─────────────────────────────────────────────────────────────────────

describe("goal category", () => {
  it("detects a user request", () => {
    const s = scoreKeywords("Can you help me implement the login flow?");
    expect(s.category).toBe("goal");
    expect(s.confidence).toBeGreaterThan(0);
  });

  it("detects multiple goal signals", () => {
    const s = scoreKeywords("I need to fix this. Can you please help me?");
    expect(s.category).toBe("goal");
    expect(s.matchedSignals.length).toBeGreaterThanOrEqual(3);
  });

  it("matches 'the problem is' inside a sentence", () => {
    const s = scoreKeywords("So the problem is that the login fails silently.");
    expect(s.matchedSignals).toContain("the problem is");
  });
});

// ─── Failure ──────────────────────────────────────────────────────────────────

describe("failure category", () => {
  it("detects an error report", () => {
    const s = scoreKeywords("TypeError: cannot find module './utils'");
    expect(s.category).toBe("error");
    expect(s.confidence).toBeGreaterThan(0);
  });

  it("detects multiple failure signals", () => {
    const s = scoreKeywords("The build failed. There's a bug — it crashes with an unexpected error.");
    expect(s.category).toBe("error");
    expect(s.matchedSignals.length).toBeGreaterThanOrEqual(3);
  });

  it("detects 'doesn't work' as substring", () => {
    const s = scoreKeywords("The pagination doesn't work on mobile.");
    expect(s.matchedSignals).toContain("doesn't work");
  });

  it("detects 'module not found'", () => {
    const s = scoreKeywords("Error: module not found at resolution step");
    expect(s.matchedSignals).toContain("module not found");
  });
});

// ─── Conclusion ───────────────────────────────────────────────────────────────

describe("conclusion category", () => {
  it("detects a conclusion phrase", () => {
    const s = scoreKeywords("All tests pass. Ship it!");
    expect(s.category).toBe("conclusion");
    expect(s.confidence).toBeGreaterThan(0);
  });

  it("detects multiple conclusion signals", () => {
    const s = scoreKeywords("Done! Works perfectly. Looks good, lgtm.");
    expect(s.category).toBe("conclusion");
    expect(s.matchedSignals.length).toBeGreaterThanOrEqual(3);
  });

  it("detects 'working now'", () => {
    const s = scoreKeywords("After that change it's working now.");
    expect(s.matchedSignals).toContain("working now");
  });
});

// ─── Dominant category wins ───────────────────────────────────────────────────

describe("dominant category", () => {
  it("returns failure when failure signals outnumber others", () => {
    // 3 failure signals, 1 goal signal
    const s = scoreKeywords(
      "I need help. The build failed, there's a bug and it crashed."
    );
    expect(s.category).toBe("error");
  });

  it("returns conclusion when conclusion signals outnumber others", () => {
    // 4 conclusion signals, 1 failure signal
    const s = scoreKeywords("Fixed. Works. Done. Looks good. There was one bug.");
    expect(s.category).toBe("conclusion");
  });

  it("returns decision when decision signals dominate", () => {
    // 3 decision signals vs 1 goal signal
    const s = scoreKeywords(
      "Agreed, that makes sense. Let's go with Postgres rather than SQLite. I need to check once."
    );
    expect(s.category).toBe("decision");
  });

  it("matchedSignals only contains phrases from the winning dictionary", () => {
    const s = scoreKeywords("Fixed. Works. Done. Looks good. There was one error.");
    // conclusion has 4 matches, failure has 1 — conclusion wins
    expect(s.category).toBe("conclusion");
    // none of the matched signals should be from the failure dictionary
    const failureSet = new Set(FAILURE_SIGNALS.map((p) => p.toLowerCase()));
    for (const signal of s.matchedSignals) {
      expect(failureSet.has(signal.toLowerCase())).toBe(false);
    }
  });
});

// ─── Confidence bounds ────────────────────────────────────────────────────────

describe("confidence", () => {
  it("is always between 0 and 1 inclusive", () => {
    const samples = [
      "",
      "error",
      "failed broken bug issue crash wrong incorrect unexpected TypeError cannot find module not found permission denied null pointer exception undefined doesn't work not working",
      "let's go with this",
      "done works fixed perfect great",
    ];
    for (const content of samples) {
      const { confidence } = scoreKeywords(content);
      expect(confidence).toBeGreaterThanOrEqual(0);
      expect(confidence).toBeLessThanOrEqual(1);
    }
  });

  it("confidence does not exceed 1.0 even when all signals match", () => {
    // Construct content that contains every conclusion signal
    const allConclusion = CONCLUSION_SIGNALS.join(" ");
    const s = scoreKeywords(allConclusion);
    expect(s.confidence).toBe(1.0);
  });

  it("confidence is capped at 1.0 for all four dictionaries", () => {
    const allDecision = DECISION_SIGNALS.join(" ");
    const allGoal = GOAL_SIGNALS.join(" ");
    const allFailure = FAILURE_SIGNALS.join(" ");
    const allConclusion = CONCLUSION_SIGNALS.join(" ");
    for (const content of [allDecision, allGoal, allFailure, allConclusion]) {
      expect(scoreKeywords(content).confidence).toBeLessThanOrEqual(1.0);
    }
  });
});

// ─── matchedSignals come exclusively from winning dictionary ─────────────────

describe("matchedSignals exclusivity", () => {
  it("all matchedSignals are phrases from the winning dictionary — decision", () => {
    const s = scoreKeywords(DECISION_SIGNALS.join(" "));
    const dictSet = new Set(DECISION_SIGNALS.map((p) => p.toLowerCase()));
    for (const signal of s.matchedSignals) {
      expect(dictSet.has(signal.toLowerCase())).toBe(true);
    }
  });

  it("all matchedSignals are phrases from the winning dictionary — error", () => {
    const s = scoreKeywords(FAILURE_SIGNALS.join(" "));
    const dictSet = new Set(FAILURE_SIGNALS.map((p) => p.toLowerCase()));
    for (const signal of s.matchedSignals) {
      expect(dictSet.has(signal.toLowerCase())).toBe(true);
    }
  });

  it("all matchedSignals are phrases from the winning dictionary — goal", () => {
    const s = scoreKeywords(GOAL_SIGNALS.join(" "));
    const dictSet = new Set(GOAL_SIGNALS.map((p) => p.toLowerCase()));
    for (const signal of s.matchedSignals) {
      expect(dictSet.has(signal.toLowerCase())).toBe(true);
    }
  });

  it("all matchedSignals are phrases from the winning dictionary — conclusion", () => {
    const s = scoreKeywords(CONCLUSION_SIGNALS.join(" "));
    const dictSet = new Set(CONCLUSION_SIGNALS.map((p) => p.toLowerCase()));
    for (const signal of s.matchedSignals) {
      expect(dictSet.has(signal.toLowerCase())).toBe(true);
    }
  });

  it("does not crash when two categories are tied — returns a valid MessageType", () => {
    // Craft content with exactly 1 decision signal and 1 goal signal
    const s = scoreKeywords(`${DECISION_SIGNALS[0]} ${GOAL_SIGNALS[0]}`);
    const validTypes = ["decision", "goal", "error", "conclusion", "noise"];
    expect(validTypes).toContain(s.category);
    expect(s.confidence).toBeGreaterThanOrEqual(0);
  });
});
