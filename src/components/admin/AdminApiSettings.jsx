import { useState, useEffect } from 'react';
import { Key, Save, Eye, EyeOff, CheckCircle, AlertCircle, Loader2, ChevronRight, Sparkles, Bot, Zap, Globe } from 'lucide-react';

const PROVIDERS = [
  {
    id: 'openai',
    name: 'OpenAI',
    icon: Sparkles,
    color: 'from-emerald-500 to-teal-600',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/20',
    textColor: 'text-emerald-400',
    placeholder: 'sk-...',
    link: 'https://platform.openai.com/api-keys',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo']
  },
  {
    id: 'claude',
    name: 'Claude (Anthropic)',
    icon: Bot,
    color: 'from-orange-500 to-amber-600',
    bgColor: 'bg-orange-500/10',
    borderColor: 'border-orange-500/20',
    textColor: 'text-orange-400',
    placeholder: 'sk-ant-...',
    link: 'https://console.anthropic.com/settings/keys',
    models: ['claude-3-5-sonnet-latest', 'claude-3-haiku-20240307', 'claude-3-opus-latest']
  },
  {
    id: 'gemini',
    name: 'Gemini (Google)',
    icon: Zap,
    color: 'from-blue-500 to-indigo-600',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/20',
    textColor: 'text-blue-400',
    placeholder: 'AIza...',
    link: 'https://aistudio.google.com/app/apikey',
    models: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-pro']
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    icon: Globe,
    color: 'from-purple-500 to-violet-600',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/20',
    textColor: 'text-purple-400',
    placeholder: 'sk-or-...',
    link: 'https://openrouter.ai/keys',
    models: ['openrouter/auto', 'openrouter/anthropic/claude-3-haiku', 'openrouter/anthropic/claude-3-sonnet', 'openrouter/google/gemini-2.0-flash-exp', 'openrouter/meta-llama/llama-3-8b-instruct']
  }
];

