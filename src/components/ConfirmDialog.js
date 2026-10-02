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
            <div className="confirm-overlay ui-modal-overlay" onClick={onCancel}>
                <div
                    className="confirm-dialog ui-modal ui-modal--sm"
                    role="alertdialog"
                    aria-modal="true"
                    aria-labelledby="confirm-dialog-title"
                    aria-describedby="confirm-dialog-message"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="confirm-header ui-modal-header">
                        <span className="ui-modal-icon" aria-hidden="true">
                            <span className="material-icons-round">help_outline</span>
                        </span>
                        <div className="ui-modal-heading">
                            <h3 id="confirm-dialog-title" className="ui-modal-title">{title}</h3>
                        </div>
                    </div>
                    <div className="confirm-body ui-modal-body ui-modal-body--plain">
                        <p id="confirm-dialog-message" className="confirm-message">{message}</p>
                        {requireReason && (
                            <div className="reason-input-group ui-field">
                                <label htmlFor="confirm-reason" className="ui-label">
                                    {reasonLabel} <span className="ui-required">*</span>
                                </label>
                                <textarea
                                    id="confirm-reason"
                                    className="ui-textarea"
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    placeholder={reasonPlaceholder}
                                    rows={4}
                                    required
                                />
                            </div>
                        )}
                    </div>
                    <div className="confirm-actions ui-modal-footer">
                        <button type="button" className="btn-cancel-confirm ui-btn ui-btn--secondary" onClick={onCancel}>
                            {cancelText}
                        </button>
                        <button
                            type="button"
                            className="btn-confirm ui-btn ui-btn--primary"
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
