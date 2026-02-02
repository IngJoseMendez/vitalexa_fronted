import React, { useState, useEffect, useCallback } from 'react';
import client from '../api/client';
import { useToast } from './ToastContainer';

const AdminDiscountSection = ({ orderId, onDiscountChange }) => {
    const [discounts, setDiscounts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [customPercent, setCustomPercent] = useState('');
    const [customReason, setCustomReason] = useState('');
    const toast = useToast();

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

    // Calculate total effective discount percentage for display if needed, 
    // or just list them.

    return (
        <div style={{ marginTop: '1rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <h4 style={{ margin: '0 0 1rem 0', color: '#475569', fontSize: '0.95rem' }}>Gestión de Descuentos (Admin)</h4>

            {/* List of Applied Discounts */}
            {discounts.length > 0 && (
                <div style={{ marginBottom: '1rem' }}>
                    <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '0.5rem' }}>Descuentos Aplicados:</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        {discounts.map(d => (
                            <span key={d.id} style={{
                                background: '#dbeafe', color: '#1e40af',
                                padding: '0.3rem 0.6rem', borderRadius: '4px',
                                fontSize: '0.8rem', fontWeight: 600, border: '1px solid #bfdbfe'
                            }}>
                                {d.type === 'CUSTOM' ? `Custom: ${d.percentage}%` : `${d.percentage}%`}
                                {d.reason ? ` - ${d.reason}` : ''}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Presets */}
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Presets:</span>
                    <button
                        onClick={() => applyPreset(10)}
                        disabled={loading}
                        style={{ padding: '0.4rem 0.8rem', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', background: 'white' }}
                    >10%</button>
                    <button
                        onClick={() => applyPreset(12)}
                        disabled={loading}
                        style={{ padding: '0.4rem 0.8rem', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', background: 'white' }}
                    >12%</button>
                    <button
                        onClick={() => applyPreset(15)}
                        disabled={loading}
                        style={{ padding: '0.4rem 0.8rem', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', background: 'white' }}
                    >15%</button>
                </div>

                {/* Custom */}
                <form onSubmit={applyCustom} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Custom:</span>
                    <input
                        type="number"
                        step="0.01"
                        placeholder="%"
                        value={customPercent}
                        onChange={e => setCustomPercent(e.target.value)}
                        style={{ width: '70px', padding: '0.4rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                        disabled={loading}
                        min="0"
                        max="100"
                        onWheel={(e) => e.target.blur()}
                    />
                    <input
                        type="text"
                        placeholder="Razón / Motivo"
                        value={customReason}
                        onChange={e => setCustomReason(e.target.value)}
                        style={{ flex: 1, minWidth: '150px', padding: '0.4rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                        disabled={loading}
                    />
                    <button
                        type="submit"
                        disabled={loading || !customPercent}
                        style={{
                            padding: '0.4rem 1rem', background: '#3b82f6', color: 'white', border: 'none',
                            borderRadius: '4px', cursor: 'pointer', fontWeight: 600, opacity: loading ? 0.7 : 1
                        }}
                    >
                        Aplicar
                    </button>
                </form>
            </div>
        </div>
    );
};

export default AdminDiscountSection;
