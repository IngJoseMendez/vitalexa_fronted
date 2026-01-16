import React, { useState, useEffect, useCallback } from 'react';
import { useCart } from '../context/CartContext';
import { clientService } from '../api/client';
import { useConfirm } from './ConfirmDialog';
import { useToast } from './ToastContainer';
import { TagBadge } from './TagComponents';

// === PRODUCT CARD ===
export const ClientProductCard = ({ product, onAddToList }) => {
    const { addToCart } = useCart();
    const [qty, setQty] = useState(1);

    const handleAdd = () => {
        addToCart(product, qty);
        setQty(1);
    };

    const isOutOfStock = product.stock <= 0;

    return (
        <div className="client-product-card animate-fade-in">
            <div className="card-img-wrapper">
                <img src={product.imageUrl || '/placeholder.png'} alt={product.nombre} />
                {isOutOfStock && <span className="stock-badge out">Agotado</span>}
                {!isOutOfStock && product.stock < 10 && (
                    <span className="stock-badge low">¡Últimos {product.stock}!</span>
                )}
            </div>
            <div className="card-body">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <h3 style={{ margin: 0 }}>{product.nombre}</h3>
                    {product.tagName && <TagBadge tagName={product.tagName} />}
                </div>
                <p className="card-desc">{product.descripcion}</p>
                <div className="stock-display">
                    <span className={`stock-status ${product.stock > 0 ? 'in-stock' : 'no-stock'}`}>
                        {product.stock > 0 ? `Stock: ${product.stock} disponibles` : 'Sin Stock'}
                    </span>
                </div>

                <div className="card-footer">
                    <div className="price-row">
                        <span className="price">${product.precio.toFixed(2)}</span>
                        {onAddToList && (
                            <button
                                className="btn-action"
                                onClick={() => onAddToList(product)}
                                title="Guardar en lista"
                            >
                                📑
                            </button>
                        )}
                    </div>

                    <div className="card-actions">
                        {!isOutOfStock ? (
                            <>
                                <div className="qty-control">
                                    <button className="qty-btn" onClick={() => setQty(Math.max(1, qty - 1))}>-</button>
                                    <span className="qty-val">{qty}</span>
                                    <button className="qty-btn" onClick={() => setQty(Math.min(product.stock, qty + 1))}>+</button>
                                </div>
                                <button className="add-btn" onClick={handleAdd}>
                                    <span className="material-icons-round">add</span>
                                </button>
                            </>
                        ) : (
                            <button className="btn-action" style={{ width: '100%' }} disabled>Sin Stock</button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

// === CART VIEW ===
export const CartView = ({ onOrderPlaced }) => {
    const { cart, updateQuantity, removeFromCart, cartTotal, clearCart } = useCart();
    const toast = useToast();
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(false);
    const confirm = useConfirm();

    const handleCheckout = async () => {
        if (cart.length === 0) return;

        if (await confirm({ title: 'Confirmar Pedido', message: `Total: $${cartTotal.toFixed(2)}. ¿Proceder ? ` })) {
            setLoading(true);
            try {
                const orderData = {
                    items: cart.map(item => ({
                        productId: item.product.id,
                        cantidad: item.quantity
                    })),
                    notas: notes
                };

                await clientService.createOrder(orderData);
                toast.success('¡Pedido realizado con éxito!');
                clearCart();
                if (onOrderPlaced) onOrderPlaced();
            } catch (error) {
                toast.error('Error al crear pedido (Stock insuficiente o error de servidor)');
                console.error(error);
            } finally {
                setLoading(false);
            }
        }
    };

    if (cart.length === 0) {
        return (
            <div className="empty-state" style={{ textAlign: 'center', padding: '4rem' }}>
                <span style={{ fontSize: '4rem' }}>🛒</span>
                <h2>Tu carrito está vacío</h2>
                <p>¡Agrega productos del catálogo!</p>
            </div>
        );
    }

    return (
        <div className="modern-cart-container">
            <div className="cart-content-wrapper">
                {/* Left Side: Items List */}
                <div className="cart-items-section">
                    <div className="section-header">
                        <h2>Tu Carrito ({cart.length} productos)</h2>
                        <button className="clear-cart-link" onClick={clearCart}>Vaciar Carrito</button>
                    </div>

                    <div className="items-list">
                        {cart.map(item => (
                            <div key={item.product.id} className="modern-cart-item">
                                <div className="item-image-container">
                                    <img src={item.product.imageUrl || '/placeholder.png'} alt={item.product.nombre} />
                                </div>
                                <div className="item-main-info">
                                    <div className="item-title-row">
                                        <h4>{item.product.nombre}</h4>
                                        <button className="remove-item-btn" onClick={() => removeFromCart(item.product.id)} title="Eliminar">
                                            <span className="material-icons-round">delete_outline</span>
                                        </button>
                                    </div>
                                    <p className="item-price-unit">${item.product.precio.toFixed(2)} c/u</p>

                                    <div className="item-controls-row">
                                        <div className="modern-qty-selector">
                                            <button onClick={() => updateQuantity(item.product.id, item.quantity - 1)}>-</button>
                                            <span>{item.quantity}</span>
                                            <button onClick={() => updateQuantity(item.product.id, item.quantity + 1)}>+</button>
                                        </div>
                                        <div className="item-subtotal">
                                            <span className="subtotal-label">Subtotal:</span>
                                            <span className="subtotal-value">${(item.product.precio * item.quantity).toFixed(2)}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right Side: Order Summary */}
                <div className="cart-summary-section">
                    <div className="summary-card">
                        <h3>Resumen del Pedido</h3>

                        <div className="summary-details">
                            <div className="summary-line">
                                <span>Subtotal</span>
                                <span>${cartTotal.toFixed(2)}</span>
                            </div>
                            <div className="summary-line">
                                <span>Envío</span>
                                <span className="free-shipping">Gratis</span>
                            </div>
                            <div className="summary-line">
                                <span>Impuestos (incl.)</span>
                                <span>$0.00</span>
                            </div>
                        </div>

                        <div className="summary-total-v2">
                            <span>Total a pagar</span>
                            <span className="total-amount">${cartTotal.toFixed(2)}</span>
                        </div>

                        <div className="order-notes-container">
                            <label>Notas de la orden</label>
                            <textarea
                                placeholder="Escribe instrucciones especiales aquí..."
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                            />
                        </div>

                        <button
                            className="btn-place-order"
                            onClick={handleCheckout}
                            disabled={loading}
                        >
                            {loading ? (
                                <><span className="spinner"></span> Procesando...</>
                            ) : (
                                <>Confirmar Pedido <span className="material-icons-round">arrow_forward</span></>
                            )}
                        </button>

                        <p className="checkout-guarantee">
                            <span className="material-icons-round">verified_user</span>
                            Pago y envío garantizado por Vitalexa B2B
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

// === ORDERS LIST ===
export const OrdersView = () => {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const confirm = useConfirm();
    const toast = useToast();

    const loadOrders = useCallback(async () => {
        setLoading(true);
        try {
            const res = await clientService.getOrders();
            setOrders(res.data);
        } catch (error) {
            console.error(error);
            toast.error('Error cargando pedidos');
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        loadOrders();
    }, []);

    const handleCancel = async (id) => {
        if (await confirm({ title: 'Cancelar', message: '¿Seguro que deseas cancelar este pedido?' })) {
            try {
                await clientService.cancelOrder(id);
                toast.success('Pedido cancelado');
                loadOrders();
            } catch (error) {
                toast.error('No se pudo cancelar el pedido');
            }
        }
    };

    const handleReorder = async (id) => {
        if (await confirm({ title: 'Reordenar', message: 'Se creará un nuevo pedido con los mismos items. ¿Continuar?' })) {
            try {
                await clientService.reorder(id);
                toast.success('Pedido recreado exitosamente');
                loadOrders();
            } catch (error) {
                toast.error('Error al recrear pedido (verifica stock)');
            }
        }
    };

    if (loading) return <div>Cargando pedidos...</div>;

    return (
        <div className="orders-container">
            {orders.length === 0 && <p>No tienes pedidos recientes.</p>}
            {orders.map(order => (
                <div key={order.id} className={`order-card ${order.isSROrder ? 'is-sr' : 'is-normal'}`}>
                    <div className="order-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div>
                                <div className="order-id">
                                    {order.invoiceNumber ? `Factura #${order.invoiceNumber}` : `Orden #${order.id.slice(0, 8)}`}
                                </div>
                                <div className="order-date">{new Date(order.fechaCreacion).toLocaleDateString()}</div>
                            </div>
                            {order.isSROrder && (
                                <span className="tag-badge tag-sr" style={{ padding: '0.2rem 0.6rem', fontSize: '0.7rem' }}>S/N</span>
                            )}
                        </div>
                        <span className={`order-status status-${order.estado ? order.estado.toLowerCase() : 'pending'}`}>{order.estado || 'PENDIENTE'}</span>
                    </div>
                    <div className="order-items-summary">
                        {order.items.length} productos | Total: <strong>${order.total.toFixed(2)}</strong>
                    </div>
                    {order.notas && <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>"{order.notas}"</p>}

                    <div className="order-actions">
                        {/* Solo permitir cancelar si no está completado ni cancelado */}
                        {order.estado !== 'COMPLETADO' && order.estado !== 'CANCELADO' && (
                            <button className="btn-action" onClick={() => handleCancel(order.id)}>Cancelar</button>
                        )}
                        <button className="btn-action primary" onClick={() => handleReorder(order.id)}>Reordenar</button>
                    </div>
                </div>
            ))}
        </div>
    );
};

// === SHOPPING LISTS ===
export const ShoppingListsView = ({ onConvertToOrder, productToAdd, onProductAdded }) => {
    const [lists, setLists] = useState([]);
    const [newName, setNewName] = useState('');
    const [expandedListId, setExpandedListId] = useState(null);
    const confirm = useConfirm();
    const toast = useToast();

    const loadLists = useCallback(async () => {
        try {
            const res = await clientService.getLists();
            setLists(res.data);
        } catch (error) {
            console.error(error);
        }
    }, []);

    useEffect(() => {
        loadLists();
    }, [loadLists]);

    const handleCreate = async (e) => {
        e.preventDefault();
        if (!newName.trim()) return;
        try {
            await clientService.createList({ name: newName });
            setNewName('');
            loadLists();
            toast.success('Lista creada con éxito');
        } catch (error) {
            toast.error('Error al crear la lista');
        }
    };

    const handleConvert = async (id) => {
        if (await confirm({ title: '¿Convertir a Pedido?', message: 'Se creará una orden de compra con todos los productos de esta lista.' })) {
            try {
                await clientService.convertListToOrder(id);
                toast.success('¡Pedido creado correctamente!');
                if (onConvertToOrder) onConvertToOrder();
            } catch (error) {
                toast.error('Error al convertir. Verifica el stock disponible.');
            }
        }
    };

    const handleAddProductToList = async (listId, productName) => {
        if (!productToAdd) return;
        try {
            await clientService.addUpdateListItem(listId, {
                productId: productToAdd.id,
                defaultQty: 1
            });
            toast.success(`${productToAdd.nombre} agregado a "${productName}"`);
            if (onProductAdded) onProductAdded();
            loadLists();
        } catch (error) {
            toast.error('Error al agregar el producto');
        }
    };

    return (
        <div className="modern-lists-container">
            {/* Create List Header Section */}
            <div className="lists-action-header">
                <div className="section-title-group">
                    <span className="material-icons-round section-icon">format_list_bulleted</span>
                    <div>
                        <h2>Mis Listas de Compras</h2>
                        <p>Organiza tus pedidos recurrentes y ahorra tiempo.</p>
                    </div>
                </div>

                <form className="modern-create-list-form" onSubmit={handleCreate}>
                    <div className="input-with-icon">
                        <span className="material-icons-round">edit</span>
                        <input
                            type="text"
                            placeholder="Nombre de la nueva lista..."
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                        />
                    </div>
                    <button type="submit" className="btn-create-list">
                        <span className="material-icons-round">add</span>
                        Crear Nueva Lista
                    </button>
                </form>
            </div>

            {/* Contextual Alert for Adding Product */}
            {productToAdd && (
                <div className="add-context-alert">
                    <div className="alert-content">
                        <span className="material-icons-round">info</span>
                        <span>Selecciona una lista para guardar: <strong>{productToAdd.nombre}</strong></span>
                    </div>
                    <button className="btn-cancel-add" onClick={onProductAdded}>Cancelar</button>
                </div>
            )}

            {/* Lists Grid */}
            <div className="modern-lists-grid">
                {lists.length === 0 ? (
                    <div className="empty-lists-state">
                        <span className="material-icons-round">inventory_2</span>
                        <p>No tienes listas creadas todavía.</p>
                    </div>
                ) : (
                    lists.map(list => (
                        <div key={list.id} className={`modern-list-card ${expandedListId === list.id ? 'is-expanded' : ''}`}>
                            <div className="list-card-header">
                                <div className="list-icon-circle">
                                    <span className="material-icons-round">assignment</span>
                                </div>
                                <div className="list-info">
                                    <h3>{list.name}</h3>
                                    <span className="items-count-badge">
                                        <span className="material-icons-round">shopping_basket</span>
                                        {list.items.length} productos
                                    </span>
                                </div>
                                <button
                                    className={`btn-toggle-details ${expandedListId === list.id ? 'active' : ''}`}
                                    onClick={() => setExpandedListId(expandedListId === list.id ? null : list.id)}
                                    title="Ver productos"
                                >
                                    <span className="material-icons-round">expand_more</span>
                                </button>
                            </div>

                            {/* Conditional Add Button */}
                            {productToAdd && (
                                <button
                                    className="btn-add-here-pulsing"
                                    onClick={() => handleAddProductToList(list.id, list.name)}
                                >
                                    <span className="material-icons-round">add_shopping_cart</span>
                                    Agregar a esta lista
                                </button>
                            )}

                            {/* Expanded Content */}
                            {expandedListId === list.id && (
                                <div className="list-details-panel">
                                    <div className="items-list-scroll">
                                        {list.items.length === 0 ? (
                                            <p className="no-items-text">Esta lista está vacía.</p>
                                        ) : (
                                            list.items.map(item => (
                                                <div key={item.id} className="list-item-row">
                                                    <span className="dot"></span>
                                                    <span className="product-name">{item.productName || 'Producto'}</span>
                                                    <span className="qty-tag">x{item.defaultQty}</span>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}

                            <div className="list-card-footer">
                                <button
                                    className="btn-convert-order"
                                    onClick={() => handleConvert(list.id)}
                                    disabled={list.items.length === 0}
                                >
                                    <span className="material-icons-round">shopping_cart_checkout</span>
                                    Convertir a Orden
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

// === PROFILE ===
export const ClientProfile = () => {
    const [profile, setProfile] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState({});
    const toast = useToast();

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const res = await clientService.getProfile();
                setProfile(res.data);
                setFormData(res.data);
            } catch (error) {
                console.error(error);
            }
        };
        fetchProfile();
    }, []);

    const handleSave = async () => {
        try {
            const res = await clientService.updateProfile(formData);
            setProfile(res.data);
            setIsEditing(false);
            toast.success('Perfil actualizado');
        } catch (error) {
            toast.error('Error actualizando perfil');
        }
    };

    if (!profile) return <div>Cargando perfil...</div>;

    return (
        <div className="profile-card" style={{ background: 'white', padding: '2rem', borderRadius: 'var(--radius-lg)', maxWidth: '600px', margin: '0 auto', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem' }}>
                <h2>Mi Perfil</h2>
                {!isEditing && (
                    <button className="btn-action" onClick={() => setIsEditing(true)}>Editar</button>
                )}
            </div>

            <div style={{ display: 'grid', gap: '1.5rem' }}>
                <div className="form-group">
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Nombre</label>
                    <input
                        type="text"
                        value={profile.nombre}
                        disabled
                        style={{ width: '100%', padding: '0.75rem', background: '#f1f5f9', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}
                    />
                </div>

                <div className="form-group">
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Email</label>
                    <input
                        type="email"
                        value={isEditing ? formData.email : profile.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        disabled={!isEditing}
                        style={{ width: '100%', padding: '0.75rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}
                    />
                </div>

                <div className="form-group">
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Teléfono</label>
                    <input
                        type="text"
                        value={isEditing ? formData.telefono : profile.telefono}
                        onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                        disabled={!isEditing}
                        style={{ width: '100%', padding: '0.75rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}
                    />
                </div>

                <div className="form-group">
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Dirección</label>
                    <input
                        type="text"
                        value={isEditing ? formData.direccion : profile.direccion}
                        onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
                        disabled={!isEditing}
                        style={{ width: '100%', padding: '0.75rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}
                    />
                </div>

                {isEditing && (
                    <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                        <button className="btn-primary-gradient" onClick={handleSave} style={{ padding: '0.75rem 2rem', borderRadius: 'var(--radius-md)' }}>Guardar</button>
                        <button className="btn-action" onClick={() => { setIsEditing(false); setFormData(profile); }}>Cancelar</button>
                    </div>
                )}
            </div>
        </div>
    );
};
