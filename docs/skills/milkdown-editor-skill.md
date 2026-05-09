# Milkdown Editor Skill

## Purpose

Develop and maintain the visual Markdown editor integration.

## Context

Milkdown is the required WYSIWYG Markdown editor for KnowNext.ai. Markdown remains the saved format.

## Rules

- Do not replace Milkdown with another editor.
- Do not show raw Markdown as the primary editing experience.
- Load documents from Markdown strings.
- Export edits back to Markdown strings.
- Keep document content single-column.
- Style Milkdown through scoped CSS/Tailwind-compatible selectors.

## Recommended Steps

1. Read the active document through the API layer.
2. Pass Markdown into the Milkdown wrapper.
3. Subscribe to Markdown updates.
4. Keep toolbar actions separate from persistence.
5. Save through document services, not editor internals.

## Acceptance Criteria

- The editor renders headings, lists, tables, code, quotes, and tasks visually.
- Editing marks the document dirty.
- Saving persists the exported Markdown through the API contract.

## Mistakes To Avoid

- Directly manipulating Milkdown DOM nodes for business logic.
- Introducing multi-column document layouts.
- Binding Git or AI operations to editor components.

