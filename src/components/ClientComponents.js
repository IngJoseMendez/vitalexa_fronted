import React, { useState, useEffect } from 'react';
import { useCart } from '../context/CartContext';
import { clientService } from '../api/client';
import { useConfirm } from './ConfirmDialog';
import { useToast } from './ToastContainer';

// === PRODUCT CARD ===
export const ClientProductCard = ({ product, onAddToList }) => {
    const { addToCart } = useCart();
    const toast = useToast();
    const [qty, setQty] = useState(1);

    const handleAdd = () => {
        addToCart(product, qty);
        toast.success(`Agregado: ${product.nombre}`);
        setQty(1);
    };

    const isOutOfStock = product.stock <= 0;

    return (
        <div className="client-product-card">
            <div className="card-img-wrapper">
                <img src={product.imageUrl || '/placeholder.png'} alt={product.nombre} />
                {isOutOfStock && <span className="stock-badge out">Agotado</span>}
                {!isOutOfStock && product.stock < 10 && (
                    <span className="stock-badge low">¡Últimos {product.stock}!</span>
                )}
            </div>
            <div className="card-body">
                <h3>{product.nombre}</h3>
                <p className="card-desc">{product.descripcion}</p>

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

        if (await confirm({ title: 'Confirmar Pedido', message: `Total: $${cartTotal.toFixed(2)}. ¿Proceder?` })) {
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
        <div className="cart-layout">
            <div className="cart-items">
                {cart.map(item => (
                    <div key={item.product.id} className="cart-item">
                        <img src={item.product.imageUrl || '/placeholder.png'} className="item-img" alt={item.product.nombre} />
                        <div className="item-details">
                            <h4>{item.product.nombre}</h4>
                            <span className="price">${item.product.precio.toFixed(2)}</span>
                        </div>
                        <div className="item-actions">
                            <div className="qty-control">
                                <button className="qty-btn" onClick={() => updateQuantity(item.product.id, item.quantity - 1)}>-</button>
                                <span className="qty-val">{item.quantity}</span>
                                <button className="qty-btn" onClick={() => updateQuantity(item.product.id, item.quantity + 1)}>+</button>
                            </div>
                            <span className="item-total">${(item.product.precio * item.quantity).toFixed(2)}</span>
                            <button
                                className="btn-action delete"
                                onClick={() => removeFromCart(item.product.id)}
                            >
                                Eliminar
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            <div className="cart-summary">
                <h3>Resumen del Pedido</h3>
                <div className="summary-row">
                    <span>Subtotal</span>
                    <span>${cartTotal.toFixed(2)}</span>
                </div>
                <div className="summary-row">
                    <span>Impuestos</span>
                    <span>Included</span>
                </div>
                <div className="summary-total">
                    <div className="summary-row" style={{ marginBottom: 0 }}>
                        <span>Total</span>
                        <span>${cartTotal.toFixed(2)}</span>
                    </div>
                </div>

                <textarea
                    className="order-notes"
                    placeholder="Notas adicionales para la orden..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                />

                <button
                    className="btn-checkout"
                    onClick={handleCheckout}
                    disabled={loading}
                >
                    {loading ? 'Procesando...' : 'Confirmar Pedido'}
                </button>
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

    const loadOrders = async () => {
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
    };

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
                <div key={order.id} className="order-card">
                    <div className="order-header">
                        <div>
                            <div className="order-id">Orden #{order.id.slice(0, 8)}</div>
                            <div className="order-date">{new Date(order.fechaCreacion).toLocaleDateString()}</div>
                        </div>
                        <span className={`order-status status-${order.estado}`}>{order.estado}</span>
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

    const loadLists = async () => {
        try {
            const res = await clientService.getLists();
            setLists(res.data);
        } catch (error) {
            console.error(error);
        }
    };

    useEffect(() => {
        loadLists();
    }, []);

    // Handle adding product if productToAdd is present
    useEffect(() => {
        if (productToAdd && lists.length > 0) {
            // Auto-open modal/prompt?
            // For now, we assume user selects a list below.
            toast.info(`Selecciona una lista para agregar: ${productToAdd.nombre}`);
        }
    }, [productToAdd, lists]);

    const handleCreate = async (e) => {
        e.preventDefault();
        if (!newName.trim()) return;
        try {
            await clientService.createList({ name: newName });
            setNewName('');
            loadLists();
            toast.success('Lista creada');
        } catch (error) {
            toast.error('Error creando lista');
        }
    };

    const handleConvert = async (id) => {
        if (await confirm({ title: 'Ordenar Lista', message: '¿Crear un pedido con estos items?' })) {
            try {
                await clientService.convertListToOrder(id);
                toast.success('Pedido creado desde la lista');
                if (onConvertToOrder) onConvertToOrder();
            } catch (error) {
                toast.error('Error al convertir (Stock insuficiente?)');
            }
        }
    };

    const handleAddProductToList = async (listId) => {
        if (!productToAdd) return;
        try {
            await clientService.addUpdateListItem(listId, {
                productId: productToAdd.id,
                defaultQty: 1
            });
            toast.success(`${productToAdd.nombre} agregado a la lista`);
            if (onProductAdded) onProductAdded();
            loadLists();
        } catch (error) {
            toast.error('Error agregando item');
        }
    };

    return (
        <div className="lists-container">
            <form className="new-list-form" onSubmit={handleCreate}>
                <input
                    type="text"
                    placeholder="Nombre de nueva lista (ej: Pedido Semanal)"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                />
                <button type="submit" className="btn-primary-gradient" style={{ borderRadius: 'var(--radius-md)', padding: '0 1.5rem' }}>
                    Crear Lista
                </button>
            </form>

            {productToAdd && (
                <div style={{ background: 'var(--primary-light)', padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1rem', border: '1px solid var(--primary)' }}>
                    <strong>Agregando:</strong> {productToAdd.nombre} - Selecciona una lista para guardarlo.
                </div>
            )}

            <div className="lists-grid">
                {lists.map(list => (
                    <div key={list.id} className="list-card">
                        <div className="list-header" style={{ alignItems: 'flex-start' }}>
                            <div>
                                <h3 style={{ margin: 0 }}>{list.name}</h3>
                                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{list.items.length} items</span>
                            </div>
                            <button className="btn-action" onClick={() => setExpandedListId(expandedListId === list.id ? null : list.id)}>
                                {expandedListId === list.id ? 'Ocultar' : 'Ver Detalles'}
                            </button>
                        </div>

                        {productToAdd && (
                            <button
                                className="btn-action primary"
                                style={{ width: '100%', marginBottom: '1rem' }}
                                onClick={() => handleAddProductToList(list.id)}
                            >
                                Agregar Aquí
                            </button>
                        )}

                        {expandedListId === list.id && (
                            <div className="list-items-detail" style={{ borderTop: '1px dashed var(--border)', paddingTop: '1rem', marginBottom: '1rem' }}>
                                {list.items.length === 0 ? <p style={{ fontSize: '0.9rem' }}>Lista vacía</p> : (
                                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                                        {list.items.map(item => (
                                            <li key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', fontSize: '0.9rem' }}>
                                                <span>{item.productName || 'Producto'} (x{item.defaultQty})</span>
                                                {/* Future: Edit qty */}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}

                        <button className="btn-checkout" style={{ marginTop: 0 }} onClick={() => handleConvert(list.id)}>
                            Convertir a Orden
                        </button>
                    </div>
                ))}
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
        clientService.getProfile().then(res => {
            setProfile(res.data);
            setFormData(res.data);
        }).catch(console.error);
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
