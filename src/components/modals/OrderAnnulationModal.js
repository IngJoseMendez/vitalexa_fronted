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
    <div className="modal-overlay">
      <div className="modal-content annulation-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            <span className="material-icons-round" style={{ verticalAlign: 'middle', marginRight: '0.5rem', color: '#dc3545' }}>
              delete_forever
            </span>
            Anular Orden
          </h3>
          <button className="btn-close" onClick={onClose} disabled={isLoading}>
            <span className="material-icons-round">close</span>
          </button>
        </div>

        <div className="modal-body">
          <div className="warning-section">
            <span className="material-icons-round warning-icon">warning</span>
            <p className="warning-text">
              Al anular esta orden, se restaurará el stock y se registrará como anulada.
              Esta acción no puede ser revertida.
            </p>
          </div>

          <div className="form-group">
            <label htmlFor="reason" className="form-label">
              Motivo de Anulación <span className="required">*</span>
            </label>
            <textarea
              id="reason"
              className="form-control"
              rows="4"
              placeholder="Describe el motivo por el cual se anula esta orden..."
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
            className="btn btn-danger"
            onClick={handleConfirm}
            disabled={isLoading || !reason.trim()}
          >
            {isLoading ? (
              <>
                <span className="spinner-border" style={{ width: '0.9rem', height: '0.9rem', marginRight: '0.5rem' }} />
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

