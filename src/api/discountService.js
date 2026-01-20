// src/api/discountService.js
// Discount API endpoints - Admin applies, Owner revokes/adds
import apiClient from './client';

const discountService = {
    // === ADMIN ENDPOINTS ===

    // Apply preset discounts
    applyDiscount10: (orderId) => apiClient.post(`/admin/discounts/order/${orderId}/apply-10`),
    applyDiscount12: (orderId) => apiClient.post(`/admin/discounts/order/${orderId}/apply-12`),
    applyDiscount15: (orderId) => apiClient.post(`/admin/discounts/order/${orderId}/apply-15`),

    // Apply custom percentage discount
    applyCustomDiscount: (discountData) => apiClient.post('/admin/discounts/custom', discountData),

    // Get all discounts for an order
    getOrderDiscounts: (orderId) => apiClient.get(`/admin/discounts/order/${orderId}`),

    // === OWNER ENDPOINTS ===

    // Revoke a discount
    revokeDiscount: (discountId) => apiClient.put(`/owner/discounts/${discountId}/revoke`),

    // Add additional discount (Owner only)
    addOwnerDiscount: (discountData) => apiClient.post('/owner/discounts', discountData)
};

export default discountService;
