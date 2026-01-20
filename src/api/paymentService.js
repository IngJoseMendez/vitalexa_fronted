// src/api/paymentService.js
// Payment/Abono API endpoints - OWNER ONLY
import apiClient from './client';

const paymentService = {
    // Register a new payment for an order
    createPayment: (paymentData) => apiClient.post('/owner/payments', paymentData),

    // Get all payments for a specific order
    getOrderPayments: (orderId) => apiClient.get(`/owner/payments/order/${orderId}`),

    // Cancel/delete a payment
    deletePayment: (paymentId) => apiClient.delete(`/owner/payments/${paymentId}`)
};

export default paymentService;
