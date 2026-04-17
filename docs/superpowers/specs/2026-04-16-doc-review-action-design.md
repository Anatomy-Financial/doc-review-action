# Doc Review Action — Design Spec

## Context

When code changes land in a PR, documentation often lags behind. A field type changes from list to string, a new endpoint is added, a config option is renamed — but the corresponding docs stay stale. This action automates the detection of doc/code drift by using Claude to analyze PR diffs against the repo's documentation and post actionable suggestions directly on the PR.

## Requirements

- Reusable GitHub Action, referenced as `uses: RLProteus/doc-review-action@v1`
- Triggers on pull requests (opened, synchronize, reopened)
- Reads the PR diff and all documentation files (`.md` by default, configurable)
- Uses Claude API (Sonnet 4, 200K context) to identify:
  - Existing docs that are stale or inaccurate given the code changes
  - Missing docs for newly introduced features/endpoints
- Posts recommendations as a PR review comment with GitHub-native `suggestion` blocks (click to apply)
- Never blocks the PR — check always passes (green/neutral)
- API key provided via GitHub secret

## Architecture

```
PR opened/updated
       │
       ▼
┌─────────────┐
│  index.ts   │  Orchestrator
│  (entry)    │
└──────┬──────┘
       │
  ┌────┴─────┬──────────────┐
  ▼          ▼              ▼
diff.ts   docs.ts      claude.ts
  │          │              │
  │  PR file patches   Doc contents
  │  with line nums    (prioritized)
  │          │              │
  └────┬─────┘              │
       │  Combined payload  │
       └───────────────────►│
                            │
                      Claude Sonnet 4
                            │
                      JSON response
                            │
                            ▼
                      review.ts
                            │
               ┌────────────┴────────────┐
               ▼                         ▼
     PR review w/ suggestion     Summary comment for
     blocks (existing docs)      new doc recommendations
```

## Action Interface

### `action.yml`

```yaml
name: 'Doc Review'
description: 'AI-powered documentation review using Claude'
inputs:
  anthropic-api-key:
    description: 'Anthropic API key'
    required: true
  github-token:
    description: 'GitHub token for PR comments'
    default: ${{ github.token }}
  model:
    description: 'Claude model to use'
    default: 'claude-sonnet-4-20250514'
  doc-patterns:
    description: 'Glob pattern for documentation files'
    default: '**/*.md'
runs:
  using: 'node20'
  main: 'dist/index.js'
```

### Usage in consuming repos

```yaml
name: Documentation Review
on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  doc-review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - uses: RLProteus/doc-review-action@v1
        with:
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
```

## Components

### `src/index.ts` — Orchestrator

- Reads action inputs via `@actions/core`
- Gets PR context from `@actions/github`
- Calls diff → docs → claude → review modules in sequence
- Always exits with code 0 (never fails the check)
- Catches all errors gracefully — logs warning, exits clean

### `src/diff.ts` — Diff Retrieval

- Uses `octokit.pulls.listFiles()` to get changed files with patches and line numbers
- Filters out binary files, very large files (>10K lines), and lockfiles
- Returns structured array: `{filename, patch, status, additions, deletions}`
- Line numbers from the GitHub API map directly to suggestion comment positions

### `src/docs.ts` — Documentation Collector

- Uses `git ls-files` matching the configurable `doc-patterns` glob to find doc files
- Reads file contents via filesystem (repo is already checked out)
- Smart prioritization: docs whose paths share a prefix with changed code paths are ranked first (e.g., change to `src/auth/` prioritizes `docs/auth.md`)
- README.md is always included (covered by default `**/*.md` pattern)

### `src/claude.ts` — Claude API Integration

- Builds a system prompt defining the role: documentation reviewer
- Includes few-shot examples showing expected JSON output schema
- Sends diff + doc contents in a single API call (Sonnet 4's 200K context window)
- If estimated tokens exceed ~150K, truncates lowest-priority docs (those with least path overlap to changed files)
- Uses Anthropic SDK with prompt caching on the system prompt
- Requests structured JSON output

**Claude output schema:**
```typescript
interface DocRecommendation {
  type: "update" | "create";
  file: string;           // path to existing doc file, or suggested new file path
  startLine?: number;     // for updates: line range in the doc file
  endLine?: number;
  suggestedContent?: string;  // the replacement text for suggestion blocks
  reasoning: string;      // explanation of why this change is needed
}
```

**Prompt design principles:**
- Only flag meaningful discrepancies (not cosmetic style differences)
- Each recommendation must include reasoning
- For "create" type, describe what documentation is missing and why
- Err on the side of fewer, higher-quality suggestions

### `src/review.ts` — GitHub Review Poster

**Important constraint:** GitHub's `pulls.createReview` inline comments can only target files that are part of the PR diff. Doc files not modified in the PR cannot receive inline suggestions.

- For `type: "update"` recommendations where the doc file IS in the PR diff:
  - Creates a PR review using `octokit.pulls.createReview()` with `event: "COMMENT"` (not `REQUEST_CHANGES` — keeps check non-blocking)
  - Inline comments with ` ```suggestion ` blocks mapped to file/line positions
- For `type: "update"` recommendations where the doc file is NOT in the PR diff:
  - Included in the summary PR comment with the full suggested change as a code block (user copies manually or opens a follow-up)
- For `type: "create"` recommendations: included in the summary PR comment listing recommended new documentation with descriptions
- If no recommendations: posts nothing (clean green check, no noise)

## Token Management

- Sonnet 4 has a 200K context window
- PR diffs are typically 1-10K tokens; doc files vary widely
- Budget: ~50K for diff, ~100K for docs, ~10K for prompt/examples, ~40K for output buffer
- If docs exceed budget: prioritize by path overlap with changed files, then by file size (smaller first)
- If a single diff exceeds 50K tokens: summarize unchanged hunks, keep only +/- lines

## Non-Blocking Guarantee

The action never fails a PR check:
1. `index.ts` wraps all logic in try/catch — any error logs a warning and exits 0
2. PR review uses `event: "COMMENT"`, not `REQUEST_CHANGES`
3. No `core.setFailed()` calls anywhere in the codebase
4. If Claude API is down or returns garbage: log warning, exit clean, no comment posted

## File Structure

```
doc-review-action/
├── action.yml
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts        # Entry point / orchestrator
│   ├── diff.ts         # PR diff retrieval
│   ├── docs.ts         # Documentation file collector
│   ├── claude.ts       # Claude API integration
│   └── review.ts       # GitHub review comment poster
├── __tests__/
│   ├── diff.test.ts
│   ├── docs.test.ts
│   ├── claude.test.ts
│   └── review.test.ts
├── dist/               # Bundled output (ncc)
│   └── index.js
└── docs/
    └── superpowers/
        └── specs/
            └── 2026-04-16-doc-review-action-design.md
```

## Build & Bundle

- TypeScript compiled and bundled with `@vercel/ncc` into `dist/index.js`
- `dist/` is committed to the repo (standard for JS GitHub Actions)
- Build command: `ncc build src/index.ts -o dist`

## Testing Strategy

- **Unit tests** (vitest): Mock Octokit and Anthropic SDK, test each module independently
- **Integration test**: Fixture PR diff + docs → verify end-to-end JSON parsing and comment formatting
- **Manual test**: Install the action in the doc-review-action repo itself, open a test PR, verify the comment appears correctly with working suggestion blocks

## Dependencies

- `@actions/core` — Action input/output and logging
- `@actions/github` — Octokit client with PR context
- `@anthropic-ai/sdk` — Claude API client
- `@vercel/ncc` (dev) — Bundle for distribution
- `vitest` (dev) — Test runner
