// src/components/modals/CompleteOrderModal.js
import { useState } from 'react';
import { useToast } from '../ToastContainer';
import orderService from '../../api/orderService';
import './CompleteOrderModal.css';

/**
 * Modal para completar una orden con fecha de factura opcional.
 *
 * Props:
 *  - order      : objeto de la orden a completar
 *  - onClose    : función para cerrar el modal (sin completar)
 *  - onSuccess  : función llamada luego de completar exitosamente
 */
function CompleteOrderModal({ order, onClose, onSuccess }) {
    const [completedAt, setCompletedAt] = useState('');   // "YYYY-MM-DD" o vacío
    const [auditNote, setAuditNote] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const toast = useToast();

    const orderLabel = order?.invoiceNumber
        ? `Factura #${order.invoiceNumber}`
        : `#${(order?.id || '').substring(0, 8)}`;

    const handleConfirm = async () => {
        setIsLoading(true);
        try {
            // Construir payload: solo incluir campos si están rellenos
            const payload = {};
            if (completedAt) payload.completedAt = completedAt;
            if (auditNote.trim()) payload.auditNote = auditNote.trim();

            await orderService.completeOrder(order.id, payload);

            const dateLabel = completedAt
                ? new Date(completedAt + 'T00:00:00').toLocaleDateString('es-ES')
                : 'hoy';
            toast.success(`Orden completada exitosamente (fecha: ${dateLabel})`);
            onSuccess && onSuccess();
        } catch (error) {
            console.error('Error al completar orden:', error);
            toast.error('Error al completar la orden: ' + (error.response?.data?.message || 'Error desconocido'));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="modal-content complete-order-modal"
                onClick={(e) => e.stopPropagation()}
            >
                {/* ── HEADER ── */}
                <div className="modal-header">
                    <h3>
                        <span
                            className="material-icons-round"
                            style={{ verticalAlign: 'middle', marginRight: '0.5rem', color: '#10b981' }}
                        >
                            done_all
                        </span>
                        Completar Orden
                    </h3>
                    <button className="btn-close" onClick={onClose} disabled={isLoading}>
                        <span className="material-icons-round">close</span>
                    </button>
                </div>

                {/* ── BODY ── */}
                <div className="modal-body">
                    {/* Info de la orden */}
                    <div className="complete-info-section">
                        <span className="material-icons-round complete-info-icon">receipt_long</span>
                        <p className="complete-info-text">
                            <strong>{orderLabel} — {order?.cliente || 'Sin cliente'}</strong>
                            Al confirmar, la orden quedará en estado <strong>COMPLETADO</strong>. Puedes
                            asignar una fecha de factura diferente a la de hoy (útil para facturas emitidas
                            con retraso). Las metas y saldos se calcularán con la fecha elegida.
                        </p>
                    </div>

                    {/* Date picker */}
                    <div className="form-group">
                        <label className="form-label">
                            Fecha de factura
                            <span className="optional-badge">(opcional — vacío = hoy)</span>
                        </label>
                        <div className="date-input-row">
                            <input
                                type="date"
                                className="form-control"
                                value={completedAt}
                                onChange={(e) => setCompletedAt(e.target.value)}
                                disabled={isLoading}
                            />
                            {completedAt && (
                                <button
                                    className="btn-use-today"
                                    onClick={() => setCompletedAt('')}
                                    disabled={isLoading}
                                    title="Usar la fecha de hoy"
                                >
                                    <span className="material-icons-round" style={{ fontSize: '15px' }}>
                                        today
                                    </span>
                                    Usar hoy
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Nota de auditoría */}
                    <div className="form-group">
                        <label className="form-label">
                            Nota de auditoría
                            <span className="optional-badge">(opcional)</span>
                        </label>
                        <textarea
                            className="form-control"
                            rows={3}
                            placeholder="Ej: Factura de enero registrada con retraso..."
                            value={auditNote}
                            onChange={(e) => setAuditNote(e.target.value)}
                            disabled={isLoading}
                            style={{ resize: 'vertical' }}
                        />
                    </div>
                </div>

                {/* ── FOOTER ── */}
                <div className="modal-footer">
                    <button
                        className="btn btn-secondary"
                        onClick={onClose}
                        disabled={isLoading}
                    >
                        Cancelar
                    </button>
                    <button
                        className="btn btn-success"
                        onClick={handleConfirm}
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <>
                                <span className="complete-spinner" />
                                Completando...
                            </>
                        ) : (
                            <>
                                <span className="material-icons-round" style={{ fontSize: '18px' }}>done_all</span>
                                Completar Orden
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default CompleteOrderModal;
