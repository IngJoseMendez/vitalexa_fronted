// src/api/client.js
import axios from 'axios';

// Configuración base
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

// Cliente HTTP
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - Agregar token
apiClient.interceptors.request.use(
  (config) => {

    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    console.error('Request error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor - Manejar errores globales
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      switch (error.response.status) {
        case 401:
          // No autorizado - limpiar sesión
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          window.location.href = '/login';
          break;
        case 403:
          // Prohibido
          console.error('No tienes permisos para esta acción');
          break;
        case 404:
          // No encontrado
          console.error('Recurso no encontrado');
          break;
        case 500:
          // Error del servidor
          console.error('Error del servidor');
          break;
        default:
          console.error('Error:', error.response.status);
      }
    } else if (error.request) {
      console.error('No se recibió respuesta del servidor');
    } else {
      console.error('Error configurando la petición:', error.message);
    }
    return Promise.reject(error);
  }
);

// Export default
export default apiClient;

// Named exports adicionales

// === CLIENT ENDPOINTS ===
export const clientService = {
  // Products
  getProducts: () => apiClient.get('/cliente/products'),
  getProductsPage: (page = 0, size = 24, q = '', inStock = null, tagId = null) => {
    const params = { page, size };
    if (q) params.q = q;
    if (inStock !== null) params.inStock = inStock;
    if (tagId !== null) params.tagId = tagId;
    return apiClient.get('/cliente/products/page', { params });
  },

  // Orders
  createOrder: (orderData) => apiClient.post('/cliente/orders', orderData),
  getOrders: () => apiClient.get('/cliente/orders'),
  getOrderById: (id) => apiClient.get(`/cliente/orders/${id}`),
  cancelOrder: (id) => apiClient.patch(`/cliente/orders/${id}/cancel`),
  reorder: (id) => apiClient.post(`/cliente/orders/${id}/reorder`),

  // Shopping Lists
  getLists: () => apiClient.get('/cliente/lists'),
  createList: (data) => apiClient.post('/cliente/lists', data),
  addUpdateListItem: (listId, itemData) => apiClient.post(`/cliente/lists/${listId}/items`, itemData), // itemData: { productId, defaultQty }
  updateListItem: (listId, itemId, data) => apiClient.patch(`/cliente/lists/${listId}/items/${itemId}`, data), // data: { defaultQty }
  convertListToOrder: (listId) => apiClient.post(`/cliente/lists/${listId}/to-order`),

  // Profile
  getProfile: () => apiClient.get('/cliente/me'),
  updateProfile: (data) => apiClient.patch('/cliente/me', data),
};

export { API_BASE_URL };

