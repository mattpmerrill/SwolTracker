import { useState } from 'react';
import { X, LayoutDashboard, Key, FileText, ArrowLeft } from 'lucide-react';
import AdminDashboard from './AdminDashboard';
import AdminApiSettings from './AdminApiSettings';
import AdminPromptEditor from './AdminPromptEditor';

const AdminArea = ({ onClose, db }) => {
  const [activeSection, setActiveSection] = useState('dashboard');

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'api', label: 'API Settings', icon: Key },
    { id: 'prompts', label: 'Prompts', icon: FileText },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col text-white">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 via-transparent to-purple-500/5 pointer-events-none" />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between p-4 border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-2 hover:bg-zinc-800/50 rounded-xl transition-colors text-zinc-400 hover:text-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-orange-500/20 to-red-600/20 rounded-lg">
              <LayoutDashboard className="w-5 h-5 text-orange-500" />
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">Admin Area</h1>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-zinc-800/50 rounded-xl transition-colors text-zinc-400 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="relative z-10 flex border-b border-zinc-800/50 px-6 gap-6 bg-zinc-900/30 backdrop-blur-md">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSection(tab.id)}
            className={`flex items-center gap-2 py-4 text-sm font-medium transition-all relative
              ${activeSection === tab.id
                ? 'text-white'
                : 'text-zinc-500 hover:text-zinc-300'
              }`}
          >
            <tab.icon className={`w-4 h-4 ${activeSection === tab.id ? 'text-orange-500' : 'text-current'}`} />
            {tab.label}
            {activeSection === tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-orange-500 to-red-600 rounded-t-full" />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6 relative z-10">
        {activeSection === 'dashboard' && <AdminDashboard db={db} />}
        {activeSection === 'api' && <AdminApiSettings db={db} />}
        {activeSection === 'prompts' && <AdminPromptEditor db={db} />}
      </div>
    </div>
  );
};

export default AdminArea;
