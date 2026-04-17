import { describe, it, expect, vi } from "vitest";
import { getChangedFiles } from "../src/diff.js";

function createMockOctokit(files: any[]) {
  return {
    paginate: {
      iterator: vi.fn().mockReturnValue({
        async *[Symbol.asyncIterator]() {
          yield { data: files };
        },
      }),
    },
    rest: {
      pulls: {
        listFiles: {},
      },
    },
  } as any;
}

describe("getChangedFiles", () => {
  it("returns files with patches", async () => {
    const mockFiles = [
      {
        filename: "src/auth.ts",
        status: "modified",
        patch: "@@ -1,3 +1,3 @@\n-const x = 1;\n+const x = 2;",
        additions: 1,
        deletions: 1,
      },
    ];

    const octokit = createMockOctokit(mockFiles);
    const result = await getChangedFiles(octokit, "owner", "repo", 1);

    expect(result).toHaveLength(1);
    expect(result[0].filename).toBe("src/auth.ts");
    expect(result[0].patch).toContain("const x = 2");
  });

  it("filters out lockfiles", async () => {
    const mockFiles = [
      {
        filename: "package-lock.json",
        status: "modified",
        patch: "@@ -1 +1 @@\n-old\n+new",
        additions: 1,
        deletions: 1,
      },
      {
        filename: "uv.lock",
        status: "modified",
        patch: "@@ -1 +1 @@\n-old\n+new",
        additions: 1,
        deletions: 1,
      },
      {
        filename: "src/index.ts",
        status: "modified",
        patch: "@@ -1 +1 @@\n-old\n+new",
        additions: 1,
        deletions: 1,
      },
    ];

    const octokit = createMockOctokit(mockFiles);
    const result = await getChangedFiles(octokit, "owner", "repo", 1);

    expect(result).toHaveLength(1);
    expect(result[0].filename).toBe("src/index.ts");
  });

  it("filters out binary files (no patch)", async () => {
    const mockFiles = [
      {
        filename: "image.png",
        status: "added",
        patch: undefined,
        additions: 0,
        deletions: 0,
      },
      {
        filename: "src/code.ts",
        status: "added",
        patch: "@@ -0,0 +1 @@\n+new line",
        additions: 1,
        deletions: 0,
      },
    ];

    const octokit = createMockOctokit(mockFiles);
    const result = await getChangedFiles(octokit, "owner", "repo", 1);

    expect(result).toHaveLength(1);
    expect(result[0].filename).toBe("src/code.ts");
  });

  it("returns empty array when no files", async () => {
    const octokit = createMockOctokit([]);
    const result = await getChangedFiles(octokit, "owner", "repo", 1);
    expect(result).toHaveLength(0);
  });
});
