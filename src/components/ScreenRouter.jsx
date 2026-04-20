import { WorkoutScreen, MaxesScreen, ProgressScreen, BuddiesScreen } from '../screens';

/**
 * Dispatches to the active tab's screen. Pass-through for all screen props.
 */
export default function ScreenRouter({ activeTab, workoutProps, maxesProps, progressProps, buddiesProps }) {
  switch (activeTab) {
    case 'workout':  return <WorkoutScreen {...workoutProps} />;
    case 'maxes':    return <MaxesScreen {...maxesProps} />;
    case 'progress': return <ProgressScreen {...progressProps} />;
    case 'buddies':  return <BuddiesScreen {...buddiesProps} />;
    default:         return null;
  }
}
