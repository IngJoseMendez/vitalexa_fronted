import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import '../styles/ToastContainer.css';

const ToastContext = createContext();

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within ToastProvider');
    }
    return context;
};

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.filter(toast => toast.id !== id));
    }, []);

    const addToast = useCallback((message, type = 'info', duration = 4000) => {
        const id = Date.now() + Math.random();
        const newToast = { id, message, type, duration };

        setToasts(prev => [...prev, newToast]);

        // Auto-remove after duration
        setTimeout(() => {
            removeToast(id);
        }, duration);

        return id;
    }, [removeToast]);

    const toast = useMemo(() => ({
        success: (message, duration) => addToast(message, 'success', duration),
        error: (message, duration) => addToast(message, 'error', duration),
        warning: (message, duration) => addToast(message, 'warning', duration),
        info: (message, duration) => addToast(message, 'info', duration),
    }), [addToast]);

    return (
        <ToastContext.Provider value={toast}>
            {children}
            <div className="toast-container" aria-live="polite">
                {toasts.map((toast) => (
                    <Toast key={toast.id} {...toast} onClose={() => removeToast(toast.id)} />
                ))}
            </div>
        </ToastContext.Provider>
    );
}

function Toast({ message, type, duration, onClose }) {
    // Icono Material según el tipo (antes eran caracteres ✓ ✕ ⚠ ⓘ)
    const getIcon = () => {
        switch (type) {
            case 'success': return 'check_circle';
            case 'error': return 'error';
            case 'warning': return 'warning';
            case 'info': return 'info';
            default: return 'info';
        }
    };

    // Barra fina con el tiempo restante: se vacía en la misma duración con la que addToast
    // programa el cierre (solo presentación; el cierre sigue siendo ese setTimeout)
    const showProgress = Number.isFinite(duration) && duration > 0;

    return (
        <div className={`toast toast-${type}`} onClick={onClose} role={type === 'error' ? 'alert' : 'status'}>
            <div className="toast-icon">
                <span className="material-icons-round" aria-hidden="true">{getIcon()}</span>
            </div>
            <div className="toast-message">{message}</div>
            <button type="button" className="toast-close" onClick={onClose} aria-label="Cerrar">
                <span className="material-icons-round" aria-hidden="true">close</span>
            </button>
            {showProgress && (
                <span
                    className="toast-progress"
                    style={{ '--toast-duration': `${duration}ms` }}
                    aria-hidden="true"
                />
            )}
        </div>
    );
}
