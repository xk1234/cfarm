---
title: "Agent GitHub publishing"
description: "Safe commit, pull request, merge, and Vercel deployment workflow for agents sharing the LumenClip checkout."
---

# Agent GitHub publishing

This repository is often used by several agents at the same time. They share
the worktree, Git index, branch, and local processes. A clean publishing
workflow must protect other agents' uncommitted and staged work while proving
that the exact merged revision reached production.

## Non-negotiable safety rules

1. Treat every existing modification, untracked file, and staged entry as
   someone else's work unless its ownership is known.
2. Never use `git add -A`, `git add .`, `git reset --hard`,
   `git checkout --`, or broad recursive deletion in a mixed worktree.
3. Stage only the paths in the requested change.
4. Inspect the index in a separate command immediately before committing.
5. If unrelated files are staged, stop. Do not commit them and do not silently
   unstage them, because another agent may be preparing a commit.
6. Never expose GitHub or Vercel tokens in commands, remote URLs, logs, or
   documentation.
7. Merge only after checks pass for the exact current PR head SHA.
8. Do not report deployment success until the production deployment for the
   merge commit is `READY`.

## 1. Resolve repository and PR context

Run read-only checks first:

```bash
git status -sb
git branch --show-current
git remote -v
gh auth status
gh repo view --json nameWithOwner,defaultBranchRef
gh pr status
```

Record:

- repository in `owner/name` form;
- current branch;
- default/base branch;
- current PR number, if one exists;
- every dirty or staged path that is outside the requested change.

Do not assume the current branch or index still has the same state it had at
the start of the task. Another agent may have changed it between commands.

## 2. Validate before staging

Use checks proportional to the change. For a TypeScript UI change, the minimum
is typically:

```bash
pnpm prettier --check path/to/changed-file.tsx
pnpm typecheck
pnpm eslint path/to/changed-file.tsx
git diff --check -- path/to/changed-file.tsx
```

Add focused Vitest or Playwright coverage when behavior changed. Browser
verification should exercise the responsive state that motivated the fix.

## 3. Stage and commit without capturing other work

Stage explicit paths:

```bash
git add -- path/to/first-file path/to/second-file
```

Then inspect the complete staged scope in a separate command:

```bash
git diff --cached --name-status
git diff --cached --stat
git diff --cached
```

The index must contain only the intended files and hunks. Only then commit:

```bash
git commit -m "Concise description"
```

Do not write a single shell command that stages and commits. A command such as
`git add ... && git commit ...` can commit files that another agent staged
before the command ran.

### If unrelated files are already staged

Do not proceed with the local commit and do not disturb the existing index.
Choose one of these paths:

- coordinate with the owner of the staged work;
- use a separate clean worktree and apply only the intended patch there;
- use the connected GitHub app to update only the intended files on the PR
  branch.

If an accidental local commit captures unrelated staged files, do not push it.
Undo only the local commit with a non-destructive mixed reset, confirm all files
remain present, and rebuild the intended index:

```bash
git reset --mixed HEAD^
git status --short
```

Never use a hard reset for this recovery.

## 4. Push with the CLI when permitted

The normal path is:

```bash
git push -u origin "$(git branch --show-current)"
```

If Git returns 403 while `gh auth status` succeeds:

```bash
gh auth setup-git
git push -u origin "$(git branch --show-current)"
```

Retry this once. If it still returns 403, the CLI token likely lacks repository
contents permission. Do not display `gh auth token`, place a token in the
remote URL, or ask logs to print credentials. Use the connected GitHub app
instead.

## 5. GitHub app fallback

The connected GitHub app can update an existing branch through GitHub's
Contents API:

1. Fetch the remote file on the exact PR branch to obtain its current blob SHA.
2. Read the complete intended local file.
3. Call the app's update-file operation with:
   - `repository_full_name`;
   - PR branch name;
   - repository-relative path;
   - complete UTF-8 file content;
   - current blob SHA;
   - concise commit message.
4. Repeat sequentially for additional files. Do not update several files on
   the same branch in parallel; concurrent branch-ref updates can race.
5. Fetch the branch again and confirm the remote file blob matches the intended
   content.

For a new path, use the app's create-file operation. For a new branch, create
the branch from a known base ref or commit before creating files.

The Contents API makes one commit per operation. That is acceptable for a PR;
the merge strategy can combine commits later.

After connector commits, align the local branch only when it is safe to do so.
A mixed reset to the fetched remote branch preserves working-tree files, while
a hard reset does not:

```bash
git fetch origin branch-name
git reset --mixed origin/branch-name
```

Inspect `git status` immediately afterward and confirm unrelated work remains.

## 6. Prepare and merge the pull request

Prefer the connected GitHub app for PR mutations.

1. Confirm the PR base and head branches.
2. Update the PR summary when the final scope differs from the original body.
3. Mark a draft PR ready only after local validation.
4. Wait for required checks on the latest head SHA.
5. Read the PR again and record its current head SHA.
6. Merge with that SHA supplied as `expected_head_sha`.

Supplying the expected SHA prevents merging if another agent pushes after the
checks complete.

For CLI inspection:

```bash
gh pr view PR_NUMBER --json headRefOid,mergeable,mergeStateStatus,statusCheckRollup
gh pr checks PR_NUMBER --watch
```

Do not merge a pending or stale head merely because an earlier deployment
passed.

## 7. Verify Vercel production

Git integration creates a preview for the PR branch and a production
deployment after the merge reaches `main`.

Required sequence:

1. Wait for the final PR-head preview to become `READY`.
2. Merge the PR.
3. Find the production deployment whose Git SHA equals the merge commit.
4. Wait until that deployment's target is `production` and state is `READY`.
5. Check recent production runtime errors.

Record:

- PR URL and merge commit;
- production deployment ID and URL;
- deployment state;
- framework;
- validation results;
- production runtime-error scan.

A `READY` preview URL is not proof that production was updated.

## 8. Appwrite function changes

Vercel deploys only the Next.js application. When a change touches Appwrite
Functions or their synchronized shared modules:

```bash
pnpm appwrite:check-shared
node appwrite/functions/deploy.mjs
```

Follow the deployment order in [Deployment](deployment.md). Do not claim a
complete release if required function changes were not deployed.

## Handoff checklist

- [ ] Intended file list recorded.
- [ ] Dirty and staged unrelated files preserved.
- [ ] Focused checks passed.
- [ ] Cached diff inspected separately before commit.
- [ ] Remote branch contains the intended content.
- [ ] PR checks passed on the final head SHA.
- [ ] PR merged with an expected head SHA.
- [ ] Production deployment matches the merge commit and is `READY`.
- [ ] Recent production runtime errors checked.
- [ ] Unrelated local work called out in the handoff.
