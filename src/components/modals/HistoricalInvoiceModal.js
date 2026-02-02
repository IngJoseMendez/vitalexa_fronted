import React, { useState, useEffect, useCallback } from 'react';
import client from '../../api/client';
import { useToast } from '../ToastContainer';

export default function HistoricalInvoiceModal({ onClose, onSuccess }) {
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(false);
    const [fetchingClients, setFetchingClients] = useState(true);
    const [isRegisteredClient, setIsRegisteredClient] = useState(true);
    const toast = useToast();

    // Form State
    const [formData, setFormData] = useState({
        invoiceNumber: '',
        fecha: new Date().toISOString().slice(0, 16), // Default to current time for input type="datetime-local"
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

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            // Prepare payload
            const payload = {
                invoiceNumber: parseInt(formData.invoiceNumber),
                fecha: new Date(formData.fecha).toISOString(), // Ensure ISO format
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

            await client.post('/owner/invoices', payload);
            toast.success('Factura histórica registrada exitosamente');
            if (onSuccess) onSuccess();
            onClose();

        } catch (error) {
            console.error('Error creating historical invoice:', error);
            if (error.response) {
                if (error.response.status === 409) {
                    toast.error('Ya existe una factura con ese número. Usa uno diferente.');
                } else if (error.response.status === 400) {
                    toast.error('Datos inválidos. Verifica que el número de factura y montos sean positivos.');
                } else if (error.response.status === 403) {
                    toast.error('No tienes permisos para realizar esta acción.');
                } else {
                    toast.error(error.response.data?.message || 'Error al registrar factura');
                }
            } else {
                toast.error('Error de conexión al servidor');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: '600px', width: '95%' }} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>
                        <span className="material-icons-round" style={{ fontSize: '24px', verticalAlign: 'middle', marginRight: '8px', color: '#fbbf24' }}>
                            history
                        </span>
                        Registrar Factura Histórica
                    </h3>
                    <button className="btn-close" onClick={onClose}>
                        <span className="material-icons-round">close</span>
                    </button>
                </div>

                <div className="modal-body" style={{ padding: '1.5rem', maxHeight: '70vh', overflowY: 'auto' }}>
                    <div className="info-box" style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem', fontSize: '0.9rem', color: '#92400e' }}>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <span className="material-icons-round" style={{ fontSize: '20px' }}>info</span>
                            <div>
                                <strong>Nota Importante:</strong>
                                <p style={{ margin: '0.2rem 0' }}>
                                    Las facturas históricas se registran automáticamente como <strong>COMPLETADAS</strong> y afectan el balance del cliente. No contienen productos individuales.
                                </p>
                            </div>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="historical-invoice-form">
                        {/* TIPO DE CLIENTE TOOGLE */}
                        <div className="form-group" style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Tipo de Cliente</label>
                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                    <input
                                        type="radio"
                                        checked={isRegisteredClient}
                                        onChange={() => setIsRegisteredClient(true)}
                                    />
                                    Cliente Registrado
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                    <input
                                        type="radio"
                                        checked={!isRegisteredClient}
                                        onChange={() => setIsRegisteredClient(false)}
                                    />
                                    Cliente Ocasional / No Registrado
                                </label>
                            </div>
                        </div>

                        {/* SELECCIÓN DE CLIENTE */}
                        {isRegisteredClient ? (
                            <div className="form-group">
                                <label>Cliente <span className="required">*</span></label>
                                {fetchingClients ? (
                                    <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>Cargando clientes...</div>
                                ) : (
                                    <select
                                        name="clientId"
                                        value={formData.clientId}
                                        onChange={handleChange}
                                        className="form-input"
                                        required={isRegisteredClient}
                                    >
                                        <option value="">-- Seleccionar Cliente --</option>
                                        {clients.map(c => (
                                            <option key={c.id} value={c.id}>
                                                {c.nombre} {c.nit ? `(NIT: ${c.nit})` : ''}
                                            </option>
                                        ))}
                                    </select>
                                )}
                            </div>
                        ) : (
                            // CAMPOS PARA CLIENTE NO REGISTRADO
                            <div style={{ background: '#f9fafb', padding: '1rem', borderRadius: '8px', border: '1px solid #e5e7eb', marginBottom: '1rem' }}>
                                <div className="form-group">
                                    <label>Nombre del Cliente <span className="required">*</span></label>
                                    <input
                                        type="text"
                                        name="clientName"
                                        value={formData.clientName}
                                        onChange={handleChange}
                                        className="form-input"
                                        placeholder="Ej: Juan Pérez"
                                        required={!isRegisteredClient}
                                    />
                                </div>
                                <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <div className="form-group">
                                        <label>Teléfono</label>
                                        <input
                                            type="text"
                                            name="clientPhone"
                                            value={formData.clientPhone}
                                            onChange={handleChange}
                                            className="form-input"
                                            placeholder="Opcional"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Email</label>
                                        <input
                                            type="email"
                                            name="clientEmail"
                                            value={formData.clientEmail}
                                            onChange={handleChange}
                                            className="form-input"
                                            placeholder="Opcional"
                                        />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Dirección</label>
                                    <input
                                        type="text"
                                        name="clientAddress"
                                        value={formData.clientAddress}
                                        onChange={handleChange}
                                        className="form-input"
                                        placeholder="Opcional"
                                    />
                                </div>
                            </div>
                        )}

                        <hr style={{ margin: '1.5rem 0', border: 'none', borderTop: '1px solid #e5e7eb' }} />

                        {/* DATOS DE LA FACTURA */}
                        <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                            <div className="form-group">
                                <label>Número de Factura <span className="required">*</span></label>
                                <input
                                    type="number"
                                    name="invoiceNumber"
                                    value={formData.invoiceNumber}
                                    onChange={handleChange}
                                    className="form-input"
                                    placeholder="Ej: 1001"
                                    min="1"
                                    required
                                    onWheel={(e) => e.target.blur()}
                                />
                            </div>
                            <div className="form-group">
                                <label>Tipo de Factura <span className="required">*</span></label>
                                <select
                                    name="invoiceType"
                                    value={formData.invoiceType}
                                    onChange={handleChange}
                                    className="form-input"
                                    required
                                >
                                    <option value="NORMAL">Normal (Standard)</option>
                                    <option value="SR">Remisión (S/R)</option>
                                    <option value="PROMO">Promoción</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Fecha de Emisión <span className="required">*</span></label>
                                <input
                                    type="datetime-local"
                                    name="fecha"
                                    value={formData.fecha}
                                    onChange={handleChange}
                                    className="form-input"
                                    required
                                />
                            </div>
                        </div>

                        <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div className="form-group">
                                <label>Valor Total ($) <span className="required">*</span></label>
                                <input
                                    type="number"
                                    name="totalValue"
                                    value={formData.totalValue}
                                    onChange={handleChange}
                                    className="form-input"
                                    placeholder="0.00"
                                    min="0"
                                    step="0.01"
                                    required
                                    onWheel={(e) => e.target.blur()}
                                />
                            </div>
                            <div className="form-group">
                                <label>Monto Pagado ($) <span className="required">*</span></label>
                                <input
                                    type="number"
                                    name="amountPaid"
                                    value={formData.amountPaid}
                                    onChange={handleChange}
                                    className="form-input"
                                    placeholder="Lo que pagó el cliente"
                                    min="0"
                                    step="0.01"
                                    required
                                    onWheel={(e) => e.target.blur()}
                                />
                                <small style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                                    La deuda se calculará automáticamente (Total - Pagado)
                                </small>
                            </div>
                        </div>

                        <div className="form-group">
                            <label>Notas Adicionales</label>
                            <textarea
                                name="notes"
                                value={formData.notes}
                                onChange={handleChange}
                                className="form-input"
                                rows="3"
                                placeholder="Detalles extra sobre esta factura histórica..."
                            />
                        </div>

                        <div className="modal-footer" style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={onClose}
                                disabled={loading}
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                className="btn-primary"
                                disabled={loading}
                                style={{
                                    background: '#fbbf24',
                                    color: '#78350f',
                                    fontWeight: 700,
                                    border: 'none',
                                    padding: '0.75rem 1.5rem',
                                    borderRadius: '0.5rem',
                                    cursor: 'pointer'
                                }}
                            >
                                {loading ? 'Registrando...' : 'Registrar Factura'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
