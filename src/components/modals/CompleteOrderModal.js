// src/components/modals/CompleteOrderModal.js
import { useState } from 'react';
import { useToast } from '../ToastContainer';
import orderService from '../../api/orderService';
import { formatOrderLabel } from '../../utils/formatters';
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

    // "Pedido P-123" (aún sin factura: la factura se asigna al completar)
    const orderLabel = formatOrderLabel(order);

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
        <div className="ui-modal-overlay complete-order-overlay" onClick={onClose}>
            <div
                className="ui-modal ui-modal--sm complete-order-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="complete-order-title"
                onClick={(e) => e.stopPropagation()}
            >
                {/* ── HEADER ── */}
                <div className="ui-modal-header">
                    <span className="ui-modal-icon ui-modal-icon--success" aria-hidden="true">
                        <span className="material-icons-round">done_all</span>
                    </span>
                    <div className="ui-modal-heading">
                        <h3 id="complete-order-title" className="ui-modal-title">Completar Orden</h3>
                    </div>
                    <button type="button" className="ui-icon-btn" onClick={onClose} disabled={isLoading} aria-label="Cerrar">
                        <span className="material-icons-round" aria-hidden="true">close</span>
                    </button>
                </div>

                {/* ── BODY ── */}
                <div className="ui-modal-body ui-modal-body--plain">
                    {/* Info de la orden */}
                    <div className="ui-alert ui-alert--info complete-info-section">
                        <span className="material-icons-round" aria-hidden="true">receipt_long</span>
                        <p className="complete-info-text">
                            <strong className="ui-alert-title">{orderLabel} — {order?.cliente || 'Sin cliente'}</strong>
                            Al confirmar, la orden quedará en estado <strong>COMPLETADO</strong>. Puedes
                            asignar una fecha de factura diferente a la de hoy (útil para facturas emitidas
                            con retraso). Las metas y saldos se calcularán con la fecha elegida.
                        </p>
                    </div>

                    {/* Date picker */}
                    <div className="ui-field">
                        <label className="ui-label" htmlFor="complete-order-date">
                            Fecha de factura
                            <span className="ui-optional complete-optional">(opcional — vacío = hoy)</span>
                        </label>
                        <div className="complete-date-row">
                            <input
                                id="complete-order-date"
                                type="date"
                                className="ui-input"
                                value={completedAt}
                                onChange={(e) => setCompletedAt(e.target.value)}
                                disabled={isLoading}
                            />
                            {completedAt && (
                                <button
                                    type="button"
                                    className="ui-btn ui-btn--secondary complete-use-today"
                                    onClick={() => setCompletedAt('')}
                                    disabled={isLoading}
                                    title="Usar la fecha de hoy"
                                >
                                    <span className="material-icons-round" aria-hidden="true">
                                        today
                                    </span>
                                    Usar hoy
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Nota de auditoría */}
                    <div className="ui-field">
                        <label className="ui-label" htmlFor="complete-order-note">
                            Nota de auditoría
                            <span className="ui-optional complete-optional">(opcional)</span>
                        </label>
                        <textarea
                            id="complete-order-note"
                            className="ui-textarea"
                            rows={3}
                            placeholder="Ej: Factura de enero registrada con retraso..."
                            value={auditNote}
                            onChange={(e) => setAuditNote(e.target.value)}
                            disabled={isLoading}
                        />
                    </div>
                </div>

                {/* ── FOOTER ── */}
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
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <>
                                <span className="ui-spinner" aria-hidden="true" />
                                Completando...
                            </>
                        ) : (
                            <>
                                <span className="material-icons-round" aria-hidden="true">done_all</span>
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
