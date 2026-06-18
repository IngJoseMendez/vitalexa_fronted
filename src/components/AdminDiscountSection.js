import React, { useState, useEffect, useCallback } from 'react';
import client from '../api/client';
import { useToast } from './ToastContainer';
import { useConfirm } from './ConfirmDialog';

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
    const confirm = useConfirm();

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
        const ok = await confirm({
            title: 'Revocar descuento',
            message: 'El total de la orden se recalculará. ¿Deseas revocar este descuento?',
            confirmText: 'Revocar',
            cancelText: 'Cancelar'
        });
        if (!ok) return;
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
        <div className="discount-section">
            <h4 className="discount-section-title">
                <span className="material-icons-round">sell</span>
                Gestión de Descuentos (Admin)
            </h4>

            {/* Lista de descuentos aplicados */}
            {discounts.length > 0 && (
                <div className="discount-applied">
                    <p className="discount-applied-label">Descuentos aplicados</p>
                    <div className="discount-chips">
                        {discounts.map(d => {
                            const isRevoked = d.status === 'REVOKED';
                            const isBeingRevoked = revoking === d.id;
                            return (
                                <span key={d.id} className={`discount-chip ${isRevoked ? 'revoked' : ''}`}>
                                    <span className="discount-chip-pct">
                                        {d.type === 'CUSTOM' ? `Custom ${d.percentage}%` : `${d.percentage}%`}
                                    </span>
                                    {d.reason ? <span className="discount-chip-reason">{d.reason}</span> : null}
                                    {isRevoked && <span className="discount-chip-tag">(revocado)</span>}

                                    {/* Botón revocar: solo si la orden no está completada y el descuento no está ya revocado */}
                                    {canRevoke && !isRevoked && (
                                        <button
                                            className="discount-chip-remove"
                                            onClick={() => revokeDiscount(d.id)}
                                            disabled={isBeingRevoked || loading}
                                            title="Revocar descuento"
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
                <div className="discount-controls">
                    {/* Atajos rápidos */}
                    <div className="discount-presets">
                        {[10, 12, 15].map(pct => (
                            <button
                                key={pct}
                                className="discount-preset-btn"
                                onClick={() => applyPreset(pct)}
                                disabled={loading}
                            >
                                {pct}%
                            </button>
                        ))}
                    </div>

                    {/* Personalizado: %, motivo opcional y aplicar en una sola fila compacta */}
                    <form className="discount-custom-form" onSubmit={applyCustom}>
                        <input
                            type="number" step="0.01" placeholder="%" value={customPercent}
                            onChange={e => setCustomPercent(e.target.value)}
                            className="discount-input discount-input-pct"
                            disabled={loading} min="0" max="100" onWheel={(e) => e.target.blur()}
                        />
                        <input
                            type="text" placeholder="Motivo (opcional)" value={customReason}
                            onChange={e => setCustomReason(e.target.value)}
                            className="discount-input discount-input-reason"
                            disabled={loading}
                        />
                        <button type="submit" className="discount-apply-btn" disabled={loading || !customPercent}>
                            Aplicar
                        </button>
                    </form>
                </div>
            )}

            {/* Mensaje informativo cuando la orden ya está completada */}
            {!canRevoke && discounts.length === 0 && (
                <p className="discount-empty-note">Sin descuentos aplicados.</p>
            )}
            {!canRevoke && discounts.length > 0 && (
                <p className="discount-empty-note">La orden está completada. Solo el Owner puede modificar descuentos.</p>
            )}
        </div>
    );
};

export default AdminDiscountSection;
