// src/api/clientService.js
// Clientes desde el panel de Admin/Owner (GET/DELETE/PATCH /api/admin/clients):
// lista de eliminados (archivados), eliminar/archivar y restaurar.
// (Las llamadas del portal del cliente siguen en api/client.js → clientService.)
import apiClient from './client';

export const CLIENT_STATUS = {
    ACTIVE: 'active',
    ARCHIVED: 'archived',
};

// Resultado de DELETE /admin/clients/{id}
export const DELETE_RESULT = {
    DELETED: 'DELETED',   // no tenía historial: se borró de verdad
    ARCHIVED: 'ARCHIVED', // tenía historial: queda archivado y se puede restaurar
};

const adminClientService = {
    // Sin "status" el backend devuelve solo los activos (la lista de siempre: el panel la sigue
    // pidiendo con apiClient.get('/admin/clients')). Con status=archived, los eliminados.
    getArchivedClients: () =>
        apiClient.get('/admin/clients', { params: { status: CLIENT_STATUS.ARCHIVED } }),

    // 200 { result: 'DELETED' | 'ARCHIVED', message }; 409 { message } si tiene saldo pendiente
    // o pedidos sin completar; 404 si no existe. Ya archivado = 200 ARCHIVED (idempotente).
    deleteClient: (id) => apiClient.delete(`/admin/clients/${id}`),

    // 200 ClientResponse con active = true (y su usuario del portal vuelve a estar activo)
    restoreClient: (id) => apiClient.patch(`/admin/clients/${id}/restore`),
};

export default adminClientService;
