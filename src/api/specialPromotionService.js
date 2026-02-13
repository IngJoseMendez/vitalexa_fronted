import client from './client';

const specialPromotionService = {
    // ============================================
    // ADMIN ENDPOINTS
    // ============================================

    getAll: (page = 0, size = 20) =>
        client.get('/admin/special-promotions', { params: { page, size } }),

    getById: (id) =>
        client.get(`/admin/special-promotions/${id}`),

    search: (q, page = 0, size = 20) =>
        client.get('/admin/special-promotions/search', { params: { q, page, size } }),

    getByParent: (parentId) =>
        client.get(`/admin/special-promotions/by-parent/${parentId}`),

    // Used to pre-fill data when creating a linked promotion
    getParentData: (parentId) =>
        client.get(`/admin/special-promotions/parent/${parentId}/data`),

    create: (data) =>
        client.post('/admin/special-promotions', data),

    update: (id, data) =>
        client.put(`/admin/special-promotions/${id}`, data),

    toggleStatus: (id, activo) =>
        client.patch(`/admin/special-promotions/${id}/status`, null, { params: { activo } }),

    remove: (id) =>
        client.delete(`/admin/special-promotions/${id}`),

    // ============================================
    // VENDOR ENDPOINT
    // ============================================

    getVendorPromotions: (page = 0, size = 20) =>
        client.get('/vendedor/special-promotions', { params: { page, size } }),
};

export default specialPromotionService;
