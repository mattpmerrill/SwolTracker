# ADR-005: Chad, the in-app coach, runs on the OpenAI Agents SDK

Status: accepted (2026-10-29)

## Context

SwolTracker users can already bring their own agent over MCP. We also want a coach built into the
app: Chad, a chat assistant that reads a user's training history and can change one day of their
program after they confirm. Chad needs an agent loop, tool calling, and a way to pause a run for
approval before anything is written.

## Decision

- Chad is built with the OpenAI Agents SDK for TypeScript (`@openai/agents` 0.21.0) and served at
  `POST /api/chad`, a Vercel function.
- Chad reuses the existing MCP tool kit (`buildToolKit`). The kit is built per request, bound to the
  verified user id, and the tools close over it. Two kit functions are new, `get_program_day` and
  `update_program_day`. They are not registered as MCP tools.
- Model access is OpenRouter only (`OPENROUTER_API_KEY`). The SDK's OpenAI provider points at
  OpenRouter with a `baseURL` and uses the Chat Completions API. The model comes from
  `app_settings.chad_model`, with a default when unset. Tracing is off, because it would send user
  training data to OpenAI.
- This is a second server-side LLM path beside `/api/llm` (ADR-002). It does not use
  `callLlmInternal` or its provider fallback; it is OpenRouter only.
- Writes pause the run (`needsApproval`). The browser shows the proposed change, and the user taps
  Apply or Nah.

## Rejected

- **Microsoft Agent Framework.** It is Python and .NET only. Using it means a second language and a
  second service beside a TypeScript codebase.
- **Subscription OAuth.** Not available to us for a hosted app: Anthropic limits subscription OAuth
  to its own apps, and OpenAI's Sign in with ChatGPT for hosted apps is a partner trial. The app
  pays for model use with an API key instead.

## Security

- No identity lives in the run context. The tools act on the user the kit was built for, taken from
  the verified sign-in token, never from the request body or the run state.
- The serialized `RunState` round-trips through the browser while a run waits for approval. If a user
  tampers with it, the most they can change is what they save to their own program. Every write still
  goes through `requireWritableGym` and `DaySchema`, so this is the same power they have editing the
  program in the app. We accept this for the proof of concept. Signing the state with an HMAC is a
  follow-up.
- History sent from the browser is untrusted. The server drops system items and caps count and size.

## Consequences

- A tool added to the kit can be given to Chad with a small Zod schema. One validation and save path
  serves the MCP agent and Chad.
- Chat history lasts for the browser tab session only.
- `/api/chad` needs `OPENROUTER_API_KEY` in Production. Preview deployments lack the service-role
  key, so the end-to-end check happens on production.

## Follow-ups

- A `chad_messages` table so chat history survives the session.
- Streaming replies.
- HMAC-sign the serialized run state.
- Expose `get_program_day` and `update_program_day` over MCP (with `SKILL.md` and scope updates).
- Creating new weeks, and a warning when an edited day already has logged sets.
