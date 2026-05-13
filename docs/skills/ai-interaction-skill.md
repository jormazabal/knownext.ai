# AI Interaction Skill

Use this guidance when changing KnowNext.ai AI flows.

## Required Pattern

- Resolve user intent through structured state and an LLM `intentDecision`.
- Use `executionMode=quick` by default. Quick mode must be one direct execution pass and must never return or route to `agentic_task`.
- Use `executionMode=reasoning` only when the user selects Razonar in the prompt. Run a short structured preflight first, then execute direct, ask permission/clarification, or route to an agentic task.
- Treat `reasoningDepth` as a per-prompt budget signal: `light`, `medium`, or `deep`.
- Persist a single active `AiPendingIntent` per project when a request needs confirmation, web permission, or later execution.
- Preserve `targetDocumentId` from the originating document until the intent is completed or cancelled, even if the user continues in the IA tab.
- Execute document and project changes only from structured fields such as `documentChange`, `operations`, `pendingIntent`, and `intentAction`.
- Treat `answer` as conversational UI text only. Never promote it into document content.

## Forbidden Pattern

- Do not infer confirmation, cancellation, replacement, creation, or routing from regexes, keyword checks, language-specific phrases, or lists such as "yes/si/ok".
- Do not simulate button actions by sending natural-language prompts.
- Do not apply document edits from a conversational answer.

## UX Defaults

- Keep simple document tasks in-place with `uiPlacement=document_bubble`.
- Keep the prompt default on `Rápido` to avoid unnecessary token use.
- Use `uiPlacement=conversation_tab` only for longer agentic tasks: multiple documents, multiple sources, checkpoints, or extended web research.
- Buttons on pending intent cards must send structured `intentAction` values: `allow_web_research`, `apply`, or `cancel`.
