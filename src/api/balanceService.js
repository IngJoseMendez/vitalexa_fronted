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

    // 🆕 Get pending invoices for a client with optional date filters
    getPendingInvoices: (clientId, startDate = null, endDate = null) => {
        const params = {};
        if (startDate) params.startDate = startDate;
        if (endDate) params.endDate = endDate;
        return apiClient.get(`/balances/client/${clientId}/pending-invoices`, { params });
    },

    // 🆕 Get days overdue for a client
    getDaysOverdue: (clientId) => apiClient.get(`/balances/client/${clientId}/days-overdue`),

    // 🆕 Get last payment date for a client
    getLastPaymentDate: (clientId) => apiClient.get(`/balances/client/${clientId}/last-payment-date`),

    // 🆕 Export balances to Excel with filters
    exportToExcel: (filters = {}) => {
        const params = {};
        if (filters.vendedorId) params.vendedorId = filters.vendedorId;
        if (filters.startDate) params.startDate = filters.startDate;
        if (filters.endDate) params.endDate = filters.endDate;
        if (filters.onlyWithDebt !== undefined) params.onlyWithDebt = filters.onlyWithDebt;

        return apiClient.get('/balances/export/excel', {
            params,
            responseType: 'blob'
        });
    },

    // === OWNER ONLY ENDPOINTS ===

    // Set credit limit for a client
    setCreditLimit: (clientId, amount) =>
        apiClient.put(`/balances/client/${clientId}/credit-limit`, null, { params: { amount } }),

    // Remove credit limit for a client
    removeCreditLimit: (clientId) =>
        apiClient.delete(`/balances/client/${clientId}/credit-limit`),

    // Set initial balance for a client (can only be set once)
    setInitialBalance: (clientId, amount) =>
        apiClient.put(`/balances/client/${clientId}/initial-balance`, null, { params: { amount } }),

    // Add balance favor (credit balance) to a client
    addBalanceFavor: (clientId, amount) =>
        apiClient.put(`/balances/client/${clientId}/balance-favor`, null, { params: { amount } })
};

export default balanceService;
