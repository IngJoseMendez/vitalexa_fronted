import React, { useState, useEffect, useCallback } from 'react';
import paymentService from '../../api/paymentService';
import discountService from '../../api/discountService';
import { useToast } from '../ToastContainer';
import AssortmentSelectionModal from './AssortmentSelectionModal';
import OrderAnnulationModal from './OrderAnnulationModal';
import orderService from '../../api/orderService';
import client from '../../api/client';
import { OrdenStatus, PromotionType } from '../../utils/types';
import HistoricalInvoiceModal from './HistoricalInvoiceModal'; // Import for editing
import { formatCurrency, formatDateISO } from '../../utils/formatters';
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
    const [showEditHistoryModal, setShowEditHistoryModal] = useState(false); // State for editing modal
    const [selectedPromotionForAssortment, setSelectedPromotionForAssortment] = useState(null);
    const [editingItemEta, setEditingItemEta] = useState(null);
    const [etaForm, setEtaForm] = useState({ date: '', note: '' });
    const [showAnnulationModal, setShowAnnulationModal] = useState(false);
    const [annulationLoading, setAnnulationLoading] = useState(false);
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
        const confirmed = window.confirm('¿Está seguro de anular este pago?');
        if (!confirmed) return;

        try {
            await paymentService.cancelPayment(paymentId, "Anulado desde detalle de orden");
            toast.success('Pago anulado correctamente');
            fetchPayments();
            if (onRefresh) onRefresh();
        } catch (error) {
            console.error('Error canceling payment:', error);
            toast.error('Error al anular el pago');
        }
    };

    // Restore a payment
    const handleRestorePayment = async (paymentId) => {
        try {
            await paymentService.restorePayment(paymentId);
            toast.success('Pago restaurado correctamente');
            fetchPayments();
            if (onRefresh) onRefresh();
        } catch (error) {
            console.error('Error restoring payment:', error);
            toast.error('Error al restaurar el pago');
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



    // Handle Order Annulling
    const handleAnnulOrder = () => {
        if (!isOwner && !isAdmin) return;
        setShowAnnulationModal(true);
    };

    const handleConfirmAnnulation = async (reason) => {
        try {
            setAnnulationLoading(true);
            await orderService.annulOrder(order.id || order.orderId, reason);
            toast.success("Orden anulada correctamente");
            setShowAnnulationModal(false);
            if (onRefresh) onRefresh();
            onClose(); // Close modal after annulment
        } catch (error) {
            console.error("Error annulling order:", error);
            toast.error("Error al anular la orden: " + (error.response?.data?.message || error.message));
        } finally {
            setAnnulationLoading(false);
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
    const totalPaid = payments
        .filter(p => !p.isCancelled)
        .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

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
        <div className="modal-overlay">
            <div className="modal-content-large order-detail-enhanced" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>
                        <span className="material-icons-round">receipt_long</span>
                        Detalle de Orden #{order.invoiceNumber || (order.id || order.orderId)?.substring(0, 8)}
                    </h3>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        {(isOwner || isAdmin) && (
                            <button
                                className="btn-edit-invoice"
                                onClick={() => setShowEditHistoryModal(true)}
                                style={{
                                    background: '#f59e0b',
                                    color: '#fff',
                                    border: 'none',
                                    padding: '0.4rem 0.8rem',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    fontWeight: 'bold',
                                    fontSize: '0.85rem'
                                }}
                                title="Editar Factura Histórica (Sobreescribir)"
                            >
                                <span className="material-icons-round" style={{ fontSize: '16px' }}>edit</span>
                                Editar Factura
                            </button>
                        )}
                        {/* Anular: OWNER y ADMIN pueden anular cualquier orden (incluyendo COMPLETADAS) */}
                        {(isOwner || isAdmin) &&
                          currentOrder.estado !== 'ANULADA' && currentOrder.estado !== 'CANCELADO' && (
                            <button
                                className="btn-cancel"
                                style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                                onClick={handleAnnulOrder}
                            >
                                <span className="material-icons-round" style={{ fontSize: '16px' }}>block</span>
                                Anular Venta
                            </button>
                        )}
                        <button className="btn-close" onClick={onClose}>
                            <span className="material-icons-round">close</span>
                        </button>
                    </div>
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
                                <span className="value">${formatCurrency(currentOrder.total)}</span>
                            </div>
                            {currentOrder.discountedTotal && currentOrder.discountedTotal !== currentOrder.total && (
                                <div className="info-item highlight success">
                                    <span className="label">Total con Descuento:</span>
                                    <span className="value">${formatCurrency(currentOrder.discountedTotal)}</span>
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
                                {currentOrder.items?.filter(i =>
                                    i.isPromotionItem &&
                                    i.promotion?.requiresAssortmentSelection &&
                                    !i.assortmentCompleted &&
                                    (i.promotion.type === PromotionType.BUY_GET_FREE || i.promotion.type === 'ASSORTMENT_PROMOTION')
                                ).map(item => (
                                    <div key={item.promotion.id} style={{ marginTop: '1rem' }}>
                                        <button
                                            className="btn-select-assortment"
                                            onClick={() => openAssortmentModal(item.promotion.id)}
                                        >
                                            Seleccionar Surtidos para {item.promotion.nombre}
                                        </button>
                                    </div>
                                ))}
                                {(!currentOrder.items?.some(i =>
                                    i.isPromotionItem &&
                                    i.promotion?.requiresAssortmentSelection &&
                                    !i.assortmentCompleted &&
                                    (i.promotion.type === PromotionType.BUY_GET_FREE || i.promotion.type === 'ASSORTMENT_PROMOTION')
                                )) && (
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
                                                ${item.isFreeItem ? '0.00' : formatCurrency(item.precioUnitario || 0)}
                                            </td>
                                            <td style={{ color: item.isFreeItem ? '#10b981' : 'inherit', fontWeight: item.isFreeItem ? 700 : 'inherit' }}>
                                                ${formatCurrency(item.subtotal || 0)}
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
                                <strong className={hasDiscounts ? 'strike-through' : ''}>${formatCurrency(originalTotal)}</strong>
                            </div>
                            {hasDiscounts && (
                                <div className="summary-item highlight">
                                    <span>Total con Descuento:</span>
                                    <strong className="success">${formatCurrency(effectiveTotal)}</strong>
                                </div>
                            )}
                            <div className="summary-item paid">
                                <span>Total Pagado:</span>
                                <strong>${formatCurrency(totalPaid)}</strong>
                            </div>
                            <div className={`summary-item ${pendingBalance <= 0.01 ? 'success' : 'warning'}`}>
                                <span>Saldo Pendiente:</span>
                                <strong style={{ fontSize: '1.2rem' }}>${formatCurrency(Math.max(0, pendingBalance))}</strong>
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
                                    <div key={payment.id} className={`payment-item ${payment.isCancelled ? 'cancelled' : ''}`}>
                                        <div className="payment-main">
                                            <span className="payment-amount">${formatCurrency(payment.amount)}</span>
                                            <span className="payment-date">
                                                {new Date(payment.paymentDate).toLocaleDateString()}
                                            </span>
                                            {payment.isCancelled ? (
                                                <span className="badge-cancelled">
                                                    <span className="material-icons-round">cancel</span> ANULADO
                                                </span>
                                            ) : (
                                                payment.withinDeadline && (
                                                    <span className="badge-deadline">
                                                        <span className="material-icons-round">schedule</span> En plazo
                                                    </span>
                                                )
                                            )}
                                        </div>
                                        <div className="payment-meta">
                                            {payment.discountApplied > 0 && (
                                                <span>Descuento: {payment.discountApplied}%</span>
                                            )}
                                            {payment.notes && <span>Notas: {payment.notes}</span>}
                                            <span>Registrado por: {payment.registeredByUsername || payment.registeredByName || 'Sistema'}</span>
                                            {payment.isCancelled && payment.cancelledByUsername && (
                                                <div className="cancellation-info-mini">
                                                    Anulado por: {payment.cancelledByUsername} 
                                                    {payment.cancellationReason && ` (${payment.cancellationReason})`}
                                                </div>
                                            )}
                                        </div>
                                        <div className="payment-actions">
                                            {canManagePayments && !payment.isCancelled && (
                                                <button
                                                    className="btn-cancel-payment"
                                                    onClick={() => handleCancelPayment(payment.id)}
                                                    title="Anular Pago"
                                                >
                                                    <span className="material-icons-round">delete_outline</span>
                                                </button>
                                            )}
                                            {canManagePayments && payment.isCancelled && (
                                                <button
                                                    className="btn-restore-payment"
                                                    onClick={() => handleRestorePayment(payment.id)}
                                                    title="Restaurar Pago"
                                                >
                                                    <span className="material-icons-round">restore</span>
                                                </button>
                                            )}
                                        </div>
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

                {/* Order Annulation Modal */}
                {showAnnulationModal && (
                    <OrderAnnulationModal
                        onClose={() => setShowAnnulationModal(false)}
                        onConfirm={handleConfirmAnnulation}
                        isLoading={annulationLoading}
                    />
                )}

                {/* Edit Historical Invoice Modal */}
                {showEditHistoryModal && (
                    <HistoricalInvoiceModal
                        onClose={() => setShowEditHistoryModal(false)}
                        onSuccess={() => {
                            setShowEditHistoryModal(false);
                            if (onRefresh) onRefresh();
                            fetchOrderDetails(); // Refresh details if modal stays open
                        }}
                        initialOrder={currentOrder}
                    />
                )}
            </div>
        </div>
    );
}

// ===== PAYMENT FORM MODAL (EXTENDED) =====
// Exported so it can be reused from BalancesPage
const PAYMENT_METHODS = [
    { value: 'EFECTIVO', label: 'Efectivo', icon: '💵' },
    { value: 'TRANSFERENCIA', label: 'Transferencia', icon: '🏦' },
    { value: 'CHEQUE', label: 'Cheque', icon: '📝' },
    { value: 'TARJETA', label: 'Tarjeta', icon: '💳' },
    { value: 'CREDITO', label: 'Crédito', icon: '📊' },
    { value: 'OTRO', label: 'Otro', icon: '🔖' }
];

export function PaymentFormModal({ orderId, orderTotal, totalPaid, onClose, onSuccess }) {
    const [formData, setFormData] = useState({
        amount: '',
        paymentMethod: 'EFECTIVO',
        actualPaymentDate: formatDateISO(new Date()),
        withinDeadline: true,
        notes: ''
    });
    const [saving, setSaving] = useState(false);
    const toast = useToast();

    // Calculate pending balance first
    const pendingBalance = orderTotal - totalPaid;

    // Dynamic calculation of context values
    const finalPaymentAmount = parseFloat(formData.amount || 0);

    // The "Remaining Balance" after this transaction would be: 
    // Current Pending - Payment Amount
    const effectivePendingAfter = Math.max(0, pendingBalance - finalPaymentAmount);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!formData.amount || parseFloat(formData.amount) <= 0) {
            toast.warning('Ingrese un monto válido');
            return;
        }

        if (!formData.paymentMethod) {
            toast.warning('Seleccione un método de pago');
            return;
        }

        try {
            setSaving(true);
            await paymentService.createPayment({
                orderId,
                amount: parseFloat(formData.amount),
                paymentMethod: formData.paymentMethod,
                actualPaymentDate: formData.actualPaymentDate || null,
                withinDeadline: formData.withinDeadline,
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
        <div className="modal-overlay nested">
            <div className="modal-content form-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3><span className="material-icons-round">payments</span> Registrar Pago</h3>
                    <button className="btn-close" onClick={onClose}>
                        <span className="material-icons-round">close</span>
                    </button>
                </div>

                <div className="payment-context">
                    <div className="context-item">
                        <span>Total Orden</span>
                        <strong>${formatCurrency(orderTotal)}</strong>
                    </div>
                    <div className="context-item">
                        <span>Ya Pagado</span>
                        <strong>${formatCurrency(totalPaid)}</strong>
                    </div>
                    <div className="context-item highlight">
                        <span>Saldo Pendiente</span>
                        <strong className="warning">${formatCurrency(pendingBalance)}</strong>
                    </div>
                </div>

                {/* Dynamic Preview Line */}
                {finalPaymentAmount > 0 && (
                    <div className="payment-preview-box">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>Saldo Restante (Estimado):</span>
                            <strong className={effectivePendingAfter <= 0.01 ? 'success' : ''}>
                                ${formatCurrency(effectivePendingAfter)}
                            </strong>
                        </div>
                        {effectivePendingAfter <= 0.01 && (
                            <div className="paid-badge">
                                <span className="material-icons-round">check_circle</span>
                                ¡La orden quedará PAGADA!
                            </div>
                        )}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="payment-form">

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
                                placeholder={`Máximo sugerido: ${formatCurrency(pendingBalance)}`}
                                required
                                onWheel={(e) => e.target.blur()}
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Método de Pago *</label>
                        <select
                            value={formData.paymentMethod}
                            onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                            required
                            style={{
                                width: '100%', padding: '0.6rem 0.8rem',
                                borderRadius: '8px', border: '1px solid #e2e8f0',
                                fontSize: '0.9rem', background: 'white',
                                cursor: 'pointer'
                            }}
                        >
                            {PAYMENT_METHODS.map(m => (
                                <option key={m.value} value={m.value}>{m.icon} {m.label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label>Fecha del Pago</label>
                        <input
                            type="date"
                            value={formData.actualPaymentDate}
                            onChange={(e) => setFormData({ ...formData, actualPaymentDate: e.target.value })}
                            max={formatDateISO(new Date())}
                            style={{
                                width: '100%', padding: '0.6rem 0.8rem',
                                borderRadius: '8px', border: '1px solid #e2e8f0',
                                fontSize: '0.9rem'
                            }}
                        />
                        <small style={{ color: '#6b7280', fontSize: '0.75rem' }}>Fecha real en que se realizó el pago</small>
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
                            placeholder="Referencia, observaciones..."
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
