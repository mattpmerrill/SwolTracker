import AgentFlow from './generating/AgentFlow';
import StandardFlow from './generating/StandardFlow';

export default function GeneratingStep({ onboarding }) {
  return onboarding.hasAgent ? <AgentFlow onboarding={onboarding} /> : <StandardFlow onboarding={onboarding} />;
}
