# Git Versioning Skill

## Purpose

Design and implement document version history based on local Git commits.

## Rules

- Do not show branches.
- Do not show `main`.
- Do not run Git from React components.
- Git operations belong in Rust runtime services.
- Mock commit data is allowed only as replaceable local runtime behavior.

## Recommended Steps

1. Keep the version schema stable.
2. Implement Rust Git adapters behind the runtime version service.
3. Resolve document paths inside Rust services.
4. Return latest version first.
5. Add Rust tests with a temporary repository when real Git is introduced.

## Acceptance Criteria

- Version panel shows hash, title, author, initials, relative time, and Actual for latest version.
- UI stays branch-free.
- Git failures are handled through structured runtime responses.
