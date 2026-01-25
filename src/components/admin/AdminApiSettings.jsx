import { useState, useEffect } from 'react';
import { Key, Save, Eye, EyeOff, CheckCircle, AlertCircle, Loader2, ChevronRight } from 'lucide-react';

const AdminApiSettings = ({ db }) => {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [hasExistingKey, setHasExistingKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [settings, setSettings] = useState({});

  const loadSettings = async () => {
    setLoading(true);
    try {
      const allSettings = await db.getAllAppSettings();
      const settingsMap = {};
      allSettings.forEach(s => {
        settingsMap[s.key] = s.value;
      });
      setSettings(settingsMap);

      // Check if API key exists
      const existingKey = settingsMap['llm_api_key'];
      if (existingKey && existingKey.length > 0) {
        setHasExistingKey(true);
        // Show masked version
        setApiKey(`${existingKey.slice(0, 7)}...${existingKey.slice(-4)}`);
      }
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

  const handleSaveApiKey = async () => {
    if (!apiKey || apiKey.length < 20 || apiKey.includes('...')) {
      setMessage({ type: 'error', text: 'Please enter a valid API key' });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const success = await db.saveAppSetting('llm_api_key', apiKey);
      if (success) {
        setMessage({ type: 'success', text: 'API key saved successfully' });
        setHasExistingKey(true);
        setApiKey(`${apiKey.slice(0, 7)}...${apiKey.slice(-4)}`);
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

  const handleDeleteApiKey = async () => {
    if (!confirm('Are you sure you want to delete the API key? AI features will stop working.')) {
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const success = await db.saveAppSetting('llm_api_key', '');
      if (success) {
        setMessage({ type: 'success', text: 'API key deleted' });
        setHasExistingKey(false);
        setApiKey('');
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

  const handleReplaceKey = () => {
    setApiKey('');
    setHasExistingKey(false);
    setShowKey(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-green-500" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent mb-2">API Settings</h2>
        <p className="text-zinc-500">
          Configure the global OpenAI API key used for all AI features in the app.
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

      {/* API Key Section */}
      <div className="bg-zinc-900/50 backdrop-blur-xl rounded-2xl p-8 border border-white/5 shadow-xl shadow-black/20">
        <div className="flex items-center gap-4 mb-8">
          <div className="p-3 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl shadow-lg ring-1 ring-inset ring-black/20">
            <Key className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">OpenAI API Key</h3>
            <p className="text-sm text-zinc-400">Required for AI workout generation</p>
          </div>
        </div>

        {hasExistingKey ? (
          <div className="space-y-6">
            <div className="flex items-center gap-3 p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
              <CheckCircle className="w-5 h-5 text-emerald-500" />
              <span className="text-sm text-emerald-400/90 font-medium flex-1">API Key configured successfully</span>
              <span className="text-xs text-emerald-500/50 font-mono bg-emerald-500/5 px-2 py-1 rounded-md">{apiKey}</span>
            </div>
            <div className="flex gap-4">
              <button
                onClick={handleReplaceKey}
                disabled={saving}
                className="flex-1 px-6 py-3 bg-zinc-800/50 text-white rounded-xl text-sm font-medium hover:bg-zinc-800 transition-all border border-white/5 hover:border-white/10 active:scale-[0.98] disabled:opacity-50"
              >
                Replace Key
              </button>
              <button
                onClick={handleDeleteApiKey}
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
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
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
              <span>Get your API key from OpenAI</span>
              <a
                href="https://platform.openai.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-purple-400 hover:text-purple-300 transition-colors hover:underline"
              >
                platform.openai.com
                <ChevronRight className="w-3 h-3" />
              </a>
            </div>

            <button
              onClick={handleSaveApiKey}
              disabled={saving || !apiKey || apiKey.length < 20}
              className="w-full py-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-purple-900/20 hover:shadow-purple-900/40 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving Configuration...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save API Key
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Model Settings Info */}
      <div className="bg-zinc-900/50 backdrop-blur-xl rounded-2xl p-8 border border-white/5 shadow-xl shadow-black/20">
        <h3 className="font-semibold text-white mb-6">Model Configuration</h3>
        <div className="space-y-4">
          <div className="flex justify-between items-center p-4 bg-zinc-950/30 rounded-xl border border-white/5">
            <span className="text-zinc-400 text-sm">Onboarding Generation</span>
            <span className="font-mono text-xs text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">{settings['llm_model_onboarding'] || 'gpt-4o-mini'}</span>
          </div>
          <div className="flex justify-between items-center p-4 bg-zinc-950/30 rounded-xl border border-white/5">
            <span className="text-zinc-400 text-sm">Weekly Generation</span>
            <span className="font-mono text-xs text-purple-400 bg-purple-500/10 px-2.5 py-1 rounded-lg border border-purple-500/20">{settings['llm_model_weekly'] || 'gpt-4o'}</span>
          </div>
        </div>
        <p className="text-xs text-zinc-600 mt-6 text-center">
          Model settings can be configured directly in your Supabase database settings table.
        </p>
      </div>
    </div>
  );
};

export default AdminApiSettings;
