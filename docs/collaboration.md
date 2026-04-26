# Collaboration Flow

This project uses trunk-based development. `main` is the trunk and release work
is handled on separate release branches.

## Branches

### `main`

`main` is the integration branch and the source of truth for ongoing work.

- Keep `main` in a working state.
- Merge normal development into `main` through pull requests.
- Require tests to pass before merging.
- Do not use `main` as a long-running release stabilization branch.

### Feature and Bugfix Branches

Use short-lived branches for individual tickets, bugs, or small coherent
changes.

Branch names should describe the work:

```text
feature/sl-002-auth-shell
feature/sl-003-room-layouts
bugfix/healthz-status-code
docs/collaboration-flow
```

Feature and bugfix branches should:

- Start from the latest `main`.
- Stay focused on one ticket, bug, or documentation change.
- Be opened as pull requests back into `main`.
- Be deleted after merge.

Most work should use this path:

```text
main -> feature/<ticket-or-topic> -> pull request -> main
```

### Release Branches

Use release branches only when preparing a concrete release.

Release branch names should identify the release:

```text
release/0.1.0
release/2026-05-friend-test
```

Release branches should:

- Be created from a known-good `main`.
- Contain stabilization work only.
- Avoid new feature work.
- Receive release notes, version updates, and release-specific fixes.
- Be tagged when the release is ready.

The release path is:

```text
main -> release/<version> -> tag v<version>
```

## Updating `main`

`main` is updated through pull requests from short-lived branches.

Before merging into `main`:

- Rebase or merge the latest `main` into the branch if it has drifted.
- Run the relevant backend and frontend checks.
- Keep the pull request scoped to the branch's stated purpose.
- Prefer squash merges for small ticket branches so `main` stays readable.

After merging:

- Delete the feature or bugfix branch.
- Move the related ticket forward in the planning notes.
- Start the next branch from the updated `main`.

## Updating Release Branches

Release branches are updated only for release stabilization.

Acceptable release branch changes include:

- Version numbers.
- Release notes.
- Configuration or packaging fixes.
- Small bug fixes needed for the release.
- Test fixes that validate release readiness.

Avoid merging unrelated feature work into a release branch. If a feature is not
already on `main` when the release branch is cut, it should wait for the next
release.

## Returning Release Fixes to `main`

Any fix made on a release branch that should remain part of the product must be
merged back into `main`.

Use one of these paths:

- Cherry-pick the release fix into a new branch from `main`, then open a pull
  request into `main`.
- Merge the release branch back into `main` if the branch contains only changes
  that should all return to trunk.

Prefer cherry-picking when the release branch contains release-only metadata or
changes that should not land on `main`.

## Choosing a Branch Type

Use this decision rule:

| Work type | Branch from | Target |
| --- | --- | --- |
| Normal ticket | `main` | `main` |
| Bug found during development | `main` | `main` |
| Documentation update | `main` | `main` |
| Release preparation | `main` | release tag |
| Bug found while stabilizing a release | `release/<version>` | `release/<version>` and backport to `main` |
| Emergency fix for an already released version | release branch or release tag | patched release tag and backport to `main` |

When unsure, branch from `main` and target `main`.
