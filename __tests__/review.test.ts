import { describe, it, expect, vi, beforeEach } from "vitest";
import { postReview } from "../src/review.js";
import type { ChangedFile, DocRecommendation } from "../src/types.js";

function createMockOctokit() {
  return {
    rest: {
      pulls: {
        createReview: vi.fn().mockResolvedValue({}),
      },
      issues: {
        createComment: vi.fn().mockResolvedValue({}),
      },
    },
  } as any;
}

const changedFiles: ChangedFile[] = [
  {
    filename: "docs/api.md",
    status: "modified",
    patch: "@@ -1,3 +1,3 @@\n-old\n+new",
    additions: 1,
    deletions: 1,
  },
  {
    filename: "src/handler.ts",
    status: "modified",
    patch: "@@ -10,3 +10,3 @@\n-old\n+new",
    additions: 1,
    deletions: 1,
  },
];

describe("postReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does nothing when no recommendations", async () => {
    const octokit = createMockOctokit();
    await postReview(octokit, "owner", "repo", 1, [], changedFiles);

    expect(octokit.rest.pulls.createReview).not.toHaveBeenCalled();
    expect(octokit.rest.issues.createComment).not.toHaveBeenCalled();
  });

  it("posts inline review for doc files in the PR diff", async () => {
    const octokit = createMockOctokit();
    const recommendations: DocRecommendation[] = [
      {
        type: "update",
        file: "docs/api.md",
        startLine: 2,
        endLine: 2,
        suggestedContent: "- `userId`: string",
        reasoning: "userId type changed",
      },
    ];

    await postReview(
      octokit,
      "owner",
      "repo",
      1,
      recommendations,
      changedFiles
    );

    expect(octokit.rest.pulls.createReview).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "owner",
        repo: "repo",
        pull_number: 1,
        event: "COMMENT",
        comments: expect.arrayContaining([
          expect.objectContaining({
            path: "docs/api.md",
            line: 2,
            side: "RIGHT",
          }),
        ]),
      })
    );
  });

  it("posts summary comment for doc files NOT in the PR diff", async () => {
    const octokit = createMockOctokit();
    const recommendations: DocRecommendation[] = [
      {
        type: "update",
        file: "docs/other.md",
        startLine: 5,
        endLine: 5,
        suggestedContent: "updated content",
        reasoning: "Content is stale",
      },
    ];

    await postReview(
      octokit,
      "owner",
      "repo",
      1,
      recommendations,
      changedFiles
    );

    expect(octokit.rest.pulls.createReview).not.toHaveBeenCalled();
    expect(octokit.rest.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "owner",
        repo: "repo",
        issue_number: 1,
        body: expect.stringContaining("docs/other.md"),
      })
    );
  });

  it("posts summary comment for 'create' recommendations", async () => {
    const octokit = createMockOctokit();
    const recommendations: DocRecommendation[] = [
      {
        type: "create",
        file: "docs/webhooks.md",
        reasoning: "New webhook handler added but no docs exist",
      },
    ];

    await postReview(
      octokit,
      "owner",
      "repo",
      1,
      recommendations,
      changedFiles
    );

    expect(octokit.rest.pulls.createReview).not.toHaveBeenCalled();
    expect(octokit.rest.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining("docs/webhooks.md"),
      })
    );
  });

  it("handles mixed inline and summary recommendations", async () => {
    const octokit = createMockOctokit();
    const recommendations: DocRecommendation[] = [
      {
        type: "update",
        file: "docs/api.md",
        startLine: 2,
        endLine: 2,
        suggestedContent: "inline fix",
        reasoning: "In-diff fix",
      },
      {
        type: "create",
        file: "docs/new.md",
        reasoning: "New docs needed",
      },
    ];

    await postReview(
      octokit,
      "owner",
      "repo",
      1,
      recommendations,
      changedFiles
    );

    expect(octokit.rest.pulls.createReview).toHaveBeenCalled();
    expect(octokit.rest.issues.createComment).toHaveBeenCalled();
  });
});
