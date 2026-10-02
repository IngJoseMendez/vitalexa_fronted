import React, { useState, useEffect, useCallback, useMemo } from 'react';
import client from '../../api/client';
import { useToast } from '../ToastContainer';
import { useConfirm } from '../ConfirmDialog';
import './HistoricalInvoiceModal.css';

// El backend guarda las fechas en hora de Colombia, sin zona: se editan y envían tal cual.
// Pasarlas por toISOString() las convertía a UTC y cada guardado corría la fecha +5 horas.
const toDateTimeLocal = (value) => {
    if (typeof value === 'string') return value.slice(0, 16); // "2026-09-23T00:00:00" → "2026-09-23T00:00"
    const date = value instanceof Date ? value : new Date();
    const tzOffset = date.getTimezoneOffset() * 60000;
    return new Date(date - tzOffset).toISOString().slice(0, 16);
};

export default function HistoricalInvoiceModal({ onClose, onSuccess, initialOrder = null }) {
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(false);
    const [fetchingClients, setFetchingClients] = useState(true);
    const [isRegisteredClient, setIsRegisteredClient] = useState(true);
    const toast = useToast();
    const askConfirm = useConfirm();

    // Edit Mode Flag
    const isEditMode = !!initialOrder;

    // Search State
    const [searchTerm, setSearchTerm] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);

    // Form State
    const [formData, setFormData] = useState({
        invoiceNumber: '',
        fecha: toDateTimeLocal(new Date()),
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

            // Fecha de la factura: completedAt (la que muestran la tarjeta y el PDF);
            // las históricas no tienen completedAt y su fecha es la de la factura
            const invoiceDate = toDateTimeLocal(initialOrder.completedAt ?? initialOrder.fecha);

            // Find client if possible
            const matchedClient = clients.find(c => c.nombre === initialOrder.cliente);

            setFormData({
                invoiceNumber: initialOrder.invoiceNumber || '',
                fecha: invoiceDate,
                // ?? (no ||) para que una factura en $0 se prellene con 0 y no quede vacía
                totalValue: initialOrder.total ?? '',
                amountPaid: initialOrder.totalPaid ?? '', // Pre-fill with current paid amount?
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
            const confirmed = await askConfirm({
                title: 'Advertencia de edición',
                message:
                    "ADVERTENCIA DE EDICIÓN\n\n" +
                    "Al guardar estos cambios:\n" +
                    "1. Los pagos existentes se ELIMINARÁN y se creará uno nuevo con el 'Monto Pagado' ingresado.\n" +
                    "2. Los datos de la factura se actualizarán permanentemente.\n\n" +
                    "¿Está seguro de continuar?",
                confirmText: 'Guardar',
                cancelText: 'Cancelar'
            });
            if (!confirmed) return;
        }

        setLoading(true);

        try {
            const payload = {
                invoiceNumber: parseInt(formData.invoiceNumber),
                fecha: formData.fecha,
                totalValue: parseFloat(formData.totalValue),
                amountPaid: parseFloat(formData.amountPaid),
                invoiceType: formData.invoiceType,
                notes: formData.notes
            };
            // Le indica al backend que la fecha editada es la de la factura (completedAt)
            if (isEditMode) payload.invoiceDate = formData.fecha;

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
        <div className="ui-modal-overlay hm-overlay">
            <div
                className="ui-modal ui-modal--lg hm-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="hm-title"
                onClick={e => e.stopPropagation()}
            >
                {/* HEADER */}
                <div className="ui-modal-header">
                    <span className={`ui-modal-icon${isEditMode ? ' ui-modal-icon--warning' : ''}`} aria-hidden="true">
                        <span className="material-icons-round">{isEditMode ? 'edit' : 'history'}</span>
                    </span>
                    <div className="ui-modal-heading">
                        <h3 id="hm-title" className="ui-modal-title">
                            {isEditMode ? 'Editar Factura / Orden' : 'Registrar Factura Histórica'}
                        </h3>
                    </div>
                    <button type="button" className="ui-icon-btn" onClick={onClose} aria-label="Cerrar">
                        <span className="material-icons-round" aria-hidden="true">close</span>
                    </button>
                </div>

                {/* BODY */}
                <div className="ui-modal-body">
                    {/* INFO BANNER */}
                    <div className={`ui-alert ${isEditMode ? 'ui-alert--warning' : 'ui-alert--info'}`}>
                        <span className="material-icons-round" aria-hidden="true">
                            {isEditMode ? 'warning' : 'info'}
                        </span>
                        <p>
                            {isEditMode ? (
                                <span>
                                    <strong>PRECAUCIÓN:</strong> Editar la factura <strong>reiniciará los pagos</strong> al monto ingresado abajo. Asegúrate de colocar el "Total Pagado" correcto.
                                </span>
                            ) : (
                                <span>
                                    <strong>Nota:</strong> Estas facturas no contienen productos, solo montos para afectar el balance.
                                </span>
                            )}
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} id="historical-form" className="hm-form">

                        {/* SECTION 1: CLIENT */}
                        <section className="ui-section">
                            <div className="ui-section-head">
                                <span className="ui-step" aria-hidden="true">1</span>
                                <div>
                                    <h4 className="ui-section-title">Información del Cliente</h4>
                                </div>
                            </div>

                            <div className="ui-choice-grid hm-client-type" role="radiogroup" aria-label="Tipo de cliente">
                                <label className={`ui-choice ui-choice--compact${isRegisteredClient ? ' is-selected' : ''}`}>
                                    <input type="radio" checked={isRegisteredClient} onChange={() => setIsRegisteredClient(true)} />
                                    <span className="material-icons-round ui-choice-icon" aria-hidden="true">how_to_reg</span>
                                    <span className="ui-choice-text">
                                        <span className="ui-choice-title">Cliente Registrado</span>
                                    </span>
                                </label>
                                <label className={`ui-choice ui-choice--compact${!isRegisteredClient ? ' is-selected' : ''}`}>
                                    <input type="radio" checked={!isRegisteredClient} onChange={() => setIsRegisteredClient(false)} />
                                    <span className="material-icons-round ui-choice-icon" aria-hidden="true">person_add</span>
                                    <span className="ui-choice-text">
                                        <span className="ui-choice-title">Nuevo / Ocasional</span>
                                    </span>
                                </label>
                            </div>

                            {isRegisteredClient ? (
                                <div className="client-search-container ui-field hm-client-search">
                                    <label className="ui-label" htmlFor="hm-client-search">Buscar Cliente <span className="ui-required">*</span></label>
                                    <div className="ui-input-group hm-search">
                                        <span className="material-icons-round ui-input-icon" aria-hidden="true">search</span>
                                        <input
                                            id="hm-client-search"
                                            type="text"
                                            className="ui-input hm-search-input"
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
                                                className={`ui-icon-btn hm-search-clear${formData.clientId ? ' has-check' : ''}`}
                                                title="Limpiar búsqueda"
                                            >
                                                <span className="material-icons-round" aria-hidden="true">close</span>
                                            </button>
                                        )}
                                        {formData.clientId && (
                                            <span className="material-icons-round hm-search-check" aria-hidden="true">
                                                check_circle
                                            </span>
                                        )}
                                    </div>

                                    {showDropdown && (
                                        <div className="hm-dropdown">
                                            {fetchingClients && <div className="hm-no-results">Cargando...</div>}
                                            {!fetchingClients && filteredClients.length === 0 && (
                                                <div className="hm-no-results">No se encontraron clientes</div>
                                            )}
                                            {filteredClients.map(c => (
                                                <div key={c.id} className="hm-option" onClick={() => handleClientSelect(c)}>
                                                    <div className="hm-option-info">
                                                        <span className="hm-option-name">
                                                            {c.nombre}
                                                            {c.representanteLegal && (
                                                                <span className="hm-option-rep"> / {c.representanteLegal}</span>
                                                            )}
                                                        </span>
                                                        {c.nit && <span className="hm-option-nit">NIT: {c.nit}</span>}
                                                    </div>
                                                    <span className="material-icons-round hm-option-chevron" aria-hidden="true">chevron_right</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                // NON-REGISTERED INPUTS
                                <div className="ui-grid">
                                    <div className="ui-field">
                                        <label className="ui-label" htmlFor="hm-client-name">Nombre Completo <span className="ui-required">*</span></label>
                                        <input
                                            id="hm-client-name"
                                            type="text" name="clientName" className="ui-input"
                                            value={formData.clientName} onChange={handleChange} required={!isRegisteredClient}
                                        />
                                    </div>
                                    <div className="ui-field">
                                        <label className="ui-label" htmlFor="hm-client-phone">Teléfono</label>
                                        <input
                                            id="hm-client-phone"
                                            type="text" name="clientPhone" className="ui-input"
                                            value={formData.clientPhone} onChange={handleChange}
                                        />
                                    </div>
                                    <div className="ui-field">
                                        <label className="ui-label" htmlFor="hm-client-email">Email</label>
                                        <input
                                            id="hm-client-email"
                                            type="email" name="clientEmail" className="ui-input"
                                            value={formData.clientEmail} onChange={handleChange}
                                        />
                                    </div>
                                    <div className="ui-field">
                                        <label className="ui-label" htmlFor="hm-client-address">Dirección</label>
                                        <input
                                            id="hm-client-address"
                                            type="text" name="clientAddress" className="ui-input"
                                            value={formData.clientAddress} onChange={handleChange}
                                        />
                                    </div>
                                </div>
                            )}
                        </section>

                        {/* SECTION 2: INVOICE DATA */}
                        <section className="ui-section">
                            <div className="ui-section-head">
                                <span className="ui-step" aria-hidden="true">2</span>
                                <div>
                                    <h4 className="ui-section-title">Detalles de la Factura</h4>
                                </div>
                            </div>

                            <div className="ui-grid ui-grid--3">
                                <div className="ui-field">
                                    <label className="ui-label" htmlFor="hm-invoice-number">No. Factura <span className="ui-required">*</span></label>
                                    <input
                                        id="hm-invoice-number"
                                        type="number" name="invoiceNumber" className="ui-input"
                                        value={formData.invoiceNumber} onChange={handleChange} required min="1"
                                        placeholder="Ej: 1001"
                                        onWheel={(e) => e.target.blur()}
                                    />
                                </div>
                                <div className="ui-field">
                                    <label className="ui-label" htmlFor="hm-invoice-type">Tipo <span className="ui-required">*</span></label>
                                    <select
                                        id="hm-invoice-type"
                                        name="invoiceType" className="ui-select"
                                        value={formData.invoiceType} onChange={handleChange} required
                                    >
                                        <option value="NORMAL">Normal</option>
                                        <option value="SR">Remisión (S/R)</option>
                                        <option value="PROMO">Promoción</option>
                                    </select>
                                </div>
                                <div className="ui-field">
                                    <label className="ui-label" htmlFor="hm-invoice-date">Fecha Factura <span className="ui-required">*</span></label>
                                    <input
                                        id="hm-invoice-date"
                                        type="datetime-local" name="fecha" className="ui-input"
                                        value={formData.fecha} onChange={handleChange} required
                                    />
                                </div>
                            </div>

                            <div className="ui-field hm-notes">
                                <label className="ui-label" htmlFor="hm-notes">Notas</label>
                                <textarea
                                    id="hm-notes"
                                    name="notes" className="ui-textarea"
                                    value={formData.notes} onChange={handleChange}
                                    placeholder="Detalles adicionales..."
                                />
                            </div>
                        </section>

                        {/* SECTION 3: FINANCIALS */}
                        <section className="ui-section">
                            <div className="ui-section-head">
                                <span className="ui-step" aria-hidden="true">3</span>
                                <div>
                                    <h4 className="ui-section-title">Montos</h4>
                                </div>
                            </div>

                            <div className="ui-grid">
                                <div className="ui-field">
                                    <label className="ui-label" htmlFor="hm-total-value">Valor Total ($) <span className="ui-required">*</span></label>
                                    <input
                                        id="hm-total-value"
                                        type="number" name="totalValue" className="ui-input"
                                        value={formData.totalValue} onChange={handleChange} required min="0" step="0.01"
                                        placeholder="0.00"
                                        onWheel={(e) => e.target.blur()}
                                    />
                                </div>
                                <div className="ui-field">
                                    <label className="ui-label" htmlFor="hm-amount-paid">Monto Pagado ($) <span className="ui-required">*</span></label>
                                    <input
                                        id="hm-amount-paid"
                                        type="number" name="amountPaid" className="ui-input"
                                        value={formData.amountPaid} onChange={handleChange} required min="0" step="0.01"
                                        placeholder="0.00"
                                        onWheel={(e) => e.target.blur()}
                                    />
                                    {isEditMode && (
                                        <small className="ui-help hm-help-warning">
                                            * Este monto reemplazará todos los pagos anteriores.
                                        </small>
                                    )}
                                </div>
                            </div>

                            {/* Summary Cards */}
                            <div className="hm-fin">
                                <div className="hm-fin-card">
                                    <span className="hm-fin-label">Total Factura</span>
                                    <span className="hm-fin-value">${total.toFixed(2)}</span>
                                </div>
                                <div className="hm-fin-card">
                                    <span className="hm-fin-label">Abonado</span>
                                    <span className="hm-fin-value hm-text-success">${paid.toFixed(2)}</span>
                                </div>
                                <div className="hm-fin-card hm-fin-card--balance">
                                    <span className="hm-fin-label">{isPaidOff ? 'Estado' : 'Saldo Pendiente'}</span>
                                    <span className={`hm-fin-value ${isPaidOff ? 'hm-text-success' : 'hm-text-danger'}`}>
                                        {isPaidOff ? 'PAGADO' : `$${balance.toFixed(2)}`}
                                    </span>
                                </div>
                            </div>
                        </section>

                    </form>
                </div>

                {/* FOOTER */}
                <div className="ui-modal-footer">
                    <button
                        type="button"
                        className="ui-btn ui-btn--secondary"
                        onClick={onClose}
                        disabled={loading}
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        form="historical-form"
                        className="ui-btn ui-btn--primary"
                        disabled={loading}
                    >
                        {loading ? 'Guardando...' : (isEditMode ? 'Actualizar Factura' : 'Registrar Factura')}
                    </button>
                </div>
            </div>
        </div>
    );
}
