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
export { API_BASE_URL };
