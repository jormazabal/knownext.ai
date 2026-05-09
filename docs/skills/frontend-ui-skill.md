# Frontend UI Skill

## Purpose

Build KnowNext.ai frontend UI that is compact, modern, and faithful to the product screenshots.

## Context

The app is a Tauri desktop workspace with React, TypeScript, Tailwind, and lucide-react icons.

## Rules

- Use orange `#F37021` for primary actions.
- Do not use blue as the primary action color.
- Keep the main workspace white and the sidebar `#FAFAFA`.
- Do not place a search input in the sidebar header.
- Do not add an external plus button next to the project selector.
- Do not show permanent action icons on tree items.
- Keep feature logic out of visual-only components.

## Recommended Steps

1. Identify the feature folder to change.
2. Update typed props and domain models first.
3. Build the component with Tailwind tokens.
4. Verify responsive constraints and text overflow.
5. Update manual checklist if behavior changes.

## Acceptance Criteria

- Visual hierarchy matches the desktop workspace model.
- UI remains compact and readable.
- Actions use hover/menu patterns consistently.
- No unrelated colors, cards, or decorative backgrounds are introduced.

## Mistakes To Avoid

- Replacing functional app surfaces with landing-page patterns.
- Adding global state for small local interactions.
- Scattering mock data inside components.

