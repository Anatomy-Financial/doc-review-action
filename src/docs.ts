import * as glob from "@actions/glob";
import { readFile } from "node:fs/promises";
import type { ChangedFile, DocFile } from "./types.js";

/**
 * Compute a priority score based on path overlap with changed files.
 * Higher score = more relevant to the changes.
 */
function computePriority(
  docPath: string,
  changedFiles: ChangedFile[]
): number {
  const docParts = docPath.split("/");
  let maxOverlap = 0;

  for (const file of changedFiles) {
    const fileParts = file.filename.split("/");
    let overlap = 0;
    for (let i = 0; i < Math.min(docParts.length, fileParts.length); i++) {
      if (docParts[i] === fileParts[i]) {
        overlap++;
      } else {
        break;
      }
    }
    maxOverlap = Math.max(maxOverlap, overlap);
  }

  return maxOverlap;
}

export async function getDocFiles(
  docPatterns: string,
  changedFiles: ChangedFile[]
): Promise<DocFile[]> {
  const globber = await glob.create(docPatterns, {
    followSymbolicLinks: false,
  });
  const paths = await globber.glob();

  const docs: DocFile[] = [];

  for (const absPath of paths) {
    // Convert absolute path to relative (cwd-based)
    const relativePath = absPath.replace(process.cwd() + "/", "");

    // Skip node_modules, .git, dist
    if (
      relativePath.startsWith("node_modules/") ||
      relativePath.startsWith(".git/") ||
      relativePath.startsWith("dist/")
    ) {
      continue;
    }

    const content = await readFile(absPath, "utf-8");
    const priority = computePriority(relativePath, changedFiles);

    docs.push({ filepath: relativePath, content, priority });
  }

  // Sort by priority descending (most relevant first)
  docs.sort((a, b) => b.priority - a.priority);

  return docs;
}
