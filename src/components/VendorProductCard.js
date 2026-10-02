import React, { useState } from 'react';
import { TagBadge } from './TagComponents';
import { formatCurrency } from '../utils/formatters';
import { PLACEHOLDER_IMAGE } from '../utils/placeholderImage';
import '../styles/areas/VendorProductCard.css';


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
        <div className="vpc">
            <div className="vpc-media">
                <img
                    src={product.imageUrl || PLACEHOLDER_IMAGE}
                    alt={product.nombre}
                    onError={(e) => {
                        e.target.src = PLACEHOLDER_IMAGE;
                    }}
                    loading="lazy"
                    decoding="async"
                />

                {cartQty > 0 && (
                    <span className="vpc-cart-badge" title="Cantidad en carrito">
                        <span className="material-icons-round" aria-hidden="true">shopping_cart</span>
                        {cartQty}
                    </span>
                )}
            </div>

            <div className="vpc-body">
                <div className="vpc-head">
                    <div className="vpc-title">
                        <h4 className="vpc-name">{product.nombre}</h4>
                        {product.isSpecialProduct && (
                            <span className="ui-badge ui-badge--primary vpc-special">
                                ESPECIAL
                            </span>
                        )}
                    </div>
                    {product.tagName && <TagBadge tagName={product.tagName} />}
                </div>

                <p className="vpc-price">${formatCurrency(parseFloat(product.precio))}</p>

                {/* Visual Stock Display */}
                <div className="vpc-stock">
                    <div className="vpc-stock-bar">
                        <div
                            className={`vpc-stock-fill ${(product.stock - cartQty) <= 0 ? 'is-empty' : ''}`}
                            style={{
                                width: `${Math.max(0, ((product.stock - cartQty) / (product.stock > 0 ? product.stock : 1)) * 100)}%` // Prevent div by zero or negative width
                            }}
                        />
                    </div>
                    <span className={`vpc-stock-text ${(product.stock - cartQty) < 0 ? 'is-negative' : ''}`}>
                        {product.stock - cartQty} unidades
                    </span>
                </div>
            </div>

            <div className="vpc-actions">
                {/* Quantity Controls */}
                <div className="vpc-qty">
                    <button
                        type="button"
                        onClick={decrement}
                        className="ui-icon-btn ui-icon-btn--lg ui-icon-btn--bordered vpc-qty-btn"
                        aria-label="Disminuir cantidad"
                    >
                        <span className="material-icons-round" aria-hidden="true">remove</span>
                    </button>

                    <input
                        type="number"
                        min="1"
                        value={quantity}
                        onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                        className="ui-input vpc-qty-input"
                        aria-label="Cantidad a agregar"
                    />

                    <button
                        type="button"
                        onClick={increment}
                        className="ui-icon-btn ui-icon-btn--lg ui-icon-btn--bordered vpc-qty-btn"
                        aria-label="Aumentar cantidad"
                    >
                        <span className="material-icons-round" aria-hidden="true">add</span>
                    </button>
                </div>

                <button
                    type="button"
                    onClick={handleAddToCart}
                    className={`ui-btn vpc-add ${(product.stock - cartQty) <= 0 ? 'ui-btn--secondary vpc-add--oos' : 'ui-btn--primary'}`}
                >
                    <span className="material-icons-round" aria-hidden="true">
                        {(product.stock - cartQty) <= 0 ? 'warning' : 'add'}
                    </span>
                    {(product.stock - cartQty) <= 0 ? 'Vender S/Stock' : 'Agregar'}
                </button>
            </div>
        </div>
    );
}

export default VendorProductCard;
