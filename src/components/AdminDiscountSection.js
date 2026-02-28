import React, { useState, useEffect, useCallback } from 'react';
import client from '../api/client';
import { useToast } from './ToastContainer';

/**
 * Sección de descuentos para admins.
 * Props:
 *   orderId      – UUID de la orden
 *   orderStatus  – estado actual de la orden (e.g. 'COMPLETADO')
 *   onDiscountChange – callback para refrescar la orden padre
 */
const AdminDiscountSection = ({ orderId, orderStatus, onDiscountChange }) => {
    const [discounts, setDiscounts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [revoking, setRevoking] = useState(null); // id del descuento en proceso de revocación
    const [customPercent, setCustomPercent] = useState('');
    const [customReason, setCustomReason] = useState('');
    const toast = useToast();

    // Si la orden está completada, el admin no puede revocar descuentos
    const canRevoke = orderStatus !== 'COMPLETADO';

    const fetchDiscounts = useCallback(async () => {
        if (!orderId) return;
        try {
            const res = await client.get(`/admin/discounts/order/${orderId}`);
            setDiscounts(res.data || []);
        } catch (error) {
            console.error('Error fetching discounts:', error);
        }
    }, [orderId]);

    useEffect(() => {
        fetchDiscounts();
    }, [fetchDiscounts]);

    const applyPreset = async (percent) => {
        setLoading(true);
        try {
            await client.post(`/admin/discounts/order/${orderId}/apply-${percent}`);
            toast.success(`Descuento de ${percent}% aplicado`);
            await fetchDiscounts();
            if (onDiscountChange) onDiscountChange();
        } catch (error) {
            console.error(error);
            toast.error('Error aplicando descuento: ' + (error.response?.data?.message || error.message));
        } finally {
            setLoading(false);
        }
    };

    const applyCustom = async (e) => {
        e.preventDefault();
        if (!customPercent || parseFloat(customPercent) <= 0) {
            toast.warning('Porcentaje inválido');
            return;
        }
        setLoading(true);
        try {
            await client.post('/admin/discounts/custom', {
                orderId,
                percentage: parseFloat(customPercent),
                reason: customReason || 'Descuento personalizado'
            });
            toast.success('Descuento personalizado aplicado');
            setCustomPercent('');
            setCustomReason('');
            await fetchDiscounts();
            if (onDiscountChange) onDiscountChange();
        } catch (error) {
            console.error(error);
            toast.error('Error: ' + (error.response?.data?.message || error.message));
        } finally {
            setLoading(false);
        }
    };

    const revokeDiscount = async (discountId) => {
        if (!window.confirm('¿Revocar este descuento? El total de la orden se recalculará.')) return;
        setRevoking(discountId);
        try {
            await client.delete(`/admin/discounts/${discountId}`);
            toast.success('Descuento revocado');
            await fetchDiscounts();
            if (onDiscountChange) onDiscountChange();
        } catch (error) {
            console.error(error);
            toast.error('Error al revocar: ' + (error.response?.data?.message || error.message));
        } finally {
            setRevoking(null);
        }
    };

    return (
        <div style={{ marginTop: '1rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <h4 style={{ margin: '0 0 1rem 0', color: '#475569', fontSize: '0.95rem' }}>Gestión de Descuentos (Admin)</h4>

            {/* Lista de descuentos aplicados */}
            {discounts.length > 0 && (
                <div style={{ marginBottom: '1rem' }}>
                    <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '0.5rem' }}>Descuentos Aplicados:</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        {discounts.map(d => {
                            const isRevoked = d.status === 'REVOKED';
                            const isBeingRevoked = revoking === d.id;
                            return (
                                <span
                                    key={d.id}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.35rem',
                                        background: isRevoked ? '#fee2e2' : '#dbeafe',
                                        color: isRevoked ? '#991b1b' : '#1e40af',
                                        padding: '0.3rem 0.5rem',
                                        borderRadius: '4px',
                                        fontSize: '0.8rem',
                                        fontWeight: 600,
                                        border: `1px solid ${isRevoked ? '#fecaca' : '#bfdbfe'}`,
                                        textDecoration: isRevoked ? 'line-through' : 'none',
                                        opacity: isRevoked ? 0.75 : 1,
                                    }}
                                >
                                    {d.type === 'CUSTOM' ? `Custom: ${d.percentage}%` : `${d.percentage}%`}
                                    {d.reason ? ` - ${d.reason}` : ''}
                                    {isRevoked && <span style={{ fontSize: '0.7rem', fontWeight: 400 }}>(revocado)</span>}

                                    {/* Botón revocar: solo si la orden no está completada y el descuento no está ya revocado */}
                                    {canRevoke && !isRevoked && (
                                        <button
                                            onClick={() => revokeDiscount(d.id)}
                                            disabled={isBeingRevoked || loading}
                                            title="Revocar descuento"
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                background: 'none',
                                                border: 'none',
                                                cursor: 'pointer',
                                                color: '#dc2626',
                                                fontSize: '14px',
                                                lineHeight: 1,
                                                padding: '0 2px',
                                                opacity: isBeingRevoked ? 0.5 : 1,
                                                fontWeight: 700,
                                            }}
                                        >
                                            {isBeingRevoked ? '…' : '×'}
                                        </button>
                                    )}
                                </span>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Formulario de aplicar descuento — oculto si la orden está completada */}
            {canRevoke && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {/* Presets */}
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Presets:</span>
                        <button onClick={() => applyPreset(10)} disabled={loading}
                            style={{ padding: '0.4rem 0.8rem', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', background: 'white' }}>10%</button>
                        <button onClick={() => applyPreset(12)} disabled={loading}
                            style={{ padding: '0.4rem 0.8rem', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', background: 'white' }}>12%</button>
                        <button onClick={() => applyPreset(15)} disabled={loading}
                            style={{ padding: '0.4rem 0.8rem', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', background: 'white' }}>15%</button>
                    </div>

                    {/* Custom */}
                    <form onSubmit={applyCustom} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Custom:</span>
                        <input
                            type="number" step="0.01" placeholder="%" value={customPercent}
                            onChange={e => setCustomPercent(e.target.value)}
                            style={{ width: '70px', padding: '0.4rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                            disabled={loading} min="0" max="100" onWheel={(e) => e.target.blur()}
                        />
                        <input
                            type="text" placeholder="Razón / Motivo" value={customReason}
                            onChange={e => setCustomReason(e.target.value)}
                            style={{ flex: 1, minWidth: '150px', padding: '0.4rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                            disabled={loading}
                        />
                        <button type="submit" disabled={loading || !customPercent}
                            style={{
                                padding: '0.4rem 1rem', background: '#3b82f6', color: 'white', border: 'none',
                                borderRadius: '4px', cursor: 'pointer', fontWeight: 600, opacity: loading ? 0.7 : 1
                            }}>
                            Aplicar
                        </button>
                    </form>
                </div>
            )}

            {/* Mensaje informativo cuando la orden ya está completada */}
            {!canRevoke && discounts.length === 0 && (
                <p style={{ fontSize: '0.82rem', color: '#94a3b8', fontStyle: 'italic' }}>
                    Sin descuentos aplicados.
                </p>
            )}
            {!canRevoke && discounts.length > 0 && (
                <p style={{ fontSize: '0.82rem', color: '#94a3b8', fontStyle: 'italic', marginTop: '0.5rem' }}>
                    La orden está completada. Solo el Owner puede modificar descuentos.
                </p>
            )}
        </div>
    );
};

export default AdminDiscountSection;
