# ADR-002: LLM calls go through `/api/llm`, with configurable providers

Status: accepted (recorded 2026-09-30 from earlier work)

## Context

The app generates programs and exercise swaps with an LLM. Calling a provider from the browser
would put a provider key in client code, so the 2026-02-07 security pass made the server-side proxy
the only path. The provider also changes over time: OpenAI first, then Claude, Gemini and
OpenRouter, and a missing key for the chosen provider should not take generation down.

## Decision

- The browser calls `POST /api/llm` with the user's JWT. The function holds the provider keys as
  server-only environment variables and calls the provider.
- Auth is mandatory and fails closed. Generation is capped at 20 per user per day, prompts are
  size-limited (413 over the limit), provider errors are mapped to fixed public messages, and
  usage is logged server-side.
- The active provider is an admin setting (`app_settings.llm_provider`). Models are chosen per
  request type (`onboarding`, `weekly`, `swap`) in `api/_llm-core.js`, with an optional
  `llm_model_<provider>` override. If the chosen provider has no key, the proxy falls back to the
  next configured one (openai, claude, gemini, openrouter).
- The same dispatch (`callLlmInternal`) is injected into the MCP tool kit, so server-side tools
  can call a model without a second code path.

## Consequences

- No provider key ever reaches client code, and one place owns timeouts, retries and error mapping.
- Adding a provider means a config entry and a call function in `api/_llm-core.js`.
- Model names in the config age. They are data to maintain, not a contract.
- The admin panel still has legacy fields that save provider keys into `app_settings`. The proxy
  reads environment variables only, so those fields do nothing for generation (see `docs/status.md`).
