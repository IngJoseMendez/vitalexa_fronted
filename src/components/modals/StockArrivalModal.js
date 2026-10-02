import React, { useState } from 'react';
import '../../styles/areas/Inventory.css';

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
        <div className="ui-modal-overlay inv-arrival-overlay">
            <div className="ui-modal ui-modal--sm inv-arrival" role="dialog" aria-modal="true" aria-labelledby="sam-title">
                <div className="ui-modal-header">
                    <span className="ui-modal-icon" aria-hidden="true">
                        <span className="material-icons-round">add_box</span>
                    </span>
                    <div className="ui-modal-heading">
                        <h3 id="sam-title" className="ui-modal-title">Registrar Llegada de Mercancía</h3>
                        <p className="ui-modal-subtitle">{product.nombre}</p>
                    </div>
                    <button type="button" className="ui-icon-btn" onClick={onClose} aria-label="Cerrar">
                        <span className="material-icons-round" aria-hidden="true">close</span>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="inv-modal-form">
                    <div className="ui-modal-body ui-modal-body--plain">
                        <div className="inv-stock-summary">
                            Stock Actual: <span className={`inv-stock-value${product.stock < 0 ? ' is-negative' : ''}`}>{product.stock}</span>
                        </div>

                        {error && (
                            <div className="ui-alert ui-alert--danger" role="alert">
                                <span className="material-icons-round" aria-hidden="true">error_outline</span>
                                <p>{error}</p>
                            </div>
                        )}

                        <div className="ui-field">
                            <label className="ui-label" htmlFor="sam-quantity">Cantidad a Sumar <span className="ui-required">*</span></label>
                            <input
                                id="sam-quantity"
                                type="number"
                                min="1"
                                className="ui-input"
                                value={quantity}
                                onChange={e => setQuantity(e.target.value)}
                                placeholder="Ej: 50"
                                required
                                autoFocus
                            />
                            <small className="ui-help">Se sumará al stock actual.</small>
                        </div>

                        <div className="ui-field">
                            <label className="ui-label" htmlFor="sam-reason">Motivo / Referencia</label>
                            <input
                                id="sam-reason"
                                type="text"
                                className="ui-input"
                                value={reason}
                                onChange={e => setReason(e.target.value)}
                                placeholder="Ej: Pedido #123, Reposición..."
                            />
                        </div>
                    </div>

                    <div className="ui-modal-footer">
                        <button type="button" className="ui-btn ui-btn--secondary" onClick={onClose} disabled={loading}>
                            Cancelar
                        </button>
                        <button type="submit" className="ui-btn ui-btn--primary" disabled={loading}>
                            {loading ? 'Registrando...' : 'Confirmar Llegada'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
