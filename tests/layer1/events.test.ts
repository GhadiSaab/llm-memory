import { describe, it, expect } from "vitest";
import {
  classifyToolEvent,
  isInstallCommand,
  isTestCommand,
  isBuildCommand,
  isConfigFile,
} from "../../src/layer1/events.js";

// ─── Detection helpers ────────────────────────────────────────────────────────

describe("isInstallCommand", () => {
  it.each([
    "npm install express",
    "npm i lodash",
    "yarn add axios",
    "pnpm add zod",
    "pip install requests",
    "pip3 install flask",
    "cargo add serde",
    "gem install rails",
    "go get github.com/foo/bar",
  ])("matches: %s", (cmd) => expect(isInstallCommand(cmd)).toBe(true));

  it.each([
    "npm run build",
    "npm test",
    "pip show requests",
    "cargo build",
  ])("does not match: %s", (cmd) => expect(isInstallCommand(cmd)).toBe(false));
});

describe("isTestCommand", () => {
  it.each([
    "jest",
    "npx jest --watch",
    "vitest run",
    "pytest tests/",
    "mocha test/",
    "cargo test",
    "go test ./...",
    "npm test",
    "npm run test",
    "yarn test",
    "pnpm test",
  ])("matches: %s", (cmd) => expect(isTestCommand(cmd)).toBe(true));

  it.each([
    "npm run build",
    "echo test",
    "ls ./tests",
  ])("does not match: %s", (cmd) => expect(isTestCommand(cmd)).toBe(false));
});

describe("isBuildCommand", () => {
  it.each([
    "docker build -t myapp .",
    "npm run build",
    "yarn build",
    "pnpm build",
    "cargo build",
    "go build ./...",
    "make",
    "make all",
    "tsc",
    "tsc --noEmit",
    "webpack",
    "vite build",
    "next build",
  ])("matches: %s", (cmd) => expect(isBuildCommand(cmd)).toBe(true));

  it.each([
    "npm install",
    "npm test",
    "echo build",
    "ls",
  ])("does not match: %s", (cmd) => expect(isBuildCommand(cmd)).toBe(false));
});

describe("isConfigFile", () => {
  it.each([
    ".env",
    ".env.production",
    "docker-compose.yml",
    "docker-compose.yaml",
    "Dockerfile",
    "tsconfig.json",
    "tsconfig.base.json",
    ".eslintrc.json",
    ".prettierrc",
    "babel.config.js",
    "vite.config.ts",
    "webpack.config.js",
    "jest.config.ts",
    "vitest.config.ts",
    "package.json",
    "pyproject.toml",
    "Cargo.toml",
    "go.mod",
  ])("matches: %s", (path) => expect(isConfigFile(path)).toBe(true));

  it.each([
    "src/index.ts",
    "README.md",
    "src/config.ts",
    "tests/setup.ts",
  ])("does not match: %s", (path) => expect(isConfigFile(path)).toBe(false));
});

// ─── classifyToolEvent ────────────────────────────────────────────────────────

describe("classifyToolEvent — unknown tool", () => {
  it("returns null for unknown tools", () => {
    expect(classifyToolEvent("unknown_tool", {}, {}, true)).toBeNull();
    expect(classifyToolEvent("read_file", {}, {}, true)).toBeNull();
  });
});

// ─── write_file / create_file ─────────────────────────────────────────────────

describe("classifyToolEvent — write_file", () => {
  it("classifies as file_created", () => {
    const e = classifyToolEvent("write_file", { path: "src/auth.ts" }, {}, true);
    expect(e).not.toBeNull();
    expect(e!.type).toBe("file_created");
    expect(e!.weight).toBe(0.8);
    expect((e!.payload as any).path).toBe("src/auth.ts");
  });

  it("classifies as file_modified for edit_file", () => {
    const e = classifyToolEvent("edit_file", { path: "src/auth.ts" }, {}, true);
    expect(e!.type).toBe("file_modified");
    expect(e!.weight).toBe(0.8);
  });

  it("classifies as file_modified for str_replace", () => {
    const e = classifyToolEvent("str_replace", { path: "src/index.ts" }, {}, true);
    expect(e!.type).toBe("file_modified");
  });

  it("returns null when no path in args", () => {
    const e = classifyToolEvent("write_file", {}, {}, true);
    expect(e).toBeNull();
  });

  it("classifies as config_modified when writing a config file", () => {
    const e = classifyToolEvent("write_file", { path: "tsconfig.json" }, {}, true);
    expect(e!.type).toBe("config_modified");
    expect(e!.weight).toBe(0.7);
    expect((e!.payload as any).path).toBe("tsconfig.json");
  });

  it("classifies .env as config_modified", () => {
    const e = classifyToolEvent("write_file", { path: ".env" }, {}, true);
    expect(e!.type).toBe("config_modified");
  });
});

// ─── bash — git commit ────────────────────────────────────────────────────────

describe("classifyToolEvent — bash git commit", () => {
  it("classifies git commit as commit event", () => {
    const e = classifyToolEvent(
      "bash",
      { command: "git commit -m 'Add auth module'" },
      { output: "[main abc1234] Add auth module" },
      true
    );
    expect(e!.type).toBe("commit");
    expect(e!.weight).toBe(0.9);
    expect((e!.payload as any).message).toBe("Add auth module");
    expect((e!.payload as any).hash).toBe("abc1234");
  });

  it("extracts hash from output", () => {
    const e = classifyToolEvent(
      "bash",
      { command: "git commit -m 'fix bug'" },
      { output: "deadbeef fix bug" },
      true
    );
    expect((e!.payload as any).hash).toBe("deadbeef");
  });
});

