# AI Document Assistant Skill

## Purpose

Build the contextual AI assistant for the active Markdown document.

## Context

The AI input floats inside the document area and sends the active document plus prompt to FastAPI.

## Rules

- Do not call AI providers directly from React.
- Do not expose API keys in frontend code.
- Keep requests scoped to the active document.
- Initial behavior can be mocked.
- Preserve user privacy and document context boundaries.

## Recommended Steps

1. Define request and response schemas.
2. Send prompt and current Markdown through `lib/api/ai`.
3. Handle loading and empty prompt states.
4. Add response display only after product behavior is defined.
5. Move provider integration into FastAPI service adapters.

## Acceptance Criteria

- Input is writable.
- Plus, send, and microphone icons are inside the input.
- Submit calls the AI API contract.

## Mistakes To Avoid

- Adding an external send button.
- Building provider-specific code in React.
- Persisting prompts without an explicit product rule.

