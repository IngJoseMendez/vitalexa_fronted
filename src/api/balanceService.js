// src/api/balanceService.js
// Client Balance API endpoints
import apiClient from './client';

const balanceService = {
    // Get all client balances (Owner/Admin see all, Vendedor sees their clients)
    getAllBalances: (vendedorId = null) => {
        const params = vendedorId ? { vendedorId } : {};
        return apiClient.get('/balances', { params });
    },

    // Get single client balance details
    getClientBalance: (clientId) => apiClient.get(`/balances/client/${clientId}`),

    // === OWNER ONLY ENDPOINTS ===

    // Set credit limit for a client
    setCreditLimit: (clientId, amount) =>
        apiClient.put(`/balances/client/${clientId}/credit-limit`, null, { params: { amount } }),

    // Remove credit limit for a client
    removeCreditLimit: (clientId) =>
        apiClient.delete(`/balances/client/${clientId}/credit-limit`),

    // Set initial balance for a client (can only be set once)
    setInitialBalance: (clientId, amount) =>
        apiClient.put(`/balances/client/${clientId}/initial-balance`, null, { params: { amount } })
};

export default balanceService;
