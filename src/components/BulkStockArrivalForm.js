import React, { useState } from 'react';
import { useToast } from './ToastContainer';
import productService from '../api/productService';

export default function BulkStockArrivalForm({ products, onClose, onSuccess }) {
    const toast = useToast();

    const [reason, setReason] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [quantities, setQuantities] = useState({}); // Map productId -> quantity string
    const [loading, setLoading] = useState(false);

    // Filter products
    const displayedProducts = products.filter(p =>
        !p.isSpecialProduct && // Exclude special products
        p.active && // Only active products
        (p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (p.id && p.id.toString().includes(searchTerm)))
    );

    const handleQuantityChange = (productId, value) => {
        setQuantities(prev => ({
            ...prev,
            [productId]: value
        }));
    };

    const handleSubmit = async () => {
        const items = [];
        Object.keys(quantities).forEach(pid => {
            const qty = parseInt(quantities[pid]);
            if (!isNaN(qty) && qty > 0) {
                items.push({ productId: pid, quantity: qty });
            }
        });

        if (items.length === 0) {
            toast.warning('Ingrese al menos una cantidad válida mayor a 0.');
            return;
        }

        if (!window.confirm(`¿Confirmar llegada de stock para ${items.length} productos?`)) return;

        setLoading(true);
        try {
            const response = await productService.addStockBulk({
                reason: reason || 'Carga Masiva',
                items: items
            });

            // Handle Blob Download (PDF)
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `huella_carga_masiva_stock_${Date.now()}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.parentNode.removeChild(link);

            toast.success(`Stock actualizado correctamente para ${items.length} productos.`);
            onSuccess();
        } catch (error) {
            console.error('Bulk stock error:', error);

            // Handle Blob Error (convert blob to text/json if needed)
            if (error.response && error.response.data instanceof Blob) {
                try {
                    const text = await error.response.data.text();
                    const json = JSON.parse(text);
                    toast.error('Error: ' + (json.message || 'Error desconocido'));
                } catch (parseErr) {
                    toast.error('Error al procesar la carga masiva.');
                }
            } else {
                toast.error('Error en la carga masiva: ' + (error.response?.data?.message || error.message));
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ background: 'white', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className="material-icons-round" style={{ color: 'var(--primary)' }}>inventory</span>
                    Llegada Masiva de Stock
                </h3>

                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <label style={{ fontWeight: 600, fontSize: '0.9rem' }}>Motivo:</label>
                        <input
                            type="text"
                            placeholder="Ej: Llegada Contenedor #123"
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                            style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db', width: '250px' }}
                        />
                    </div>

                    <button onClick={onClose} className="btn-secondary" disabled={loading}>
                        Cancelar
                    </button>
                    <button
                        onClick={handleSubmit}
                        className="btn-primary"
                        disabled={loading}
                    >
                        {loading ? 'Procesando...' : `Confirmar (${Object.values(quantities).filter(v => parseInt(v) > 0).length})`}
                    </button>
                </div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
                <input
                    type="text"
                    placeholder="Buscar producto para agregar stock..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '1rem' }}
                    autoFocus
                />
            </div>

            <div style={{ overflow: 'auto', flex: 1, border: '1px solid #e5e7eb', borderRadius: '8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
                    <thead style={{ position: 'sticky', top: 0, background: '#f9fafb', zIndex: 1, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                        <tr>
                            <th style={{ padding: '0.8rem', textAlign: 'left' }}>Producto</th>
                            <th style={{ padding: '0.8rem', width: '150px' }}>Categoría</th>
                            <th style={{ padding: '0.8rem', width: '120px' }}>Stock Actual</th>
                            <th style={{ padding: '0.8rem', width: '150px' }}>Cantidad a Sumar</th>
                        </tr>
                    </thead>
                    <tbody>
                        {displayedProducts.map(p => {
                            const qty = quantities[p.id] || '';
                            const hasValue = parseInt(qty) > 0;
                            return (
                                <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6', background: hasValue ? '#f0fdf4' : 'white' }}>
                                    <td style={{ padding: '0.5rem' }}>
                                        <div style={{ fontWeight: 500 }}>{p.nombre}</div>
                                        <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>ID: {p.id.substring(0, 8)}...</div>
                                    </td>
                                    <td style={{ padding: '0.5rem', color: '#6b7280' }}>{p.tagName || '-'}</td>
                                    <td style={{ padding: '0.5rem' }}>
                                        <span style={{ fontWeight: 600, color: p.stock < 0 ? '#ef4444' : 'inherit' }}>{p.stock}</span>
                                    </td>
                                    <td style={{ padding: '0.5rem' }}>
                                        <input
                                            type="number"
                                            min="0"
                                            className="form-input"
                                            placeholder="0"
                                            value={qty}
                                            onChange={e => handleQuantityChange(p.id, e.target.value)}
                                            style={{
                                                borderColor: hasValue ? '#10b981' : '',
                                                background: hasValue ? 'white' : '#f9fafb',
                                                fontWeight: hasValue ? 'bold' : 'normal',
                                                textAlign: 'center'
                                            }}
                                            onWheel={(e) => e.target.blur()}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    // Optional: auto-focus next input? 
                                                }
                                            }}
                                        />
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {displayedProducts.length === 0 && (
                    <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>
                        No se encontraron productos.
                    </div>
                )}
            </div>
        </div>
    );
}
