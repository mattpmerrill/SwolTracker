import { useState } from 'react';
import { Bot, Send, Loader2, X } from 'lucide-react';
import { getString, setString } from '../../utils/storage';
import { recordWeekSessionNote } from '../../lib/sessionNotes';

const DISMISS_PREFIX = 'swoltracker-postworkout-note:';

const QUICK_CHIPS = [
  { id: 'strong', label: 'Felt strong', text: 'Felt strong today. Energy and loads moved well.' },
  { id: 'form', label: 'Form focus', text: 'Want to focus on form next session — a few lifts felt off.' },
  { id: 'low', label: 'Low energy', text: 'Energy was low. Consider a lighter day or recovery if the trend continues.' },
  { id: 'progress', label: 'Ready to push', text: 'Hit all prescribed work. Ready to progress loads where it makes sense.' },
  { id: 'soreness', label: 'Sore / beat up', text: 'Still sore from prior sessions — flag for programming.' },
];

/**
 * Phase 3.6 — post-workout CTA to leave a note for the agent coach.
 * Shown when the current day is marked complete and the user has an agent key.
 * Dismissal is per week+day so it reappears next session.
 */
export default function PostWorkoutCoachPrompt({
  week,
  day,
  focusLabel = null,
  sending = false,
  onSend,
  onOpenFullBoard,
}) {
  const dismissKey = `${DISMISS_PREFIX}${week}-${day}`;
  const [dismissed, setDismissed] = useState(() => getString(dismissKey) === '1');
  const [custom, setCustom] = useState('');
  const [activeChip, setActiveChip] = useState(null);

  if (dismissed) return null;

  const handleDismiss = () => {
    setString(dismissKey, '1');
    setDismissed(true);
  };

  const buildMessage = (chipText = null) => {
    const base = chipText || custom.trim();
    if (!base) return null;
    const header = focusLabel
      ? `Post-workout note — Week ${week} ${day} (${focusLabel}):`
      : `Post-workout note — Week ${week} ${day}:`;
    return `${header}\n${base}`;
  };

  const handleChip = async (chip) => {
    setActiveChip(chip.id);
    const msg = buildMessage(chip.text);
    const ok = await onSend?.(msg);
    if (ok) {
      recordWeekSessionNote(week, day, chip.text, chip.label);
      handleDismiss();
    }
    setActiveChip(null);
  };

  const handleSendCustom = async () => {
    const msg = buildMessage();
    if (!msg) return;
    const ok = await onSend?.(msg);
    if (ok) {
      recordWeekSessionNote(week, day, custom.trim());
      setCustom('');
      handleDismiss();
    }
  };

  return (
    <div className="mt-4 mb-2 rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-cyan-500/10 via-zinc-900/80 to-teal-500/5 p-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center shrink-0">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-semibold text-white text-sm">How was training?</p>
            <p className="text-xs text-zinc-400">Send a note to your coach for the next check-in</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {QUICK_CHIPS.map((chip) => (
          <button
            key={chip.id}
            type="button"
            disabled={sending}
            onClick={() => handleChip(chip)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors disabled:opacity-50 ${
              activeChip === chip.id
                ? 'bg-cyan-500/25 border-cyan-400/50 text-cyan-200'
                : 'bg-zinc-800/80 border-zinc-700 text-zinc-300 hover:border-cyan-500/40 hover:text-cyan-200'
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSendCustom();
            }
          }}
          placeholder="Or type a quick note…"
          maxLength={500}
          disabled={sending}
          className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl py-2.5 px-3 focus:outline-none focus:border-cyan-500/50 transition-colors text-sm disabled:opacity-50"
        />
        <button
          type="button"
          onClick={handleSendCustom}
          disabled={sending || !custom.trim()}
          className="px-3.5 py-2.5 bg-gradient-to-r from-cyan-500 to-teal-600 text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:from-cyan-400 hover:to-teal-500 transition-all"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>

      {onOpenFullBoard && (
        <button
          type="button"
          onClick={onOpenFullBoard}
          className="mt-3 text-xs font-medium text-cyan-400 hover:underline underline-offset-2"
        >
          Open full Coach Board
        </button>
      )}
    </div>
  );
}
