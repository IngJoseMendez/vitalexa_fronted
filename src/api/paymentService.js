// src/api/paymentService.js
// Payment/Abono API endpoints - OWNER ONLY
import apiClient from './client';

const paymentService = {
    // Register a new payment for an order (ACTUALIZADO con nuevos campos)
    // paymentData puede incluir surplusToCredit:true para enviar el sobrante a saldo a favor
    createPayment: (paymentData) => apiClient.post('/owner/payments', paymentData),

    // Aplicar el saldo a favor del cliente para pagar una orden.
    // amount opcional: si no se envía, aplica el máximo posible (min(crédito, pendiente)).
    useBalanceToPay: (orderId, amount) =>
        apiClient.post(`/owner/payments/order/${orderId}/use-balance`, null,
            amount != null ? { params: { amount } } : undefined),

    // Get all payments for a specific order (incluye anulados)
    getOrderPayments: (orderId) => apiClient.get(`/owner/payments/order/${orderId}`),

    // 🆕 Get only active (non-cancelled) payments for an order
    getActiveOrderPayments: (orderId) => apiClient.get(`/owner/payments/order/${orderId}/active`),

    // 🆕 Get a specific payment by ID
    getPaymentById: (paymentId) => apiClient.get(`/owner/payments/${paymentId}`),

    // 🆕 Cancel a payment (soft delete with reason)
    cancelPayment: (paymentId, reason) =>
        apiClient.put(`/owner/payments/${paymentId}/cancel`, null, { params: { reason } }),

    // 🆕 Restore a cancelled payment
    restorePayment: (paymentId) => apiClient.put(`/owner/payments/${paymentId}/restore`),

    // @deprecated - Use cancelPayment instead for soft delete
    deletePayment: (paymentId) => apiClient.delete(`/owner/payments/${paymentId}`)
};

export default paymentService;
