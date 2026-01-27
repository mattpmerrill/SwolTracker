import { useState, useEffect } from 'react';
import {
  AlertCircle, AlertTriangle, Info, CheckCircle,
  Loader2, RefreshCw, Trash2, ChevronDown, ChevronRight,
  Filter, Search, Clock, User, Code, FileText, X, Copy, Check
} from 'lucide-react';

const CATEGORIES = [
  { id: 'all', label: 'All Categories' },
  { id: 'llm', label: 'LLM/AI' },
  { id: 'database', label: 'Database' },
  { id: 'parsing', label: 'Parsing' },
  { id: 'avatar', label: 'Avatar' },
  { id: 'network', label: 'Network' },
  { id: 'auth', label: 'Auth' },
];

const SEVERITIES = [
  { id: 'all', label: 'All Severities' },
  { id: 'critical', label: 'Critical' },
  { id: 'error', label: 'Error' },
  { id: 'warning', label: 'Warning' },
];

const SeverityBadge = ({ severity }) => {
  const config = {
    critical: { icon: AlertCircle, bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' },
    error: { icon: AlertTriangle, bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30' },
    warning: { icon: Info, bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30' },
  };
  const { icon: Icon, bg, text, border } = config[severity] || config.error;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium ${bg} ${text} ${border} border`}>
      <Icon className="w-3 h-3" />
      {severity}
    </span>
  );
};

const CategoryBadge = ({ category }) => {
  const colors = {
    llm: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    database: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    parsing: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    avatar: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
    network: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    auth: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    unknown: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
  };

  return (
    <span className={`px-2 py-1 rounded-md text-xs font-medium border ${colors[category] || colors.unknown}`}>
      {category}
    </span>
  );
};

const StatCard = ({ icon: Icon, label, value, color, subValue }) => (
  <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl p-4 border border-white/5 hover:border-white/10 transition-all">
    <div className="flex items-center gap-3">
      <div className={`p-2 rounded-lg ${color}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-2xl font-bold text-white">{value ?? '-'}</p>
        <p className="text-xs text-zinc-500">{label}</p>
        {subValue && <p className="text-xs text-zinc-600 mt-0.5">{subValue}</p>}
      </div>
    </div>
  </div>
);

const AdminErrorLogs = ({ db }) => {
  const [errors, setErrors] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedRows, setExpandedRows] = useState({});
  const [message, setMessage] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  // Filters
  const [category, setCategory] = useState('all');
  const [severity, setSeverity] = useState('all');
  const [showResolved, setShowResolved] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Pagination
  const [page, setPage] = useState(0);
  const pageSize = 25;

  const loadData = async () => {
    setLoading(true);
    try {
      const [errorData, statsData] = await Promise.all([
        db.getErrorLogs({
          limit: pageSize,
          offset: page * pageSize,
          category: category !== 'all' ? category : null,
          severity: severity !== 'all' ? severity : null,
          resolved: showResolved ? null : false,
        }),
        db.getErrorStats()
      ]);
      setErrors(errorData || []);
      setStats(statsData);
    } catch (err) {
      console.error('Error loading error logs:', err);
      setMessage({ type: 'error', text: 'Failed to load error logs' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [category, severity, showResolved, page]);

  const handleResolve = async (errorId) => {
    const success = await db.resolveError(errorId, 'Resolved via admin panel');
    if (success) {
      setMessage({ type: 'success', text: 'Error marked as resolved' });
      loadData();
    } else {
      setMessage({ type: 'error', text: 'Failed to resolve error' });
    }
    setTimeout(() => setMessage(null), 3000);
  };

  const handleCleanup = async () => {
    if (!confirm('This will delete resolved errors older than 30 days. Continue?')) return;
    const deleted = await db.cleanupOldErrors();
    setMessage({ type: 'success', text: `Deleted ${deleted} old error records` });
    setTimeout(() => setMessage(null), 3000);
    loadData();
  };

  const toggleRow = (id) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const copyToClipboard = async (text, id) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const filteredErrors = errors.filter(e =>
    !searchTerm ||
    e.message?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.component?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.operation?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.user_email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString();
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatRelativeTime = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatDate(dateStr);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">Error Logs</h2>
          <p className="text-zinc-500 text-sm mt-1">Monitor and resolve application errors</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleCleanup}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white bg-zinc-800/50 hover:bg-zinc-800 rounded-xl transition-all border border-white/5 hover:border-white/10"
          >
            <Trash2 className="w-4 h-4" />
            Cleanup
          </button>
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white bg-zinc-800/50 hover:bg-zinc-800 rounded-xl transition-all border border-white/5 hover:border-white/10 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={`p-4 rounded-xl flex items-center gap-3 backdrop-blur-md border animate-in slide-in-from-top-2 duration-300
          ${message.type === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/20'
            : 'bg-red-500/10 border-red-500/20'}`}>
          {message.type === 'success' ? (
            <CheckCircle className="w-5 h-5 text-emerald-500" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-500" />
          )}
          <span className={message.type === 'success' ? 'text-emerald-400' : 'text-red-400'}>
            {message.text}
          </span>
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            icon={AlertCircle}
            label="Total Errors"
            value={stats.total_errors || 0}
            color="bg-zinc-700/50 text-zinc-300"
          />
          <StatCard
            icon={AlertTriangle}
            label="Unresolved"
            value={stats.unresolved_errors || 0}
            color="bg-orange-500/20 text-orange-400"
          />
          <StatCard
            icon={Clock}
            label="Last 24h"
            value={stats.errors_last_24h || 0}
            color="bg-blue-500/20 text-blue-400"
            subValue={stats.errors_last_7d ? `${stats.errors_last_7d} in 7 days` : null}
          />
          <StatCard
            icon={AlertCircle}
            label="Critical Unresolved"
            value={stats.critical_unresolved || 0}
            color="bg-red-500/20 text-red-400"
          />
        </div>
      )}

      {/* Filters */}
      <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl p-4 border border-white/5 flex flex-wrap gap-4 items-center">
        <div className="flex items-center gap-2 text-zinc-400">
          <Filter className="w-4 h-4" />
          <span className="text-sm font-medium">Filters:</span>
        </div>

        <select
          value={category}
          onChange={(e) => { setCategory(e.target.value); setPage(0); }}
          className="bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 cursor-pointer"
        >
          {CATEGORIES.map(c => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>

        <select
          value={severity}
          onChange={(e) => { setSeverity(e.target.value); setPage(0); }}
          className="bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 cursor-pointer"
        >
          {SEVERITIES.map(s => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>

        <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(e) => { setShowResolved(e.target.checked); setPage(0); }}
            className="rounded border-zinc-600 bg-zinc-800 text-orange-500 focus:ring-orange-500/50 cursor-pointer"
          />
          Show resolved
        </label>

        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search errors..."
              className="w-full pl-10 pr-4 py-2 bg-zinc-800 border border-white/10 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading && !errors.length && (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
        </div>
      )}

      {/* Error List */}
      {!loading || errors.length > 0 ? (
        <div className="bg-zinc-900/50 backdrop-blur-xl rounded-2xl border border-white/5 overflow-hidden">
          {filteredErrors.length === 0 ? (
            <div className="text-center py-12 text-zinc-500">
              <CheckCircle className="w-12 h-12 mx-auto mb-4 text-emerald-500/50" />
              <p className="font-medium text-white">No errors found</p>
              <p className="text-sm mt-1">Great job! Everything is running smoothly.</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {filteredErrors.map(error => (
                <div key={error.id} className="group">
                  {/* Row Header */}
                  <div
                    className="flex items-center gap-4 p-4 cursor-pointer hover:bg-zinc-800/50 transition-colors"
                    onClick={() => toggleRow(error.id)}
                  >
                    <div className={`p-1 rounded transition-transform duration-200 ${expandedRows[error.id] ? 'rotate-90' : ''}`}>
                      <ChevronRight className="w-4 h-4 text-zinc-500" />
                    </div>

                    <SeverityBadge severity={error.severity} />
                    <CategoryBadge category={error.category} />

                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{error.message}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {error.component && <span>{error.component}</span>}
                        {error.operation && <span className="text-zinc-600"> / {error.operation}</span>}
                      </p>
                    </div>

                    <div className="text-right text-xs text-zinc-500 hidden sm:block">
                      <p>{formatRelativeTime(error.created_at)}</p>
                      <p className="text-zinc-600">{formatTime(error.created_at)}</p>
                    </div>

                    {!error.resolved ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleResolve(error.id); }}
                        className="opacity-0 group-hover:opacity-100 px-3 py-1.5 text-xs font-medium text-emerald-400 bg-emerald-500/10 rounded-lg hover:bg-emerald-500/20 transition-all border border-emerald-500/20"
                      >
                        Resolve
                      </button>
                    ) : (
                      <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-md border border-emerald-500/20">
                        Resolved
                      </span>
                    )}
                  </div>

                  {/* Expanded Details */}
                  {expandedRows[error.id] && (
                    <div className="px-4 pb-4 pt-0 bg-zinc-950/30 border-t border-white/5">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                        {/* User Info */}
                        {(error.user_email || error.user_name) && (
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-xs text-zinc-400">
                              <User className="w-3 h-3" />
                              User
                            </div>
                            <p className="text-sm text-white">{error.user_name || 'Unknown'}</p>
                            {error.user_email && (
                              <p className="text-xs text-zinc-500">{error.user_email}</p>
                            )}
                          </div>
                        )}

                        {/* Timestamp */}
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-xs text-zinc-400">
                            <Clock className="w-3 h-3" />
                            Timestamp
                          </div>
                          <p className="text-sm text-white">{formatDate(error.created_at)} at {formatTime(error.created_at)}</p>
                        </div>

                        {/* Context */}
                        {error.context && Object.keys(error.context).length > 0 && (
                          <div className="space-y-1 md:col-span-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 text-xs text-zinc-400">
                                <FileText className="w-3 h-3" />
                                Context
                              </div>
                              <button
                                onClick={() => copyToClipboard(JSON.stringify(error.context, null, 2), `context-${error.id}`)}
                                className="flex items-center gap-1.5 px-2 py-1 text-xs text-zinc-400 hover:text-white bg-zinc-800/50 hover:bg-zinc-800 rounded-md transition-all border border-white/5 hover:border-white/10"
                                title="Copy to clipboard"
                              >
                                {copiedId === `context-${error.id}` ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-400" />
                                    <span className="text-emerald-400">Copied</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3" />
                                    <span>Copy</span>
                                  </>
                                )}
                              </button>
                            </div>
                            <pre className="text-xs text-zinc-300 bg-zinc-900/50 p-3 rounded-lg overflow-x-auto max-h-32 font-mono">
                              {JSON.stringify(error.context, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>

                      {/* Stack Trace */}
                      {error.stack_trace && (
                        <div className="mt-4 space-y-1">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-xs text-zinc-400">
                              <Code className="w-3 h-3" />
                              Stack Trace
                            </div>
                            <button
                              onClick={() => copyToClipboard(error.stack_trace, `stack-${error.id}`)}
                              className="flex items-center gap-1.5 px-2 py-1 text-xs text-zinc-400 hover:text-white bg-zinc-800/50 hover:bg-zinc-800 rounded-md transition-all border border-white/5 hover:border-white/10"
                              title="Copy to clipboard"
                            >
                              {copiedId === `stack-${error.id}` ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-400" />
                                  <span className="text-emerald-400">Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                          </div>
                          <pre className="text-xs text-zinc-400 bg-zinc-900/50 p-3 rounded-lg overflow-x-auto max-h-48 font-mono whitespace-pre-wrap">
                            {error.stack_trace}
                          </pre>
                        </div>
                      )}

                      {/* Resolution Notes */}
                      {error.resolved && error.resolution_notes && (
                        <div className="mt-4 space-y-1">
                          <div className="flex items-center gap-2 text-xs text-zinc-400">
                            <CheckCircle className="w-3 h-3" />
                            Resolution Notes
                          </div>
                          <p className="text-sm text-emerald-400 bg-emerald-500/10 p-3 rounded-lg border border-emerald-500/20">
                            {error.resolution_notes}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {filteredErrors.length > 0 && (
            <div className="flex items-center justify-between p-4 border-t border-white/5">
              <p className="text-sm text-zinc-500">
                Showing {page * pageSize + 1} - {page * pageSize + filteredErrors.length}
                {stats?.total_errors ? ` of ${stats.total_errors}` : ''}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-3 py-1.5 text-sm text-zinc-400 bg-zinc-800 rounded-lg hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={filteredErrors.length < pageSize}
                  className="px-3 py-1.5 text-sm text-zinc-400 bg-zinc-800 rounded-lg hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};

export default AdminErrorLogs;
