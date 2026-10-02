import React, { useState } from 'react';
import { useToast } from './ToastContainer';
import { useConfirm } from './ConfirmDialog';
import productService from '../api/productService';
import '../styles/areas/Inventory.css';

export default function BulkStockArrivalForm({ products, onClose, onSuccess }) {
    const toast = useToast();
    const askConfirm = useConfirm();

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

        const ok = await askConfirm({ title: 'Confirmar llegada de stock', message: `¿Confirmar llegada de stock para ${items.length} productos?`, confirmText: 'Confirmar', cancelText: 'Cancelar' });
        if (!ok) return;

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
        <section className="inv-bulk">
            <div className="inv-bulk-head">
                <h3 className="inv-bulk-title">
                    <span className="material-icons-round" aria-hidden="true">inventory</span>
                    Llegada Masiva de Stock
                </h3>

                <div className="inv-bulk-tools">
                    <div className="inv-inline-field">
                        <label className="ui-label" htmlFor="bsa-reason">Motivo:</label>
                        <input
                            id="bsa-reason"
                            type="text"
                            className="ui-input"
                            placeholder="Ej: Llegada Contenedor #123"
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                        />
                    </div>

                    <button type="button" onClick={onClose} className="ui-btn ui-btn--secondary" disabled={loading}>
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        className="ui-btn ui-btn--primary"
                        disabled={loading}
                    >
                        {loading ? 'Procesando...' : `Confirmar (${Object.values(quantities).filter(v => parseInt(v) > 0).length})`}
                    </button>
                </div>
            </div>

            <div className="ui-search inv-bulk-search">
                <span className="material-icons-round ui-search-icon" aria-hidden="true">search</span>
                <input
                    type="text"
                    className="ui-input"
                    aria-label="Buscar producto para agregar stock"
                    placeholder="Buscar producto para agregar stock..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    autoFocus
                />
            </div>

            <div className="ui-table-wrap">
                <table className="ui-table inv-table-md">
                    <thead>
                        <tr>
                            <th>Producto</th>
                            <th className="inv-w-lg">Categoría</th>
                            <th className="inv-w-md ui-num">Stock Actual</th>
                            <th className="inv-w-lg">Cantidad a Sumar</th>
                        </tr>
                    </thead>
                    <tbody>
                        {displayedProducts.map(p => {
                            const qty = quantities[p.id] || '';
                            const hasValue = parseInt(qty) > 0;
                            return (
                                <tr key={p.id} className={hasValue ? 'is-filled' : undefined}>
                                    <td>
                                        <div className="inv-cell-name">{p.nombre}</div>
                                        <div className="inv-id">ID: {p.id.substring(0, 8)}...</div>
                                    </td>
                                    <td className="inv-cell-muted">{p.tagName || '-'}</td>
                                    <td className="ui-num">
                                        <span className={`inv-stock-value${p.stock < 0 ? ' is-negative' : ''}`}>{p.stock}</span>
                                    </td>
                                    <td>
                                        <input
                                            type="number"
                                            min="0"
                                            className={`ui-input inv-cell-input inv-cell-input--qty${hasValue ? ' is-filled' : ''}`}
                                            aria-label={`Cantidad a sumar de ${p.nombre}`}
                                            placeholder="0"
                                            value={qty}
                                            onChange={e => handleQuantityChange(p.id, e.target.value)}
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
                    <div className="inv-bulk-empty">
                        No se encontraron productos.
                    </div>
                )}
            </div>
        </section>
    );
}
