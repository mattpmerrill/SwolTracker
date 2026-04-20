import { Dumbbell, Target, Users, BarChart3 } from 'lucide-react';

const TABS = [
  { id: 'workout', icon: Dumbbell, label: 'Workout' },
  { id: 'maxes', icon: Target, label: '1RM' },
  { id: 'buddies', icon: Users, label: 'Buddies' },
  { id: 'progress', icon: BarChart3, label: 'Progress' },
];

/**
 * Bottom navigation bar with tab buttons
 */
export default function BottomNav({
  activeTab,
  onTabChange,
  user,
}) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-zinc-900/95 backdrop-blur-xl border-t border-zinc-800/50 px-6 py-3">
      <div className="flex justify-around max-w-lg mx-auto">
        {TABS.map(tab => {
          let notificationCount = 0;
          if (tab.id === 'buddies' && user) {
            const pendingRequests = user.receivedRequests?.length || 0;
            const acceptedNotifs = user.acceptedNotifications?.length || 0;
            notificationCount = pendingRequests + acceptedNotifs;
          }

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex flex-col items-center gap-1 py-1 px-4 rounded-xl transition-all relative ${
                activeTab === tab.id
                  ? 'text-orange-500'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <div className="relative">
                <tab.icon className="w-6 h-6" />
                {notificationCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-zinc-900">
                    {notificationCount}
                  </span>
                )}
              </div>
              <span className="text-xs font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
