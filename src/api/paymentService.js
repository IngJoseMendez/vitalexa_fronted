// src/api/paymentService.js
// Payment/Abono API endpoints - OWNER ONLY
import apiClient from './client';

const paymentService = {
    // Register a new payment for an order (ACTUALIZADO con nuevos campos)
    createPayment: (paymentData) => apiClient.post('/owner/payments', paymentData),

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
