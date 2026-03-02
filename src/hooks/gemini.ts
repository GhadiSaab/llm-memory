// Gemini CLI hook config generator.
// Produces the hooks block for ~/.gemini/settings.json.

import { homedir } from "node:os";
import { join } from "node:path";

const RECEIVER = join(homedir(), ".llm-memory", "bin", "hook-receiver");

const HOOK_CMD = (event: string) =>
  `${RECEIVER} --event ${event} --session $LLM_MEMORY_SESSION_ID`;

export interface GeminiHookConfig {
  hooks: {
    BeforeTool: string;
    AfterTool: string;
  };
}

export function buildGeminiHookConfig(): GeminiHookConfig {
  return {
    hooks: {
      BeforeTool: HOOK_CMD("PreToolUse"),
      AfterTool: HOOK_CMD("PostToolUse"),
    },
  };
}
