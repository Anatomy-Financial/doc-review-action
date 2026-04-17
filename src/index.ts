import * as core from "@actions/core";
import * as github from "@actions/github";
import { getChangedFiles } from "./diff.js";
import { getDocFiles } from "./docs.js";
import { analyzeDocumentation } from "./claude.js";
import { postReview } from "./review.js";

async function run(): Promise<void> {
  const context = github.context;

  if (!context.payload.pull_request) {
    core.info("Not a pull request event. Skipping.");
    return;
  }

  const anthropicApiKey = core.getInput("anthropic-api-key", {
    required: true,
  });
  const githubToken = core.getInput("github-token", { required: true });
  const model = core.getInput("model") || "claude-sonnet-4-20250514";
  const docPatterns = core.getInput("doc-patterns") || "**/*.md";

  const octokit = github.getOctokit(githubToken);
  const owner = context.repo.owner;
  const repo = context.repo.repo;
  const pullNumber = context.payload.pull_request.number;

  core.info(`Analyzing PR #${pullNumber} in ${owner}/${repo}`);

  // Step 1: Get changed files
  core.info("Fetching changed files...");
  const changedFiles = await getChangedFiles(octokit, owner, repo, pullNumber);
  core.info(`Found ${changedFiles.length} changed files`);

  if (changedFiles.length === 0) {
    core.info("No changed files to analyze. Skipping.");
    return;
  }

  // Step 2: Get documentation files
  core.info("Collecting documentation files...");
  const docFiles = await getDocFiles(docPatterns, changedFiles);
  core.info(`Found ${docFiles.length} documentation files`);

  if (docFiles.length === 0) {
    core.info("No documentation files found. Skipping.");
    return;
  }

  // Step 3: Analyze with Claude
  core.info(`Analyzing documentation with ${model}...`);
  const recommendations = await analyzeDocumentation(
    changedFiles,
    docFiles,
    anthropicApiKey,
    model
  );
  core.info(`Claude found ${recommendations.length} recommendations`);

  // Step 4: Post review
  if (recommendations.length > 0) {
    core.info("Posting review comments...");
    await postReview(
      octokit,
      owner,
      repo,
      pullNumber,
      recommendations,
      changedFiles
    );
    core.info("Review posted successfully");
  } else {
    core.info("No documentation issues found. All good!");
  }
}

run().catch((error: unknown) => {
  // Never fail the check — just warn
  const message = error instanceof Error ? error.message : String(error);
  core.warning(`Doc review encountered an error: ${message}`);
});
