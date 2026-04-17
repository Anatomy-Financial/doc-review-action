import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ChangedFile, DocFile } from "../src/types.js";

// Mock the Anthropic SDK
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: vi.fn(),
  };
});

import Anthropic from "@anthropic-ai/sdk";
import { analyzeDocumentation } from "../src/claude.js";

const MockAnthropic = vi.mocked(Anthropic);

function setupMockResponse(text: string) {
  const mockCreate = vi.fn().mockResolvedValue({
    content: [{ type: "text", text }],
  });
  MockAnthropic.mockImplementation(
    () =>
      ({
        messages: { create: mockCreate },
      }) as any
  );
  return mockCreate;
}

const sampleDiff: ChangedFile[] = [
  {
    filename: "src/models/user.ts",
    status: "modified",
    patch:
      '@@ -5,3 +5,3 @@\n-  userId: string[];\n+  userId: string;\n   name: string;',
    additions: 1,
    deletions: 1,
  },
];

const sampleDocs: DocFile[] = [
  {
    filepath: "docs/api.md",
    content: "# API\n\n- `userId`: list of strings\n- `name`: string",
    priority: 1,
  },
];

describe("analyzeDocumentation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses valid JSON response", async () => {
    const response = JSON.stringify([
      {
        type: "update",
        file: "docs/api.md",
        startLine: 3,
        endLine: 3,
        suggestedContent: "- `userId`: string (UUID format)",
        reasoning: "userId changed from list to single string",
      },
    ]);

    setupMockResponse(response);

    const result = await analyzeDocumentation(
      sampleDiff,
      sampleDocs,
      "test-key",
      "claude-sonnet-4-20250514"
    );

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("update");
    expect(result[0].file).toBe("docs/api.md");
    expect(result[0].reasoning).toContain("userId");
  });

  it("handles JSON wrapped in markdown code blocks", async () => {
    const response =
      '```json\n[{"type":"update","file":"docs/api.md","startLine":3,"endLine":3,"suggestedContent":"new text","reasoning":"change needed"}]\n```';

    setupMockResponse(response);

    const result = await analyzeDocumentation(
      sampleDiff,
      sampleDocs,
      "test-key",
      "claude-sonnet-4-20250514"
    );

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("update");
  });

  it("returns empty array for empty JSON response", async () => {
    setupMockResponse("[]");

    const result = await analyzeDocumentation(
      sampleDiff,
      sampleDocs,
      "test-key",
      "claude-sonnet-4-20250514"
    );

    expect(result).toHaveLength(0);
  });

  it("filters out invalid recommendations", async () => {
    const response = JSON.stringify([
      {
        type: "update",
        file: "docs/api.md",
        reasoning: "valid",
      },
      {
        type: "invalid_type",
        file: "docs/api.md",
        reasoning: "invalid",
      },
      {
        type: "update",
        // missing file
        reasoning: "invalid",
      },
    ]);

    setupMockResponse(response);

    const result = await analyzeDocumentation(
      sampleDiff,
      sampleDocs,
      "test-key",
      "claude-sonnet-4-20250514"
    );

    expect(result).toHaveLength(1);
    expect(result[0].reasoning).toBe("valid");
  });

  it("passes correct model to Anthropic SDK", async () => {
    const mockCreate = setupMockResponse("[]");

    await analyzeDocumentation(
      sampleDiff,
      sampleDocs,
      "test-key",
      "claude-sonnet-4-20250514"
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-sonnet-4-20250514",
      })
    );
  });
});
