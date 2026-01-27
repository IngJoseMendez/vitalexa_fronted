import React, { useState, useEffect, useCallback } from 'react';
import client from '../api/client';
import { useToast } from './ToastContainer';

/**
 * AdminClientsPanel - Panel for Admin/Owner to manage clients
 * Allows creating clients assigned to specific vendors
 */
function AdminClientsPanel() {
    const [clients, setClients] = useState([]);
    const [vendedores, setVendedores] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedVendedor, setSelectedVendedor] = useState(''); // Filter by vendor
    const toast = useToast();

    const fetchData = useCallback(async () => {
        try {
            const [clientsRes, vendedoresRes] = await Promise.all([
                client.get('/admin/clients'),
                client.get('/admin/clients/vendedores')
            ]);
            setClients(clientsRes.data);
            setVendedores(vendedoresRes.data);
        } catch (error) {
            console.error('Error al cargar datos:', error);
            toast.error('Error al cargar datos: ' + (error.response?.data?.message || error.message));
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Filter clients by search term AND vendor
    const filteredClients = clients.filter(c => {
        // Vendor filter
        if (selectedVendedor && c.vendedorAsignadoNombre !== selectedVendedor) {
            return false;
        }

        // Text search filter
        const term = searchTerm.toLowerCase();
        if (term) {
            return (
                (c.nombre || '').toLowerCase().includes(term) ||
                (c.administrador || '').toLowerCase().includes(term) ||
                (c.representanteLegal || '').toLowerCase().includes(term) ||
                (c.vendedorAsignadoNombre || '').toLowerCase().includes(term)
            );
        }
        return true;
    });

    if (loading) {
        return <div className="loading">Cargando clientes...</div>;
    }

    return (
        <div className="admin-clients-panel">
            <div className="panel-header">
                <h2>
                    <span className="material-icons-round" style={{ fontSize: '32px', color: 'var(--primary)', verticalAlign: 'middle' }}>people</span>
                    {' '}Gestión de Clientes
                </h2>
                <button className="btn-add" onClick={() => setShowModal(true)}>
                    <span className="material-icons-round" style={{ fontSize: '18px', verticalAlign: 'middle' }}>add</span>
                    {' '}Nuevo Cliente
                </button>
            </div>

            {/* Filters Row */}
            <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '1rem',
                marginBottom: '1.5rem',
                alignItems: 'center'
            }}>
                {/* Search Bar */}
                <div className="search-container" style={{ flex: '1', minWidth: '250px', marginBottom: 0 }}>
                    <span className="material-icons-round search-icon">search</span>
                    <input
                        type="text"
                        placeholder="Buscar por nombre, administrador, representante..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="search-input"
                        style={{ width: '100%' }}
                    />
                </div>

                {/* Vendor Filter Dropdown */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className="material-icons-round" style={{ color: 'var(--primary)', fontSize: '20px' }}>badge</span>
                    <select
                        value={selectedVendedor}
                        onChange={(e) => setSelectedVendedor(e.target.value)}
                        style={{
                            padding: '0.6rem 1rem',
                            borderRadius: '8px',
                            border: '1px solid #e5e7eb',
                            fontSize: '0.9rem',
                            minWidth: '180px',
                            background: selectedVendedor ? '#f0fdf4' : 'white',
                            cursor: 'pointer'
                        }}
                    >
                        <option value="">Todos los vendedores</option>
                        {vendedores.map(v => (
                            <option key={v.id} value={v.username}>{v.username}</option>
                        ))}
                    </select>
                    {selectedVendedor && (
                        <button
                            onClick={() => setSelectedVendedor('')}
                            style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                padding: '4px',
                                color: '#6b7280',
                                display: 'flex',
                                alignItems: 'center'
                            }}
                            title="Limpiar filtro"
                        >
                            <span className="material-icons-round" style={{ fontSize: '18px' }}>close</span>
                        </button>
                    )}
                </div>

                {/* Results count */}
                <span style={{
                    fontSize: '0.85rem',
                    color: 'var(--text-muted)',
                    padding: '0.5rem 0.75rem',
                    background: '#f3f4f6',
                    borderRadius: '20px'
                }}>
                    {filteredClients.length} cliente{filteredClients.length !== 1 ? 's' : ''}
                </span>
            </div>


            {/* Clients Grid */}
            <div className="clients-grid" style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                gap: '1.5rem'
            }}>
                {filteredClients.length === 0 ? (
                    <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                        <span className="material-icons-round" style={{ fontSize: '3rem', opacity: 0.3 }}>person_search</span>
                        <p style={{ marginTop: '0.5rem' }}>No se encontraron clientes</p>
                    </div>
                ) : (
                    filteredClients.map(cliente => (
                        <div key={cliente.id} className="cliente-card" style={{
                            background: 'white',
                            borderRadius: '12px',
                            padding: '1.25rem',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                            border: '1px solid #e5e7eb'
                        }}>
                            <div style={{ marginBottom: '0.75rem' }}>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#111827' }}>{cliente.nombre}</h3>
                                <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    marginTop: '0.5rem',
                                    padding: '4px 10px',
                                    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                                    color: 'white',
                                    borderRadius: '20px',
                                    fontSize: '0.75rem',
                                    fontWeight: 600
                                }}>
                                    <span className="material-icons-round" style={{ fontSize: '14px' }}>badge</span>
                                    Vendedor: {cliente.vendedorAsignadoNombre || 'N/A'}
                                </span>
                            </div>

                            <div style={{ fontSize: '0.9rem', color: '#4b5563', lineHeight: 1.6 }}>
                                <p style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '0.4rem 0' }}>
                                    <span className="material-icons-round" style={{ fontSize: '16px', color: '#6b7280' }}>email</span>
                                    {cliente.email}
                                </p>
                                <p style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '0.4rem 0' }}>
                                    <span className="material-icons-round" style={{ fontSize: '16px', color: '#6b7280' }}>phone</span>
                                    {cliente.telefono}
                                </p>
                                <p style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '0.4rem 0' }}>
                                    <span className="material-icons-round" style={{ fontSize: '16px', color: '#6b7280' }}>place</span>
                                    {cliente.direccion || 'Sin dirección'}
                                </p>
                                <p style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '0.4rem 0' }}>
                                    <span className="material-icons-round" style={{ fontSize: '16px', color: '#6b7280' }}>home_work</span>
                                    NIT: {cliente.nit}
                                </p>
                                {cliente.administrador && (
                                    <p style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '0.4rem 0' }}>
                                        <span className="material-icons-round" style={{ fontSize: '16px', color: '#6b7280' }}>person</span>
                                        Admin: {cliente.administrador}
                                    </p>
                                )}
                                {cliente.representanteLegal && (
                                    <p style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '0.4rem 0' }}>
                                        <span className="material-icons-round" style={{ fontSize: '16px', color: '#6b7280' }}>gavel</span>
                                        Rep. Legal: {cliente.representanteLegal}
                                    </p>
                                )}
                            </div>

                            <div style={{
                                marginTop: '1rem',
                                paddingTop: '0.75rem',
                                borderTop: '1px solid #e5e7eb',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                            }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', color: '#059669', fontWeight: 600 }}>
                                    <span className="material-icons-round" style={{ fontSize: '16px' }}>shopping_bag</span>
                                    Compras: ${parseFloat(cliente.totalCompras || 0).toFixed(2)}
                                </span>
                                {cliente.fechaCreacion && (
                                    <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                                        Creado: {new Date(cliente.fechaCreacion).toLocaleDateString('es-ES')}
                                    </span>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Create Client Modal */}
            {showModal && (
                <AdminClientFormModal
                    vendedores={vendedores}
                    onClose={() => setShowModal(false)}
                    onSuccess={() => {
                        setShowModal(false);
                        fetchData();
                    }}
                />
            )}
        </div>
    );
}