// ─── bash — install ───────────────────────────────────────────────────────────

describe("classifyToolEvent — bash install", () => {
  it("classifies npm install as dependency_added", () => {
    const e = classifyToolEvent("bash", { command: "npm install express" }, {}, true);
    expect(e!.type).toBe("dependency_added");
    expect(e!.weight).toBe(0.6);
    expect((e!.payload as any).manager).toBe("npm");
    expect((e!.payload as any).package).toBe("express");
  });

  it("classifies pip install as dependency_added", () => {
    const e = classifyToolEvent("bash", { command: "pip install requests" }, {}, true);
    expect(e!.type).toBe("dependency_added");
    expect((e!.payload as any).manager).toBe("pip");
    expect((e!.payload as any).package).toBe("requests");
  });

  it("skips flags and extracts first non-flag token: npm install -g express", () => {
    const e = classifyToolEvent("bash", { command: "npm install -g express" }, {}, true);
    expect(e!.type).toBe("dependency_added");
    expect((e!.payload as any).package).toBe("express");
  });

  it("extracts package before trailing flags: npm install express --save", () => {
    const e = classifyToolEvent("bash", { command: "npm install express --save" }, {}, true);
    expect(e!.type).toBe("dependency_added");
    expect((e!.payload as any).package).toBe("express");
  });
});

// ─── bash — test ──────────────────────────────────────────────────────────────

describe("classifyToolEvent — bash test", () => {
  it("classifies vitest run as test_run", () => {
    const e = classifyToolEvent(
      "bash",
      { command: "npx vitest run" },
      { output: "138 passed (138)" },
      true
    );
    expect(e!.type).toBe("test_run");
    expect(e!.weight).toBe(0.7);
    expect((e!.payload as any).passed).toBe(138);
  });

  it("classifies failed jest run with failure count", () => {
    const e = classifyToolEvent(
      "bash",
      { command: "jest" },
      { output: "3 failed, 10 passed" },
      false
    );
    expect(e!.type).toBe("test_run");
    expect((e!.payload as any).failed).toBe(3);
  });
});

// ─── bash — build ─────────────────────────────────────────────────────────────

describe("classifyToolEvent — bash build", () => {
  it("classifies npm run build as build_attempt", () => {
    const e = classifyToolEvent("bash", { command: "npm run build" }, {}, true);
    expect(e!.type).toBe("build_attempt");
    expect(e!.weight).toBe(0.6);
    expect((e!.payload as any).success).toBe(true);
  });

  it("captures errorSummary on failed build", () => {
    const e = classifyToolEvent(
      "bash",
      { command: "tsc" },
      { stderr: "error TS2345: Argument of type 'string' is not assignable" },
      false
    );
    expect(e!.type).toBe("build_attempt");
    expect((e!.payload as any).success).toBe(false);
    expect((e!.payload as any).errorSummary).toContain("TS2345");
  });
});

// ─── bash — error ─────────────────────────────────────────────────────────────

describe("classifyToolEvent — bash error", () => {
  it("classifies failed non-special command as error", () => {
    const e = classifyToolEvent(
      "bash",
      { command: "cat missing-file.txt" },
      { stderr: "No such file or directory" },
      false
    );
    expect(e!.type).toBe("error");
    expect(e!.weight).toBe(0.7);
    expect((e!.payload as any).command).toBe("cat missing-file.txt");
    expect((e!.payload as any).message).toContain("No such file");
  });
});

// ─── bash — generic command ───────────────────────────────────────────────────

describe("classifyToolEvent — bash generic", () => {
  it("classifies successful unrecognised command as command_run with low weight", () => {
    const e = classifyToolEvent("bash", { command: "ls -la" }, { output: "..." }, true);
    expect(e!.type).toBe("command_run");
    expect(e!.weight).toBe(0.3);
    expect((e!.payload as any).success).toBe(true);
  });

  it("empty command string returns command_run with weight 0.3", () => {
    const e = classifyToolEvent("bash", { command: "" }, {}, true);
    expect(e).not.toBeNull();
    expect(e!.type).toBe("command_run");
    expect(e!.weight).toBe(0.3);
    expect((e!.payload as any).command).toBe("");
  });
});

// ─── run_command alias ────────────────────────────────────────────────────────

describe("classifyToolEvent — run_command alias", () => {
  it("handles run_command the same as bash", () => {
    const e = classifyToolEvent("run_command", { command: "ls" }, {}, true);
    expect(e!.type).toBe("command_run");
  });
});

// ─── shape ────────────────────────────────────────────────────────────────────

describe("classifyToolEvent — event shape", () => {
  it("returns event with id, session_id, type, payload, weight, timestamp, source", () => {
    const e = classifyToolEvent("write_file", { path: "src/foo.ts" }, {}, true)!;
    expect(e.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(e.session_id).toBeDefined();
    expect(typeof e.type).toBe("string");
    expect(typeof e.payload).toBe("object");
    expect(typeof e.weight).toBe("number");
    expect(typeof e.timestamp).toBe("number");
    expect(e.source).toBe("mcp");
  });
});
