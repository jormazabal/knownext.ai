# AI Document Assistant Skill

## Purpose

Build the contextual AI assistant for the active Markdown document.

## Rules

- Do not call AI providers directly from React.
- Do not expose API keys in frontend code.
- Keep requests scoped to the active document and selected context sources.
- Runtime services own credentials, context extraction, provider routing, and operation validation.
- Initial behavior can be mocked only as a replaceable Rust runtime service.
- Do not persist prompts without an explicit product rule.

## Recommended Steps

1. Define request and response schemas under the frontend API and Rust contracts.
2. Send prompt, current Markdown, and context source IDs through `lib/api/ai`.
3. Handle loading, empty prompt, permission, and unavailable-provider states.
4. Return structured operations for document edits, generated images, and project actions.
5. Add frontend tests for prompt interactions and Rust tests for runtime contracts.

## Acceptance Criteria

- Input is writable.
- Plus, send, and microphone icons stay inside the input.
- Submit calls the AI API contract.
- React never receives or displays stored provider secrets.
