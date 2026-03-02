// Project resolution for the shell wrapper.
// Resolves the current working directory to a project record, creating one if needed.

import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { basename } from "node:path";
import {
  getProjectByGitRemote,
  getProjectByPathHash,
  createProject,
} from "../db/index.js";

// ─── Resolution result ────────────────────────────────────────────────────────

export interface ResolvedProject {
  projectId: string;
  name: string;
  path: string;
  gitRemote: string | null;
  pathHash: string;
  isNew: boolean;
}

// ─── Git helpers ──────────────────────────────────────────────────────────────

function tryExecSync(cmd: string, cwd: string): string | null {
  try {
    return execSync(cmd, { cwd, stdio: ["pipe", "pipe", "pipe"] }).toString().trim() || null;
  } catch {
    return null;
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function resolveProject(cwd: string): Promise<ResolvedProject> {
  // 1. Try git remote as canonical ID
  const gitRemote = tryExecSync("git remote get-url origin", cwd);

  // 2. Try git root for the canonical path
  const gitRoot = tryExecSync("git rev-parse --show-toplevel", cwd);

  // 3. Resolved path: git root → cwd
  const resolvedPath = gitRoot ?? cwd;
  const name = basename(resolvedPath);
  const pathHash = createHash("sha256").update(resolvedPath).digest("hex");

  // 4. Look up existing project (by remote first, then path hash)
  const existing =
    (gitRemote ? getProjectByGitRemote(gitRemote) : null) ??
    getProjectByPathHash(pathHash);

  if (existing) {
    return {
      projectId: existing.id,
      name: existing.name,
      path: existing.path,
      gitRemote: existing.git_remote,
      pathHash,
      isNew: false,
    };
  }

  // 5. Create new project
  const project = createProject({ name, path: resolvedPath, git_remote: gitRemote, path_hash: pathHash });

  return {
    projectId: project.id,
    name: project.name,
    path: project.path,
    gitRemote: project.git_remote,
    pathHash,
    isNew: true,
  };
}
