# doc-review-action

A GitHub Action that uses Claude to analyze PR code changes and recommend documentation updates. Posts suggestions directly on the PR using GitHub's native suggestion blocks so reviewers can apply fixes with one click.

## Features

- Detects stale documentation based on code changes in the PR
- Recommends new documentation for undocumented features
- Posts inline `suggestion` blocks on doc files in the diff (click to apply)
- Posts a summary comment for docs outside the diff and new doc recommendations
- Never blocks the PR — check always passes

## Usage

```yaml
# .github/workflows/doc-review.yml
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
      - uses: Anatomy-Financial/doc-review-action@v1
        with:
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `anthropic-api-key` | Anthropic API key for Claude | Yes | — |
| `github-token` | GitHub token for PR comments | No | `${{ github.token }}` |
| `model` | Claude model to use | No | `claude-sonnet-4-20250514` |
| `doc-patterns` | Glob pattern for documentation files | No | `**/*.md` |

## How it works

1. Fetches the PR diff via the GitHub API
2. Collects all documentation files matching `doc-patterns` (defaults to all `.md` files, including README)
3. Sends the diff and docs to Claude for analysis
4. Posts recommendations as PR review comments with suggestion blocks

Documentation files whose paths overlap with changed code paths are prioritized (e.g., a change to `src/auth/` prioritizes `docs/auth.md`).

## Development

```bash
npm install        # Install dependencies
npm test           # Run tests
npm run build      # Bundle with ncc into dist/
```

## License

MIT
