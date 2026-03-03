// Claude Code hook config generator.
// Produces the hooks block for .claude/settings.json.

import { homedir } from "node:os";
import { join } from "node:path";

const RECEIVER = join(homedir(), ".llm-memory", "bin", "hook-receiver");
const SESSION_START = join(homedir(), ".llm-memory", "bin", "session-start");

const HOOK_CMD = (event: string) =>
  `${RECEIVER} --event ${event} --session $LLM_MEMORY_SESSION_ID`;

export interface ClaudeHookConfig {
  hooks: {
    SessionStart: Array<{
      hooks: Array<{ type: string; command: string }>;
    }>;
    PostToolUse: Array<{
      matcher: string;
      hooks: Array<{ type: string; command: string }>;
    }>;
  };
}

export function buildClaudeHookConfig(sessionStartBin = SESSION_START): ClaudeHookConfig {
  return {
    hooks: {
      SessionStart: [
        {
          hooks: [{ type: "command", command: sessionStartBin }],
        },
      ],
      PostToolUse: [
        {
          matcher: "*",
          hooks: [{ type: "command", command: HOOK_CMD("PostToolUse") }],
        },
      ],
    },
  };
}
