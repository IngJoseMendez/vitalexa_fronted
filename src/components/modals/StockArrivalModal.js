import React, { useState } from 'react';

export default function StockArrivalModal({ product, onClose, onSuccess }) {
    const [quantity, setQuantity] = useState('');
    const [reason, setReason] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Import service dynamically or pass it? Usually imports are top level.
    // I'll assume productService is available via import.
    // However, to avoid circular dependencies if this was inside components, I'll import it.
    // Check ProductsPanel imports... it imports productService.
    const productService = require('../../api/productService').default;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);

        const qty = parseInt(quantity);
        if (isNaN(qty) || qty <= 0) {
            setError('La cantidad debe ser mayor a 0');
            return;
        }

        setLoading(true);
        try {
            const response = await productService.addStock(product.id, qty, reason);

            // Handle Blob Download (PDF)
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `huella_stock_${product.id}_${Date.now()}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.parentNode.removeChild(link);

            onSuccess(); // refresh parent
            onClose(); // close modal
        } catch (err) {
            console.error('Stock arrival error:', err);

            // Handle Blob Error (convert blob to text/json)
            if (err.response && err.response.data instanceof Blob) {
                try {
                    const text = await err.response.data.text();
                    const json = JSON.parse(text);
                    setError('Error: ' + (json.message || 'Error desconocido'));
                } catch (parseErr) {
                    setError('Error al procesar la llegada de stock.');
                }
            } else {
                setError('Error al registrar llegada: ' + (err.response?.data?.message || err.message));
            }
        } finally {
            setLoading(false);
        }
    };

    if (!product) return null;

    return (
        <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: '400px', width: '90%' }}>
                <div className="modal-header">
                    <h3>Registrar Llegada de Mercancía</h3>
                    <button className="close-btn" onClick={onClose}>&times;</button>
                </div>

                <div style={{ padding: '1rem', background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                    <div style={{ fontWeight: 600 }}>{product.nombre}</div>
                    <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                        Stock Actual: <span style={{ color: product.stock < 0 ? '#ef4444' : 'inherit', fontWeight: 'bold' }}>{product.stock}</span>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="modal-body">
                    {error && (
                        <div style={{
                            background: '#fee2e2',
                            color: '#b91c1c',
                            padding: '0.75rem',
                            borderRadius: '6px',
                            marginBottom: '1rem',
                            fontSize: '0.9rem'
                        }}>
                            {error}
                        </div>
                    )}

                    <div className="form-group">
                        <label>Cantidad a Sumar <span style={{ color: 'red' }}>*</span></label>
                        <input
                            type="number"
                            min="1"
                            className="form-input"
                            value={quantity}
                            onChange={e => setQuantity(e.target.value)}
                            placeholder="Ej: 50"
                            required
                            autoFocus
                        />
                        <small style={{ color: '#6b7280' }}>Se sumará al stock actual.</small>
                    </div>

                    <div className="form-group">
                        <label>Motivo / Referencia</label>
                        <input
                            type="text"
                            className="form-input"
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                            placeholder="Ej: Pedido #123, Reposición..."
                        />
                    </div>

                    <div className="modal-footer">
                        <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
                            Cancelar
                        </button>
                        <button type="submit" className="btn-primary" disabled={loading}>
                            {loading ? 'Registrando...' : 'Confirmar Llegada'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
