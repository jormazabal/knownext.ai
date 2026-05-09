# Git Versioning Skill

## Purpose

Design and implement document version history based on Git commits.

## Context

The UI shows simplified commit history for the active document. Branches are intentionally excluded.

## Rules

- Do not show branches.
- Do not show `main`.
- Do not run Git from React components.
- Git operations belong in backend/runtime services.
- V1 uses mock commit data.

## Recommended Steps

1. Keep the version schema stable.
2. Implement backend Git adapter behind `version_service`.
3. Resolve document path to Git history server-side.
4. Return latest version first.
5. Add tests with a temporary repository when real Git is introduced.

## Acceptance Criteria

- Version panel shows hash, title, author, initials, relative time, and Actual for latest version.
- UI stays branch-free.
- Git failures are handled in backend responses.

## Mistakes To Avoid

- Adding branch dropdowns or branch labels.
- Calling shell Git commands from React.
- Treating Git history as global instead of document-specific.

