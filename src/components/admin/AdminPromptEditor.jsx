import { useState, useEffect } from 'react';
import { FileText, Plus, Edit3, Trash2, Save, X, Loader2, CheckCircle, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';

const AdminPromptEditor = ({ db }) => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [expandedTemplates, setExpandedTemplates] = useState({});
  const [isCreating, setIsCreating] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ name: '', description: '', template: '' });

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const data = await db.getAllPromptTemplates();
      setTemplates(data || []);
    } catch (err) {
      console.error('Error loading templates:', err);
      setMessage({ type: 'error', text: 'Failed to load templates' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const toggleExpanded = (id) => {
    setExpandedTemplates(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleEditClick = (template) => {
    setEditingTemplate({ ...template });
    setExpandedTemplates(prev => ({ ...prev, [template.id]: true }));
  };

  const handleCancelEdit = () => {
    setEditingTemplate(null);
  };

  const handleSaveEdit = async () => {
    if (!editingTemplate) return;

    setSaving(true);
    setMessage(null);

    try {
      const success = await db.updatePromptTemplate(
        editingTemplate.id,
        editingTemplate.name,
        editingTemplate.description,
        editingTemplate.template
      );

      if (success) {
        setMessage({ type: 'success', text: 'Template updated successfully' });
        setEditingTemplate(null);
        await loadTemplates();
      } else {
        setMessage({ type: 'error', text: 'Failed to update template' });
      }
    } catch (err) {
      console.error('Error updating template:', err);
      setMessage({ type: 'error', text: err.message || 'Failed to update template' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (template) => {
    if (!confirm(`Are you sure you want to delete "${template.name}"? This cannot be undone.`)) {
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const success = await db.deletePromptTemplate(template.id);
      if (success) {
        setMessage({ type: 'success', text: 'Template deleted' });
        await loadTemplates();
      } else {
        setMessage({ type: 'error', text: 'Failed to delete template' });
      }
    } catch (err) {
      console.error('Error deleting template:', err);
      setMessage({ type: 'error', text: err.message || 'Failed to delete template' });
    } finally {
      setSaving(false);
    }
  };

  const handleCreateTemplate = async () => {
    if (!newTemplate.name || !newTemplate.template) {
      setMessage({ type: 'error', text: 'Name and template content are required' });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const id = await db.createPromptTemplate(
        newTemplate.name,
        newTemplate.description,
        newTemplate.template
      );

      if (id) {
        setMessage({ type: 'success', text: 'Template created successfully' });
        setNewTemplate({ name: '', description: '', template: '' });
        setIsCreating(false);
        await loadTemplates();
      } else {
        setMessage({ type: 'error', text: 'Failed to create template' });
      }
    } catch (err) {
      console.error('Error creating template:', err);
      setMessage({ type: 'error', text: err.message || 'Failed to create template' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-green-500" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">Prompt Templates</h2>
          <p className="text-zinc-500 mt-1">
            Manage AI prompt templates used for workout generation.
          </p>
        </div>
        {!isCreating && (
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-2 px-6 py-2.5 bg-zinc-800/50 hover:bg-zinc-800 text-emerald-400 rounded-xl text-sm font-bold border border-emerald-500/20 hover:border-emerald-500/40 transition-all shadow-lg shadow-emerald-500/5 hover:scale-[1.02] active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            New Template
          </button>
        )}
      </div>

      {/* Message */}
      {message && (
        <div className={`p-4 rounded-xl flex items-center gap-3 backdrop-blur-md border animate-in slide-in-from-top-2 duration-300 ${message.type === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/20 shadow-lg shadow-emerald-500/10'
            : 'bg-red-500/10 border-red-500/20 shadow-lg shadow-red-500/10'
          }`}>
          {message.type === 'success' ? (
            <CheckCircle className="w-5 h-5 text-emerald-500" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-500" />
          )}
          <span className={message.type === 'success' ? 'text-emerald-400' : 'text-red-400 font-medium'}>
            {message.text}
          </span>
        </div>
      )}

      {/* Create New Template */}
      {isCreating && (
        <div className="bg-zinc-900/50 backdrop-blur-xl rounded-2xl p-8 border border-white/5 shadow-xl shadow-black/20 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-lg font-semibold text-white">Create New Template</h3>
            <button
              onClick={() => {
                setIsCreating(false);
                setNewTemplate({ name: '', description: '', template: '' });
              }}
              className="p-2 hover:bg-zinc-800/50 rounded-xl transition-colors text-zinc-500 hover:text-zinc-300"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block mb-2">Name</label>
                <input
                  type="text"
                  value={newTemplate.name}
                  onChange={(e) => setNewTemplate(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., weekly_workout_generator"
                  className="w-full px-4 py-3 bg-zinc-950/50 rounded-xl border border-white/5 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block mb-2">Description</label>
                <input
                  type="text"
                  value={newTemplate.description}
                  onChange={(e) => setNewTemplate(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Brief description of function"
                  className="w-full px-4 py-3 bg-zinc-950/50 rounded-xl border border-white/5 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all text-sm"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block mb-2">Template Content</label>
              <textarea
                value={newTemplate.template}
                onChange={(e) => setNewTemplate(prev => ({ ...prev, template: e.target.value }))}
                placeholder="Enter your prompt template here..."
                className="w-full h-48 px-4 py-3 bg-zinc-950/50 rounded-xl border border-white/5 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all text-sm font-mono resize-none leading-relaxed"
              />
            </div>

            <button
              onClick={handleCreateTemplate}
              disabled={saving || !newTemplate.name || !newTemplate.template}
              className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-900/20 hover:shadow-emerald-900/40 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating Template...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Create Template
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Templates List */}
      <div className="space-y-4">
        {templates.length === 0 ? (
          <div className="text-center text-zinc-500 py-12 bg-zinc-900/50 border border-white/5 rounded-2xl flex flex-col items-center justify-center">
            <div className="p-4 bg-zinc-800/50 rounded-full mb-4">
              <FileText className="w-8 h-8 text-zinc-600" />
            </div>
            <p className="font-medium">No templates found</p>
            <p className="text-sm mt-1">Create your first prompt template to get started</p>
          </div>
        ) : (
          templates.map(template => (
            <div
              key={template.id}
              className="bg-zinc-900/50 backdrop-blur-xl rounded-2xl border border-white/5 overflow-hidden transition-all duration-300 hover:bg-zinc-800/50 hover:border-white/10 hover:shadow-xl hover:shadow-black/20 group"
            >
              {/* Template Header */}
              <div
                className="flex items-center justify-between p-5 cursor-pointer"
                onClick={() => toggleExpanded(template.id)}
              >
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-lg transition-colors ${expandedTemplates[template.id]
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-zinc-800/50 text-zinc-400 group-hover:bg-zinc-700/50 group-hover:text-zinc-300'
                    }`}>
                    {expandedTemplates[template.id] ? (
                      <ChevronDown className="w-5 h-5" />
                    ) : (
                      <ChevronRight className="w-5 h-5" />
                    )}
                  </div>

                  <div>
                    <h4 className="font-semibold text-white group-hover:text-emerald-400 transition-colors">{template.name}</h4>
                    <p className="text-xs text-zinc-500 mt-0.5">{template.description || 'No description'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => handleEditClick(template)}
                    disabled={saving}
                    className="p-2 hover:bg-zinc-700 rounded-lg transition-colors text-zinc-400 hover:text-white"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(template)}
                    disabled={saving}
                    className="p-2 hover:bg-red-500/20 rounded-lg transition-colors text-zinc-400 hover:text-red-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Expanded Content */}
              {expandedTemplates[template.id] && (
                <div className="border-t border-white/5 p-6 bg-zinc-950/30 animate-in slide-in-from-top-1 duration-200">
                  {editingTemplate?.id === template.id ? (
                    // Edit Mode
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block mb-2">Name</label>
                          <input
                            type="text"
                            value={editingTemplate.name}
                            onChange={(e) => setEditingTemplate(prev => ({ ...prev, name: e.target.value }))}
                            className="w-full px-4 py-3 bg-zinc-950/50 rounded-xl border border-white/5 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all text-sm"
                          />
                        </div>

                        <div>
                          <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block mb-2">Description</label>
                          <input
                            type="text"
                            value={editingTemplate.description || ''}
                            onChange={(e) => setEditingTemplate(prev => ({ ...prev, description: e.target.value }))}
                            className="w-full px-4 py-3 bg-zinc-950/50 rounded-xl border border-white/5 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all text-sm"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block mb-2">Template Content</label>
                        <textarea
                          value={editingTemplate.template}
                          onChange={(e) => setEditingTemplate(prev => ({ ...prev, template: e.target.value }))}
                          className="w-full h-64 px-4 py-3 bg-zinc-950/50 rounded-xl border border-white/5 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all text-sm font-mono resize-none leading-relaxed"
                        />
                      </div>

                      <div className="flex gap-4">
                        <button
                          onClick={handleCancelEdit}
                          disabled={saving}
                          className="flex-1 py-3 bg-zinc-800 text-white rounded-xl text-sm font-medium hover:bg-zinc-700 transition-colors border border-white/5"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveEdit}
                          disabled={saving}
                          className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-purple-900/20 hover:shadow-purple-900/40 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {saving ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            <>
                              <Save className="w-4 h-4" />
                              Save Changes
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ) : (
                    // View Mode
                    <div>
                      <div className="text-xs text-zinc-500 mb-3 font-mono">
                        Last Updated: {new Date(template.updated_at).toLocaleDateString()}
                      </div>
                      <pre className="bg-zinc-950/50 rounded-xl p-6 text-xs font-mono text-zinc-300 overflow-x-auto border border-white/5 leading-relaxed">
                        {template.template}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default AdminPromptEditor;
