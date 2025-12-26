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

    const confirm = useCallback(({ title, message, confirmText = 'Aceptar', cancelText = 'Cancelar' }) => {
        return new Promise((resolve) => {
            setDialog({
                title,
                message,
                confirmText,
                cancelText,
                onConfirm: () => {
                    setDialog(null);
                    resolve(true);
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

function ConfirmDialog({ title, message, confirmText, cancelText, onConfirm, onCancel }) {
    return (
        <>
            <div className="confirm-overlay" onClick={onCancel} />
            <div className="confirm-dialog">
                <div className="confirm-header">
                    <h3>{title}</h3>
                </div>
                <div className="confirm-body">
                    <p>{message}</p>
                </div>
                <div className="confirm-actions">
                    <button className="btn-cancel-confirm" onClick={onCancel}>
                        {cancelText}
                    </button>
                    <button className="btn-confirm" onClick={onConfirm}>
                        {confirmText}
                    </button>
                </div>
            </div>
        </>
    );
}
