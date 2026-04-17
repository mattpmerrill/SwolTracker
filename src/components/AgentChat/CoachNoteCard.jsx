import { useState } from 'react';
import { Bot, X, ChevronRight } from 'lucide-react';
import { getString, setString } from '../../utils/storage';

const DISMISSED_KEY = 'swoltracker-dismissed-coach-note';

/**
 * Small card on the workout screen showing the latest coach note.
 * Dismissal is keyed to the note's id, so dismissing hides the card until
 * a new coach note arrives (which will have a different id).
 */
export default function CoachNoteCard({ note, onOpenChat }) {
  const [dismissedId, setDismissedId] = useState(() => getString(DISMISSED_KEY));

  if (!note || dismissedId === note.id) return null;

  const handleDismiss = () => {
    setString(DISMISSED_KEY, note.id);
    setDismissedId(note.id);
  };

  const isReview = note.message_type === 'weekly_review';
  const label = isReview ? 'Weekly Review' : 'Program Update';
  const accentFrom = isReview ? 'from-cyan-500/20' : 'from-orange-500/20';
  const accentTo = isReview ? 'to-teal-500/20' : 'to-amber-500/20';
  const borderColor = isReview ? 'border-cyan-500/30' : 'border-orange-500/30';
  const labelColor = isReview ? 'text-cyan-400' : 'text-orange-400';

  // Clean up literal \n and markdown for the preview
  const cleaned = note.content.replace(/\\n/g, ' ').replace(/\*\*/g, '');
  const truncated = cleaned.length > 120
    ? cleaned.slice(0, 120).trimEnd() + '...'
    : cleaned;

  const timeAgo = (date) => {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  return (
    <div className={`mb-4 bg-gradient-to-br ${accentFrom} ${accentTo} rounded-2xl border ${borderColor} p-4 relative`}>
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center shrink-0">
          <Bot className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0 pr-6">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-semibold uppercase tracking-wider ${labelColor}`}>{label}</span>
            {note.week_number && (
              <span className="text-xs text-zinc-500">Week {note.week_number}</span>
            )}
            <span className="text-xs text-zinc-600">{timeAgo(note.message_created_at)}</span>
          </div>
          <p className="text-sm text-zinc-300 leading-relaxed">{truncated}</p>
          <button
            onClick={onOpenChat}
            className={`mt-2 flex items-center gap-1 text-xs font-medium ${labelColor} hover:underline underline-offset-2`}
          >
            Read more <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
