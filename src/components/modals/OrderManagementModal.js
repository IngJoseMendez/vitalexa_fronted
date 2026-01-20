import React, { useState, useEffect, useCallback } from 'react';
import paymentService from '../../api/paymentService';
import discountService from '../../api/discountService';
import { useToast } from '../ToastContainer';
import './OrderManagementModal.css';

// ===== ORDER DETAIL MODAL - ENHANCED WITH PAYMENTS & DISCOUNTS =====
export function OrderDetailModal({ order, onClose, onRefresh, userRole }) {
    const [payments, setPayments] = useState([]);
    const [discounts, setDiscounts] = useState([]);
    const [loadingPayments, setLoadingPayments] = useState(true);
    const [loadingDiscounts, setLoadingDiscounts] = useState(true);
    const [showPaymentForm, setShowPaymentForm] = useState(false);
    const [showDiscountForm, setShowDiscountForm] = useState(false);
    const toast = useToast();

    // Permissions
    const isOwner = userRole === 'ROLE_OWNER';
    const isAdmin = userRole === 'ROLE_ADMIN';
    const canManagePayments = isOwner; // Only Owner can manage payments
    const canManageDiscounts = isOwner || isAdmin; // Owner and Admin can manage discounts

    // Fetch payments for this order
    const fetchPayments = useCallback(async () => {
        try {
            setLoadingPayments(true);
            const orderId = order.id || order.orderId;
            const response = await paymentService.getOrderPayments(orderId);
            setPayments(response.data || []);
        } catch (error) {
            console.error('Error fetching payments:', error);
            // Only show error if it's not a 404 (no payments yet)
            if (error.response?.status !== 404) {
                toast.error('Error al cargar pagos');
            }
            setPayments([]);
        } finally {
            setLoadingPayments(false);
        }
    }, [order.id, order.orderId, toast]);

    // Fetch discounts for this order
    const fetchDiscounts = useCallback(async () => {
        try {
            setLoadingDiscounts(true);
            const orderId = order.id || order.orderId;
            const response = await discountService.getOrderDiscounts(orderId);
            setDiscounts(response.data || []);
        } catch (error) {
            console.error('Error fetching discounts:', error);
            if (error.response?.status !== 404) {
                toast.error('Error al cargar descuentos');
            }
            setDiscounts([]);
        } finally {
            setLoadingDiscounts(false);
        }
    }, [order.id, order.orderId, toast]);

    useEffect(() => {
        fetchPayments();
        fetchDiscounts();
    }, [fetchPayments, fetchDiscounts]);

    // Cancel a payment
    const handleCancelPayment = async (paymentId) => {
        if (!window.confirm('¿Está seguro de anular este pago?')) return;

        try {
            await paymentService.deletePayment(paymentId);
            toast.success('Pago anulado correctamente');
            fetchPayments();
            if (onRefresh) onRefresh();
        } catch (error) {
            console.error('Error canceling payment:', error);
            toast.error('Error al anular el pago');
        }
    };

    // Revoke a discount
    const handleRevokeDiscount = async (discountId) => {
        if (!window.confirm('¿Está seguro de revocar este descuento?')) return;

        try {
            await discountService.revokeDiscount(discountId);
            toast.success('Descuento revocado correctamente');
            fetchDiscounts();
            if (onRefresh) onRefresh();
        } catch (error) {
            console.error('Error revoking discount:', error);
            toast.error('Error al revocar el descuento');
        }
    };

    // Calculate payment summary
    const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    const orderTotal = parseFloat(order.discountedTotal || order.total || 0);
    const pendingBalance = orderTotal - totalPaid;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content-large order-detail-enhanced" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>
                        <span className="material-icons-round">receipt_long</span>
                        Detalle de Orden #{order.invoiceNumber || (order.id || order.orderId)?.substring(0, 8)}
                    </h3>
                    <button className="btn-close" onClick={onClose}>
                        <span className="material-icons-round">close</span>
                    </button>
                </div>

                <div className="order-detail-content">
                    {/* Order Info Section */}
                    <div className="detail-section order-summary-section">
                        <h4><span className="material-icons-round">info</span> Información General</h4>
                        <div className="info-grid">
                            <div className="info-item">
                                <span className="label">Estado:</span>
                                <span className={`badge status-${order.estado?.toLowerCase()}`}>{order.estado}</span>
                            </div>
                            <div className="info-item">
                                <span className="label">Vendedor:</span>
                                <span>{order.vendedor}</span>
                            </div>
                            <div className="info-item">
                                <span className="label">Cliente:</span>
                                <span>{order.cliente}</span>
                            </div>
                            <div className="info-item">
                                <span className="label">Fecha:</span>
                                <span>{new Date(order.fecha).toLocaleString()}</span>
                            </div>
                            <div className="info-item highlight">
                                <span className="label">Total Original:</span>
                                <span className="value">${parseFloat(order.total).toFixed(2)}</span>
                            </div>
                            {order.discountedTotal && order.discountedTotal !== order.total && (
                                <div className="info-item highlight success">
                                    <span className="label">Total con Descuento:</span>
                                    <span className="value">${parseFloat(order.discountedTotal).toFixed(2)}</span>
                                </div>
                            )}
                        </div>

                        {order.notas && (
                            <div className="notes-box">
                                <strong><span className="material-icons-round">note</span> Notas:</strong>
                                <p>{order.notas}</p>
                            </div>
                        )}
                    </div>

                    {/* Products Section */}
                    <div className="detail-section">
                        <h4><span className="material-icons-round">inventory_2</span> Productos ({order.items?.length || 0})</h4>
                        <div className="products-table-wrapper">
                            <table className="items-table">
                                <thead>
                                    <tr>
                                        <th>Producto</th>
                                        <th>Cantidad</th>
                                        <th>Precio Unit.</th>
                                        <th>Subtotal</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {order.items?.map((item, idx) => (
                                        <tr key={idx}>
                                            <td>{item.productName}</td>
                                            <td>{item.cantidad}</td>
                                            <td>${parseFloat(item.precioUnitario).toFixed(2)}</td>
                                            <td>${parseFloat(item.subtotal).toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Discounts Section */}
                    <div className="detail-section discounts-section">
                        <div className="section-header">
                            <h4><span className="material-icons-round">discount</span> Descuentos</h4>
                            {canManageDiscounts && (
                                <button
                                    className="btn-add-small"
                                    onClick={() => setShowDiscountForm(true)}
                                >
                                    <span className="material-icons-round">add</span> Añadir
                                </button>
                            )}
                        </div>

                        {loadingDiscounts ? (
                            <div className="loading-inline">Cargando descuentos...</div>
                        ) : discounts.length === 0 ? (
                            <div className="empty-inline">
                                <span className="material-icons-round">info</span>
                                No hay descuentos aplicados
                            </div>
                        ) : (
                            <div className="discounts-list">
                                {discounts.map(discount => (
                                    <div key={discount.id} className={`discount-item ${discount.status?.toLowerCase()}`}>
                                        <div className="discount-info">
                                            <span className="discount-percentage">{discount.percentage}%</span>
                                            <span className="discount-type">{discount.type}</span>
                                            <span className="discount-status">{discount.status}</span>
                                        </div>
                                        <div className="discount-meta">
                                            <span>Aplicado por: {discount.appliedByName || 'Sistema'}</span>
                                            {discount.revokedByName && (
                                                <span>Revocado por: {discount.revokedByName}</span>
                                            )}
                                        </div>
                                        {discount.status === 'APPLIED' && canManageDiscounts && (
                                            <button
                                                className="btn-revoke"
                                                onClick={() => handleRevokeDiscount(discount.id)}
                                            >
                                                <span className="material-icons-round">block</span> Revocar
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Payments Section - OWNER ONLY */}
                    <div className="detail-section payments-section">
                        <div className="section-header">
                            <h4><span className="material-icons-round">payments</span> Pagos / Abonos</h4>
                            {canManagePayments && (
                                <button
                                    className="btn-add-small primary"
                                    onClick={() => setShowPaymentForm(true)}
                                >
                                    <span className="material-icons-round">add</span> Registrar Pago
                                </button>
                            )}
                        </div>

                        {/* Payment Summary */}
                        <div className="payment-summary">
                            <div className="summary-item">
                                <span>Total Orden:</span>
                                <strong>${orderTotal.toFixed(2)}</strong>
                            </div>
                            <div className="summary-item paid">
                                <span>Total Pagado:</span>
                                <strong>${totalPaid.toFixed(2)}</strong>
                            </div>
                            <div className={`summary-item ${pendingBalance <= 0.01 ? 'success' : 'warning'}`}>
                                <span>Saldo Pendiente:</span>
                                <strong>${pendingBalance.toFixed(2)}</strong>
                            </div>
                        </div>

                        {loadingPayments ? (
                            <div className="loading-inline">Cargando pagos...</div>
                        ) : payments.length === 0 ? (
                            <div className="empty-inline">
                                <span className="material-icons-round">info</span>
                                No hay pagos registrados
                            </div>
                        ) : (
                            <div className="payments-list">
                                {payments.map(payment => (
                                    <div key={payment.id} className="payment-item">
                                        <div className="payment-main">
                                            <span className="payment-amount">${parseFloat(payment.amount).toFixed(2)}</span>
                                            <span className="payment-date">
                                                {new Date(payment.paymentDate).toLocaleDateString()}
                                            </span>
                                            {payment.withinDeadline && (
                                                <span className="badge-deadline">
                                                    <span className="material-icons-round">schedule</span> En plazo
                                                </span>
                                            )}
                                        </div>
                                        <div className="payment-meta">
                                            {payment.discountApplied > 0 && (
                                                <span>Descuento: {payment.discountApplied}%</span>
                                            )}
                                            {payment.notes && <span>Notas: {payment.notes}</span>}
                                            <span>Registrado por: {payment.registeredByName || 'Sistema'}</span>
                                        </div>
                                        {canManagePayments && (
                                            <button
                                                className="btn-cancel-payment"
                                                onClick={() => handleCancelPayment(payment.id)}
                                            >
                                                <span className="material-icons-round">delete_outline</span>
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Payment Form Modal */}
                {showPaymentForm && (
                    <PaymentFormModal
                        orderId={order.id || order.orderId}
                        orderTotal={orderTotal}
                        totalPaid={totalPaid}
                        onClose={() => setShowPaymentForm(false)}
                        onSuccess={() => {
                            setShowPaymentForm(false);
                            fetchPayments();
                            if (onRefresh) onRefresh();
                        }}
                    />
                )}

                {/* Discount Form Modal */}
                {showDiscountForm && (
                    <OwnerDiscountFormModal
                        orderId={order.id || order.orderId}
                        onClose={() => setShowDiscountForm(false)}
                        onSuccess={() => {
                            setShowDiscountForm(false);
                            fetchDiscounts();
                            if (onRefresh) onRefresh();
                        }}
                    />
                )}
            </div>
        </div>
    );
}

// ===== PAYMENT FORM MODAL =====
function PaymentFormModal({ orderId, orderTotal, totalPaid, onClose, onSuccess }) {
    const [formData, setFormData] = useState({
        amount: '',
        withinDeadline: true,
        discountApplied: '',
        notes: ''
    });
    const [saving, setSaving] = useState(false);
    const toast = useToast();

    const pendingBalance = orderTotal - totalPaid;

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!formData.amount || parseFloat(formData.amount) <= 0) {
            toast.warning('Ingrese un monto válido');
            return;
        }

        try {
            setSaving(true);
            await paymentService.createPayment({
                orderId,
                amount: parseFloat(formData.amount),
                withinDeadline: formData.withinDeadline,
                discountApplied: formData.discountApplied ? parseFloat(formData.discountApplied) : null,
                notes: formData.notes || null
            });
            toast.success('Pago registrado correctamente');
            onSuccess();
        } catch (error) {
            console.error('Error creating payment:', error);
            toast.error('Error al registrar el pago: ' + (error.response?.data?.message || error.message));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="modal-overlay nested" onClick={onClose}>
            <div className="modal-content form-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3><span className="material-icons-round">payments</span> Registrar Pago</h3>
                    <button className="btn-close" onClick={onClose}>
                        <span className="material-icons-round">close</span>
                    </button>
                </div>

                <div className="payment-context">
                    <div className="context-item">
                        <span>Total Orden:</span>
                        <strong>${orderTotal.toFixed(2)}</strong>
                    </div>
                    <div className="context-item">
                        <span>Ya Pagado:</span>
                        <strong>${totalPaid.toFixed(2)}</strong>
                    </div>
                    <div className="context-item highlight">
                        <span>Saldo Pendiente:</span>
                        <strong>${pendingBalance.toFixed(2)}</strong>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="payment-form">
                    <div className="form-group">
                        <label>Monto del Pago *</label>
                        <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={formData.amount}
                            onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                            placeholder={`Máximo sugerido: $${pendingBalance.toFixed(2)}`}
                            required
                        />
                    </div>

                    <div className="form-group checkbox">
                        <input
                            type="checkbox"
                            id="withinDeadline"
                            checked={formData.withinDeadline}
                            onChange={(e) => setFormData({ ...formData, withinDeadline: e.target.checked })}
                        />
                        <label htmlFor="withinDeadline">
                            <span className="material-icons-round">schedule</span>
                            Pago dentro del plazo establecido
                        </label>
                    </div>

                    <div className="form-group">
                        <label>Descuento Aplicado (%) <small>- Opcional</small></label>
                        <input
                            type="number"
                            step="0.1"
                            min="0"
                            max="100"
                            value={formData.discountApplied}
                            onChange={(e) => setFormData({ ...formData, discountApplied: e.target.value })}
                            placeholder="Ej: 5"
                        />
                    </div>

                    <div className="form-group">
                        <label>Notas <small>- Opcional</small></label>
                        <textarea
                            value={formData.notes}
                            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            placeholder="Método de pago, referencia, observaciones..."
                            rows="2"
                        />
                    </div>

                    <div className="form-actions">
                        <button type="button" className="btn-cancel" onClick={onClose}>Cancelar</button>
                        <button type="submit" className="btn-save" disabled={saving}>
                            {saving ? 'Guardando...' : 'Registrar Pago'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ===== OWNER DISCOUNT FORM MODAL =====
function OwnerDiscountFormModal({ orderId, onClose, onSuccess }) {
    const [percentage, setPercentage] = useState('');
    const [saving, setSaving] = useState(false);
    const toast = useToast();

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!percentage || parseFloat(percentage) <= 0 || parseFloat(percentage) > 100) {
            toast.warning('Ingrese un porcentaje válido (1-100)');
            return;
        }

        try {
            setSaving(true);
            await discountService.addOwnerDiscount({
                orderId,
                percentage: parseFloat(percentage),
                reason: 'Descuento adicional por Owner'
            });
            toast.success('Descuento añadido correctamente');
            onSuccess();
        } catch (error) {
            console.error('Error adding discount:', error);
            toast.error('Error al añadir descuento: ' + (error.response?.data?.message || error.message));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="modal-overlay nested" onClick={onClose}>
            <div className="modal-content form-modal small" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3><span className="material-icons-round">discount</span> Añadir Descuento</h3>
                    <button className="btn-close" onClick={onClose}>
                        <span className="material-icons-round">close</span>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="discount-form">
                    <div className="form-group">
                        <label>Porcentaje de Descuento *</label>
                        <div className="input-with-suffix">
                            <input
                                type="number"
                                step="0.1"
                                min="0.1"
                                max="100"
                                value={percentage}
                                onChange={(e) => setPercentage(e.target.value)}
                                placeholder="Ej: 5"
                                required
                            />
                            <span className="suffix">%</span>
                        </div>
                    </div>

                    <div className="form-actions">
                        <button type="button" className="btn-cancel" onClick={onClose}>Cancelar</button>
                        <button type="submit" className="btn-save" disabled={saving}>
                            {saving ? 'Guardando...' : 'Aplicar Descuento'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default OrderDetailModal;
