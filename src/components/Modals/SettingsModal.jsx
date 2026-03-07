import { useState, useEffect } from 'react';
import { X, Brain, Zap, Check, Shield, Package, Plus, Bot, Key, Copy, Trash2, Loader2 } from 'lucide-react';

/**
 * Main settings modal
 */
export default function SettingsModal({
  isOpen,
  groupRole,
  groupLeader,
  currentUser,
  userId,
  workoutProgram,
  equipment,
  programStartDate,
  actualCurrentWeek,
  isAdmin,
  supabase,
  onClose,
  onOpenAiGenerator,
  onOpenAdmin,
  onOpenEquipment,
  onRemoveEquipment,
}) {
  if (!isOpen) return null;

  // Find next week without a program
  const getNextUnprogrammedWeek = () => {
    let nextWeek = 1;
    while (workoutProgram[nextWeek]) nextWeek++;
    return nextWeek;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center">
      <div className="w-full max-w-lg bg-zinc-900 rounded-t-3xl sm:rounded-3xl p-6 max-h-[80vh] overflow-y-auto">
        <div className="w-12 h-1 bg-zinc-700 rounded-full mx-auto mb-6 sm:hidden" />
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">Settings</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-zinc-800 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* AI Coach Section */}
        <div className="mb-6 bg-gradient-to-br from-green-500/10 to-emerald-500/10 rounded-2xl border border-green-500/20 p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold">AI Coach</h3>
              <p className="text-xs text-zinc-400">
                {groupRole === 'member'
                  ? `Following ${groupLeader?.name}'s workouts`
                  : 'Powered by ChatGPT'}
              </p>
            </div>
          </div>

          {groupRole === 'member' ? (
            <div className="w-full py-3 rounded-xl bg-blue-500/20 border border-blue-500/30 text-center">
              <p className="text-sm text-blue-400 font-medium">
                Following {groupLeader?.name}'s Program
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                Leave the group to generate your own workouts
              </p>
            </div>
          ) : (
            <button
              onClick={() => {
                onOpenAiGenerator(getNextUnprogrammedWeek());
                onClose();
              }}
              disabled={currentUser !== userId}
              className={`w-full py-3 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-2 text-sm ${
                currentUser !== userId ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <Zap className="w-4 h-4" />
              Generate Next Week's Program
            </button>
          )}

          <div className="mt-4 grid grid-cols-4 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8].map(weekNum => {
              const hasProgram = workoutProgram[weekNum];
              return (
                <div
                  key={weekNum}
                  className={`p-2 rounded-lg border text-center ${
                    hasProgram
                      ? 'bg-green-500/20 border-green-500/30'
                      : 'bg-zinc-800/50 border-zinc-700'
                  }`}
                >
                  <p className="text-xs font-bold text-zinc-300">W{weekNum}</p>
                  {hasProgram && (
                    <Check className="w-3 h-3 text-green-500 mx-auto mt-1" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Connect Agent Section */}
        {supabase && <AgentKeysSection supabase={supabase} />}

        {/* Admin Section - Only visible to admins */}
        {isAdmin && (
          <div className="mb-6">
            <button
              onClick={() => {
                onClose();
                onOpenAdmin();
              }}
              className="w-full py-3 px-4 bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 rounded-xl text-purple-400 font-medium hover:from-purple-500/30 hover:to-pink-500/30 transition-all flex items-center justify-center gap-2"
            >
              <Shield className="w-5 h-5" />
              Open Admin Area
            </button>
          </div>
        )}

        {/* Equipment Section */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold flex items-center gap-2">
              <Package className="w-5 h-5 text-orange-500" />
              Gym Equipment
            </h3>
            <button
              onClick={() => {
                onClose();
                onOpenEquipment();
              }}
              className="p-2 bg-zinc-800 rounded-lg hover:bg-zinc-700"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {equipment.map(item => (
              <div
                key={item}
                className="flex items-center gap-1 px-3 py-1.5 bg-zinc-800 rounded-lg text-sm"
              >
                <span>{item}</span>
                <button
                  onClick={() => onRemoveEquipment(item)}
                  className="text-zinc-500 hover:text-red-400"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Program Info */}
        <div className="p-4 bg-zinc-800/50 rounded-xl">
          <h3 className="font-semibold mb-2">Program Started</h3>
          <p className="text-zinc-400 text-sm">
            {new Date(programStartDate).toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric'
            })}
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            Currently on Week {actualCurrentWeek}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Agent Keys Section ─────────────────────────────────────

function AgentKeysSection({ supabase }) {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [newKey, setNewKey] = useState(null); // one-time display
  const [keyName, setKeyName] = useState('');
  const [copied, setCopied] = useState(null); // 'key' | 'config' | null

  useEffect(() => {
    loadKeys();
  }, []);

  async function loadKeys() {
    const { data } = await supabase
      .from('api_keys')
      .select('id, key_prefix, name, last_used_at, created_at')
      .is('revoked_at', null)
      .order('created_at', { ascending: false });
    setKeys(data || []);
    setLoading(false);
  }

  async function generateKey() {
    setGenerating(true);
    const { data, error } = await supabase.rpc('create_api_key', {
      p_name: keyName.trim() || 'My Agent',
    });

    if (error || !data?.success) {
      alert(data?.error || error?.message || 'Failed to create key');
      setGenerating(false);
      return;
    }

    setNewKey(data.key);
    setKeyName('');
    setGenerating(false);
    loadKeys();
  }

  async function revokeKey(keyId) {
    const { data } = await supabase.rpc('revoke_api_key', { p_key_id: keyId });
    if (data?.success) {
      setKeys(prev => prev.filter(k => k.id !== keyId));
    }
  }

  function copyToClipboard(text, label) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }

  function timeAgo(date) {
    if (!date) return 'Never used';
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }

  const mcpUrl = `${window.location.origin}/api/mcp`;

  // State 2: Key just created — show it once
  if (newKey) {
    const configSnippet = JSON.stringify({
      swoltracker: {
        url: mcpUrl,
        headers: { Authorization: `Bearer ${newKey}` },
      },
    }, null, 2);

    return (
      <div className="mb-6 bg-gradient-to-br from-cyan-500/10 to-blue-500/10 rounded-2xl border border-cyan-500/20 p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
            <Key className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-cyan-400">Save Your API Key</h3>
            <p className="text-xs text-zinc-400">Won't be shown again!</p>
          </div>
        </div>

        <div className="mb-3">
          <div className="flex items-center gap-2 bg-zinc-800 rounded-lg p-3 font-mono text-sm break-all">
            <span className="flex-1 text-cyan-300">{newKey}</span>
            <button
              onClick={() => copyToClipboard(newKey, 'key')}
              className="shrink-0 p-1.5 hover:bg-zinc-700 rounded"
            >
              {copied === 'key' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-zinc-400" />}
            </button>
          </div>
        </div>

        <p className="text-xs text-zinc-400 mb-2">Add to your agent's MCP config:</p>
        <div className="flex items-start gap-2 bg-zinc-800 rounded-lg p-3 font-mono text-xs">
          <pre className="flex-1 text-zinc-300 overflow-x-auto whitespace-pre">{configSnippet}</pre>
          <button
            onClick={() => copyToClipboard(configSnippet, 'config')}
            className="shrink-0 p-1.5 hover:bg-zinc-700 rounded mt-0.5"
          >
            {copied === 'config' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-zinc-400" />}
          </button>
        </div>

        <button
          onClick={() => setNewKey(null)}
          className="w-full mt-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 font-medium text-sm transition-colors"
        >
          Done
        </button>
      </div>
    );
  }

  // State 1 & 3: No keys / existing keys
  return (
    <div className="mb-6 bg-gradient-to-br from-cyan-500/10 to-blue-500/10 rounded-2xl border border-cyan-500/20 p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
          <Bot className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-bold">
            {keys.length > 0 ? 'Connected Agents' : 'Connect Your AI Agent'}
          </h3>
          <p className="text-xs text-zinc-400">
            {keys.length > 0
              ? `${keys.length} active key${keys.length > 1 ? 's' : ''}`
              : 'Let an AI agent read & log workouts'}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-3">
          <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
        </div>
      ) : (
        <>
          {/* Existing keys */}
          {keys.length > 0 && (
            <div className="space-y-2 mb-3">
              {keys.map(k => (
                <div key={k.id} className="flex items-center gap-3 bg-zinc-800/60 rounded-lg px-3 py-2">
                  <code className="text-xs text-cyan-400 font-mono">{k.key_prefix}...</code>
                  <span className="text-xs text-zinc-300 flex-1 truncate">{k.name}</span>
                  <span className="text-xs text-zinc-500 shrink-0">{timeAgo(k.last_used_at)}</span>
                  <button
                    onClick={() => revokeKey(k.id)}
                    className="p-1 hover:bg-zinc-700 rounded text-zinc-500 hover:text-red-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Generate form */}
          <div className="flex gap-2">
            <input
              type="text"
              value={keyName}
              onChange={e => setKeyName(e.target.value)}
              placeholder="Key name (e.g. My Snappy)"
              maxLength={50}
              className="flex-1 px-3 py-2 bg-zinc-800 rounded-lg text-sm placeholder-zinc-500 border border-zinc-700 focus:border-cyan-500/50 focus:outline-none"
            />
            <button
              onClick={generateKey}
              disabled={generating || keys.length >= 5}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 shrink-0"
            >
              {generating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  {keys.length > 0 ? 'New Key' : 'Generate'}
                </>
              )}
            </button>
          </div>
          {keys.length >= 5 && (
            <p className="text-xs text-zinc-500 mt-1">Max 5 keys. Revoke one to create another.</p>
          )}
        </>
      )}
    </div>
  );
}
