import client from './client';

const promotionService = {
    // Admin endpoints
    getAll: async () => {
        return await client.get('/admin/promotions');
    },

    getById: async (id) => {
        return await client.get(`/admin/promotions/${id}`);
    },

    create: async (data) => {
        return await client.post('/admin/promotions', data);
    },

    update: async (id, data) => {
        return await client.put(`/admin/promotions/${id}`, data);
    },

    toggleStatus: async (id, active) => {
        return await client.patch(`/admin/promotions/${id}/status?active=${active}`);
    },

    delete: async (id) => {
        return await client.delete(`/admin/promotions/${id}`);
    },

    // Vendor endpoint
    getValid: async () => {
        return await client.get('/vendedor/promotions');
    },

    // Complete assortment selection for promotion
    completeAssortment: async (orderId, promotionId, products) => {
        return await client.post(
            `/admin/orders/${orderId}/promotions/${promotionId}/assortment`,
            products
        );
    }
};

export default promotionService;
