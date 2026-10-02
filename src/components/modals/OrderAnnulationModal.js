// src/components/modals/OrderAnnulationModal.js
import { useState } from 'react';
import { useToast } from '../ToastContainer';
import './OrderAnnulationModal.css';

function OrderAnnulationModal({ onClose, onConfirm, isLoading = false }) {
  const [reason, setReason] = useState('');
  const toast = useToast();

  const handleConfirm = async () => {
    if (!reason.trim()) {
      toast.warning('Debes ingresar un motivo de anulación');
      return;
    }

    if (onConfirm) {
      await onConfirm(reason);
    }
  };

  return (
    <div className="ui-modal-overlay annulation-overlay">
      <div
        className="ui-modal ui-modal--sm annulation-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="annulation-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ui-modal-header">
          <span className="ui-modal-icon ui-modal-icon--danger" aria-hidden="true">
            <span className="material-icons-round">delete_forever</span>
          </span>
          <div className="ui-modal-heading">
            <h3 id="annulation-title" className="ui-modal-title">Anular Orden</h3>
          </div>
          <button type="button" className="ui-icon-btn" onClick={onClose} disabled={isLoading} aria-label="Cerrar">
            <span className="material-icons-round" aria-hidden="true">close</span>
          </button>
        </div>

        <div className="ui-modal-body ui-modal-body--plain">
          <div className="ui-alert ui-alert--warning annulation-warning">
            <span className="material-icons-round" aria-hidden="true">warning</span>
            <p className="annulation-warning-text">
              Al anular esta orden, se restaurará el stock y se registrará como anulada.
              Si fue un error, podrás revertir la anulación indicando un motivo.
            </p>
          </div>

          <div className="ui-field">
            <label htmlFor="reason" className="ui-label">
              Motivo de Anulación <span className="ui-required">*</span>
            </label>
            <textarea
              id="reason"
              className="ui-textarea"
              rows="4"
              placeholder="Describe el motivo por el cual se anula esta orden..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isLoading}
            />
          </div>
        </div>

        <div className="ui-modal-footer">
          <button
            type="button"
            className="ui-btn ui-btn--secondary"
            onClick={onClose}
            disabled={isLoading}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="ui-btn ui-btn--danger"
            onClick={handleConfirm}
            disabled={isLoading || !reason.trim()}
          >
            {isLoading ? (
              <>
                <span className="ui-spinner" aria-hidden="true" />
                Anulando...
              </>
            ) : (
              'Anular Orden'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default OrderAnnulationModal;

