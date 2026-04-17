import Anthropic from "@anthropic-ai/sdk";
import type { ChangedFile, DocFile, DocRecommendation } from "./types.js";

const SYSTEM_PROMPT = `You are a documentation reviewer for a software project. Your job is to analyze code changes (provided as a PR diff) and compare them against the project's existing documentation files.

Your task:
1. Identify existing documentation that is now stale, inaccurate, or incomplete due to the code changes.
2. Identify when new documentation should be created for newly introduced features, endpoints, or significant functionality that is undocumented.

Rules:
- Only flag meaningful discrepancies. Do NOT flag cosmetic style differences, formatting, or minor wording.
- Each recommendation must include clear reasoning explaining WHY the documentation needs to change.
- For "update" recommendations, provide the exact replacement text for the affected lines.
- For "create" recommendations, describe what documentation is missing and suggest a file path.
- Err on the side of fewer, higher-quality suggestions over many low-value ones.
- Line numbers refer to lines in the documentation file, NOT the diff.

Respond with a JSON array of recommendations. Each recommendation has this schema:

{
  "type": "update" | "create",
  "file": "path/to/doc.md",
  "startLine": 15,       // only for "update" type - first line to replace (1-indexed)
  "endLine": 17,         // only for "update" type - last line to replace (1-indexed, inclusive)
  "suggestedContent": "replacement text for the line range",  // only for "update" type
  "reasoning": "explanation of why this change is needed"
}

If there are no documentation issues, respond with an empty array: []

Example output:
[
  {
    "type": "update",
    "file": "docs/api.md",
    "startLine": 42,
    "endLine": 42,
    "suggestedContent": "- \`user_id\`: string (UUID format)",
    "reasoning": "The PR changes the user_id field from a list of strings to a single string UUID in the UserProfile model."
  },
  {
    "type": "create",
    "file": "docs/webhooks.md",
    "reasoning": "A new webhook handler was added in src/webhooks/handler.ts but no webhook documentation exists. Documentation should cover the webhook event types, payload format, and configuration."
  }
]`;

// Rough token estimate: ~4 chars per token
const CHARS_PER_TOKEN = 4;
const MAX_INPUT_TOKENS = 150_000;
const MAX_INPUT_CHARS = MAX_INPUT_TOKENS * CHARS_PER_TOKEN;

function buildUserMessage(
  changedFiles: ChangedFile[],
  docFiles: DocFile[]
): string {
  const parts: string[] = [];

  parts.push("## Code Changes (PR Diff)\n");
  for (const file of changedFiles) {
    parts.push(`### ${file.filename} (${file.status})`);
    parts.push("```diff");
    parts.push(file.patch ?? "(no patch available)");
    parts.push("```\n");
  }

  parts.push("## Documentation Files\n");
  for (const doc of docFiles) {
    // Add line numbers for reference
    const numberedContent = doc.content
      .split("\n")
      .map((line, i) => `${i + 1}: ${line}`)
      .join("\n");

    parts.push(`### ${doc.filepath}`);
    parts.push("```");
    parts.push(numberedContent);
    parts.push("```\n");
  }

  return parts.join("\n");
}

function truncateDocsToFit(
  changedFiles: ChangedFile[],
  docFiles: DocFile[]
): DocFile[] {
  // Estimate chars used by diff
  let diffChars = 0;
  for (const file of changedFiles) {
    diffChars += (file.patch?.length ?? 0) + file.filename.length + 50;
  }

  // Budget remaining for docs
  const systemChars = SYSTEM_PROMPT.length;
  const docBudget = MAX_INPUT_CHARS - diffChars - systemChars - 2000; // 2000 char buffer

  if (docBudget <= 0) return [];

  const result: DocFile[] = [];
  let usedChars = 0;

  // Docs are already sorted by priority (highest first)
  for (const doc of docFiles) {
    const docChars = doc.content.length + doc.filepath.length + 50;
    if (usedChars + docChars > docBudget) break;
    result.push(doc);
    usedChars += docChars;
  }

  return result;
}

export async function analyzeDocumentation(
  changedFiles: ChangedFile[],
  docFiles: DocFile[],
  apiKey: string,
  model: string
): Promise<DocRecommendation[]> {
  const client = new Anthropic({ apiKey });

  const fittedDocs = truncateDocsToFit(changedFiles, docFiles);
  const userMessage = buildUserMessage(changedFiles, fittedDocs);

  const response = await client.messages.create({
    model,
    max_tokens: 8192,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userMessage }],
  });

  // Extract text from response
  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") return [];

  const text = textBlock.text.trim();

  // Parse JSON from response (handle markdown code blocks)
  let jsonStr = text;
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  const parsed = JSON.parse(jsonStr);
  if (!Array.isArray(parsed)) return [];

  // Validate each recommendation
  return parsed.filter(
    (r: unknown): r is DocRecommendation =>
      typeof r === "object" &&
      r !== null &&
      "type" in r &&
      (r.type === "update" || r.type === "create") &&
      "file" in r &&
      typeof r.file === "string" &&
      "reasoning" in r &&
      typeof r.reasoning === "string"
  );
}
