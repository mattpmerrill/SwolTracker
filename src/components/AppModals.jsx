import { lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase, db } from '../lib/supabase';

// Modals render null while closed, so mount-on-open + lazy keeps them out of
// the entry chunk without changing close behavior. Each loads once, on demand.
const AgentChatPanel = lazy(() => import('./AgentChat/AgentChatPanel'));
const SettingsModal = lazy(() => import('./Modals/SettingsModal'));
const EquipmentModal = lazy(() => import('./Modals/EquipmentModal'));
const AiGeneratorModal = lazy(() => import('./Modals/AiGeneratorModal'));
const AddLiftModal = lazy(() => import('./Maxes/AddLiftModal'));
const ProfileArea = lazy(() => import('./Profile/ProfileArea'));
const AdminArea = lazy(() => import('./admin/AdminArea'));

function OverlayFallback() {
  return (
    <div className="fixed inset-0 z-50 bg-zinc-950/60 flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
    </div>
  );
}

/**
 * Aggregated mount point for every app-level modal / overlay so the root
 * component stays focused on state wiring. Each prop bundle maps to one
 * modal; pass `null`/falsy `isOpen` to suppress.
 */
export default function AppModals({
  agentChat,          // hook-returned object from useAgentChat
  settings,           // { isOpen, onClose, ...settingsProps }
  equipment,          // { isOpen, name, onNameChange, onAdd, onClose }
  aiGenerator,        // full aiGen prop bundle
  addLift,            // { isOpen, name, weight, onNameChange, onWeightChange, onAdd, onClose }
  admin,              // { isOpen, onClose }
  profile,            // profileArea props (or null)
}) {
  return (
    <>
      {agentChat.showPanel && (
        <Suspense fallback={<OverlayFallback />}>
          <AgentChatPanel
            isOpen
            messages={agentChat.messages}
            loading={agentChat.loading}
            input={agentChat.input}
            sending={agentChat.sending}
            chatEndRef={agentChat.chatEndRef}
            onClose={agentChat.close}
            onInputChange={agentChat.setInput}
            onSend={agentChat.send}
            onDelete={agentChat.remove}
          />
        </Suspense>
      )}

      {settings.isOpen && (
        <Suspense fallback={<OverlayFallback />}>
          <SettingsModal supabase={supabase} {...settings} />
        </Suspense>
      )}

      {equipment.isOpen && (
        <Suspense fallback={<OverlayFallback />}>
          <EquipmentModal
            isOpen
            equipmentName={equipment.name}
            onNameChange={equipment.onNameChange}
            onAdd={equipment.onAdd}
            onClose={equipment.onClose}
          />
        </Suspense>
      )}

      {aiGenerator.isOpen && (
        <Suspense fallback={<OverlayFallback />}>
          <AiGeneratorModal {...aiGenerator} />
        </Suspense>
      )}

      {addLift.isOpen && (
        <Suspense fallback={<OverlayFallback />}>
          <AddLiftModal
            isOpen
            liftName={addLift.name}
            liftWeight={addLift.weight}
            onLiftNameChange={addLift.onNameChange}
            onLiftWeightChange={addLift.onWeightChange}
            onAdd={addLift.onAdd}
            onClose={addLift.onClose}
          />
        </Suspense>
      )}

      {admin.isOpen && (
        <Suspense fallback={<OverlayFallback />}>
          <AdminArea onClose={admin.onClose} db={db} />
        </Suspense>
      )}

      {profile && (
        <Suspense fallback={<OverlayFallback />}>
          <ProfileArea {...profile} />
        </Suspense>
      )}
    </>
  );
}
