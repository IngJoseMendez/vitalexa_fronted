import React, { createContext, useContext, useState, useCallback } from 'react';
import '../styles/ConfirmDialog.css';

const ConfirmContext = createContext();

export const useConfirm = () => {
    const context = useContext(ConfirmContext);
    if (!context) {
        throw new Error('useConfirm must be used within ConfirmProvider');
    }
    return context;
};

export function ConfirmProvider({ children }) {
    const [dialog, setDialog] = useState(null);

    const confirm = useCallback(({
        title,
        message,
        confirmText = 'Aceptar',
        cancelText = 'Cancelar',
        requireReason = false,
        reasonLabel = 'Razón',
        reasonPlaceholder = 'Ingrese la razón...'
    }) => {
        return new Promise((resolve) => {
            setDialog({
                title,
                message,
                confirmText,
                cancelText,
                requireReason,
                reasonLabel,
                reasonPlaceholder,
                onConfirm: (reason) => {
                    setDialog(null);
                    resolve(requireReason ? { confirmed: true, reason } : true);
                },
                onCancel: () => {
                    setDialog(null);
                    resolve(false);
                }
            });
        });
    }, []);

    return (
        <ConfirmContext.Provider value={confirm}>
            {children}
            {dialog && <ConfirmDialog {...dialog} />}
        </ConfirmContext.Provider>
    );
}

function ConfirmDialog({
    title,
    message,
    confirmText,
    cancelText,
    requireReason,
    reasonLabel,
    reasonPlaceholder,
    onConfirm,
    onCancel
}) {
    const [reason, setReason] = useState('');

    const handleConfirm = () => {
        if (requireReason && !reason.trim()) {
            return; // No permitir confirmar sin razón si es requerida
        }
        onConfirm(requireReason ? reason : null);
    };

    return (
        <>
            <div className="confirm-overlay" onClick={onCancel}>
                <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
                    <div className="confirm-header">
                        <h3>{title}</h3>
                    </div>
                    <div className="confirm-body">
                        <p>{message}</p>
                        {requireReason && (
                            <div className="reason-input-group">
                                <label htmlFor="confirm-reason">{reasonLabel} *</label>
                                <textarea
                                    id="confirm-reason"
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    placeholder={reasonPlaceholder}
                                    rows={4}
                                    required
                                    style={{
                                        width: '100%',
                                        padding: '0.75rem',
                                        borderRadius: '8px',
                                        border: '1px solid #e5e7eb',
                                        fontSize: '0.95rem',
                                        marginTop: '0.5rem',
                                        resize: 'vertical',
                                        fontFamily: 'inherit'
                                    }}
                                />
                            </div>
                        )}
                    </div>
                    <div className="confirm-actions">
                        <button className="btn-cancel-confirm" onClick={onCancel}>
                            {cancelText}
                        </button>
                        <button
                            className="btn-confirm"
                            onClick={handleConfirm}
                            disabled={requireReason && !reason.trim()}
                        >
                            {confirmText}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}
