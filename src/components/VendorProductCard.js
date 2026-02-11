import React, { useState } from 'react';
import { TagBadge } from './TagComponents';
import { formatCurrency } from '../utils/formatters';

const PLACEHOLDER_IMAGE = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23f3f4f6" width="200" height="200"/%3E%3Ctext fill="%239ca3af" font-family="Arial, sans-serif" font-size="16" dy="10" font-weight="bold" x="50%25" y="50%25" text-anchor="middle"%3ESin Imagen%3C/text%3E%3C/svg%3E';

function VendorProductCard({ product, cartItem, onAddToCart }) {
    const [quantity, setQuantity] = useState(1);
    const cartQty = cartItem?.cantidad || 0;

    const handleAddToCart = () => {
        onAddToCart(product, quantity);
        setQuantity(1); // Reset after adding
    };

    const increment = () => setQuantity(prev => prev + 1);
    const decrement = () => setQuantity(prev => Math.max(1, prev - 1));

    return (
        <div className="product-card">
            <img
                src={product.imageUrl || PLACEHOLDER_IMAGE}
                alt={product.nombre}
                onError={(e) => {
                    e.target.src = PLACEHOLDER_IMAGE;
                }}
                loading="lazy"
            />

            {cartQty > 0 && (
                <span className="product-cart-badge" title="Cantidad en carrito">
                    <span className="material-icons-round">shopping_cart</span>
                    {cartQty}
                </span>
            )}

            <div className="product-info">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.25rem', gap: '0.5rem' }}>
                    <div style={{ flex: 1 }}>
                        <h4 style={{ margin: 0 }}>{product.nombre}</h4>
                        {product.isSpecialProduct && (
                            <span style={{
                                fontSize: '0.65rem',
                                background: 'linear-gradient(135deg, #8b5cf6, #d946ef)',
                                color: 'white',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontWeight: 'bold',
                                display: 'inline-block',
                                marginTop: '2px'
                            }}>
                                ESPECIAL
                            </span>
                        )}
                    </div>
                    {product.tagName && <TagBadge tagName={product.tagName} />}
                </div>

                <p className="product-price">${formatCurrency(parseFloat(product.precio))}</p>

                {/* Visual Stock Display */}
                <div className="stock-visual-indicator" style={{ marginBottom: '0.5rem' }}>
                    <div className="stock-bar-small">
                        <div
                            className="stock-fill-small"
                            style={{
                                width: `${Math.max(0, ((product.stock - cartQty) / product.stock) * 100)}%`
                            }}
                        />
                    </div>
                    <span className="stock-text">
                        {Math.max(0, product.stock - cartQty)}/{product.stock} disponibles
                    </span>
                </div>

                {/* Quantity Controls */}
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <button
                        onClick={decrement}
                        style={{
                            width: '32px', height: '32px', borderRadius: '6px', border: '1px solid #e5e7eb',
                            background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}
                    >
                        <span className="material-icons-round" style={{ fontSize: '16px' }}>remove</span>
                    </button>

                    <input
                        type="number"
                        min="1"
                        value={quantity}
                        onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                        style={{
                            flex: 1, textAlign: 'center', border: '1px solid #e5e7eb', borderRadius: '6px',
                            fontSize: '1rem', fontWeight: 'bold'
                        }}
                    />

                    <button
                        onClick={increment}
                        style={{
                            width: '32px', height: '32px', borderRadius: '6px', border: '1px solid #e5e7eb',
                            background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}
                    >
                        <span className="material-icons-round" style={{ fontSize: '16px' }}>add</span>
                    </button>
                </div>

                <button
                    onClick={handleAddToCart}
                    className="btn-add-cart"
                    style={product.stock === 0 ? { background: '#f59e0b', border: '1px solid #d97706' } : {}}
                >
                    <span className="material-icons-round" style={{ fontSize: '1.1rem' }}>
                        {product.stock === 0 ? 'warning' : 'add'}
                    </span>
                    {product.stock === 0 ? 'Vender S/Stock' : 'Agregar'}
                </button>
            </div>
        </div>
    );
}

export default VendorProductCard;