/**
 * AdminClientFormModal - Modal for creating a new client assigned to a vendor
 */
function AdminClientFormModal({ vendedores, onClose, onSuccess }) {
    const [formData, setFormData] = useState({
        nit: '',
        nombre: '',
        administrador: '',
        representanteLegal: '',
        email: '',
        telefono: '',
        direccion: '',
        vendedorId: ''
    });
    const [saving, setSaving] = useState(false);
    const toast = useToast();

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!formData.vendedorId) {
            toast.warning('Debe seleccionar un vendedor para asignar el cliente');
            return;
        }

        setSaving(true);

        try {
            await client.post('/admin/clients', formData);
            toast.success(`¡Cliente creado y asignado exitosamente! Credenciales: Usuario y contraseña = ${formData.nit}`);
            onSuccess();
        } catch (error) {
            console.error('Error al crear cliente:', error);

            let errorMessage = 'Error al crear cliente';
            const serverData = error.response?.data;

            if (serverData) {
                const messageStr = typeof serverData === 'string' ? serverData : serverData.message;

                if (messageStr) {
                    // Attempt to extract the specific business exception message
                    // Handles "BusinessExeption" (typo in backend) and "BusinessException"
                    // Regex looks for the exception name followed by a colon and catches the rest of the message
                    const match = messageStr.match(/BusinessExce?ption:\s*(.+?)(?:$|;|with root cause)/);

                    if (match && match[1]) {
                        errorMessage = match[1].trim();
                    } else {
                        // If no specific exception format found but we have a message, use it
                        // but limit length just in case it's a huge stack trace
                        if (messageStr.length < 200) {
                            errorMessage = messageStr;
                        } else {
                            errorMessage = 'Error del servidor: verifique los datos ingresados';
                        }
                    }
                }
            } else if (error.message) {
                errorMessage = error.message;
            }

            // Show the error toast
            toast.error(errorMessage);
        } finally {
            setSaving(false);
        }
    };

    const isFormValid = formData.nit.trim() && formData.nombre.trim() &&
        formData.administrador.trim() && formData.representanteLegal.trim() &&
        formData.email.trim() && formData.telefono.trim() &&
        formData.direccion.trim() && formData.vendedorId;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
                <div className="modal-header">
                    <h3>
                        <span className="material-icons-round" style={{ fontSize: '20px', verticalAlign: 'middle', marginRight: '8px', color: 'var(--primary)' }}>person_add</span>
                        Crear Cliente
                    </h3>
                    <button className="btn-close" onClick={onClose}>
                        <span className="material-icons-round">close</span>
                    </button>
                </div>

                {/* Vendor Selection Info Box */}
                <div style={{
                    background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%)',
                    border: '1px solid rgba(99, 102, 241, 0.3)',
                    borderRadius: '8px',
                    padding: '12px 16px',
                    margin: '0 0 16px 0',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px'
                }}>
                    <span className="material-icons-round" style={{ color: 'var(--primary)', fontSize: '20px', marginTop: '2px' }}>info</span>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        <strong style={{ color: 'var(--text-primary)' }}>Asignación de Vendedor:</strong>
                        <br />
                        El cliente será asignado al vendedor seleccionado y solo ese vendedor podrá ver y gestionar este cliente.
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="client-form">
                    {/* Vendor Selection */}
                    <div className="form-group">
                        <label>
                            Asignar a Vendedor <span style={{ color: '#ef4444', fontWeight: 'bold' }}>*</span>
                        </label>
                        <select
                            value={formData.vendedorId}
                            onChange={(e) => setFormData({ ...formData, vendedorId: e.target.value })}
                            required
                            style={{
                                width: '100%',
                                padding: '0.75rem',
                                borderRadius: '8px',
                                border: '1px solid #e5e7eb',
                                fontSize: '0.95rem',
                                background: formData.vendedorId ? '#f0fdf4' : 'white'
                            }}
                        >
                            <option value="">-- Seleccionar vendedor --</option>
                            {vendedores.map(v => (
                                <option key={v.id} value={v.id}>{v.username}</option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label>NIT <span style={{ color: '#ef4444', fontWeight: 'bold' }}>*</span></label>
                        <input
                            type="text"
                            value={formData.nit}
                            onChange={(e) => setFormData({ ...formData, nit: e.target.value })}
                            placeholder="Ej: 123456789"
                            required
                        />
                        <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '4px', display: 'block' }}>
                            <span className="material-icons-round" style={{ fontSize: '12px', verticalAlign: 'middle', marginRight: '4px' }}>vpn_key</span>
                            Este será el usuario y contraseña del cliente
                        </small>
                    </div>

                    <div className="form-group">
                        <label>Nombre de Establecimiento <span style={{ color: '#ef4444', fontWeight: 'bold' }}>*</span></label>
                        <input
                            type="text"
                            value={formData.nombre}
                            onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                            placeholder="Nombre del establecimiento"
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label>Administrador <span style={{ color: '#ef4444', fontWeight: 'bold' }}>*</span></label>
                        <input
                            type="text"
                            value={formData.administrador}
                            onChange={(e) => setFormData({ ...formData, administrador: e.target.value })}
                            placeholder="Nombre del administrador"
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label>Representante Legal <span style={{ color: '#ef4444', fontWeight: 'bold' }}>*</span></label>
                        <input
                            type="text"
                            value={formData.representanteLegal}
                            onChange={(e) => setFormData({ ...formData, representanteLegal: e.target.value })}
                            placeholder="Nombre del representante legal"
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label>Email <span style={{ color: '#ef4444', fontWeight: 'bold' }}>*</span></label>
                        <input
                            type="email"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            placeholder="correo@ejemplo.com"
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label>Teléfono <span style={{ color: '#ef4444', fontWeight: 'bold' }}>*</span></label>
                        <input
                            type="tel"
                            value={formData.telefono}
                            onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                            placeholder="Número de teléfono"
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label>Dirección <span style={{ color: '#ef4444', fontWeight: 'bold' }}>*</span></label>
                        <textarea
                            value={formData.direccion}
                            onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
                            rows="2"
                            placeholder="Dirección del cliente"
                            required
                        />
                    </div>

                    <div className="form-actions">
                        <button type="button" onClick={onClose} className="btn-cancel">
                            Cancelar
                        </button>
                        <button type="submit" disabled={saving || !isFormValid} className="btn-save">
                            {saving ? 'Guardando...' : 'Crear Cliente'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default AdminClientsPanel;
