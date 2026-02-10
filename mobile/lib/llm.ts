// Mobile LLM client — calls the server-side /api/llm proxy
// Self-contained: uses mobile supabase client (not the web's supabase.js)
import { supabase } from './supabase';

const TIMEOUT_MS = 65000;

// Base URL for the Vercel-hosted API proxy
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || '';

/**
 * Call the LLM via the server-side proxy.
 * Signature matches the legacy callLlmProvider for backward compat with stores.
 */
export async function callLlmProvider(
  provider: string,
  _apiKey: string | null, // ignored — keys are server-side
  systemPrompt: string,
  userPrompt: string,
  requestType: string = 'weekly',
  _db: any = null,
  _userId: string | null = null
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (supabase) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/llm`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ provider, systemPrompt, userPrompt, requestType }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `LLM request failed: ${response.status}`);
    }

    return await response.json();
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error('Request timed out. The AI service is taking too long to respond.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// New name used by the refactored web code
export const generateWithLlm = callLlmProvider;
