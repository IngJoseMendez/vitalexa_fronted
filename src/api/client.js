// src/config/api.js

// URL del backend (automático según ambiente)
export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

// Endpoints
export const API_ENDPOINTS = {
  // Auth
  LOGIN: `${API_BASE_URL}/auth/login`,
  REGISTER: `${API_BASE_URL}/auth/register`,

  // Products (según rol)
  PRODUCTS_ADMIN: `${API_BASE_URL}/admin/products`,
  PRODUCTS_OWNER: `${API_BASE_URL}/owner/products`,
  PRODUCTS_VENDEDOR: `${API_BASE_URL}/vendedor/products`,

  // Users
  USERS: `${API_BASE_URL}/users`,
};

// Configuración de Axios (si lo usas)
import axios from 'axios';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor para agregar token JWT
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);
