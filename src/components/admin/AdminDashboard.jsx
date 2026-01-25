import { useState, useEffect } from 'react';
import { Users, Dumbbell, Zap, DollarSign, Activity, TrendingUp, Loader2, RefreshCw } from 'lucide-react';

const StatCard = ({ icon: Icon, label, value, subValue, color, trend }) => (
  <div className="bg-zinc-900/50 backdrop-blur-xl rounded-2xl p-6 border border-white/5 shadow-xl shadow-black/20 hover:bg-zinc-800/50 hover:scale-[1.02] hover:border-white/10 transition-all duration-300 group">
    <div className="flex items-center gap-4 mb-4">
      <div className={`p-3 rounded-xl ${color} shadow-lg ring-1 ring-inset ring-black/20`}>
        <Icon className="w-6 h-6" />
      </div>
      <span className="text-sm font-medium text-zinc-400 group-hover:text-zinc-300 transition-colors">{label}</span>
    </div>
    <div className="flex items-end justify-between">
      <div>
        <p className="text-3xl font-bold text-white tracking-tight">{value}</p>
        {subValue && (
          <p className="text-xs text-zinc-500 mt-1 font-medium">{subValue}</p>
        )}
      </div>
      {trend && (
        <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full font-medium ${trend > 0
          ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20'
          : 'text-zinc-500 bg-zinc-500/10 border border-zinc-500/20'
          }`}>
          <TrendingUp className="w-3.5 h-3.5" />
          <span>+{trend}</span>
        </div>
      )}
    </div>
  </div>
);

const AdminDashboard = ({ db }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await db.getAdminDashboardStats();
      if (data) {
        setStats(data);
      } else {
        setError('Failed to load stats. Make sure you have admin access.');
      }
    } catch (err) {
      console.error('Error loading admin stats:', err);
      setError(err.message || 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-8 text-center backdrop-blur-sm">
        <p className="text-red-400 mb-6">{error}</p>
        <button
          onClick={loadStats}
          className="px-6 py-2.5 bg-red-500/20 text-red-400 rounded-xl hover:bg-red-500/30 transition-all font-medium"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center text-zinc-500 py-12">
        No stats available
      </div>
    );
  }

  const formatCost = (cost) => {
    if (cost === 0) return '$0.00';
    if (cost < 0.01) return '<$0.01';
    return `$${cost.toFixed(2)}`;
  };

  const formatNumber = (num) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Dashboard Overview</h2>
          <p className="text-zinc-500 text-sm mt-1">Platform activity and performance metrics</p>
        </div>
        <button
          onClick={loadStats}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white bg-zinc-800/50 hover:bg-zinc-800 rounded-xl transition-all border border-white/5 hover:border-white/10"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <StatCard
          icon={Users}
          label="Total Users"
          value={stats.total_users}
          subValue={`${stats.onboarding_completed_count} completed onboarding`}
          color="bg-gradient-to-br from-blue-500 to-blue-600 text-white"
          trend={stats.users_last_7_days}
        />

        <StatCard
          icon={Dumbbell}
          label="AI Workouts Generated"
          value={stats.total_ai_workouts}
          subValue={`${stats.ai_workouts_last_30_days} in last 30 days`}
          color="bg-gradient-to-br from-emerald-500 to-teal-600 text-white"
          trend={stats.ai_workouts_last_7_days}
        />

        <StatCard
          icon={Zap}
          label="API Calls"
          value={stats.api_calls_total}
          subValue={`${stats.api_success_rate}% success rate`}
          color="bg-gradient-to-br from-amber-500 to-orange-600 text-white"
          trend={stats.api_calls_last_7_days}
        />

        <StatCard
          icon={Activity}
          label="Total Tokens Used"
          value={formatNumber(stats.total_tokens_used)}
          subValue={`${formatNumber(stats.tokens_last_30_days)} in last 30 days`}
          color="bg-gradient-to-br from-violet-500 to-purple-600 text-white"
        />

        <StatCard
          icon={DollarSign}
          label="Estimated Cost"
          value={formatCost(stats.estimated_cost_total)}
          subValue={`${formatCost(stats.estimated_cost_last_30_days)} in last 30 days`}
          color="bg-gradient-to-br from-rose-500 to-pink-600 text-white"
        />
      </div>

      {/* Additional Info */}
      <div className="bg-zinc-900/50 backdrop-blur-xl rounded-2xl p-6 border border-white/5 shadow-xl shadow-black/20">
        <h3 className="font-semibold text-white mb-6 flex items-center gap-2">
          <Activity className="w-5 h-5 text-zinc-400" />
          Recent Activity
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div className="space-y-1">
            <p className="text-zinc-500 text-xs uppercase tracking-wider font-medium">New Users (7d)</p>
            <p className="text-2xl font-bold text-white">{stats.users_last_7_days}</p>
          </div>
          <div className="space-y-1">
            <p className="text-zinc-500 text-xs uppercase tracking-wider font-medium">New Users (30d)</p>
            <p className="text-2xl font-bold text-white">{stats.users_last_30_days}</p>
          </div>
          <div className="space-y-1">
            <p className="text-zinc-500 text-xs uppercase tracking-wider font-medium">API Calls (7d)</p>
            <p className="text-2xl font-bold text-white">{stats.api_calls_last_7_days}</p>
          </div>
          <div className="space-y-1">
            <p className="text-zinc-500 text-xs uppercase tracking-wider font-medium">Cost (7d)</p>
            <p className="text-2xl font-bold text-white">{formatCost(stats.estimated_cost_last_7_days)}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
