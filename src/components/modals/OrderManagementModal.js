import React, { useState, useEffect, useCallback } from 'react';
import paymentService from '../../api/paymentService';
import discountService from '../../api/discountService';
import { useToast } from '../ToastContainer';
import { useConfirm } from '../ConfirmDialog';
import AssortmentSelectionModal from './AssortmentSelectionModal';
import OrderAnnulationModal from './OrderAnnulationModal';
import OrderRevertAnnulmentModal from './OrderRevertAnnulmentModal';
import orderService from '../../api/orderService';
import client from '../../api/client';
import { OrdenStatus, PromotionType, getStatusLabel } from '../../utils/types';
import HistoricalInvoiceModal from './HistoricalInvoiceModal'; // Import for editing
import { formatCurrency, formatDateISO, formatDateTime, formatOrderLabel } from '../../utils/formatters';
import './OrderManagementModal.css';

// Tono del badge de estado (solo presentación, según el sistema de diseño):
// PENDIENTE=warning, CONFIRMADO=primary, COMPLETADO=success, ANULADA/CANCELADO=danger, otros=neutral
const STATUS_BADGE_TONE = {
    [OrdenStatus.PENDIENTE]: 'warning',
    [OrdenStatus.CONFIRMADO]: 'primary',
    [OrdenStatus.COMPLETADO]: 'success',
    [OrdenStatus.ANULADA]: 'danger',
    [OrdenStatus.CANCELADO]: 'danger'
};
const statusBadgeClass = (estado) => `ui-badge ui-badge--${STATUS_BADGE_TONE[estado] || 'neutral'}`;

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
    const [showRevertModal, setShowRevertModal] = useState(false);
    const [revertLoading, setRevertLoading] = useState(false);
    const [annulmentHistory, setAnnulmentHistory] = useState([]);
    const toast = useToast();
    const confirm = useConfirm();

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

    // Historial de anulaciones / reversiones (más reciente primero)
    const fetchAnnulmentHistory = useCallback(async () => {
        const orderId = order.id || order.orderId;
        if (!orderId) return;
        try {
            const response = await orderService.getAnnulmentHistory(orderId);
            setAnnulmentHistory(response.data || []);
        } catch (error) {
            console.error('Error fetching annulment history:', error);
            setAnnulmentHistory([]);
        }
    }, [order.id, order.orderId]);

    useEffect(() => {
        fetchOrderDetails();
        fetchPayments();
        fetchDiscounts();
        fetchAnnulmentHistory();
    }, [fetchOrderDetails, fetchPayments, fetchDiscounts, fetchAnnulmentHistory]);

    // Cancel a payment
    const handleCancelPayment = async (paymentId) => {
        const confirmed = await confirm({
            title: '¿Anular este pago?',
            message: 'El pago quedará anulado. Podrás restaurarlo después si fue un error.',
            confirmText: 'Anular pago',
            cancelText: 'Cancelar'
        });
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
            toast.error('Error al restaurar el pago: ' + (error.response?.data?.message || error.message));
        }
    };

    // Revoke a discount
    const handleRevokeDiscount = async (discountId) => {
        const confirmed = await confirm({
            title: '¿Revocar este descuento?',
            message: 'El descuento se revocará y el total de la orden se recalculará.',
            confirmText: 'Revocar',
            cancelText: 'Cancelar'
        });
        if (!confirmed) return;

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

    // Revertir la anulación: el modal queda abierto con la orden actualizada
    // (siguiente paso habitual: restaurar los pagos que se anularon antes)
    const handleConfirmRevert = async (reason) => {
        try {
            setRevertLoading(true);
            const response = await orderService.revertAnnulment(order.id || order.orderId, reason);
            toast.success(`Anulación revertida. La venta quedó en estado ${getStatusLabel(response.data?.estado)}`);
            setShowRevertModal(false);
            if (response.data) setCurrentOrder(response.data);
            fetchAnnulmentHistory();
            fetchPayments();
            if (onRefresh) onRefresh();
        } catch (error) {
            console.error("Error reverting annulment:", error);
            toast.error("Error al revertir la anulación: " + (error.response?.data?.message || error.message));
        } finally {
            setRevertLoading(false);
        }
    };

    const isAnnulled = currentOrder.estado === OrdenStatus.ANULADA;
    // El registro más reciente es la anulación vigente si la orden está anulada
    const currentAnnulment = isAnnulled && annulmentHistory[0]?.action === 'ANNULMENT'
        ? annulmentHistory[0]
        : null;

    const describeAnnulmentStock = (event) => {
        if (event.action === 'ANNULMENT') {
            return event.stockAdjusted ? 'stock devuelto al inventario' : 'sin devolver stock';
        }
        return event.stockAdjusted ? 'stock descontado de nuevo' : 'sin mover stock';
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

    // Solo presentación: barra de lo pagado sobre el total vigente (los mismos valores del
    // resumen; saldada = llena, como el saldo en verde). Protegida contra división por cero.
    const paidPct = pendingBalance <= 0.01
        ? 100
        : (effectiveTotal > 0 ? Math.min(100, Math.max(0, (totalPaid / effectiveTotal) * 100)) : 0);

    return (
        <div className="ui-modal-overlay omm-overlay">
            <div
                className="ui-modal ui-modal--xl omm-detail"
                role="dialog"
                aria-modal="true"
                aria-labelledby="omm-detail-title"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="ui-modal-header">
                    <span className="ui-modal-icon" aria-hidden="true">
                        <span className="material-icons-round">receipt_long</span>
                    </span>
                    <div className="ui-modal-heading">
                        <h3 id="omm-detail-title" className="ui-modal-title">
                            {/* currentOrder: la versión recargada (refleja una factura recién editada) */}
                            Detalle de {formatOrderLabel({ ...order, ...currentOrder })}
                        </h3>
                    </div>
                    <button type="button" className="ui-icon-btn" onClick={onClose} aria-label="Cerrar">
                        <span className="material-icons-round" aria-hidden="true">close</span>
                    </button>
                </div>

                <div className="ui-modal-body omm-detail-body">
                    {loadingOrder && (
                        <div className="loading-overlay-inline omm-detail-loading" role="status">
                            <span className="ui-spinner ui-spinner--sm" aria-hidden="true" /> Cargando detalles actualizados...
                        </div>
                    )}
                    {/* Order Info Section */}
                    <section className="ui-section omm-span-full">
                        <div className="ui-section-head">
                            <h4 className="ui-section-title omm-section-title"><span className="material-icons-round ui-icon-tile ui-icon-tile--sm ui-icon-tile--primary" aria-hidden="true">info</span> Información General</h4>
                        </div>
                        <div className="omm-info-grid">
                            <div className="omm-info-item">
                                <span className="omm-info-label">Estado:</span>
                                <span className="omm-info-value">
                                    <span className={statusBadgeClass(currentOrder.estado)}>{currentOrder.estado}</span>
                                </span>
                            </div>
                            <div className="omm-info-item">
                                <span className="omm-info-label">Vendedor:</span>
                                <span className="omm-info-value">{currentOrder.vendedor}</span>
                            </div>
                            <div className="omm-info-item">
                                <span className="omm-info-label">Cliente:</span>
                                <span className="omm-info-value">{currentOrder.cliente}</span>
                            </div>
                            <div className="omm-info-item">
                                <span className="omm-info-label">{currentOrder.completedAt ? 'Fecha pedido:' : 'Fecha:'}</span>
                                <span className="omm-info-value">{new Date(currentOrder.fecha).toLocaleString()}</span>
                            </div>
                            {/* La fecha de la factura (tarjeta, PDF, reportes) es completedAt, no la del pedido */}
                            {currentOrder.completedAt && (
                                <div className="omm-info-item">
                                    <span className="omm-info-label">Fecha factura:</span>
                                    <span className="omm-info-value">{new Date(currentOrder.completedAt).toLocaleDateString('es-ES')}</span>
                                </div>
                            )}
                            <div className="omm-info-item omm-info-item--amount">
                                <span className="omm-info-label">Total Original:</span>
                                <span className="omm-info-value">${formatCurrency(currentOrder.total)}</span>
                            </div>
                            {currentOrder.discountedTotal && currentOrder.discountedTotal !== currentOrder.total && (
                                <div className="omm-info-item omm-info-item--amount omm-info-item--success">
                                    <span className="omm-info-label">Total con Descuento:</span>
                                    <span className="omm-info-value">${formatCurrency(currentOrder.discountedTotal)}</span>
                                </div>
                            )}
                        </div>

                        {isAnnulled && (
                            <div className="ui-alert ui-alert--danger omm-callout">
                                <span className="material-icons-round" aria-hidden="true">block</span>
                                <div>
                                    <strong className="ui-alert-title">Venta anulada</strong>
                                    <p className="omm-annulled-reason">Motivo: {currentOrder.cancellationReason || 'Sin motivo registrado'}</p>
                                    {currentAnnulment && (
                                        <small className="omm-annulled-meta">
                                            Por {currentAnnulment.username} el {formatDateTime(currentAnnulment.createdAt)}
                                        </small>
                                    )}
                                </div>
                            </div>
                        )}

                        {currentOrder.notas && (
                            <div className="omm-notes omm-callout">
                                <strong className="omm-notes-title"><span className="material-icons-round" aria-hidden="true">note</span> Notas:</strong>
                                <p>{currentOrder.notas}</p>
                            </div>
                        )}

                        {annulmentHistory.length > 0 && (
                            <div className="omm-history omm-callout">
                                <strong className="omm-history-title">
                                    <span className="material-icons-round" aria-hidden="true">history</span> Historial de anulación
                                </strong>
                                <ul className="omm-history-list">
                                    {annulmentHistory.map(event => (
                                        <li
                                            key={event.id}
                                            className={`omm-history-event ${event.action === 'ANNULMENT' ? 'is-annulment' : 'is-reversal'}`}
                                        >
                                            <div className="omm-history-head">
                                                <span className="material-icons-round omm-history-icon" aria-hidden="true">
                                                    {event.action === 'ANNULMENT' ? 'block' : 'settings_backup_restore'}
                                                </span>
                                                <strong>{event.action === 'ANNULMENT' ? 'Anulada' : 'Anulación revertida'}</strong>
                                                <span className="omm-history-meta">
                                                    {formatDateTime(event.createdAt)} · {event.username}
                                                </span>
                                            </div>
                                            <p className="omm-history-reason">{event.reason}</p>
                                            <small className="omm-history-detail">
                                                {getStatusLabel(event.previousStatus)} → {getStatusLabel(event.newStatus)} · {describeAnnulmentStock(event)}
                                            </small>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}


                        {/* PENDING PROMOTION ALERT */}
                        {currentOrder.estado === OrdenStatus.PENDING_PROMOTION_COMPLETION && isAdmin && (
                            <div className="ui-alert ui-alert--warning omm-callout omm-pending-promo">
                                <span className="material-icons-round" aria-hidden="true">warning</span>
                                <div className="omm-pending-promo-body">
                                    <h4 className="ui-alert-title omm-pending-promo-title">
                                        Acción Requerida: Completar Promoción
                                    </h4>
                                    <p>Esta orden contiene promociones que requieren selección de productos surtidos.</p>
                                    {currentOrder.items?.filter(i =>
                                        i.isPromotionItem &&
                                        i.promotion?.requiresAssortmentSelection &&
                                        !i.assortmentCompleted &&
                                        (i.promotion.type === PromotionType.BUY_GET_FREE || i.promotion.type === 'ASSORTMENT_PROMOTION')
                                    ).map(item => (
                                        <div key={item.promotion.id} className="omm-pending-promo-action">
                                            <button
                                                type="button"
                                                className="ui-btn ui-btn--primary ui-btn--sm"
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
                                            <p className="omm-pending-promo-note"><em>No se detectaron promociones pendientes específicas en los ítems, pero el estado es PENDIENTE_PROMOCION.</em></p>
                                        )}
                                </div>
                            </div>
                        )}
                    </section>

                    {/* Products Section */}
                    <section className="ui-section omm-span-full">
                        <div className="ui-section-head">
                            <h4 className="ui-section-title omm-section-title"><span className="material-icons-round ui-icon-tile ui-icon-tile--sm ui-icon-tile--sky" aria-hidden="true">inventory_2</span> Productos ({currentOrder.items?.length || 0})</h4>
                        </div>
                        <div className="ui-table-wrap omm-items-wrap">
                            <table className="ui-table ui-table--compact omm-items-table">
                                <thead>
                                    <tr>
                                        <th>Producto</th>
                                        <th className="ui-num">Cantidad</th>
                                        <th className="omm-col-status">Estado</th>
                                        <th className="ui-num">Precio Unit.</th>
                                        <th className="ui-num">Subtotal</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {currentOrder.items?.map((item, idx) => (
                                        <tr key={idx} className={item.outOfStock ? 'omm-row-warning' : ''}>
                                            <td className="omm-col-product">
                                                <div className="omm-item-name">{item.productName}</div>
                                                <div className="omm-item-badges">
                                                    {item.outOfStock && (
                                                        <span className="ui-badge ui-badge--warning">
                                                            <span className="material-icons-round" aria-hidden="true">event_busy</span>
                                                            Sin Stock
                                                        </span>
                                                    )}
                                                    {item.isPromotionItem && (
                                                        <span className="ui-badge ui-badge--primary">
                                                            <span className="material-icons-round" aria-hidden="true">local_offer</span>
                                                            Promoción
                                                        </span>
                                                    )}
                                                    {item.isFreeItem && (
                                                        <span className="ui-badge ui-badge--success">
                                                            <span className="material-icons-round" aria-hidden="true">card_giftcard</span>
                                                            Bonificado
                                                        </span>
                                                    )}
                                                </div>

                                                {/* ETA Display/Edit for Admins */}
                                                {item.outOfStock && (
                                                    <div className="omm-eta">
                                                        {item.estimatedArrivalDate ? (
                                                            <div className="omm-eta-info">
                                                                <strong>ETA:</strong> {new Date(item.estimatedArrivalDate).toLocaleDateString()}
                                                                {item.estimatedArrivalNote && <span> ({item.estimatedArrivalNote})</span>}
                                                                {isAdmin && (
                                                                    <button
                                                                        type="button"
                                                                        className="ui-btn ui-btn--ghost ui-btn--sm omm-eta-edit"
                                                                        onClick={() => {
                                                                            const idToUse = item.id || item.orderItemId;
                                                                            setEditingItemEta(idToUse);
                                                                            setEtaForm({
                                                                                date: item.estimatedArrivalDate ? item.estimatedArrivalDate.substring(0, 10) : '',
                                                                                note: item.estimatedArrivalNote || ''
                                                                            });
                                                                        }}
                                                                    >
                                                                        Editar
                                                                    </button>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            isAdmin && (
                                                                <button
                                                                    type="button"
                                                                    className="ui-btn ui-btn--secondary ui-btn--sm"
                                                                    onClick={() => {
                                                                        const idToUse = item.id || item.orderItemId;
                                                                        setEditingItemEta(idToUse);
                                                                        setEtaForm({ date: '', note: '' });
                                                                    }}
                                                                >
                                                                    + Agregar Estimación de Llegada
                                                                </button>
                                                            )
                                                        )}

                                                        {/* ETA Edit Form */}
                                                        {editingItemEta === (item.id || item.orderItemId) && (
                                                            <div className="omm-eta-form">
                                                                <h5 className="omm-eta-title">Definir Estimación de Llegada</h5>
                                                                <div className="omm-eta-fields">
                                                                    <input
                                                                        type="date"
                                                                        className="ui-input"
                                                                        aria-label="Fecha estimada de llegada"
                                                                        value={etaForm.date}
                                                                        onChange={(e) => setEtaForm({ ...etaForm, date: e.target.value })}
                                                                    />
                                                                    <input
                                                                        type="text"
                                                                        className="ui-input"
                                                                        aria-label="Nota de la estimación de llegada"
                                                                        placeholder="Nota (ej: Llega el martes)"
                                                                        value={etaForm.note}
                                                                        onChange={(e) => setEtaForm({ ...etaForm, note: e.target.value })}
                                                                    />
                                                                    {/* Secundaria y luego primaria: el orden del DOM (tabulador) coincide con el visual */}
                                                                    <div className="omm-eta-actions">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setEditingItemEta(null)}
                                                                            className="ui-btn ui-btn--secondary ui-btn--sm"
                                                                        >
                                                                            Cancelar
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                const idToUse = item.id || item.orderItemId;
                                                                                if (!idToUse) {
                                                                                    console.error("❌ No valid ID found for item:", item);
                                                                                    toast.error("Error: No se pudo identificar el ítem para actualizar ETA");
                                                                                    return;
                                                                                }
                                                                                handleUpdateEta(idToUse);
                                                                            }}
                                                                            className="ui-btn ui-btn--primary ui-btn--sm"
                                                                        >
                                                                            Guardar
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="ui-num" data-label="Cantidad">{item.cantidad}</td>
                                            <td className="omm-col-status">
                                                {/* Status column content if needed, basically covered by badges */}
                                            </td>
                                            <td className={`ui-num${item.isFreeItem ? ' omm-free' : ''}`} data-label="Precio Unit.">
                                                ${item.isFreeItem ? '0.00' : formatCurrency(item.precioUnitario || 0)}
                                            </td>
                                            <td className={`ui-num${item.isFreeItem ? ' omm-free' : ''}`} data-label="Subtotal">
                                                ${formatCurrency(item.subtotal || 0)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    {/* Discounts Section */}
                    <section className="ui-section omm-discounts">
                        <div className="ui-section-head omm-section-head">
                            <h4 className="ui-section-title omm-section-title"><span className="material-icons-round ui-icon-tile ui-icon-tile--sm ui-icon-tile--teal" aria-hidden="true">discount</span> Descuentos</h4>
                            {canManageDiscounts && (
                                <button
                                    type="button"
                                    className="ui-btn ui-btn--secondary ui-btn--sm"
                                    onClick={() => setShowDiscountForm(true)}
                                >
                                    <span className="material-icons-round" aria-hidden="true">add</span> Añadir
                                </button>
                            )}
                        </div>

                        {loadingDiscounts ? (
                            <div className="ui-loading omm-inline-loading">
                                <span className="ui-spinner ui-spinner--sm" aria-hidden="true" />
                                Cargando descuentos...
                            </div>
                        ) : discounts.length === 0 ? (
                            <div className="omm-empty">
                                <span className="material-icons-round" aria-hidden="true">info</span>
                                No hay descuentos aplicados
                            </div>
                        ) : (
                            <div className="omm-list ui-stagger">
                                {discounts.map(discount => (
                                    <div key={discount.id} className={`omm-list-item omm-discount is-${discount.status?.toLowerCase()} ui-stripe ${discount.status === 'APPLIED' ? 'ui-stripe--success' : 'ui-stripe--neutral'}`}>
                                        <div className="omm-discount-info">
                                            <span className="omm-discount-pct">{discount.percentage}%</span>
                                            <span className="ui-badge ui-badge--neutral">{discount.type}</span>
                                            <span className={`ui-badge ${discount.status === 'APPLIED' ? 'ui-badge--success' : 'ui-badge--neutral'}`}>{discount.status}</span>
                                        </div>
                                        <div className="omm-meta">
                                            <span>Aplicado por: {discount.appliedByName || 'Sistema'}</span>
                                            {discount.revokedByName && (
                                                <span>Revocado por: {discount.revokedByName}</span>
                                            )}
                                        </div>
                                        {discount.status === 'APPLIED' && canManageDiscounts && (
                                            <button
                                                type="button"
                                                className="ui-btn ui-btn--danger-ghost ui-btn--sm omm-list-action"
                                                onClick={() => handleRevokeDiscount(discount.id)}
                                            >
                                                <span className="material-icons-round" aria-hidden="true">block</span> Revocar
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    {/* Payments Section - OWNER ONLY */}
                    <section className="ui-section omm-payments">
                        <div className="ui-section-head omm-section-head">
                            <h4 className="ui-section-title omm-section-title"><span className="material-icons-round ui-icon-tile ui-icon-tile--sm ui-icon-tile--success" aria-hidden="true">payments</span> Pagos / Abonos</h4>
                            {canManagePayments && (
                                <button
                                    type="button"
                                    className="ui-btn ui-btn--primary ui-btn--sm"
                                    onClick={() => setShowPaymentForm(true)}
                                >
                                    <span className="material-icons-round" aria-hidden="true">add</span> Registrar Pago
                                </button>
                            )}
                        </div>

                        {/* Payment Summary: total en marino, pagado en verde, pendiente en ámbar */}
                        <div className="omm-summary">
                            <div className="omm-summary-row">
                                <span>Total {hasDiscounts ? 'Original' : 'Orden'}:</span>
                                <strong className={hasDiscounts ? 'omm-strike' : ''}>${formatCurrency(originalTotal)}</strong>
                            </div>
                            {hasDiscounts && (
                                <div className="omm-summary-row">
                                    <span>Total con Descuento:</span>
                                    <strong className="omm-text-success">${formatCurrency(effectiveTotal)}</strong>
                                </div>
                            )}
                            <div className="omm-summary-row">
                                <span>Total Pagado:</span>
                                <strong className={totalPaid > 0 ? 'omm-text-success' : ''}>${formatCurrency(totalPaid)}</strong>
                            </div>
                            <div className={`omm-summary-row omm-summary-row--balance ${pendingBalance <= 0.01 ? 'is-success' : 'is-warning'}`}>
                                <span>Saldo Pendiente:</span>
                                <strong>${formatCurrency(Math.max(0, pendingBalance))}</strong>
                            </div>
                            <div
                                className="ui-progress ui-progress--sm ui-progress--success omm-summary-progress"
                                style={{ '--value': paidPct }}
                                role="progressbar"
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-valuenow={Math.floor(paidPct)}
                                aria-label="Porcentaje pagado"
                            >
                                <span className="ui-progress-bar" />
                            </div>
                        </div>

                        {loadingPayments ? (
                            <div className="ui-loading omm-inline-loading">
                                <span className="ui-spinner ui-spinner--sm" aria-hidden="true" />
                                Cargando pagos...
                            </div>
                        ) : payments.length === 0 ? (
                            <div className="omm-empty">
                                <span className="material-icons-round" aria-hidden="true">info</span>
                                No hay pagos registrados
                            </div>
                        ) : (
                            <div className="omm-list ui-stagger">
                                {payments.map(payment => (
                                    <div key={payment.id} className={`omm-list-item omm-payment ${payment.isCancelled ? 'is-cancelled' : ''} ui-stripe ${payment.isCancelled ? 'ui-stripe--danger' : 'ui-stripe--success'}`}>
                                        <div className="omm-payment-main">
                                            {/* Monto en verde; anulado en rojo tachado */}
                                            <span className="omm-payment-amount">${formatCurrency(payment.amount)}</span>
                                            <span className="omm-payment-date">
                                                <span className="material-icons-round" aria-hidden="true">event</span>
                                                {new Date(payment.paymentDate).toLocaleDateString()}
                                            </span>
                                            {payment.isCancelled ? (
                                                <span className="ui-badge ui-badge--danger">
                                                    <span className="material-icons-round" aria-hidden="true">cancel</span> ANULADO
                                                </span>
                                            ) : (
                                                payment.withinDeadline && (
                                                    <span className="ui-badge ui-badge--success">
                                                        <span className="material-icons-round" aria-hidden="true">schedule</span> En plazo
                                                    </span>
                                                )
                                            )}
                                        </div>
                                        <div className="omm-meta">
                                            {payment.discountApplied > 0 && (
                                                <span>Descuento: {payment.discountApplied}%</span>
                                            )}
                                            {payment.notes && <span>Notas: {payment.notes}</span>}
                                            <span>Registrado por: {payment.registeredByUsername || payment.registeredByName || 'Sistema'}</span>
                                            {payment.isCancelled && payment.cancelledByUsername && (
                                                <div className="omm-cancel-info">
                                                    Anulado por: {payment.cancelledByUsername}
                                                    {payment.cancellationReason && ` (${payment.cancellationReason})`}
                                                </div>
                                            )}
                                        </div>
                                        <div className="omm-list-action omm-payment-actions">
                                            {canManagePayments && !payment.isCancelled && (
                                                <button
                                                    type="button"
                                                    className="ui-icon-btn ui-icon-btn--bordered ui-icon-btn--danger"
                                                    onClick={() => handleCancelPayment(payment.id)}
                                                    title="Anular Pago"
                                                >
                                                    <span className="material-icons-round" aria-hidden="true">delete_outline</span>
                                                </button>
                                            )}
                                            {/* En una venta anulada primero se revierte la anulación */}
                                            {canManagePayments && payment.isCancelled && !isAnnulled && (
                                                <button
                                                    type="button"
                                                    className="ui-icon-btn ui-icon-btn--bordered"
                                                    onClick={() => handleRestorePayment(payment.id)}
                                                    title="Restaurar Pago"
                                                >
                                                    <span className="material-icons-round" aria-hidden="true">restore</span>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                </div>

                {/* Acciones de la venta (se oculta si no hay ninguna visible para el rol / estado).
                    Destructiva a la izquierda, como indica el sistema de diseño. */}
                <div className="ui-modal-footer omm-detail-footer">
                    {/* Anular: OWNER y ADMIN pueden anular cualquier orden (incluyendo COMPLETADAS) */}
                    {(isOwner || isAdmin) &&
                      currentOrder.estado !== 'ANULADA' && currentOrder.estado !== 'CANCELADO' && (
                        <button
                            type="button"
                            className="ui-btn ui-btn--danger-ghost omm-footer-start"
                            onClick={handleAnnulOrder}
                        >
                            <span className="material-icons-round" aria-hidden="true">block</span>
                            Anular Venta
                        </button>
                    )}
                    {/* Revertir: los mismos roles que pueden anular */}
                    {(isOwner || isAdmin) && isAnnulled && (
                        <button
                            type="button"
                            className="ui-btn ui-btn--primary"
                            onClick={() => setShowRevertModal(true)}
                            title="Revertir la anulación de esta venta"
                        >
                            <span className="material-icons-round" aria-hidden="true">settings_backup_restore</span>
                            Revertir Anulación
                        </button>
                    )}
                    {/* Editar deja la factura COMPLETADO: en una venta anulada primero hay que revertir.
                        Un pedido CANCELADO ya devolvió su stock: facturarlo sería una venta sin
                        salida de inventario (el backend también lo rechaza) */}
                    {(isOwner || isAdmin) && !isAnnulled && currentOrder.estado !== OrdenStatus.CANCELADO && (
                        <button
                            type="button"
                            className="ui-btn ui-btn--secondary"
                            onClick={() => setShowEditHistoryModal(true)}
                            title="Editar Factura Histórica (Sobreescribir)"
                        >
                            <span className="material-icons-round" aria-hidden="true">edit</span>
                            Editar Factura
                        </button>
                    )}
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

                {/* Revert Annulment Modal */}
                {showRevertModal && (
                    <OrderRevertAnnulmentModal
                        targetStatus={currentAnnulment?.previousStatus}
                        onClose={() => setShowRevertModal(false)}
                        onConfirm={handleConfirmRevert}
                        isLoading={revertLoading}
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
// icon: nombre del icono Material que acompaña al método elegido (antes emojis en el texto)
const PAYMENT_METHODS = [
    { value: 'EFECTIVO', label: 'Efectivo', icon: 'payments' },
    { value: 'TRANSFERENCIA', label: 'Transferencia', icon: 'account_balance' },
    { value: 'CHEQUE', label: 'Cheque', icon: 'edit_note' },
    { value: 'TARJETA', label: 'Tarjeta', icon: 'credit_card' },
    { value: 'CREDITO', label: 'Crédito', icon: 'request_quote' },
    { value: 'OTRO', label: 'Otro', icon: 'more_horiz' }
];

export function PaymentFormModal({ orderId, orderTotal, totalPaid, availableCredit = 0, onClose, onSuccess }) {
    const [formData, setFormData] = useState({
        amount: '',
        paymentMethod: 'EFECTIVO',
        actualPaymentDate: formatDateISO(new Date()),
        withinDeadline: true,
        notes: ''
    });
    const [saving, setSaving] = useState(false);
    const [applyingCredit, setApplyingCredit] = useState(false);
    // Saldo a favor aplicado en esta sesión y crédito restante (estado local)
    const [extraPaid, setExtraPaid] = useState(0);
    const [creditLeft, setCreditLeft] = useState(Number(availableCredit) || 0);
    const toast = useToast();
    const confirm = useConfirm();

    // Saldo pendiente considerando el crédito aplicado en esta sesión
    const effectiveTotalPaid = (Number(totalPaid) || 0) + extraPaid;
    const pendingBalance = (Number(orderTotal) || 0) - effectiveTotalPaid;

    // Dynamic calculation of context values
    const finalPaymentAmount = parseFloat(formData.amount || 0);

    // The "Remaining Balance" after this transaction would be: 
    // Current Pending - Payment Amount
    const effectivePendingAfter = Math.max(0, pendingBalance - finalPaymentAmount);

    // Usar saldo a favor del cliente para abonar a la factura (aplica min(crédito, pendiente)).
    const handleUseCredit = async () => {
        if (creditLeft <= 0 || pendingBalance <= 0.005 || applyingCredit) return;
        try {
            setApplyingCredit(true);
            const res = await paymentService.useBalanceToPay(orderId); // sin amount → máximo posible
            const applied = Number(res.data?.amount) || 0;
            const newPending = Math.max(0, pendingBalance - applied);
            setExtraPaid(p => p + applied);
            setCreditLeft(c => Math.max(0, c - applied));
            toast.success(
                `Se aplicaron $${formatCurrency(applied)} de saldo a favor.` +
                (newPending > 0.005 ? ` Falta $${formatCurrency(newPending)} por pagar.` : ' Factura saldada.')
            );
            if (newPending <= 0.005) {
                onSuccess(); // ya quedó pagada → refrescar y cerrar
            }
        } catch (error) {
            console.error('Error using balance:', error);
            toast.error('Error al usar saldo a favor: ' + (error.response?.data?.message || error.message));
        } finally {
            setApplyingCredit(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        const amt = parseFloat(formData.amount);
        if (!formData.amount || isNaN(amt) || amt <= 0) {
            toast.warning('Ingrese un monto válido');
            return;
        }

        if (!formData.paymentMethod) {
            toast.warning('Seleccione un método de pago');
            return;
        }

        // Si el monto supera el pendiente, ofrecer enviar el sobrante a saldo a favor.
        let surplusToCredit = false;
        if (amt > pendingBalance + 0.005) {
            const surplus = amt - pendingBalance;
            const ok = await confirm({
                title: '¿Registrar sobrante como saldo a favor?',
                message: `El monto ingresado ($${formatCurrency(amt)}) supera el saldo pendiente ($${formatCurrency(Math.max(0, pendingBalance))}). ` +
                    `El sobrante de $${formatCurrency(surplus)} se agregará como saldo a favor del cliente.`,
                confirmText: 'Sí, agregar a saldo a favor',
                cancelText: 'Cancelar'
            });
            if (!ok) return; // el usuario corrige el monto
            surplusToCredit = true;
        }

        try {
            setSaving(true);
            await paymentService.createPayment({
                orderId,
                amount: amt,
                paymentMethod: formData.paymentMethod,
                actualPaymentDate: formData.actualPaymentDate || null,
                withinDeadline: formData.withinDeadline,
                notes: formData.notes || null,
                surplusToCredit
            });
            toast.success(surplusToCredit ? 'Pago registrado y sobrante agregado a saldo a favor' : 'Pago registrado correctamente');
            onSuccess();
        } catch (error) {
            console.error('Error creating payment:', error);
            toast.error('Error al registrar el pago: ' + (error.response?.data?.message || error.message));
        } finally {
            setSaving(false);
        }
    };

    // Icono del método elegido (solo presentación)
    const selectedMethodIcon = (PAYMENT_METHODS.find(m => m.value === formData.paymentMethod) || PAYMENT_METHODS[0]).icon;

    // Solo presentación: barra de lo ya pagado sobre el total (mismos valores del contexto).
    // Saldada = llena; protegida contra división por cero.
    const contextTotal = Number(orderTotal) || 0;
    const paidPct = pendingBalance <= 0.005
        ? 100
        : (contextTotal > 0 ? Math.min(100, Math.max(0, (effectiveTotalPaid / contextTotal) * 100)) : 0);

    return (
        <div className="ui-modal-overlay omm-overlay omm-overlay--nested">
            <div
                className="ui-modal ui-modal--sm omm-pay"
                role="dialog"
                aria-modal="true"
                aria-labelledby="omm-pay-title"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="ui-modal-header">
                    <span className="ui-modal-icon ui-modal-icon--success" aria-hidden="true">
                        <span className="material-icons-round">payments</span>
                    </span>
                    <div className="ui-modal-heading">
                        <h3 id="omm-pay-title" className="ui-modal-title">Registrar Pago</h3>
                    </div>
                    <button type="button" className="ui-icon-btn" onClick={() => (extraPaid > 0 ? onSuccess() : onClose())} aria-label="Cerrar">
                        <span className="material-icons-round" aria-hidden="true">close</span>
                    </button>
                </div>

                {/* El formulario envuelve cuerpo y pie: el pie queda fijo abajo */}
                <form onSubmit={handleSubmit} className="payment-form omm-form">
                    <div className="ui-modal-body ui-modal-body--plain">
                        {/* Contexto con el código de color de la cartera:
                            total en marino, pagado en verde, pendiente en ámbar */}
                        <div className="omm-pay-context">
                            <div className="omm-pay-context-item">
                                <span>Total Orden</span>
                                <strong>${formatCurrency(orderTotal)}</strong>
                            </div>
                            <div className="omm-pay-context-item is-paid">
                                <span>Ya Pagado</span>
                                <strong>${formatCurrency(effectiveTotalPaid)}</strong>
                            </div>
                            <div className={`omm-pay-context-item ${pendingBalance > 0.005 ? 'is-pending' : 'is-settled'}`}>
                                <span>Saldo Pendiente</span>
                                <strong>${formatCurrency(Math.max(0, pendingBalance))}</strong>
                            </div>
                        </div>
                        <div
                            className="ui-progress ui-progress--success omm-pay-progress"
                            style={{ '--value': paidPct }}
                            role="progressbar"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={Math.floor(paidPct)}
                            aria-label="Porcentaje pagado"
                        >
                            <span className="ui-progress-bar" />
                        </div>

                        {/* Saldo a favor del cliente: aplicar a esta factura */}
                        {creditLeft > 0 && pendingBalance > 0.005 && (
                            <div className="ui-alert ui-alert--success omm-pay-credit">
                                <span className="material-icons-round" aria-hidden="true">savings</span>
                                <div className="omm-pay-credit-text">
                                    Saldo a favor disponible: <strong>${formatCurrency(creditLeft)}</strong>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleUseCredit}
                                    disabled={applyingCredit || saving}
                                    className="ui-btn ui-btn--secondary ui-btn--sm"
                                    title="Aplicar el saldo a favor a esta factura"
                                >
                                    {applyingCredit ? 'Aplicando…' : 'Usar saldo a favor'}
                                </button>
                            </div>
                        )}

                        {/* Dynamic Preview Line */}
                        {finalPaymentAmount > 0 && (
                            <div className={`omm-pay-preview${effectivePendingAfter <= 0.01 ? ' is-paid' : ' is-pending'}`}>
                                <div className="omm-pay-preview-row">
                                    <span>Saldo Restante (Estimado):</span>
                                    <strong>
                                        ${formatCurrency(effectivePendingAfter)}
                                    </strong>
                                </div>
                                {effectivePendingAfter <= 0.01 && (
                                    <div className="omm-pay-paid">
                                        <span className="material-icons-round" aria-hidden="true">check_circle</span>
                                        ¡La orden quedará PAGADA!
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="ui-field">
                            <label className="ui-label" htmlFor="omm-pay-amount">Monto del Pago <span className="ui-required">*</span></label>
                            <div className="ui-input-group">
                                <span className="ui-input-prefix">$</span>
                                <input
                                    id="omm-pay-amount"
                                    className="ui-input"
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

                        <div className="ui-field">
                            <label className="ui-label" htmlFor="omm-pay-method">Método de Pago <span className="ui-required">*</span></label>
                            <div className="ui-input-group">
                                <span className="material-icons-round ui-input-icon" aria-hidden="true">{selectedMethodIcon}</span>
                                <select
                                    id="omm-pay-method"
                                    className="ui-select"
                                    value={formData.paymentMethod}
                                    onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                                    required
                                >
                                    {PAYMENT_METHODS.map(m => (
                                        <option key={m.value} value={m.value}>{m.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="ui-field">
                            <label className="ui-label" htmlFor="omm-pay-date">Fecha del Pago</label>
                            <input
                                id="omm-pay-date"
                                className="ui-input"
                                type="date"
                                value={formData.actualPaymentDate}
                                onChange={(e) => setFormData({ ...formData, actualPaymentDate: e.target.value })}
                                max={formatDateISO(new Date())}
                            />
                            <small className="ui-help">Fecha real en que se realizó el pago</small>
                        </div>

                        <label className="ui-switch" htmlFor="withinDeadline">
                            <input
                                type="checkbox"
                                id="withinDeadline"
                                checked={formData.withinDeadline}
                                onChange={(e) => setFormData({ ...formData, withinDeadline: e.target.checked })}
                            />
                            <span className="ui-switch-track" aria-hidden="true"><span className="ui-switch-thumb" /></span>
                            <span className="ui-switch-text">
                                <span className="ui-switch-title">Pago dentro del plazo establecido</span>
                            </span>
                        </label>

                        <div className="ui-field">
                            <label className="ui-label" htmlFor="omm-pay-notes">Notas <small className="ui-optional">- Opcional</small></label>
                            <textarea
                                id="omm-pay-notes"
                                className="ui-textarea"
                                value={formData.notes}
                                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                placeholder="Referencia, observaciones..."
                                rows="2"
                            />
                        </div>
                    </div>

                    <div className="ui-modal-footer">
                        <button type="button" className="ui-btn ui-btn--secondary" onClick={() => (extraPaid > 0 ? onSuccess() : onClose())}>Cancelar</button>
                        <button type="submit" className="ui-btn ui-btn--primary" disabled={saving || applyingCredit}>
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
        <div className="ui-modal-overlay omm-overlay omm-overlay--nested" onClick={onClose}>
            <div
                className="ui-modal ui-modal--sm omm-discount-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="omm-discount-title"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="ui-modal-header">
                    <span className="ui-modal-icon" aria-hidden="true">
                        <span className="material-icons-round">discount</span>
                    </span>
                    <div className="ui-modal-heading">
                        <h3 id="omm-discount-title" className="ui-modal-title">Añadir Descuento</h3>
                    </div>
                    <button type="button" className="ui-icon-btn" onClick={onClose} aria-label="Cerrar">
                        <span className="material-icons-round" aria-hidden="true">close</span>
                    </button>
                </div>

                {/* El formulario envuelve cuerpo y pie: el pie queda fijo abajo */}
                <form onSubmit={handleSubmit} className="discount-form omm-form">
                    <div className="ui-modal-body ui-modal-body--plain">
                        <div className="ui-field">
                            <label className="ui-label" htmlFor="omm-discount-pct">Porcentaje de Descuento <span className="ui-required">*</span></label>
                            <div className="ui-input-group ui-input-group--suffix">
                                <input
                                    id="omm-discount-pct"
                                    className="ui-input"
                                    type="number"
                                    step="0.1"
                                    min="0.1"
                                    max="100"
                                    value={percentage}
                                    onChange={(e) => setPercentage(e.target.value)}
                                    placeholder="Ej: 5"
                                    required
                                />
                                <span className="ui-input-suffix">%</span>
                            </div>
                        </div>
                    </div>

                    <div className="ui-modal-footer">
                        <button type="button" className="ui-btn ui-btn--secondary" onClick={onClose}>Cancelar</button>
                        <button type="submit" className="ui-btn ui-btn--primary" disabled={saving}>
                            {saving ? 'Guardando...' : 'Aplicar Descuento'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default OrderDetailModal;
