import { WifiOff } from 'lucide-react';

export default function OfflineSyncBanner({ pending, online }) {
  if (!pending) return null;

  return (
    <div className="mx-5 mt-3 px-3 py-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-200 text-sm flex items-center gap-2">
      <WifiOff className="w-4 h-4 flex-shrink-0" />
      <span>
        {pending} {pending === 1 ? 'set' : 'sets'} saved on this phone
        {online ? ' — syncing…' : '. Will sync when you have signal.'}
      </span>
    </div>
  );
}
