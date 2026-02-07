// Re-export shared LLM utilities
export { callLlmProvider, getProviderConfig } from '../../src/lib/llm';

// On mobile, Claude API calls go direct (no CORS proxy needed).
// The shared llm.js uses '/api/claude' for web (Vercel proxy).
// We override callClaude by monkey-patching at import time if needed,
// but for now the other providers (OpenAI, Gemini) work directly.
// Claude provider override will be added when we set up the AI generation flow.
