import React, { useState, useEffect, useCallback, useMemo } from 'react';
import client from '../../api/client';
import { useToast } from '../ToastContainer';
import './HistoricalInvoiceModal.css'; // Importing the new premium styles

export default function HistoricalInvoiceModal({ onClose, onSuccess, initialOrder = null }) {
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(false);
    const [fetchingClients, setFetchingClients] = useState(true);
    const [isRegisteredClient, setIsRegisteredClient] = useState(true);
    const toast = useToast();

    // Edit Mode Flag
    const isEditMode = !!initialOrder;

    // Search State
    const [searchTerm, setSearchTerm] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);

    // Form State
    const [formData, setFormData] = useState({
        invoiceNumber: '',
        fecha: new Date().toISOString().slice(0, 16),
        totalValue: '',
        amountPaid: '',
        clientId: '',
        clientName: '',
        clientPhone: '',
        clientEmail: '',
        clientAddress: '',
        invoiceType: 'NORMAL',
        notes: ''
    });

    const fetchClients = useCallback(async () => {
        try {
            const res = await client.get('/owner/invoices/clients');
            setClients(res.data || []);
        } catch (error) {
            console.error('Error fetching clients for historical invoices:', error);
            toast.error('Error al cargar lista de clientes');
        } finally {
            setFetchingClients(false);
        }
    }, [toast]);

    useEffect(() => {
        fetchClients();
    }, [fetchClients]);

    // Pre-fill form for Edit Mode
    useEffect(() => {
        if (isEditMode && initialOrder && !fetchingClients) {
            // Determine if client is registered by finding name match or ID match (if we had it)
            // For now, simple name match logic or default to registered if we find a match
            // Assuming initialOrder has: invoiceNumber, fecha, total, (payments sum?), cliente (name)

            // Format date for datetime-local input
            const dateObj = new Date(initialOrder.fecha);
            // safe format: YYYY-MM-DDTHH:mm
            // Adjust for timezone offset to show local time correctly in input
            const tzOffset = dateObj.getTimezoneOffset() * 60000; // in ms
            const localISOTime = (new Date(dateObj - tzOffset)).toISOString().slice(0, 16);

            // Find client if possible
            const matchedClient = clients.find(c => c.nombre === initialOrder.cliente);

            setFormData({
                invoiceNumber: initialOrder.invoiceNumber || '',
                fecha: localISOTime,
                totalValue: initialOrder.total || '',
                amountPaid: initialOrder.totalPaid || '', // Pre-fill with current paid amount?
                clientId: matchedClient ? matchedClient.id : '', // If matched, use ID
                clientName: initialOrder.cliente || '',
                clientPhone: initialOrder.clientePhone || '',
                clientEmail: initialOrder.clienteEmail || '',
                clientAddress: initialOrder.clienteAddress || '',
                invoiceType: initialOrder.invoiceType || 'NORMAL',
                notes: initialOrder.notas || ''
            });

            if (matchedClient) {
                setIsRegisteredClient(true);
                setSearchTerm(matchedClient.nombre);
            } else {
                // If we have client name but no match, could be occasional or deleted client
                // If it looks like a registered name, maybe keep it as registered but just text?
                // For safety, if no match found, maybe toggle to Manual Input to preserve data?
                // Or set search term and let them search again.
                // Let's set search term.
                setSearchTerm(initialOrder.cliente || '');
                // If it was occasional, we might have phone/address data to prefill (if backend sends it)
                if (initialOrder.cliente && !matchedClient) {
                    // Assume occasional if extra data present
                    setIsRegisteredClient(false);
                }
            }
        }
    }, [isEditMode, initialOrder, clients, fetchingClients]);


    // Handle Click Outside for Dropdown
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (!event.target.closest('.client-search-container')) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    // Client Selection Logic
    const handleClientSelect = (client) => {
        setFormData(prev => ({
            ...prev,
            clientId: client.id,
            clientName: client.nombre // Optional: keeping consistency
        }));
        setSearchTerm(client.nombre); // Set search term to selected name
        setShowDropdown(false);
    };

    const clearClientSelection = () => {
        setFormData(prev => ({ ...prev, clientId: '' }));
        setSearchTerm('');
    };

    // Filtered Clients for Search
    const filteredClients = useMemo(() => {
        if (!searchTerm) return clients;
        const lowerTerm = searchTerm.toLowerCase();
        return clients.filter(c =>
            c.nombre.toLowerCase().includes(lowerTerm) ||
            (c.nit && c.nit.toLowerCase().includes(lowerTerm)) ||
            (c.representanteLegal && c.representanteLegal.toLowerCase().includes(lowerTerm))
        );
    }, [clients, searchTerm]);

    // Calculate Balance Logic
    const total = parseFloat(formData.totalValue) || 0;
    const paid = parseFloat(formData.amountPaid) || 0;
    const balance = total - paid;
    const isPaidOff = balance <= 0.01; // tolerance

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (paid > total) {
            toast.warning('El monto pagado no puede ser mayor al total de la factura');
            return;
        }

        if (isEditMode) {
            const confirmed = window.confirm(
                "⚠️ ADVERTENCIA DE EDICIÓN ⚠️\n\n" +
                "Al guardar estos cambios:\n" +
                "1. Los pagos existentes se ELIMINARÁN y se creará uno nuevo con el 'Monto Pagado' ingresado.\n" +
                "2. Los datos de la factura se actualizarán permanentemente.\n\n" +
                "¿Está seguro de continuar?"
            );
            if (!confirmed) return;
        }

        setLoading(true);

        try {
            const payload = {
                invoiceNumber: parseInt(formData.invoiceNumber),
                fecha: new Date(formData.fecha).toISOString(),
                totalValue: parseFloat(formData.totalValue),
                amountPaid: parseFloat(formData.amountPaid),
                invoiceType: formData.invoiceType,
                notes: formData.notes
            };

            if (isRegisteredClient) {
                if (!formData.clientId) {
                    toast.warning('Debes seleccionar un cliente');
                    setLoading(false);
                    return;
                }
                payload.clientId = formData.clientId;
            } else {
                if (!formData.clientName) {
                    toast.warning('El nombre del cliente es obligatorio');
                    setLoading(false);
                    return;
                }
                payload.clientName = formData.clientName;
                payload.clientPhone = formData.clientPhone;
                payload.clientEmail = formData.clientEmail;
                payload.clientAddress = formData.clientAddress;
            }

            if (isEditMode) {
                // PUT Request
                const orderId = initialOrder.id || initialOrder.orderId;
                await client.put(`/owner/invoices/${orderId}`, payload);
                toast.success('Factura actualizada exitosamente');
            } else {
                // POST Request
                await client.post('/owner/invoices', payload);
                toast.success('Factura histórica registrada exitosamente');
            }

            if (onSuccess) onSuccess();
            onClose();

        } catch (error) {
            console.error('Error saving historical invoice:', error);

            // Extract backend error message if available
            const errorMessage = error.response?.data?.message;

            if (error.response) {
                // Prioritize backend message, fallback to status-specific messages
                if (errorMessage) {
                    toast.error(errorMessage);
                } else if (error.response.status === 409) {
                    toast.error('Ya existe una factura con ese número.');
                } else if (error.response.status === 400) {
                    toast.error('Datos inválidos. Verifica los montos.');
                } else if (error.response.status === 403) {
                    toast.error('No tienes permisos.');
                } else {
                    toast.error('Error al guardar factura');
                }
            } else {
                toast.error('Error de conexión al servidor');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="historical-modal-overlay">
            <div className="historical-modal-content" onClick={e => e.stopPropagation()}>
                {/* HEADER */}
                <div className="hm-header" style={isEditMode ? { borderBottomColor: '#f59e0b' } : {}}>
                    <h3>
                        <div className="header-icon" style={isEditMode ? { background: '#fef3c7', color: '#d97706' } : {}}>
                            <span className="material-icons-round">{isEditMode ? 'edit' : 'history'}</span>
                        </div>
                        {isEditMode ? 'Editar Factura / Orden' : 'Registrar Factura Histórica'}
                    </h3>
                    <button className="btn-close-modal" onClick={onClose}>
                        <span className="material-icons-round">close</span>
                    </button>
                </div>

                {/* BODY */}
                <div className="hm-body">
                    {/* INFO BANNER */}
                    <div className="hm-section" style={{
                        background: isEditMode ? '#fff7ed' : '#fffbeb',
                        borderColor: isEditMode ? '#fbbf24' : '#fcd34d',
                        padding: '1rem'
                    }}>
                        <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.9rem', color: isEditMode ? '#9a3412' : '#92400e' }}>
                            <span className="material-icons-round" style={{ fontSize: '20px' }}>
                                {isEditMode ? 'warning' : 'info'}
                            </span>
                            <p style={{ margin: 0 }}>
                                {isEditMode ? (
                                    <span>
                                        <strong>⚠️ PRECAUCIÓN:</strong> Editar la factura <strong>reiniciará los pagos</strong> al monto ingresado abajo. Asegúrate de colocar el "Total Pagado" correcto.
                                    </span>
                                ) : (
                                    <span>
                                        <strong>Nota:</strong> Estas facturas no contienen productos, solo montos para afectar el balance.
                                    </span>
                                )}
                            </p>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} id="historical-form">

                        {/* SECTION 1: CLIENT */}
                        <div className="hm-section">
                            <div className="hm-section-title">
                                <span className="material-icons-round" style={{ fontSize: '18px' }}>person</span>
                                Información del Cliente
                            </div>

                            <div className="client-type-selector">
                                <label className={`type-option ${isRegisteredClient ? 'active' : ''}`}>
                                    <input type="radio" checked={isRegisteredClient} onChange={() => setIsRegisteredClient(true)} />
                                    Cliente Registrado
                                </label>
                                <label className={`type-option ${!isRegisteredClient ? 'active' : ''}`}>
                                    <input type="radio" checked={!isRegisteredClient} onChange={() => setIsRegisteredClient(false)} />
                                    Nuevo / Ocasional
                                </label>
                            </div>

                            {isRegisteredClient ? (
                                <div className="client-search-container">
                                    <label className="hm-label">Buscar Cliente <span className="required">*</span></label>
                                    <div className="search-input-wrapper">
                                        <span className="material-icons-round search-icon">search</span>
                                        <input
                                            type="text"
                                            className="hm-input search-mode"
                                            placeholder="Buscar por establecimiento, representante o NIT..."
                                            value={searchTerm}
                                            onChange={(e) => {
                                                setSearchTerm(e.target.value);
                                                setShowDropdown(true);
                                                if (formData.clientId) setFormData(prev => ({ ...prev, clientId: '' })); // Reset if typing
                                            }}
                                            onFocus={() => setShowDropdown(true)}
                                            required={isRegisteredClient && !formData.clientId} // Valid if ID is set
                                        />
                                        {searchTerm && (
                                            <button
                                                type="button"
                                                onClick={clearClientSelection}
                                                style={{
                                                    position: 'absolute',
                                                    right: formData.clientId ? '36px' : '10px',
                                                    top: '50%',
                                                    transform: 'translateY(-50%)',
                                                    background: 'none',
                                                    border: 'none',
                                                    color: '#9ca3af',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    padding: '4px',
                                                    zIndex: 10
                                                }}
                                                title="Limpiar búsqueda"
                                            >
                                                <span className="material-icons-round" style={{ fontSize: '18px' }}>close</span>
                                            </button>
                                        )}
                                        {formData.clientId && (
                                            <span className="material-icons-round" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#10b981' }}>
                                                check_circle
                                            </span>
                                        )}
                                    </div>

                                    {showDropdown && (
                                        <div className="client-dropdown">
                                            {fetchingClients && <div className="no-results">Cargando...</div>}
                                            {!fetchingClients && filteredClients.length === 0 && (
                                                <div className="no-results">No se encontraron clientes</div>
                                            )}
                                            {filteredClients.map(c => (
                                                <div key={c.id} className="client-option" onClick={() => handleClientSelect(c)}>
                                                    <div className="client-option-info">
                                                        <span className="client-name">
                                                            {c.nombre}
                                                            {c.representanteLegal && (
                                                                <span style={{ fontSize: '0.85em', color: '#6b7280', fontWeight: '400' }}> / {c.representanteLegal}</span>
                                                            )}
                                                        </span>
                                                        {c.nit && <span className="client-nit">NIT: {c.nit}</span>}
                                                    </div>
                                                    <span className="material-icons-round" style={{ fontSize: '16px', color: '#9ca3af' }}>chevron_right</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                // NON-REGISTERED INPUTS
                                <div className="hm-grid-2">
                                    <div className="hm-form-group">
                                        <label className="hm-label">Nombre Completo <span className="required">*</span></label>
                                        <input
                                            type="text" name="clientName" className="hm-input"
                                            value={formData.clientName} onChange={handleChange} required={!isRegisteredClient}
                                        />
                                    </div>
                                    <div className="hm-form-group">
                                        <label className="hm-label">Teléfono</label>
                                        <input
                                            type="text" name="clientPhone" className="hm-input"
                                            value={formData.clientPhone} onChange={handleChange}
                                        />
                                    </div>
                                    <div className="hm-form-group">
                                        <label className="hm-label">Email</label>
                                        <input
                                            type="email" name="clientEmail" className="hm-input"
                                            value={formData.clientEmail} onChange={handleChange}
                                        />
                                    </div>
                                    <div className="hm-form-group">
                                        <label className="hm-label">Dirección</label>
                                        <input
                                            type="text" name="clientAddress" className="hm-input"
                                            value={formData.clientAddress} onChange={handleChange}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* SECTION 2: INVOICE DATA */}
                        <div className="hm-section">
                            <div className="hm-section-title">
                                <span className="material-icons-round" style={{ fontSize: '18px' }}>receipt_long</span>
                                Detalles de la Factura
                            </div>

                            <div className="hm-grid-3">
                                <div className="hm-form-group">
                                    <label className="hm-label">No. Factura <span className="required">*</span></label>
                                    <input
                                        type="number" name="invoiceNumber" className="hm-input"
                                        value={formData.invoiceNumber} onChange={handleChange} required min="1"
                                        placeholder="Ej: 1001"
                                        onWheel={(e) => e.target.blur()}
                                    />
                                </div>
                                <div className="hm-form-group">
                                    <label className="hm-label">Tipo <span className="required">*</span></label>
                                    <select
                                        name="invoiceType" className="hm-select"
                                        value={formData.invoiceType} onChange={handleChange} required
                                    >
                                        <option value="NORMAL">Normal</option>
                                        <option value="SR">Remisión (S/R)</option>
                                        <option value="PROMO">Promoción</option>
                                    </select>
                                </div>
                                <div className="hm-form-group">
                                    <label className="hm-label">Fecha Emisión <span className="required">*</span></label>
                                    <input
                                        type="datetime-local" name="fecha" className="hm-input"
                                        value={formData.fecha} onChange={handleChange} required
                                    />
                                </div>
                            </div>

                            <div className="hm-form-group" style={{ marginTop: '1rem' }}>
                                <label className="hm-label">Notas</label>
                                <textarea
                                    name="notes" className="hm-textarea"
                                    value={formData.notes} onChange={handleChange}
                                    placeholder="Detalles adicionales..."
                                />
                            </div>
                        </div>

                        {/* SECTION 3: FINANCIALS */}
                        <div className="hm-section">
                            <div className="hm-section-title">
                                <span className="material-icons-round" style={{ fontSize: '18px' }}>payments</span>
                                Montos
                            </div>

                            <div className="hm-grid-2">
                                <div className="hm-form-group">
                                    <label className="hm-label">Valor Total ($) <span className="required">*</span></label>
                                    <input
                                        type="number" name="totalValue" className="hm-input"
                                        value={formData.totalValue} onChange={handleChange} required min="0" step="0.01"
                                        placeholder="0.00"
                                        onWheel={(e) => e.target.blur()}
                                    />
                                </div>
                                <div className="hm-form-group">
                                    <label className="hm-label">Monto Pagado ($) <span className="required">*</span></label>
                                    <input
                                        type="number" name="amountPaid" className="hm-input"
                                        value={formData.amountPaid} onChange={handleChange} required min="0" step="0.01"
                                        placeholder="0.00"
                                        onWheel={(e) => e.target.blur()}
                                    />
                                    {isEditMode && (
                                        <small style={{ color: '#d97706', fontSize: '0.8em', display: 'block', marginTop: '4px' }}>
                                            * Este monto reemplazará todos los pagos anteriores.
                                        </small>
                                    )}
                                </div>
                            </div>

                            {/* Summary Cards */}
                            <div className="financial-summary">
                                <div className="fin-card">
                                    <span className="fin-label">Total Factura</span>
                                    <span className="fin-value">${total.toFixed(2)}</span>
                                </div>
                                <div className="fin-card">
                                    <span className="fin-label">Abonado</span>
                                    <span className="fin-value" style={{ color: '#10b981' }}>${paid.toFixed(2)}</span>
                                </div>
                                <div className={`fin-card highlight`}>
                                    <span className="fin-label">{isPaidOff ? 'Estado' : 'Saldo Pendiente'}</span>
                                    <span className="fin-value" style={{ color: isPaidOff ? '#10b981' : '#dc2626' }}>
                                        {isPaidOff ? 'PAGADO' : `$${balance.toFixed(2)}`}
                                    </span>
                                </div>
                            </div>
                        </div>

                    </form>
                </div>

                {/* FOOTER */}
                <div className="hm-footer">
                    <button
                        type="button"
                        className="hm-btn hm-btn-secondary"
                        onClick={onClose}
                        disabled={loading}
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        form="historical-form"
                        className={`hm-btn ${isEditMode ? 'hm-btn-warning' : 'hm-btn-primary'}`}
                        disabled={loading}
                        style={isEditMode ? { background: '#f59e0b', borderColor: '#d97706' } : {}}
                    >
                        {loading ? 'Guardando...' : (isEditMode ? 'Actualizar Factura' : 'Registrar Factura')}
                    </button>
                </div>
            </div>
        </div>
    );
}
