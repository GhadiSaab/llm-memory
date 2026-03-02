// One-shot CLI: register the current directory as a project and print its ID.
// Usage: node dist/cli/init-project.js

import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { basename, resolve } from "node:path";
import {
  getProjectByGitRemote,
  getProjectByPathHash,
  createProject,
} from "../db/index.js";

const projectPath = resolve(process.cwd());
const pathHash = createHash("sha256").update(projectPath).digest("hex");

// Try to get git remote as canonical ID
let gitRemote: string | null = null;
try {
  gitRemote = execSync("git remote get-url origin", { cwd: projectPath, stdio: ["pipe", "pipe", "pipe"] })
    .toString()
    .trim() || null;
} catch {
  // no git remote — fine, use path hash
}

// Look up existing project
const existing =
  (gitRemote ? getProjectByGitRemote(gitRemote) : null) ??
  getProjectByPathHash(pathHash);

if (existing) {
  console.log(existing.id);
  process.exit(0);
}

// Create new project
const project = createProject({
  name: basename(projectPath),
  path: projectPath,
  git_remote: gitRemote,
  path_hash: pathHash,
});

console.log(project.id);
