import { lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import WorkoutScreen from '../screens/WorkoutScreen';

// Workout is the cold-open screen and stays in the entry chunk; the other
// tabs load on first visit so the first paint isn't paying for them.
const MaxesScreen = lazy(() => import('../screens/MaxesScreen'));
const ProgressScreen = lazy(() => import('../screens/ProgressScreen'));
const BuddiesScreen = lazy(() => import('../screens/BuddiesScreen'));

function ScreenFallback() {
  return (
    <div className="py-16 flex justify-center">
      <Loader2 className="w-7 h-7 animate-spin text-orange-500" />
    </div>
  );
}

/**
 * Dispatches to the active tab's screen. Pass-through for all screen props.
 */
export default function ScreenRouter({ activeTab, workoutProps, maxesProps, progressProps, buddiesProps }) {
  switch (activeTab) {
    case 'workout':
      return <WorkoutScreen {...workoutProps} />;
    case 'maxes':
      return <Suspense fallback={<ScreenFallback />}><MaxesScreen {...maxesProps} /></Suspense>;
    case 'progress':
      return <Suspense fallback={<ScreenFallback />}><ProgressScreen {...progressProps} /></Suspense>;
    case 'buddies':
      return <Suspense fallback={<ScreenFallback />}><BuddiesScreen {...buddiesProps} /></Suspense>;
    default:
      return null;
  }
}
