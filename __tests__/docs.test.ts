import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ChangedFile } from "../src/types.js";

// Mock @actions/glob before importing
vi.mock("@actions/glob", () => ({
  create: vi.fn(),
}));

// Mock fs/promises
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));

import { getDocFiles } from "../src/docs.js";
import * as glob from "@actions/glob";
import { readFile } from "node:fs/promises";

const mockReadFile = vi.mocked(readFile);
const mockGlobCreate = vi.mocked(glob.create);

describe("getDocFiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("finds and reads doc files", async () => {
    const cwd = process.cwd();
    mockGlobCreate.mockResolvedValue({
      glob: vi.fn().mockResolvedValue([
        `${cwd}/README.md`,
        `${cwd}/docs/api.md`,
      ]),
    } as any);

    mockReadFile
      .mockResolvedValueOnce("# Project" as any)
      .mockResolvedValueOnce("# API Docs" as any);

    const changedFiles: ChangedFile[] = [
      {
        filename: "src/api/handler.ts",
        status: "modified",
        patch: "+new code",
        additions: 1,
        deletions: 0,
      },
    ];

    const result = await getDocFiles("**/*.md", changedFiles);

    expect(result).toHaveLength(2);
    // docs/api.md should have no path overlap with src/api/handler.ts (different root dirs)
    // Both should be present
    expect(result.map((d) => d.filepath)).toContain("README.md");
    expect(result.map((d) => d.filepath)).toContain("docs/api.md");
  });

  it("skips node_modules and .git files", async () => {
    const cwd = process.cwd();
    mockGlobCreate.mockResolvedValue({
      glob: vi.fn().mockResolvedValue([
        `${cwd}/node_modules/pkg/README.md`,
        `${cwd}/.git/description`,
        `${cwd}/docs/guide.md`,
      ]),
    } as any);

    mockReadFile.mockResolvedValueOnce("# Guide" as any);

    const result = await getDocFiles("**/*.md", []);

    expect(result).toHaveLength(1);
    expect(result[0].filepath).toBe("docs/guide.md");
  });

  it("prioritizes docs with path overlap to changed files", async () => {
    const cwd = process.cwd();
    mockGlobCreate.mockResolvedValue({
      glob: vi.fn().mockResolvedValue([
        `${cwd}/README.md`,
        `${cwd}/src/auth/README.md`,
      ]),
    } as any);

    mockReadFile
      .mockResolvedValueOnce("# Root" as any)
      .mockResolvedValueOnce("# Auth" as any);

    const changedFiles: ChangedFile[] = [
      {
        filename: "src/auth/login.ts",
        status: "modified",
        patch: "+code",
        additions: 1,
        deletions: 0,
      },
    ];

    const result = await getDocFiles("**/*.md", changedFiles);

    // src/auth/README.md should be first (2 path segments overlap: src, auth)
    expect(result[0].filepath).toBe("src/auth/README.md");
    expect(result[0].priority).toBe(2);
    expect(result[1].filepath).toBe("README.md");
    expect(result[1].priority).toBe(0);
  });
});
