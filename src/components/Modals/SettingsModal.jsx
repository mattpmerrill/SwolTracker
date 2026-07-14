import { useState, useEffect } from 'react';
import { X, Brain, Zap, Check, Shield, Package, Plus, Bot, Key, Copy, Trash2, Loader2, Activity, AlertCircle, FileText, ClipboardList } from 'lucide-react';
import { db } from '../../lib/supabase';
import swoltrackerSkillGuide from '../../../SKILL.md?raw';

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
                const nextWeek = getNextUnprogrammedWeek();
                // Phase 3.7: default single week for continuity; modal can bump length
                onOpenAiGenerator(nextWeek, { weekCount: 1 });
                onClose();
              }}
              disabled={currentUser !== userId}
              className={`w-full py-3 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-2 text-sm ${
                currentUser !== userId ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <Zap className="w-4 h-4" />
              Review + Generate Next Week
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

        {/* Agent Prompt Library */}
        <AgentPromptLibrarySection />

        {/* Agent Activity — audit log of recent MCP tool calls */}
        {supabase && <AgentActivitySection supabase={supabase} />}

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
      .select('id, key_prefix, name, last_used_at, created_at, scopes')
      .is('revoked_at', null)
      .order('created_at', { ascending: false });
    setKeys(data || []);
    setLoading(false);
  }

  async function generateKey() {
    setGenerating(true);
    const { data, error } = await supabase.rpc('create_api_key', {
      p_name: keyName.trim() || 'My Agent',
      p_scopes: ['read', 'write:logs', 'write:program', 'coach'],
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
                <div key={k.id} className="bg-zinc-800/60 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-3">
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
                  {Array.isArray(k.scopes) && k.scopes.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {k.scopes.map(s => (
                        <span
                          key={s}
                          className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
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

// ── Agent Prompt Library Section ─────────────────────────────────

const WEEKLY_REVIEW_PROMPT_TEXT = `Set up a weekly cron job (every Sunday at 8 PM) to review my SwolTracker progress. Each week:

1. Call \`get_training_history_summary\` to see my recent workout data
2. Call \`get_overload_recommendations\` to check which lifts are ready to progress
3. Call \`generate_weekly_summary\` for my completion stats
4. Call \`get_streak\` for my consistency streak
5. Analyze my performance and write a personalized coach note using \`send_coach_message\` with message_type "weekly_review" and include the week_number
6. If I need program adjustments based on my progress, use \`save_workout_program\` to update next week's exercises, then note the changes with \`send_coach_message\` using message_type "program_update"

Be encouraging but honest. Reference specific exercises and numbers from my data. Keep reviews under 500 words.`;

const ONBOARDING_PROMPT_TEXT = `I just set up SwolTracker. Please connect to the SwolTracker MCP server, read the SwolTracker skill guide, interview me, and complete onboarding.

Start by calling \`get_onboarding_status\` to see what is missing. Ask short grouped questions, then call \`update_profile\` as I answer. When all required fields are present, call \`complete_onboarding\` with my equipment list. After onboarding is complete, generate and save my first 4 weeks of training with \`generate_workout_program\`.

Keep the interview fast and conversational.`;

const PROGRAM_GENERATION_PROMPT_TEXT = `Please create my next 4 weeks of SwolTracker programming.

1. Read the SwolTracker skill guide and call \`get_prompt_template\` for the programming philosophy
2. Call \`get_context_bundle\`, \`get_profile\`, \`get_maxes\`, and \`get_training_history_summary\`
3. Draft the program and confirm it with me before saving
4. Save the confirmed program with \`generate_workout_program\`
5. Send me a short summary through \`send_coach_message\` using message_type "program_update"

Use my available equipment, workout days, goals, current maxes, and recent performance.`;

function buildMcpConfigPrompt(origin) {
  const configSnippet = JSON.stringify({
    swoltracker: {
      url: `${origin}/api/mcp`,
      headers: { Authorization: 'Bearer swol_YOUR_API_KEY' },
    },
  }, null, 2);

  return `Add SwolTracker to your MCP config. Replace \`swol_YOUR_API_KEY\` with my real key from SwolTracker Settings.

${configSnippet}

After connecting, read the SwolTracker skill guide and call \`get_context_bundle\` to understand my current workout state.`;
}

function AgentPromptLibrarySection() {
  const [copied, setCopied] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const origin = typeof window === 'undefined' ? 'https://swol-tracker.vercel.app' : window.location.origin;

  const prompts = [
    {
      id: 'skill',
      title: 'Agent Skill Guide',
      description: 'The full SwolTracker operating manual for any MCP-aware agent',
      content: swoltrackerSkillGuide,
    },
    {
      id: 'config',
      title: 'MCP Config Reminder',
      description: 'Connection snippet with the current SwolTracker MCP endpoint',
      content: buildMcpConfigPrompt(origin),
    },
    {
      id: 'onboarding',
      title: 'Onboarding Prompt',
      description: 'Tell an agent to interview the user and finish setup',
      content: ONBOARDING_PROMPT_TEXT,
    },
    {
      id: 'program',
      title: 'Program Generation Prompt',
      description: 'Tell an agent to create and save a confirmed 4-week program',
      content: PROGRAM_GENERATION_PROMPT_TEXT,
    },
    {
      id: 'weekly',
      title: 'Weekly Review Cron',
      description: 'Tell an agent to schedule recurring coaching reviews',
      content: WEEKLY_REVIEW_PROMPT_TEXT,
    },
  ];

  function copyPrompt(prompt) {
    navigator.clipboard.writeText(prompt.content);
    setCopied(prompt.id);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="mb-6 bg-zinc-800/40 rounded-2xl border border-zinc-700/50 p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-zinc-700/60 flex items-center justify-center">
          <ClipboardList className="w-5 h-5 text-cyan-300" />
        </div>
        <div>
          <h3 className="font-bold text-sm">Agent Instructions</h3>
          <p className="text-xs text-zinc-400">Copyable prompts when your agent needs a reminder</p>
        </div>
      </div>

      <div className="space-y-2">
        {prompts.map(prompt => {
          const isExpanded = expanded === prompt.id;
          return (
            <div key={prompt.id} className="bg-zinc-900/60 rounded-xl border border-zinc-700/40 overflow-hidden">
              <div className="flex items-center gap-3 p-3">
                <FileText className="w-4 h-4 text-cyan-300 shrink-0" />
                <button
                  onClick={() => setExpanded(isExpanded ? null : prompt.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="text-sm font-semibold text-zinc-100 truncate">{prompt.title}</p>
                  <p className="text-xs text-zinc-500 truncate">{prompt.description}</p>
                </button>
                <button
                  onClick={() => copyPrompt(prompt)}
                  className="shrink-0 flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition-colors"
                >
                  {copied === prompt.id ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-zinc-400" />}
                  {copied === prompt.id ? 'Copied' : 'Copy'}
                </button>
              </div>
              {isExpanded && (
                <pre className="text-xs text-zinc-300 bg-zinc-950/60 border-t border-zinc-800 p-3 font-mono whitespace-pre-wrap overflow-y-auto max-h-48 leading-relaxed">{prompt.content}</pre>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Agent Activity Section ─────────────────────────────────

function auditTimeAgo(date) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function AgentActivitySection({ supabase }) {
  const [rows, setRows] = useState([]);
  const [hasKeys, setHasKeys] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: keyCheck } = await supabase
        .from('api_keys')
        .select('id')
        .is('revoked_at', null)
        .limit(1);
      if (!keyCheck || keyCheck.length === 0) {
        setHasKeys(false);
        setLoading(false);
        return;
      }
      setHasKeys(true);
      const data = await db.getMyToolCallAudit(50);
      setRows(data);
      setLoading(false);
    }
    load();
  }, []);

  if (!hasKeys && !loading) return null;

  const visible = expanded ? rows : rows.slice(0, 10);

  return (
    <div className="mb-6 bg-zinc-800/40 rounded-2xl border border-zinc-700/50 p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-zinc-700/60 flex items-center justify-center">
          <Activity className="w-5 h-5 text-zinc-300" />
        </div>
        <div>
          <h3 className="font-bold text-sm">Agent Activity</h3>
          <p className="text-xs text-zinc-400">Recent MCP tool calls from your agents</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-3">
          <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-zinc-500 text-center py-2">No tool calls yet.</p>
      ) : (
        <>
          <div className="space-y-1.5">
            {visible.map(row => (
              <div
                key={row.id}
                className="flex items-center gap-2 bg-zinc-900/60 rounded-lg px-3 py-2 text-xs"
              >
                {row.ok ? (
                  <Check className="w-3.5 h-3.5 text-green-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                )}
                <code className="font-mono text-zinc-300 truncate flex-1">{row.tool_name}</code>
                {!row.ok && row.error_message && (
                  <span className="text-red-400 truncate max-w-[40%]" title={row.error_message}>
                    {row.error_message}
                  </span>
                )}
                <span className="text-zinc-500 shrink-0">{auditTimeAgo(row.created_at)}</span>
              </div>
            ))}
          </div>
          {rows.length > 10 && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="w-full mt-2 py-1.5 text-xs text-zinc-400 hover:text-zinc-200"
            >
              {expanded ? 'Show less' : `Show all ${rows.length}`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
