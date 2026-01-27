import React, { useState, useEffect, useCallback } from 'react';
import paymentService from '../../api/paymentService';
import discountService from '../../api/discountService';
import { useToast } from '../ToastContainer';
import AssortmentSelectionModal from './AssortmentSelectionModal';
import client from '../../api/client';
import { OrdenStatus } from '../../utils/types';
import './OrderManagementModal.css';

// ===== ORDER DETAIL MODAL - ENHANCED WITH PAYMENTS & DISCOUNTS =====
export function OrderDetailModal({ order, onClose, onRefresh, userRole }) {
    const [payments, setPayments] = useState([]);
    const [discounts, setDiscounts] = useState([]);
    const [loadingPayments, setLoadingPayments] = useState(true);
    const [loadingDiscounts, setLoadingDiscounts] = useState(true);
    const [showPaymentForm, setShowPaymentForm] = useState(false);

    const [showDiscountForm, setShowDiscountForm] = useState(false);
    const [showAssortmentModal, setShowAssortmentModal] = useState(false);
    const [selectedPromotionForAssortment, setSelectedPromotionForAssortment] = useState(null);
    const [editingItemEta, setEditingItemEta] = useState(null);
    const [etaForm, setEtaForm] = useState({ date: '', note: '' });
    const toast = useToast();

    const [currentOrder, setCurrentOrder] = useState(order);
    const [loadingOrder, setLoadingOrder] = useState(false); // New loading state for order details

    // Permissions
    const isOwner = userRole === 'ROLE_OWNER';
    const isAdmin = userRole === 'ROLE_ADMIN';
    const canManagePayments = isOwner; // Only Owner can manage payments
    const canManageDiscounts = isOwner || isAdmin; // Owner and Admin can manage discounts

    // Fetch full order details (to ensure we have IDs for items)
    const fetchOrderDetails = useCallback(async () => {
        const orderId = order.id || order.orderId;
        if (!orderId) return;

        try {
            setLoadingOrder(true);
            const response = await client.get(`/admin/orders/${orderId}`);
            // Merge with existing order prop to keep any client-side info if needed, but prioritize server data
            setCurrentOrder(response.data);
            console.log("📦 Full order details loaded:", response.data);
        } catch (error) {
            console.error('Error fetching order details:', error);
            // Fallback to prop order is already handled by initial state, but toast if critical
        } finally {
            setLoadingOrder(false);
        }
    }, [order.id, order.orderId]);

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
        fetchOrderDetails();
        fetchPayments();
        fetchDiscounts();
    }, [fetchOrderDetails, fetchPayments, fetchDiscounts]);

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

    // Handle ETA Update
    const handleUpdateEta = async (itemId) => {
        try {
            await client.patch(`/admin/orders/${order.id || order.orderId}/items/${itemId}/eta`, {
                estimatedArrivalDate: etaForm.date,
                estimatedArrivalNote: etaForm.note
            });
            toast.success('ETA actualizado');
            setEditingItemEta(null);
            if (onRefresh) onRefresh();
        } catch (error) {
            console.error('Error updating ETA:', error);
            toast.error('Error al actualizar ETA');
        }
    };

    const openAssortmentModal = (promotionId) => {
        // Find promotion details from order items or fetch it
        // For now, we assume we pass the promotion object structure or fetch it
        // But the prompt says "Admin ... manage orders with PENDING_PROMOTION_COMPLETION ... modal for selecting assortment"
        // We'll need the promotion ID. Order likely has `pendingPromotionId` or we check items.
        // Actually, the simple way is to pass the promotion ID detected from the pending state or finding an item with `isPromotionItem` that needs assortment.
        // Let's assume the button passes the full promotion object if available, or just the ID.
        // The endpoint needs `promotionId`.
        // Let's assume we can get it from the order items or a specific property.
        // If the order is PENDING_PROMOTION_COMPLETION, we should look for the promotion that caused it.
        // Detailed implementations might vary, but I'll assume we can find the relevant promotion from items.

        // Strategy: find item with isPromotionItem && requiresAssortment (if we have that flag)
        // Or if the order has a `promotions` array. 
        // For this implementation, I will rely on passing the promotion object from the alert.
        setSelectedPromotionForAssortment({ id: promotionId }); // minimal obj if full not available, AssortmentModal might need to fetch it? 
        // Wait, AssortmentModal takes `promotion` prop. It displays name/desc. 
        // I should probably fetch the promotion details if I only have ID.
        // But let's assume for now I can pass what I have or I will fetch inside the modal if needed. 
        // Actually, AssortmentModal expects `promotion` object with `id`, `nombre`, `freeQuantity`.
        // I'll assume I can find it in `order.items` (the main product item usually carries promotion info?)
        // Or I'll fetch it. Let's fetch it simply.

        loadPromotionAndOpen(promotionId);
    };

    const loadPromotionAndOpen = async (promotionId) => {
        try {
            const response = await client.get(`/admin/promotions/${promotionId}`);
            setSelectedPromotionForAssortment(response.data);
            setShowAssortmentModal(true);
        } catch (error) {
            toast.error('Error al cargar detalles de la promoción');
        }
    };

    // Calculate payment summary
    const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

    // Calculate totals based on LOCAL fetched discounts to ensure sync
    // This fixes the issue where order prop is stale or missing discountedTotal
    const activeDiscounts = discounts.filter(d => d.status === 'APPLIED');
    const totalDiscountPercent = activeDiscounts.reduce((sum, d) => sum + parseFloat(d.percentage || 0), 0);
    const originalTotal = parseFloat(currentOrder.total || 0);

    // logic: effectiveTotal = Total - (Total * % / 100)
    const currentDiscountAmount = (originalTotal * totalDiscountPercent) / 100;
    const effectiveTotal = originalTotal - currentDiscountAmount;

    const pendingBalance = effectiveTotal - totalPaid;

    // Determine if we should show "Discounted Total" (if there are active discounts)
    // Also use currentOrder.discountedTotal if available and consistent
    const hasDiscounts = activeDiscounts.length > 0;

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
                    {loadingOrder && (
                        <div className="loading-overlay-inline">
                            <span className="material-icons-round spin">sync</span> Cargando detalles actualizados...
                        </div>
                    )}
                    {/* Order Info Section */}
                    <div className="detail-section order-summary-section">
                        <h4><span className="material-icons-round">info</span> Información General</h4>
                        <div className="info-grid">
                            <div className="info-item">
                                <span className="label">Estado:</span>
                                <span className={`badge status-${currentOrder.estado?.toLowerCase()}`}>{currentOrder.estado}</span>
                            </div>
                            <div className="info-item">
                                <span className="label">Vendedor:</span>
                                <span>{currentOrder.vendedor}</span>
                            </div>
                            <div className="info-item">
                                <span className="label">Cliente:</span>
                                <span>{currentOrder.cliente}</span>
                            </div>
                            <div className="info-item">
                                <span className="label">Fecha:</span>
                                <span>{new Date(currentOrder.fecha).toLocaleString()}</span>
                            </div>
                            <div className="info-item highlight">
                                <span className="label">Total Original:</span>
                                <span className="value">${parseFloat(currentOrder.total).toFixed(2)}</span>
                            </div>
                            {currentOrder.discountedTotal && currentOrder.discountedTotal !== currentOrder.total && (
                                <div className="info-item highlight success">
                                    <span className="label">Total con Descuento:</span>
                                    <span className="value">${parseFloat(currentOrder.discountedTotal).toFixed(2)}</span>
                                </div>
                            )}
                        </div>

                        {currentOrder.notas && (
                            <div className="notes-box">
                                <strong><span className="material-icons-round">note</span> Notas:</strong>
                                <p>{currentOrder.notas}</p>
                            </div>
                        )}


                        {/* PENDING PROMOTION ALERT */}
                        {currentOrder.estado === OrdenStatus.PENDING_PROMOTION_COMPLETION && isAdmin && (
                            <div className="pending-promotion-alert">
                                <h4>
                                    <span className="material-icons-round">warning</span>
                                    Acción Requerida: Completar Promoción
                                </h4>
                                <p>Esta orden contiene promociones que requieren selección de productos surtidos.</p>
                                {currentOrder.items?.filter(i => i.isPromotionItem && i.promotion?.requiresAssortmentSelection && !i.assortmentCompleted).map(item => (
                                    <div key={item.promotion.id} style={{ marginTop: '1rem' }}>
                                        <button
                                            className="btn-select-assortment"
                                            onClick={() => openAssortmentModal(item.promotion.id)}
                                        >
                                            Seleccionar Surtidos para {item.promotion.nombre}
                                        </button>
                                    </div>
                                ))}
                                {(!currentOrder.items?.some(i => i.isPromotionItem && i.promotion?.requiresAssortmentSelection && !i.assortmentCompleted)) && (
                                    <p><em>No se detectaron promociones pendientes específicas en los ítems, pero el estado es PENDIENTE_PROMOCION.</em></p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Products Section */}
                    <div className="detail-section">
                        <h4><span className="material-icons-round">inventory_2</span> Productos ({currentOrder.items?.length || 0})</h4>
                        <div className="products-table-wrapper">
                            <table className="items-table">
                                <thead>
                                    <tr>
                                        <th>Producto</th>
                                        <th>Cantidad</th>
                                        <th>Estado</th>
                                        <th>Precio Unit.</th>
                                        <th>Subtotal</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {currentOrder.items?.map((item, idx) => (
                                        <tr key={idx} className={item.outOfStock ? 'row-warning' : ''}>
                                            <td>
                                                <div style={{ fontWeight: 600 }}>{item.productName}</div>
                                                <div className="order-item-badges">
                                                    {item.outOfStock && (
                                                        <span className="order-item-badge out-of-stock">
                                                            <span className="material-icons-round" style={{ fontSize: '12px' }}>event_busy</span>
                                                            Sin Stock
                                                        </span>
                                                    )}
                                                    {item.isPromotionItem && (
                                                        <span className="order-item-badge promotion">
                                                            <span className="material-icons-round" style={{ fontSize: '12px' }}>local_offer</span>
                                                            Promoción
                                                        </span>
                                                    )}
                                                    {item.isFreeItem && (
                                                        <span className="order-item-badge free-item">
                                                            <span className="material-icons-round" style={{ fontSize: '12px' }}>card_giftcard</span>
                                                            Bonificado
                                                        </span>
                                                    )}
                                                </div>

                                                {/* ETA Display/Edit for Admins */}
                                                {item.outOfStock && (
                                                    <div style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
                                                        {item.estimatedArrivalDate ? (
                                                            <div style={{ color: '#d97706' }}>
                                                                <strong>ETA:</strong> {new Date(item.estimatedArrivalDate).toLocaleDateString()}
                                                                {item.estimatedArrivalNote && <span> ({item.estimatedArrivalNote})</span>}
                                                                {isAdmin && (
                                                                    <button
                                                                        className="btn-link"
                                                                        onClick={() => {
                                                                            const idToUse = item.id || item.orderItemId;
                                                                            setEditingItemEta(idToUse);
                                                                            setEtaForm({
                                                                                date: item.estimatedArrivalDate ? item.estimatedArrivalDate.substring(0, 10) : '',
                                                                                note: item.estimatedArrivalNote || ''
                                                                            });
                                                                        }}
                                                                        style={{ marginLeft: '0.5rem', fontSize: '0.8rem' }}
                                                                    >
                                                                        Editar
                                                                    </button>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            isAdmin && (
                                                                <button
                                                                    className="btn-link warning"
                                                                    onClick={() => {
                                                                        const idToUse = item.id || item.orderItemId;
                                                                        setEditingItemEta(idToUse);
                                                                        setEtaForm({ date: '', note: '' });
                                                                    }}
                                                                    style={{ fontSize: '0.8rem' }}
                                                                >
                                                                    + Agregar Estimación de Llegada
                                                                </button>
                                                            )
                                                        )}

                                                        {/* ETA Edit Form */}
                                                        {editingItemEta === (item.id || item.orderItemId) && (
                                                            <div className="eta-form">
                                                                <h5>Definir Estimación de Llegada</h5>
                                                                <div className="form-group">
                                                                    <input
                                                                        type="date"
                                                                        value={etaForm.date}
                                                                        onChange={(e) => setEtaForm({ ...etaForm, date: e.target.value })}
                                                                        style={{ width: '100%', marginBottom: '0.5rem' }}
                                                                    />
                                                                    <input
                                                                        type="text"
                                                                        placeholder="Nota (ej: Llega el martes)"
                                                                        value={etaForm.note}
                                                                        onChange={(e) => setEtaForm({ ...etaForm, note: e.target.value })}
                                                                        style={{ width: '100%', marginBottom: '0.5rem' }}
                                                                    />
                                                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                                        <button
                                                                            onClick={() => {
                                                                                const idToUse = item.id || item.orderItemId;
                                                                                if (!idToUse) {
                                                                                    console.error("❌ No valid ID found for item:", item);
                                                                                    toast.error("Error: No se pudo identificar el ítem para actualizar ETA");
                                                                                    return;
                                                                                }
                                                                                handleUpdateEta(idToUse);
                                                                            }}
                                                                            className="btn-save small"
                                                                        >
                                                                            Guardar
                                                                        </button>
                                                                        <button
                                                                            onClick={() => setEditingItemEta(null)}
                                                                            className="btn-cancel small"
                                                                        >
                                                                            Cancelar
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                            <td>{item.cantidad}</td>
                                            <td>
                                                {/* Status column content if needed, basically covered by badges */}
                                            </td>
                                            <td style={{ color: item.isFreeItem ? '#10b981' : 'inherit', fontWeight: item.isFreeItem ? 700 : 'inherit' }}>
                                                ${item.isFreeItem ? '0.00' : parseFloat(item.precioUnitario || 0).toFixed(2)}
                                            </td>
                                            <td style={{ color: item.isFreeItem ? '#10b981' : 'inherit', fontWeight: item.isFreeItem ? 700 : 'inherit' }}>
                                                ${parseFloat(item.subtotal || 0).toFixed(2)}
                                            </td>
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
                                <span>Total {hasDiscounts ? 'Original' : 'Orden'}:</span>
                                <strong className={hasDiscounts ? 'strike-through' : ''}>${originalTotal.toFixed(2)}</strong>
                            </div>
                            {hasDiscounts && (
                                <div className="summary-item highlight">
                                    <span>Total con Descuento:</span>
                                    <strong className="success">${effectiveTotal.toFixed(2)}</strong>
                                </div>
                            )}
                            <div className="summary-item paid">
                                <span>Total Pagado:</span>
                                <strong>${totalPaid.toFixed(2)}</strong>
                            </div>
                            <div className={`summary-item ${pendingBalance <= 0.01 ? 'success' : 'warning'}`}>
                                <span>Saldo Pendiente:</span>
                                <strong style={{ fontSize: '1.2rem' }}>${Math.max(0, pendingBalance).toFixed(2)}</strong>
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
                        orderTotal={effectiveTotal}
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

                {/* Assortment Selection Modal */}
                {showAssortmentModal && selectedPromotionForAssortment && (
                    <AssortmentSelectionModal
                        orderId={order.id || order.orderId}
                        promotion={selectedPromotionForAssortment}
                        onClose={() => {
                            setShowAssortmentModal(false);
                            setSelectedPromotionForAssortment(null);
                        }}
                        onSuccess={() => {
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

    // Calculate pending balance first
    const pendingBalance = orderTotal - totalPaid;

    // Dynamic calculation of context values
    const discountPercent = parseFloat(formData.discountApplied || 0);
    const discountAmount = (pendingBalance * discountPercent) / 100;
    const finalPaymentAmount = parseFloat(formData.amount || 0);

    // We start with the CURRENT pending balance
    // If a discount is applied during this payment, it effectively reduces the debt
    // The "Remaining Balance" after this transaction would be: 
    // Current Pending - Discount Amount (from this transaction) - Payment Amount

    const effectivePendingAfter = Math.max(0, pendingBalance - discountAmount - finalPaymentAmount);

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
                        <span>Saldo Pendiente Actual:</span>
                        <strong className="warning">${pendingBalance.toFixed(2)}</strong>
                    </div>
                    {/* Dynamic Preview Line */}
                    {(discountPercent > 0 || finalPaymentAmount > 0) && (
                        <div className="context-item preview" style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px dashed #e2e8f0' }}>
                            <span>Saldo Restante (Estimado):</span>
                            <strong className={effectivePendingAfter <= 0.01 ? 'success' : ''}>
                                ${effectivePendingAfter.toFixed(2)}
                            </strong>
                        </div>
                    )}
                </div>

                <form onSubmit={handleSubmit} className="payment-form">
                    {/* Discount Field Moved Up for workflow logic */}
                    <div className="form-group">
                        <label>Descuento a Aplicar (%) <small>- Opcional</small></label>
                        <div className="input-group-text">
                            <input
                                type="number"
                                step="0.1"
                                min="0"
                                max="100"
                                value={formData.discountApplied}
                                onChange={(e) => setFormData({ ...formData, discountApplied: e.target.value })}
                                placeholder="Ej: 5 (5%)"
                            />
                            <span className="suffix">%</span>
                        </div>
                        {discountPercent > 0 && (
                            <div className="input-help success">
                                <span className="material-icons-round" style={{ fontSize: '14px' }}>trending_down</span>
                                Reduce la deuda en: -${discountAmount.toFixed(2)}
                            </div>
                        )}
                    </div>

                    <div className="form-group">
                        <label>Monto del Pago *</label>
                        <div className="input-group-text">
                            <span className="prefix">$</span>
                            <input
                                type="number"
                                step="0.01"
                                min="0.01"
                                value={formData.amount}
                                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                                placeholder={`Máximo sugerido: ${(pendingBalance - discountAmount).toFixed(2)}`}
                                required
                            />
                        </div>
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
