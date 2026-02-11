import client from './client';

const specialProductService = {
    // ============================================
    // ADMIN ENDPOINTS
    // ============================================

    getAll: (page = 0, size = 20) =>
        client.get('/admin/special-products', { params: { page, size } }),

    getById: (id) =>
        client.get(`/admin/special-products/${id}`),

    search: (q, page = 0, size = 20) =>
        client.get('/admin/special-products/search', { params: { q, page, size } }),

    getByParent: (parentId) =>
        client.get(`/admin/special-products/by-parent/${parentId}`),

    getParentData: (parentId) =>
        client.get(`/admin/special-products/parent/${parentId}/data`),

    create: (data) =>
        client.post('/admin/special-products', data),

    update: (id, data) =>
        client.put(`/admin/special-products/${id}`, data),

    toggleStatus: (id, activo) =>
        client.patch(`/admin/special-products/${id}/status`, null, { params: { activo } }),

    remove: (id) =>
        client.delete(`/admin/special-products/${id}`),

    // ============================================
    // VENDOR ENDPOINT
    // ============================================

    getVendorProducts: (page = 0, size = 20) =>
        client.get('/vendedor/special-products', { params: { page, size } }),
};

export default specialProductService;
