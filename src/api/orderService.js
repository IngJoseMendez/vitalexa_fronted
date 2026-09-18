// src/api/orderService.js
import apiClient from './client';

const orderService = {
  // ✅ VENDEDOR: Create standard order
  createOrder: (orderData) => apiClient.post('/vendedor/orders', orderData),

  // ✅ ADMIN: Create order (can assign to a seller)
  createAdminOrder: (orderData) => apiClient.post('/admin/orders', orderData),

  // ✅ Get vendor list (for admin assigning orders to sellers)
  getVendedores: () => apiClient.get('/admin/clients/vendedores'),

  // ✅ Get all orders (admin)
  getOrders: () => apiClient.get('/admin/orders'),

  // ✅ Get order by ID
  getOrderById: (id) => apiClient.get(`/admin/orders/${id}`),

  // ✅ Historial de ventas (facturas completadas) paginado y con detalle resumido
  // params: { page, size, search, startDate, endDate } — fechas en formato YYYY-MM-DD
  getSalesHistory: (params = {}) => apiClient.get('/admin/orders/sales-history', { params }),

  // ✅ Change order status
  changeStatus: (id, status) => apiClient.patch(`/admin/orders/${id}/status`, { status }, { params: { status } }),

  // ✅ Annul order with reason
  annulOrder: (id, reason) => apiClient.post(`/admin/orders/${id}/annul`, null, { params: { reason } }),

  // ✅ Revertir la anulación (motivo obligatorio): la venta vuelve a su estado anterior
  // y se descuenta de nuevo el stock que devolvió la anulación. Responde la orden actualizada.
  revertAnnulment: (id, reason) => apiClient.post(`/admin/orders/${id}/revert-annulment`, null, { params: { reason } }),

  // ✅ Historial de anulaciones y reversiones de la orden (más reciente primero)
  getAnnulmentHistory: (id) => apiClient.get(`/admin/orders/${id}/annulment-history`),

  // ✅ Complete order with optional invoice date and audit note
  // payload: {} → uses today | { completedAt: "YYYY-MM-DD", auditNote: "..." } → uses manual date
  completeOrder: (id, payload = {}) => apiClient.post(`/admin/orders/${id}/complete`, payload),

  // ✅ Download invoice PDF
  getInvoicePdf: (id) => apiClient.get(`/admin/orders/${id}/invoice/pdf`, { responseType: 'blob' }),
};

export default orderService;

