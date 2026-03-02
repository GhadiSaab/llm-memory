// OpenCode hook config generator.
// Produces the hooks block for ~/.opencode/config.json.

import { homedir } from "node:os";
import { join } from "node:path";

const RECEIVER = join(homedir(), ".llm-memory", "bin", "hook-receiver");

const HOOK_CMD = (event: string) =>
  `${RECEIVER} --event ${event} --session $LLM_MEMORY_SESSION_ID`;

export interface OpenCodeHookConfig {
  hooks: {
    "tool:before": string;
    "tool:after": string;
  };
}

export function buildOpenCodeHookConfig(): OpenCodeHookConfig {
  return {
    hooks: {
      "tool:before": HOOK_CMD("PreToolUse"),
      "tool:after": HOOK_CMD("PostToolUse"),
    },
  };
}