const AdminApiSettings = ({ db }) => {
  const [selectedProvider, setSelectedProvider] = useState('openai');
  const [apiKeys, setApiKeys] = useState({
    openai: '',
    claude: '',
    gemini: '',
    openrouter: ''
  });
  const [hasExistingKeys, setHasExistingKeys] = useState({
    openai: false,
    claude: false,
    gemini: false,
    openrouter: false
  });
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [editingKey, setEditingKey] = useState(false);
  const [newKeyValue, setNewKeyValue] = useState('');

  const loadSettings = async () => {
    setLoading(true);
    try {
      const allSettings = await db.getAllAppSettings();
      const settingsMap = {};
      allSettings.forEach(s => {
        settingsMap[s.key] = s.value;
      });

      // Get current provider
      const currentProvider = settingsMap['llm_provider'] || 'openai';
      setSelectedProvider(currentProvider);

      // Check which providers have API keys
      const existingKeys = {
        openai: false,
        claude: false,
        gemini: false,
        openrouter: false,
      };
      const maskedKeys = {
        openai: '',
        claude: '',
        gemini: '',
        openrouter: '',
      };

      for (const provider of PROVIDERS) {
        const key = settingsMap[`llm_api_key_${provider.id}`];
        if (key && key.length > 0) {
          existingKeys[provider.id] = true;
          maskedKeys[provider.id] = `${key.slice(0, 7)}...${key.slice(-4)}`;
        }
      }

      setHasExistingKeys(existingKeys);
      setApiKeys(maskedKeys);
    } catch (err) {
      console.error('Error loading settings:', err);
      setMessage({ type: 'error', text: 'Failed to load settings' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSelectProvider = async (providerId) => {
    setSaving(true);
    setMessage(null);

    try {
      const success = await db.saveAppSetting('llm_provider', providerId);
      if (success) {
        setSelectedProvider(providerId);
        setMessage({ type: 'success', text: `Switched to ${PROVIDERS.find(p => p.id === providerId).name}` });
      } else {
        setMessage({ type: 'error', text: 'Failed to change provider' });
      }
    } catch (err) {
      console.error('Error changing provider:', err);
      setMessage({ type: 'error', text: err.message || 'Failed to change provider' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveApiKey = async (providerId) => {
    if (!newKeyValue || newKeyValue.length < 10) {
      setMessage({ type: 'error', text: 'Please enter a valid API key' });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const success = await db.saveAppSetting(`llm_api_key_${providerId}`, newKeyValue);
      if (success) {
        setMessage({ type: 'success', text: 'API key saved successfully' });
        setHasExistingKeys(prev => ({ ...prev, [providerId]: true }));
        setApiKeys(prev => ({ ...prev, [providerId]: `${newKeyValue.slice(0, 7)}...${newKeyValue.slice(-4)}` }));
        setEditingKey(false);
        setNewKeyValue('');
        setShowKey(false);
      } else {
        setMessage({ type: 'error', text: 'Failed to save API key' });
      }
    } catch (err) {
      console.error('Error saving API key:', err);
      setMessage({ type: 'error', text: err.message || 'Failed to save API key' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteApiKey = async (providerId) => {
    if (!confirm(`Are you sure you want to delete the ${PROVIDERS.find(p => p.id === providerId).name} API key?`)) {
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const success = await db.saveAppSetting(`llm_api_key_${providerId}`, '');
      if (success) {
        setMessage({ type: 'success', text: 'API key deleted' });
        setHasExistingKeys(prev => ({ ...prev, [providerId]: false }));
        setApiKeys(prev => ({ ...prev, [providerId]: '' }));
      } else {
        setMessage({ type: 'error', text: 'Failed to delete API key' });
      }
    } catch (err) {
      console.error('Error deleting API key:', err);
      setMessage({ type: 'error', text: err.message || 'Failed to delete API key' });
    } finally {
      setSaving(false);
    }
  };

  const handleStartEditing = (providerId) => {
    setEditingKey(providerId);
    setNewKeyValue('');
    setShowKey(false);
  };

  const handleCancelEditing = () => {
    setEditingKey(false);
    setNewKeyValue('');
    setShowKey(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-green-500" />
      </div>
    );
  }

  const currentProvider = PROVIDERS.find(p => p.id === selectedProvider);

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent mb-2">LLM Provider Settings</h2>
        <p className="text-zinc-500">
          Choose your AI provider and configure API keys for workout generation.
        </p>
      </div>

      {/* Message */}
      {message && (
        <div className={`p-4 rounded-xl flex items-center gap-3 backdrop-blur-md border animate-in slide-in-from-top-2 duration-300 ${message.type === 'success'
          ? 'bg-emerald-500/10 border-emerald-500/20 shadow-lg shadow-emerald-500/10'
          : 'bg-red-500/10 border-red-500/20 shadow-lg shadow-red-500/10'
          }`}>
          {message.type === 'success' ? (
            <CheckCircle className="w-5 h-5 text-emerald-500" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-500" />
          )}
          <span className={message.type === 'success' ? 'text-emerald-400' : 'text-red-400 font-medium'}>
            {message.text}
          </span>
        </div>
      )}

      {/* Provider Selection */}
      <div className="bg-zinc-900/50 backdrop-blur-xl rounded-2xl p-8 border border-white/5 shadow-xl shadow-black/20">
        <h3 className="font-semibold text-white mb-6">Select AI Provider</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PROVIDERS.map(provider => {
            const Icon = provider.icon;
            const isSelected = selectedProvider === provider.id;
            const hasKey = hasExistingKeys[provider.id];

            return (
              <button
                key={provider.id}
                onClick={() => handleSelectProvider(provider.id)}
                disabled={saving}
                className={`relative p-5 rounded-xl border-2 transition-all duration-300 text-left group
                  ${isSelected
                    ? `${provider.bgColor} ${provider.borderColor} shadow-lg`
                    : 'bg-zinc-950/50 border-white/5 hover:border-white/10 hover:bg-zinc-800/50'
                  }
                  disabled:opacity-50 disabled:cursor-not-allowed
                `}
              >
                {isSelected && (
                  <div className="absolute top-3 right-3">
                    <CheckCircle className={`w-5 h-5 ${provider.textColor}`} />
                  </div>
                )}
                <div className={`p-3 rounded-xl bg-gradient-to-br ${provider.color} w-fit mb-3 shadow-lg`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <h4 className={`font-semibold mb-1 ${isSelected ? 'text-white' : 'text-zinc-300 group-hover:text-white'}`}>
                  {provider.name}
                </h4>
                <p className="text-xs text-zinc-500">
                  {hasKey ? (
                    <span className={`${provider.textColor}`}>API Key configured</span>
                  ) : (
                    'No API key set'
                  )}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* API Key Configuration for Selected Provider */}
      <div className="bg-zinc-900/50 backdrop-blur-xl rounded-2xl p-8 border border-white/5 shadow-xl shadow-black/20">
        <div className="flex items-center gap-4 mb-8">
          <div className={`p-3 bg-gradient-to-br ${currentProvider.color} rounded-xl shadow-lg ring-1 ring-inset ring-black/20`}>
            <Key className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">{currentProvider.name} API Key</h3>
            <p className="text-sm text-zinc-400">Required for AI workout generation</p>
          </div>
        </div>

        {hasExistingKeys[selectedProvider] && editingKey !== selectedProvider ? (
          <div className="space-y-6">
            <div className={`flex items-center gap-3 p-4 ${currentProvider.bgColor} border ${currentProvider.borderColor} rounded-xl`}>
              <CheckCircle className={`w-5 h-5 ${currentProvider.textColor}`} />
              <span className={`text-sm ${currentProvider.textColor}/90 font-medium flex-1`}>API Key configured</span>
              <span className={`text-xs ${currentProvider.textColor}/50 font-mono ${currentProvider.bgColor} px-2 py-1 rounded-md`}>
                {apiKeys[selectedProvider]}
              </span>
            </div>
            <div className="flex gap-4">
              <button
                onClick={() => handleStartEditing(selectedProvider)}
                disabled={saving}
                className="flex-1 px-6 py-3 bg-zinc-800/50 text-white rounded-xl text-sm font-medium hover:bg-zinc-800 transition-all border border-white/5 hover:border-white/10 active:scale-[0.98] disabled:opacity-50"
              >
                Replace Key
              </button>
              <button
                onClick={() => handleDeleteApiKey(selectedProvider)}
                disabled={saving}
                className="flex-1 px-6 py-3 bg-red-500/10 text-red-400 rounded-xl text-sm font-medium hover:bg-red-500/20 transition-all border border-red-500/10 hover:border-red-500/20 active:scale-[0.98] disabled:opacity-50"
              >
                Delete Key
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="relative group">
              <input
                type={showKey ? 'text' : 'password'}
                value={newKeyValue}
                onChange={(e) => setNewKeyValue(e.target.value)}
                placeholder={currentProvider.placeholder}
                className="w-full px-5 py-4 pr-12 bg-zinc-950/50 rounded-xl border border-white/5 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all text-sm group-hover:bg-zinc-950/80"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                tabIndex={-1}
              >
                {showKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>

            <div className="flex items-center justify-between text-xs text-zinc-500 px-1">
              <span>Get your API key from {currentProvider.name}</span>
              <a
                href={currentProvider.link}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center gap-1 ${currentProvider.textColor} hover:opacity-80 transition-opacity hover:underline`}
              >
                Get API Key
                <ChevronRight className="w-3 h-3" />
              </a>
            </div>

            <div className="flex gap-4">
              {editingKey === selectedProvider && (
                <button
                  onClick={handleCancelEditing}
                  disabled={saving}
                  className="flex-1 py-4 bg-zinc-800 text-white rounded-xl text-sm font-medium hover:bg-zinc-700 transition-all border border-white/5 disabled:opacity-50"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={() => handleSaveApiKey(selectedProvider)}
                disabled={saving || !newKeyValue || newKeyValue.length < 10}
                className={`flex-1 py-4 bg-gradient-to-r ${currentProvider.color} text-white rounded-xl text-sm font-bold shadow-lg hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2`}
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save API Key
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Available Models Info */}
      <div className="bg-zinc-900/50 backdrop-blur-xl rounded-2xl p-8 border border-white/5 shadow-xl shadow-black/20">
        <h3 className="font-semibold text-white mb-6">Available Models</h3>
        <div className="space-y-3">
          {currentProvider.models.map((model, idx) => (
            <div
              key={model}
              className={`flex justify-between items-center p-4 bg-zinc-950/30 rounded-xl border border-white/5 ${idx === 0 ? currentProvider.bgColor + ' ' + currentProvider.borderColor : ''}`}
            >
              <span className="text-zinc-400 text-sm">{model}</span>
              {idx === 0 && (
                <span className={`text-xs ${currentProvider.textColor} font-medium`}>Recommended</span>
              )}
            </div>
          ))}
        </div>
        <p className="text-xs text-zinc-600 mt-6 text-center">
          Model selection for different generation types can be configured in the prompt templates.
        </p>
      </div>
    </div>
  );
};

export default AdminApiSettings;
