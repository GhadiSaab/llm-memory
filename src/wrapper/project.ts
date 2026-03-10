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

  // 3. Resolved path: use git root only if it IS the project directory.
  //    If git root is a grandparent (e.g. home dir is a bare git repo),
  //    fall back to cwd so that ~/perso/Project12 doesn't get lumped into ~.
  let resolvedPath: string;
  if (!gitRoot || gitRoot === cwd) {
    resolvedPath = gitRoot ?? cwd;
  } else {
    // gitRoot is a parent of cwd. Only trust it if cwd is exactly one level
    // inside (i.e. cwd is a direct subdir of the project root, not a nested
    // subproject buried under a home-dir git repo).
    const parent = gitRoot.endsWith("/") ? gitRoot : gitRoot + "/";
    const rel = cwd.startsWith(parent) ? cwd.slice(parent.length) : null;
    resolvedPath = rel !== null && !rel.includes("/") ? gitRoot : cwd;
  }
  const name = basename(resolvedPath);
  const pathHash = createHash("sha256").update(resolvedPath).digest("hex");

  // 4. Look up existing project — path hash takes priority over git remote
  //    to avoid collision when two different paths share the same remote.
  const existing =
    getProjectByPathHash(pathHash) ??
    (gitRemote ? getProjectByGitRemote(gitRemote) : null);

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
