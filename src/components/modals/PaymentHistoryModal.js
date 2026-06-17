// src/components/modals/PaymentHistoryModal.js
// Modal para ver el historial completo de pagos de una orden con timeline
import React, { useState, useEffect, useCallback } from 'react';
import paymentService from '../../api/paymentService';
import { useToast } from '../ToastContainer';
import { useConfirm } from '../ConfirmDialog';
import { formatCurrency, formatDate, formatDateTime } from '../../utils/formatters';
import './PaymentHistoryModal.css';

export function PaymentHistoryModal({ isOpen, onClose, orderId, invoiceNumber, onPaymentUpdate, userRole }) {
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

    const getPaymentMethodIcon = (method) => {
        const icons = {
            EFECTIVO: '💵',
            TRANSFERENCIA: '🏦',
            CHEQUE: '📝',
            TARJETA: '💳',
            CREDITO: '📊',
            OTRO: '🔖'
        };
        return icons[method] || '💰';
    };

    const filteredPayments = payments.filter(p => showCancelled || !p.isCancelled);

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-container payment-history-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>
                        <span className="material-icons-round">history</span>
                        Historial de Pagos - Factura #{invoiceNumber || orderId}
                    </h2>
                    <button className="btn-close" onClick={onClose}>
                        <span className="material-icons-round">close</span>
                    </button>
                </div>

                <div className="modal-filters">
                    <label className="phm-toggle">
                        <input
                            type="checkbox"
                            checked={showCancelled}
                            onChange={(e) => setShowCancelled(e.target.checked)}
                        />
                        <span className="phm-toggle-slider"></span>
                        <span className="phm-toggle-label">Mostrar pagos anulados</span>
                    </label>
                </div>

                <div className="modal-body">
                    {loading ? (
                        <div className="loading-state">
                            <span className="material-icons-round spin">sync</span>
                            <p>Cargando pagos...</p>
                        </div>
                    ) : filteredPayments.length === 0 ? (
                        <div className="empty-state">
                            <span className="material-icons-round">receipt_long</span>
                            <p>No hay pagos registrados</p>
                        </div>
                    ) : (
                        <div className="payment-timeline">
                            {filteredPayments.map((payment) => (
                                <div
                                    key={payment.id}
                                    className={`timeline-item ${payment.isCancelled ? 'cancelled' : ''}`}
                                >
                                    <div className="timeline-icon">
                                        {payment.isCancelled ? '❌' : '✅'}
                                    </div>
                                    <div className="payment-card">
                                        <div className="payment-header">
                                            <div className="payment-title">
                                                <span className={`badge ${payment.isCancelled ? 'badge-danger' : 'badge-success'}`}>
                                                    {payment.isCancelled ? 'ANULADO' : 'ACTIVO'}
                                                </span>
                                                <span className="payment-amount">
                                                    ${formatCurrency(payment.amount)}
                                                </span>
                                            </div>
                                            <span className="payment-method-badge">
                                                {getPaymentMethodIcon(payment.paymentMethod)} {payment.paymentMethod}
                                            </span>
                                        </div>

                                        <div className="payment-body">
                                            <div className="info-row">
                                                <span className="info-label">📅 Fecha del pago:</span>
                                                <span className="info-value highlight">
                                                    {formatDate(payment.actualPaymentDate)}
                                                </span>
                                            </div>
                                            <div className="info-row">
                                                <span className="info-label">🕒 Registrado el:</span>
                                                <span className="info-value">
                                                    {formatDateTime(payment.paymentDate)}
                                                </span>
                                            </div>
                                            <div className="info-row">
                                                <span className="info-label">👤 Registrado por:</span>
                                                <span className="info-value">{payment.registeredByUsername}</span>
                                            </div>

                                            {payment.notes && (
                                                <div className="info-row">
                                                    <span className="info-label">📝 Notas:</span>
                                                    <span className="info-value">{payment.notes}</span>
                                                </div>
                                            )}

                                            {payment.discountApplied > 0 && (
                                                <div className="info-row">
                                                    <span className="info-label">💰 Descuento aplicado:</span>
                                                    <span className="info-value success">
                                                        ${formatCurrency(payment.discountApplied)}
                                                    </span>
                                                </div>
                                            )}

                                            {payment.isCancelled && (
                                                <div className="cancellation-info">
                                                    <div className="info-row">
                                                        <span className="info-label">🚫 Anulado el:</span>
                                                        <span className="info-value">
                                                            {formatDateTime(payment.cancelledAt)}
                                                        </span>
                                                    </div>
                                                    <div className="info-row">
                                                        <span className="info-label">👤 Anulado por:</span>
                                                        <span className="info-value">{payment.cancelledByUsername}</span>
                                                    </div>
                                                    <div className="info-row">
                                                        <span className="info-label">❓ Razón:</span>
                                                        <span className="info-value">{payment.cancellationReason}</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div className="payment-footer">
                                            {!payment.isCancelled && canManagePayments && (
                                                <button
                                                    className="btn btn-danger btn-sm"
                                                    onClick={() => handleCancelPayment(payment)}
                                                    disabled={processingPaymentId === payment.id}
                                                >
                                                    <span className="material-icons-round">cancel</span>
                                                    {processingPaymentId === payment.id ? 'Anulando...' : 'Anular Pago'}
                                                </button>
                                            )}

                                            {payment.isCancelled && canManagePayments && (
                                                <button
                                                    className="btn btn-warning btn-sm"
                                                    onClick={() => handleRestorePayment(payment)}
                                                    disabled={processingPaymentId === payment.id}
                                                >
                                                    <span className="material-icons-round">restore</span>
                                                    {processingPaymentId === payment.id ? 'Restaurando...' : 'Restaurar Pago'}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose}>
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}

export default PaymentHistoryModal;

