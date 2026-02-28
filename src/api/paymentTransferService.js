// src/api/paymentTransferService.js
// Transferencias de pagos entre vendedores - OWNER ONLY
import apiClient from './client';

const paymentTransferService = {
    /**
     * Crea una nueva transferencia de pago hacia otro vendedor.
     * @param {Object} data - { paymentId, destVendedorId, amount (null=todo), targetMonth, targetYear, reason }
     */
    createTransfer: (data) =>
        apiClient.post('/owner/payment-transfers', data),

    /**
     * Revoca una transferencia existente.
     * @param {string} transferId
     * @param {string} reason - Motivo de revocación
     */
    revokeTransfer: (transferId, reason) =>
        apiClient.post(`/owner/payment-transfers/${transferId}/revoke`, { reason }),

    /**
     * Lista todas las transferencias sobre un pago específico.
     */
    getTransfersByPayment: (paymentId) =>
        apiClient.get(`/owner/payment-transfers/payment/${paymentId}`),

    /**
     * Retorna el saldo disponible para transferir de un pago.
     * saldo = pago.amount - suma_transferencias_activas
     */
    getAvailableAmount: (paymentId) =>
        apiClient.get(`/owner/payment-transfers/payment/${paymentId}/available`),

    /**
     * Lista transferencias donde el vendedor es el ORIGEN.
     */
    getTransfersByOrigin: (vendedorId) =>
        apiClient.get(`/owner/payment-transfers/origin/${vendedorId}`),

    /**
     * Lista transferencias donde el vendedor es el DESTINO.
     */
    getTransfersByDest: (vendedorId) =>
        apiClient.get(`/owner/payment-transfers/dest/${vendedorId}`),
};

export default paymentTransferService;
