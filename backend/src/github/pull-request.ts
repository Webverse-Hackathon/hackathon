/**
 * Opens a pull request with the patched files, when GITHUB_TOKEN and
 * GITHUB_REPO are configured. The demo build uses a token rather than the
 * GitHub App (DECISIONS.md #14). One commit carries every file this lineage of
 * fixes changed, so a second fix on a verify run includes the first.
 */

import { Octokit } from '@octokit/rest';
import type { BlockerInfo, PullRequestInfo } from '@ally/shared';

export interface PullRequestInput {
  token: string;
  repo: string;
  baseBranch: string;
  /** Path of the site's source inside the repository. */
  sourcePath: string;
  runId: string;
  goal: string;
  url: string;
  blocker: BlockerInfo;
  /** Relative to the source directory. */
  files: Record<string, string>;
  /** The unpatched content, to refuse to overwrite a repository that has moved on. */
  originals: Record<string, string>;
  diff: string;
  rationale: string;
  stepsUsed: number;
  stepBudget: number;
}

export class PullRequestError extends Error {}

function normalise(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

export async function openPullRequest(input: PullRequestInput): Promise<PullRequestInfo> {
  const [owner, repo] = input.repo.split('/') as [string, string];
  const octokit = new Octokit({ auth: input.token });
  const repoPath = (file: string) => [input.sourcePath.replace(/\/+$/, ''), file].filter(Boolean).join('/');

  const base = await octokit.repos.getBranch({ owner, repo, branch: input.baseBranch });
  const baseSha = base.data.commit.sha;

  for (const [file, original] of Object.entries(input.originals)) {
    const remote = await octokit.repos.getContent({ owner, repo, path: repoPath(file), ref: baseSha }).catch(() => null);
    const data = remote?.data;
    if (!data || Array.isArray(data) || data.type !== 'file' || !('content' in data)) {
      throw new PullRequestError(`${repoPath(file)} is not in ${input.repo}@${input.baseBranch}.`);
    }
    if (normalise(Buffer.from(data.content, 'base64').toString('utf8')) !== normalise(original)) {
      throw new PullRequestError(`${repoPath(file)} on ${input.baseBranch} differs from the code that was tested, so the patch was not pushed.`);
    }
  }

  const tree = await octokit.git.createTree({
    owner,
    repo,
    base_tree: base.data.commit.commit.tree.sha,
    tree: Object.entries(input.files).map(([file, content]) => ({ path: repoPath(file), mode: '100644', type: 'blob', content: normalise(content) })),
  });
  const title = `fix(a11y): ${input.blocker.category.toLowerCase().replace(/_/g, ' ')} blocking "${input.goal}"`;
  const commit = await octokit.git.createCommit({ owner, repo, message: `${title}\n\nFound and patched by Ally run ${input.runId}.`, tree: tree.data.sha, parents: [baseSha] });
  const branch = `ally/fix-${input.runId.slice(0, 8)}-${Date.now().toString(36)}`;
  await octokit.git.createRef({ owner, repo, ref: `refs/heads/${branch}`, sha: commit.data.sha });

  const body = [
    '## What a screen-reader user could not do',
    '',
    `Ally tried to **${input.goal}** on ${input.url} using only the accessibility tree and the keyboard, and was stopped at step ${input.blocker.atStep} of ${input.stepBudget}.`,
    '',
    `> ${input.blocker.summary}`,
    '',
    `**Category:** \`${input.blocker.category}\` · **WCAG:** ${input.blocker.wcagCriteria.join(', ') || 'n/a'}`,
    '',
    '## The change',
    '',
    input.rationale,
    '',
    '```diff',
    input.diff,
    '```',
    '',
    'Passed: applies cleanly · parses · typechecks · jsx-a11y (strict) · size.',
    '',
    'The verify re-run result is posted as a comment on this pull request.',
    '',
    '🤖 Opened by Ally',
  ].join('\n');

  const pr = await octokit.pulls.create({ owner, repo, title, head: branch, base: input.baseBranch, body });
  return { owner, repo, number: pr.data.number, url: pr.data.html_url, branch, state: 'open', verified: false };
}

export async function commentOnPullRequest(token: string, info: PullRequestInfo, body: string): Promise<void> {
  const octokit = new Octokit({ auth: token });
  await octokit.issues.createComment({ owner: info.owner, repo: info.repo, issue_number: info.number, body });
}
