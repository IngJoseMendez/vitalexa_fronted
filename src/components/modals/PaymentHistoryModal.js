// src/components/modals/PaymentHistoryModal.js
// Modal para ver el historial completo de pagos de una orden con timeline
import React, { useState, useEffect, useCallback } from 'react';
import paymentService from '../../api/paymentService';
import { useToast } from '../ToastContainer';
import { useConfirm } from '../ConfirmDialog';
import { formatCurrency, formatDate, formatDateTime, formatOrderLabel } from '../../utils/formatters';
import './PaymentHistoryModal.css';

export function PaymentHistoryModal({ isOpen, onClose, orderId, invoiceNumber, orderNumber, onPaymentUpdate, userRole }) {
    const [payments, setPayments] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showCancelled, setShowCancelled] = useState(true);
    const [processingPaymentId, setProcessingPaymentId] = useState(null);

    // Solo el OWNER puede anular/restaurar pagos
    const canManagePayments = userRole === 'ROLE_OWNER';

    const toast = useToast();
    const confirm = useConfirm();

    const fetchPayments = useCallback(async () => {
        if (!orderId) return;

        try {
            setLoading(true);
            const response = await paymentService.getOrderPayments(orderId);
            setPayments(response.data || []);
        } catch (error) {
            console.error('Error fetching payments:', error);
            toast.error('Error al cargar historial de pagos');
        } finally {
            setLoading(false);
        }
    }, [orderId, toast]);

    useEffect(() => {
        if (isOpen && orderId) {
            fetchPayments();
        }
    }, [isOpen, orderId, fetchPayments]);

    const handleCancelPayment = async (payment) => {
        const confirmed = await confirm({
            title: '¿Anular este pago?',
            message: `Se anulará el pago de $${formatCurrency(payment.amount)}. El pago quedará marcado como anulado para auditoría.`,
            requireReason: true,
            reasonLabel: 'Razón de anulación',
            reasonPlaceholder: 'Ej: Pago duplicado, error en el monto...'
        });

        if (!confirmed || !confirmed.reason) return;

        try {
            setProcessingPaymentId(payment.id);
            await paymentService.cancelPayment(payment.id, confirmed.reason);
            toast.success('Pago anulado correctamente');
            fetchPayments();
            if (onPaymentUpdate) onPaymentUpdate();
        } catch (error) {
            console.error('Error cancelling payment:', error);
            toast.error('Error al anular el pago: ' + (error.response?.data?.message || error.message));
        } finally {
            setProcessingPaymentId(null);
        }
    };

    const handleRestorePayment = async (payment) => {
        const confirmed = await confirm({
            title: '¿Restaurar este pago?',
            message: `Se restaurará el pago de $${formatCurrency(payment.amount)} y volverá a contar en el saldo.`
        });

        if (!confirmed) return;

        try {
            setProcessingPaymentId(payment.id);
            await paymentService.restorePayment(payment.id);
            toast.success('Pago restaurado correctamente');
            fetchPayments();
            if (onPaymentUpdate) onPaymentUpdate();
        } catch (error) {
            console.error('Error restoring payment:', error);
            toast.error('Error al restaurar el pago: ' + (error.response?.data?.message || error.message));
        } finally {
            setProcessingPaymentId(null);
        }
    };

    // Icono Material por método de pago (antes emojis)
    const getPaymentMethodIcon = (method) => {
        const icons = {
            EFECTIVO: 'payments',
            TRANSFERENCIA: 'account_balance',
            CHEQUE: 'request_quote',
            TARJETA: 'credit_card',
            CREDITO: 'account_balance_wallet',
            OTRO: 'sell'
        };
        return icons[method] || 'paid';
    };

    const filteredPayments = payments.filter(p => showCancelled || !p.isCancelled);

    if (!isOpen) return null;

    return (
        <div className="ui-modal-overlay phm-overlay" onClick={onClose}>
            <div
                className="ui-modal ui-modal--md payment-history-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="phm-title"
                onClick={e => e.stopPropagation()}
            >
                <div className="ui-modal-header">
                    <span className="ui-modal-icon" aria-hidden="true">
                        <span className="material-icons-round">history</span>
                    </span>
                    <div className="ui-modal-heading">
                        <h2 id="phm-title" className="ui-modal-title">
                            Historial de Pagos - {formatOrderLabel({ invoiceNumber, orderNumber, orderId })}
                        </h2>
                    </div>
                    <button type="button" className="ui-icon-btn" onClick={onClose} aria-label="Cerrar">
                        <span className="material-icons-round" aria-hidden="true">close</span>
                    </button>
                </div>

                <div className="phm-filters">
                    <label className="ui-switch ui-switch--plain phm-toggle">
                        <input
                            type="checkbox"
                            checked={showCancelled}
                            onChange={(e) => setShowCancelled(e.target.checked)}
                        />
                        <span className="ui-switch-track phm-toggle-slider">
                            <span className="ui-switch-thumb"></span>
                        </span>
                        <span className="ui-switch-text">
                            <span className="ui-switch-title phm-toggle-label">Mostrar pagos anulados</span>
                        </span>
                    </label>
                </div>

                <div className="ui-modal-body phm-body">
                    {loading ? (
                        <div className="ui-loading phm-state" role="status">
                            <span className="ui-spinner" aria-hidden="true"></span>
                            <p>Cargando pagos...</p>
                        </div>
                    ) : filteredPayments.length === 0 ? (
                        <div className="ui-empty phm-state">
                            <span className="material-icons-round ui-empty-icon" aria-hidden="true">receipt_long</span>
                            <p className="ui-empty-title">No hay pagos registrados</p>
                        </div>
                    ) : (
                        <ol className="phm-timeline ui-stagger">
                            {filteredPayments.map((payment) => (
                                <li
                                    key={payment.id}
                                    className={`phm-item ${payment.isCancelled ? 'is-cancelled' : ''}`}
                                >
                                    <span className="phm-dot" aria-hidden="true">
                                        <span className="material-icons-round">
                                            {payment.isCancelled ? 'cancel' : 'check_circle'}
                                        </span>
                                    </span>
                                    <article className="phm-card">
                                        <div className="phm-card-head">
                                            <div className="phm-card-title">
                                                <span className={`ui-badge ${payment.isCancelled ? 'ui-badge--danger' : 'ui-badge--success'}`}>
                                                    {payment.isCancelled ? 'ANULADO' : 'ACTIVO'}
                                                </span>
                                                {/* Monto en verde; anulado en rojo tachado */}
                                                <span className={`phm-amount ${payment.isCancelled ? 'ui-amount--danger' : 'ui-amount--success'}`}>
                                                    ${formatCurrency(payment.amount)}
                                                </span>
                                            </div>
                                            <span className="ui-badge ui-badge--neutral phm-method">
                                                <span className="material-icons-round" aria-hidden="true">
                                                    {getPaymentMethodIcon(payment.paymentMethod)}
                                                </span>
                                                {payment.paymentMethod}
                                            </span>
                                        </div>

                                        <div className="phm-rows">
                                            <div className="phm-row">
                                                <span className="phm-label">
                                                    <span className="material-icons-round" aria-hidden="true">event</span>
                                                    Fecha del pago:
                                                </span>
                                                <span className="phm-value is-strong">
                                                    {formatDate(payment.actualPaymentDate)}
                                                </span>
                                            </div>
                                            <div className="phm-row">
                                                <span className="phm-label">
                                                    <span className="material-icons-round" aria-hidden="true">schedule</span>
                                                    Registrado el:
                                                </span>
                                                <span className="phm-value">
                                                    {formatDateTime(payment.paymentDate)}
                                                </span>
                                            </div>
                                            <div className="phm-row">
                                                <span className="phm-label">
                                                    <span className="material-icons-round" aria-hidden="true">person</span>
                                                    Registrado por:
                                                </span>
                                                <span className="phm-value">{payment.registeredByUsername}</span>
                                            </div>

                                            {payment.notes && (
                                                <div className="phm-row">
                                                    <span className="phm-label">
                                                        <span className="material-icons-round" aria-hidden="true">notes</span>
                                                        Notas:
                                                    </span>
                                                    <span className="phm-value">{payment.notes}</span>
                                                </div>
                                            )}

                                            {payment.discountApplied > 0 && (
                                                <div className="phm-row">
                                                    <span className="phm-label">
                                                        <span className="material-icons-round" aria-hidden="true">sell</span>
                                                        Descuento aplicado:
                                                    </span>
                                                    <span className="phm-value is-strong">
                                                        ${formatCurrency(payment.discountApplied)}
                                                    </span>
                                                </div>
                                            )}

                                            {payment.isCancelled && (
                                                <div className="phm-cancel-info">
                                                    <div className="phm-row">
                                                        <span className="phm-label">
                                                            <span className="material-icons-round" aria-hidden="true">block</span>
                                                            Anulado el:
                                                        </span>
                                                        <span className="phm-value">
                                                            {formatDateTime(payment.cancelledAt)}
                                                        </span>
                                                    </div>
                                                    <div className="phm-row">
                                                        <span className="phm-label">
                                                            <span className="material-icons-round" aria-hidden="true">person</span>
                                                            Anulado por:
                                                        </span>
                                                        <span className="phm-value">{payment.cancelledByUsername}</span>
                                                    </div>
                                                    <div className="phm-row">
                                                        <span className="phm-label">
                                                            <span className="material-icons-round" aria-hidden="true">help_outline</span>
                                                            Razón:
                                                        </span>
                                                        <span className="phm-value">{payment.cancellationReason}</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div className="phm-card-actions">
                                            {!payment.isCancelled && canManagePayments && (
                                                <button
                                                    type="button"
                                                    className="ui-btn ui-btn--danger-ghost ui-btn--sm"
                                                    onClick={() => handleCancelPayment(payment)}
                                                    disabled={processingPaymentId === payment.id}
                                                >
                                                    <span className="material-icons-round" aria-hidden="true">cancel</span>
                                                    {processingPaymentId === payment.id ? 'Anulando...' : 'Anular Pago'}
                                                </button>
                                            )}

                                            {payment.isCancelled && canManagePayments && (
                                                <button
                                                    type="button"
                                                    className="ui-btn ui-btn--secondary ui-btn--sm"
                                                    onClick={() => handleRestorePayment(payment)}
                                                    disabled={processingPaymentId === payment.id}
                                                >
                                                    <span className="material-icons-round" aria-hidden="true">restore</span>
                                                    {processingPaymentId === payment.id ? 'Restaurando...' : 'Restaurar Pago'}
                                                </button>
                                            )}
                                        </div>
                                    </article>
                                </li>
                            ))}
                        </ol>
                    )}
                </div>

                <div className="ui-modal-footer">
                    <button type="button" className="ui-btn ui-btn--secondary" onClick={onClose}>
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}

export default PaymentHistoryModal;
