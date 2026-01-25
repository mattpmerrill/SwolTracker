// LLM provider configurations and API calling utilities

const PROVIDER_CONFIGS = {
  openai: {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o-mini',
    models: {
      onboarding: 'gpt-4o-mini',
      weekly: 'gpt-4o'
    }
  },
  claude: {
    endpoint: 'https://api.anthropic.com/v1/messages',
    defaultModel: 'claude-3-5-sonnet-latest',
    models: {
      onboarding: 'claude-3-haiku-20240307',
      weekly: 'claude-3-5-sonnet-latest'
    }
  },
  gemini: {
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    defaultModel: 'gemini-1.5-flash',
    models: {
      onboarding: 'gemini-1.5-flash',
      weekly: 'gemini-1.5-pro'
    }
  }
};

/**
 * Call the appropriate LLM provider API
 * @param {string} provider - 'openai', 'claude', or 'gemini'
 * @param {string} apiKey - The API key for the provider
 * @param {string} systemPrompt - The system message
 * @param {string} userPrompt - The user message
 * @param {string} requestType - 'onboarding' or 'weekly' to select appropriate model
 * @returns {Promise<{content: string, usage: {prompt_tokens: number, completion_tokens: number}}>}
 */
export async function callLlmProvider(provider, apiKey, systemPrompt, userPrompt, requestType = 'weekly') {
  const config = PROVIDER_CONFIGS[provider];
  if (!config) {
    throw new Error(`Unknown provider: ${provider}`);
  }

  const model = config.models[requestType] || config.defaultModel;

  switch (provider) {
    case 'openai':
      return await callOpenAI(apiKey, systemPrompt, userPrompt, model);
    case 'claude':
      return await callClaude(apiKey, systemPrompt, userPrompt, model);
    case 'gemini':
      return await callGemini(apiKey, systemPrompt, userPrompt, model);
    default:
      throw new Error(`Provider ${provider} not implemented`);
  }
}

async function callOpenAI(apiKey, systemPrompt, userPrompt, model) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 4000
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `OpenAI API request failed: ${response.status}`);
  }

  const data = await response.json();
  return {
    content: data.choices[0]?.message?.content || '',
    usage: {
      prompt_tokens: data.usage?.prompt_tokens || 0,
      completion_tokens: data.usage?.completion_tokens || 0
    },
    model: model
  };
}

async function callClaude(apiKey, systemPrompt, userPrompt, model) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: model,
      max_tokens: 4000,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt }
      ]
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Claude API request failed: ${response.status}`);
  }

  const data = await response.json();
  return {
    content: data.content?.[0]?.text || '',
    usage: {
      prompt_tokens: data.usage?.input_tokens || 0,
      completion_tokens: data.usage?.output_tokens || 0
    },
    model: model
  };
}

async function callGemini(apiKey, systemPrompt, userPrompt, model) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
        }
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4000
      }
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Gemini API request failed: ${response.status}`);
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  // Gemini uses a different token counting approach
  // We estimate based on response metadata if available
  const usageMetadata = data.usageMetadata || {};

  return {
    content: content,
    usage: {
      prompt_tokens: usageMetadata.promptTokenCount || 0,
      completion_tokens: usageMetadata.candidatesTokenCount || 0
    },
    model: model
  };
}

export function getProviderConfig(provider) {
  return PROVIDER_CONFIGS[provider] || PROVIDER_CONFIGS.openai;
}
