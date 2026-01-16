import apiClient from './client';

export const tagService = {
    getAll: () => apiClient.get('/tags'),
    getById: (id) => apiClient.get(`/tags/${id}`),
    getSystemSR: () => apiClient.get('/tags/system/sr'),
    create: (data) => apiClient.post('/tags', data),
    update: (id, data) => apiClient.put(`/tags/${id}`, data),
    delete: (id) => apiClient.delete(`/tags/${id}`),
};
