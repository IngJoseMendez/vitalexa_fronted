import client from './client';

const productService = {
    // Other product endpoints can be moved here later, but for now we focus on bulk

    /**
     * Create multiple products at once.
     * @param {Array} products Array of product objects
     * @returns Promise resolving to the PDF blob
     */
    createProductsBulk: async (products) => {
        return client.post('/admin/products/bulk', products, {
            responseType: 'blob'
        });
    },

    /**
     * Update multiple products at once.
     * @param {Array} products Array of UpdateProductBulkRequest objects
     * @returns Promise resolving to the PDF blob
     */
    updateProductsBulk: async (products) => {
        return client.put('/admin/products/bulk', products, {
            responseType: 'blob'
        });
    },

    // --- Individual Operations (PDF Return) ---

    createProduct: async (formData) => {
        return client.post('/admin/products', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            responseType: 'blob'
        });
    },

    updateProduct: async (id, formData) => {
        return client.put(`/admin/products/${id}`, formData, { // prompt says PUT for update individual
            headers: { 'Content-Type': 'multipart/form-data' },
            responseType: 'blob'
        });
    },

    // --- Stock Operations ---

    /**
     * Register stock arrival (add to existing stock).
     * @param {string} id Product ID
     * @param {number} quantity Amount to add
     * @param {string} reason Optional reason
     */
    addStock: async (id, quantity, reason) => {
        const params = { quantity };
        if (reason) params.reason = reason;
        return client.post(`/admin/products/${id}/stock/add`, null, {
            params,
            responseType: 'blob'
        });
    },

    /**
     * Bulk add stock.
     * @param {Object} payload { reason: string, items: [{ productId, quantity }] }
     */
    addStockBulk: async (payload) => {
        return client.post('/admin/products/stock/bulk-add', payload, {
            responseType: 'blob'
        });
    },

    // Note: The previous code used client.post for update (delta). 
    // The prompt says: "Update Individual: PUT /api/admin/products/{id}"
    // I will stick to the prompt's requirement. If the previous code used POST, I'll change it to PUT.
    // Wait, the prompt says: "Update Individual: PUT /api/admin/products/{id} ... Returns: PDF" (Note: This includes the endpoint variants for multipart updates).
    // The existing code in ProductsPanel.js used `client.post(\`/admin/products/${product.id}/update\`, data, config);`.
    // I will follow the user's NEW instruction to use PUT /api/admin/products/{id}.

    deleteProduct: async (id) => {
        return client.delete(`/admin/products/${id}`, {
            responseType: 'blob'
        });
    },

    // --- Inventory History ---

    getInventoryHistory: async (params) => {
        // params: page, size, sort, productId, type, startDate, endDate
        return client.get('/admin/inventory/history', { params });
    },

    exportInventoryHistory: async (params) => {
        return client.get('/admin/inventory/history/export', {
            params,
            responseType: 'blob'
        });
    },

    exportInventoryMovement: async (id) => {
        return client.get(`/admin/inventory/history/${id}/export`, {
            responseType: 'blob'
        });
    },

    // --- Inventory Export (Full) ---

    exportInventoryExcel: async () => {
        return client.get('/admin/products/inventory/export', {
            responseType: 'blob'
        });
    },

    exportInventoryPDF: async () => {
        return client.get('/admin/products/inventory/export/pdf', {
            responseType: 'blob'
        });
    },

    // --- Stock Report (role-specific) ---

    /**
     * Full inventory stock report: stockEnBD, stockComprometido, stockFisicoReal.
     * @param {'admin'|'owner'|'empacador'} role  Auth role prefix in the URL
     */
    getStockReport: async (role = 'admin') => {
        return client.get(`/${role}/products/inventory/stock-report`);
    },

    /**
     * Explicit helper for empacador frontend to call the correct endpoint.
     */
    getStockReportForEmpacador: async () => {
        return client.get('/empacador/products/inventory/stock-report');
    },

    /**
     * Only products where stockEnBD < 0 (critical alerts).
     * @param {'admin'|'owner'} role  Auth role prefix in the URL
     */
    getStockAlerts: async (role = 'admin') => {
        return client.get(`/${role}/products/inventory/stock-alerts`);
    }
};

export default productService;
