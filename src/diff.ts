import type { GitHub } from "@actions/github/lib/utils.js";
import type { ChangedFile } from "./types.js";

type Octokit = InstanceType<typeof GitHub>;

const IGNORED_FILES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "uv.lock",
  "Gemfile.lock",
  "Cargo.lock",
  "go.sum",
  "poetry.lock",
  "composer.lock",
]);

const MAX_PATCH_LINES = 10_000;

export async function getChangedFiles(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number
): Promise<ChangedFile[]> {
  const files: ChangedFile[] = [];

  // Paginate through all changed files
  for await (const response of octokit.paginate.iterator(
    octokit.rest.pulls.listFiles,
    { owner, repo, pull_number: pullNumber, per_page: 100 }
  )) {
    for (const file of response.data) {
      // Skip lockfiles
      const basename = file.filename.split("/").pop() ?? "";
      if (IGNORED_FILES.has(basename)) continue;

      // Skip binary files (no patch means binary or too large)
      if (!file.patch) continue;

      // Skip extremely large patches
      const lineCount = file.patch.split("\n").length;
      if (lineCount > MAX_PATCH_LINES) continue;

      files.push({
        filename: file.filename,
        status: file.status,
        patch: file.patch,
        additions: file.additions,
        deletions: file.deletions,
      });
    }
  }

  return files;
}
