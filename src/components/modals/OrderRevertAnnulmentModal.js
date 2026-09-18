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
    <div className="modal-overlay">
      <div className="modal-content revert-annulment-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            <span className="material-icons-round revert-title-icon">settings_backup_restore</span>
            Revertir Anulación
          </h3>
          <button className="btn-close" onClick={onClose} disabled={isLoading}>
            <span className="material-icons-round">close</span>
          </button>
        </div>

        <div className="modal-body">
          <div className="revert-info-section">
            <span className="material-icons-round revert-info-icon">info</span>
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

          <div className="form-group">
            <label htmlFor="revert-reason" className="form-label">
              Motivo de la reversión <span className="required">*</span>
            </label>
            <textarea
              id="revert-reason"
              className="form-control"
              rows="4"
              placeholder="Describe por qué se revierte la anulación de esta venta..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isLoading}
            />
          </div>
        </div>

        <div className="modal-footer">
          <button
            className="btn btn-secondary"
            onClick={onClose}
            disabled={isLoading}
          >
            Cancelar
          </button>
          <button
            className="btn btn-revert"
            onClick={handleConfirm}
            disabled={isLoading || !reason.trim()}
          >
            {isLoading ? (
              <>
                <span className="revert-spinner" />
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
