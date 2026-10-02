// src/components/modals/OrderRevertAnnulmentModal.js
import { useState } from 'react';
import { useToast } from '../ToastContainer';
import { getStatusLabel } from '../../utils/types';
import './OrderRevertAnnulmentModal.css';

// targetStatus: estado al que volverá la venta (si se conoce por el historial)
function OrderRevertAnnulmentModal({ targetStatus, onClose, onConfirm, isLoading = false }) {
  const [reason, setReason] = useState('');
  const toast = useToast();

  const handleConfirm = async () => {
    if (!reason.trim()) {
      toast.warning('Debes ingresar el motivo para revertir la anulación');
      return;
    }

    if (onConfirm) {
      await onConfirm(reason.trim());
    }
  };

  return (
    <div className="ui-modal-overlay revert-annulment-overlay">
      <div
        className="ui-modal ui-modal--sm revert-annulment-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="revert-annulment-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ui-modal-header">
          <span className="ui-modal-icon" aria-hidden="true">
            <span className="material-icons-round">settings_backup_restore</span>
          </span>
          <div className="ui-modal-heading">
            <h3 id="revert-annulment-title" className="ui-modal-title">Revertir Anulación</h3>
          </div>
          <button type="button" className="ui-icon-btn" onClick={onClose} disabled={isLoading} aria-label="Cerrar">
            <span className="material-icons-round" aria-hidden="true">close</span>
          </button>
        </div>

        <div className="ui-modal-body ui-modal-body--plain">
          <div className="ui-alert ui-alert--info revert-info-section">
            <span className="material-icons-round" aria-hidden="true">info</span>
            <div className="revert-info-text">
              <p>
                La venta volverá al estado{' '}
                {targetStatus
                  ? <strong>{getStatusLabel(targetStatus)}</strong>
                  : 'que tenía antes de anularse'}
                , se descontará otra vez del inventario el stock que devolvió la anulación
                y volverá a contar en metas y reportes.
              </p>
              <p>
                Los pagos que se anularon antes no se restauran solos: restáuralos
                desde "Pagos / Abonos" si corresponde.
              </p>
            </div>
          </div>

          <div className="ui-field">
            <label htmlFor="revert-reason" className="ui-label">
              Motivo de la reversión <span className="ui-required">*</span>
            </label>
            <textarea
              id="revert-reason"
              className="ui-textarea"
              rows="4"
              placeholder="Describe por qué se revierte la anulación de esta venta..."
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
            className="ui-btn ui-btn--primary"
            onClick={handleConfirm}
            disabled={isLoading || !reason.trim()}
          >
            {isLoading ? (
              <>
                <span className="ui-spinner" aria-hidden="true" />
                Revirtiendo...
              </>
            ) : (
              'Revertir Anulación'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default OrderRevertAnnulmentModal;
