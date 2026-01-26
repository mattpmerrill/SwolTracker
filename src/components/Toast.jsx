import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';

// Toast Context
const ToastContext = createContext(null);

/**
 * Hook to access toast notifications
 * @returns {Object} Toast methods: success, error, warning, info
 */
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

/**
 * Toast Provider Component - Wrap your app with this to enable toasts
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((toast) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, ...toast }]);

    // Auto-dismiss after duration (default 5s, errors stay longer)
    const duration = toast.duration || (toast.type === 'error' ? 8000 : 5000);
    setTimeout(() => {
      removeToast(id);
    }, duration);

    return id;
  }, [removeToast]);

  // Convenience methods
  const toast = {
    success: useCallback((message, options = {}) =>
      addToast({ type: 'success', message, ...options }), [addToast]),
    error: useCallback((message, options = {}) =>
      addToast({ type: 'error', message, ...options }), [addToast]),
    warning: useCallback((message, options = {}) =>
      addToast({ type: 'warning', message, ...options }), [addToast]),
    info: useCallback((message, options = {}) =>
      addToast({ type: 'info', message, ...options }), [addToast]),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </ToastContext.Provider>
  );
}

/**
 * Toast Container - Displays all active toasts
 */
function ToastContainer({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-20 left-0 right-0 z-[100] flex flex-col items-center gap-2 px-4 pointer-events-none">
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => onDismiss(toast.id)} />
      ))}
    </div>
  );
}

/**
 * Individual Toast Item
 */
function ToastItem({ toast, onDismiss }) {
  const [isExiting, setIsExiting] = useState(false);
  const [isEntering, setIsEntering] = useState(true);

  useEffect(() => {
    // Trigger enter animation
    const enterTimer = setTimeout(() => setIsEntering(false), 50);
    return () => clearTimeout(enterTimer);
  }, []);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(onDismiss, 200);
  };

  const config = {
    success: {
      icon: CheckCircle,
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
      text: 'text-emerald-400',
      iconColor: 'text-emerald-500',
      shadow: 'shadow-emerald-500/10'
    },
    error: {
      icon: AlertCircle,
      bg: 'bg-red-500/10',
      border: 'border-red-500/20',
      text: 'text-red-400',
      iconColor: 'text-red-500',
      shadow: 'shadow-red-500/10'
    },
    warning: {
      icon: AlertTriangle,
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20',
      text: 'text-amber-400',
      iconColor: 'text-amber-500',
      shadow: 'shadow-amber-500/10'
    },
    info: {
      icon: Info,
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/20',
      text: 'text-blue-400',
      iconColor: 'text-blue-500',
      shadow: 'shadow-blue-500/10'
    }
  };

  const { icon: Icon, bg, border, text, iconColor, shadow } = config[toast.type] || config.info;

  return (
    <div
      className={`
        pointer-events-auto max-w-md w-full
        ${bg} ${border} border backdrop-blur-xl
        rounded-xl shadow-xl ${shadow}
        p-4 flex items-start gap-3
        transition-all duration-200 ease-out
        ${isExiting ? 'opacity-0 translate-y-2 scale-95' : 'opacity-100 translate-y-0 scale-100'}
        ${isEntering ? 'opacity-0 translate-y-4 scale-95' : ''}
      `}
    >
      <Icon className={`w-5 h-5 ${iconColor} flex-shrink-0 mt-0.5`} />
      <p className={`${text} text-sm font-medium flex-1`}>{toast.message}</p>
      <button
        onClick={handleDismiss}
        className="text-zinc-500 hover:text-zinc-300 transition-colors p-1 -m-1 rounded-lg hover:bg-white/5"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export default ToastProvider;
