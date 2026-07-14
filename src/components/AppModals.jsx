import { lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase, db } from '../lib/supabase';
import AgentChatPanel from './AgentChat/AgentChatPanel';
import { SettingsModal, EquipmentModal, AiGeneratorModal } from './Modals';
import { AddLiftModal } from './Maxes';
import ProfileArea from './Profile/ProfileArea';

const AdminArea = lazy(() => import('./admin/AdminArea'));

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
      <AgentChatPanel
        isOpen={agentChat.showPanel}
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

      <SettingsModal supabase={supabase} {...settings} />
      <EquipmentModal
        isOpen={equipment.isOpen}
        equipmentName={equipment.name}
        onNameChange={equipment.onNameChange}
        onAdd={equipment.onAdd}
        onClose={equipment.onClose}
      />
      <AiGeneratorModal {...aiGenerator} />
      <AddLiftModal
        isOpen={addLift.isOpen}
        liftName={addLift.name}
        liftWeight={addLift.weight}
        onLiftNameChange={addLift.onNameChange}
        onLiftWeightChange={addLift.onWeightChange}
        onAdd={addLift.onAdd}
        onClose={addLift.onClose}
      />

      {admin.isOpen && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-zinc-950 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-orange-500" /></div>}>
          <AdminArea onClose={admin.onClose} db={db} />
        </Suspense>
      )}

      {profile && <ProfileArea {...profile} />}
    </>
  );
}
