import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useCart } from '../context/CartContext';
import { clientService } from '../api/client';
import { useConfirm } from './ConfirmDialog';
import { useToast } from './ToastContainer';
import { TagBadge } from './TagComponents';
import { formatCurrency, formatOrderLabel } from '../utils/formatters';
import { PLACEHOLDER_IMAGE } from '../utils/placeholderImage';
import { avatarTone, avatarInitials } from '../utils/avatarTone';

// Color con significado del estado de un pedido (franja izquierda y badge):
// pendiente = ámbar, confirmado = azul, completado = verde, anulado/cancelado = rojo.
const ORDER_TONE = {
    PENDIENTE: 'warning',
    PENDING_PROMOTION_COMPLETION: 'warning',
    CONFIRMADO: 'primary',
    COMPLETADO: 'success',
    CANCELADO: 'danger',
    ANULADA: 'danger',
};

const ORDER_ICON = {
    PENDIENTE: 'schedule',
    PENDING_PROMOTION_COMPLETION: 'schedule',
    CONFIRMADO: 'task_alt',
    COMPLETADO: 'check_circle',
    CANCELADO: 'cancel',
    ANULADA: 'block',
};

// === PRODUCT CARD ===
export const ClientProductCard = ({ product, onAddToList, cart }) => {
    const { addToCart } = useCart();
    const [qty, setQty] = useState(1);

    // Calculate available stock (considering items in cart)
    const cartItem = cart?.find(item => item.product?.id === product.id);
    const quantityInCart = cartItem?.quantity || 0;
    const availableStock = product.stock - quantityInCart;

    const handleAdd = () => {
        addToCart(product, qty);
        setQty(1);
    };

    const isOutOfStock = availableStock <= 0;
    const stockPercentage = (availableStock / product.stock) * 100;

    return (
        <div className="client-product-card">
            <div className="card-img-wrapper">
                <img
                    src={product.imageUrl || PLACEHOLDER_IMAGE}
                    alt={product.nombre}
                    loading="lazy"
                    decoding="async"
                />
                {isOutOfStock && <span className="stock-badge out">Agotado</span>}
                {!isOutOfStock && availableStock < 10 && (
                    <span className="stock-badge low">¡Últimos {availableStock}!</span>
                )}
                {quantityInCart > 0 && (
                    <span className="stock-badge in-cart" title="Cantidad en carrito">
                        <span className="material-icons-round" aria-hidden="true">shopping_cart</span> {quantityInCart}
                    </span>
                )}
            </div>
            <div className="card-body">
                <div className="card-title-row">
                    <h3>{product.nombre}</h3>
                    {product.tagName && <TagBadge tagName={product.tagName} />}
                </div>
                <p className="card-desc">{product.descripcion}</p>

                {/* Visual Stock Indicator */}
                <div className="stock-indicator">
                    {/* Barra de color (.ui-progress, transform: scaleX); valor protegido si el stock es 0 */}
                    <div
                        className={`stock-bar ui-progress ui-progress--${stockPercentage > 30 ? 'success' : stockPercentage > 10 ? 'warning' : 'danger'}`}
                        style={{ '--value': Number.isFinite(stockPercentage) ? Math.max(0, stockPercentage) : 0 }}
                        aria-hidden="true"
                    >
                        <span className={`stock-fill ui-progress-bar ${stockPercentage > 30 ? 'is-high' : stockPercentage > 10 ? 'is-mid' : 'is-low'}`} />
                    </div>
                    <span className={`stock-status ${availableStock > 0 ? 'in-stock' : 'no-stock'}`}>
                        {availableStock > 0 ? `${availableStock} de ${product.stock} disponibles` : 'Sin Stock'}
                    </span>
                </div>

                <div className="card-footer">
                    <div className="price-row">
                        <span className="price">${formatCurrency(product.precio)}</span>
                        {onAddToList && (
                            <button
                                type="button"
                                className="btn-action btn-save-list ui-icon-btn ui-icon-btn--bordered ui-icon-btn--lg"
                                onClick={() => onAddToList(product)}
                                title="Guardar en lista"
                                aria-label="Guardar en lista"
                            >
                                <span className="material-icons-round" aria-hidden="true">bookmark_add</span>
                            </button>
                        )}
                    </div>

                    <div className="card-actions">
                        {!isOutOfStock ? (
                            <>
                                <div className="qty-control">
                                    <button
                                        type="button"
                                        className="qty-btn"
                                        aria-label="Disminuir cantidad"
                                        onClick={() => setQty(Math.max(1, qty - 1))}
                                    >-</button>
                                    <span className="qty-val">{qty}</span>
                                    <button
                                        type="button"
                                        className="qty-btn"
                                        aria-label="Aumentar cantidad"
                                        onClick={() => setQty(Math.min(availableStock, qty + 1))}
                                    >+</button>
                                </div>
                                <button
                                    type="button"
                                    className="add-btn ui-btn ui-btn--primary"
                                    onClick={handleAdd}
                                    title="Agregar al carrito"
                                    aria-label="Agregar al carrito"
                                >
                                    <span className="material-icons-round" aria-hidden="true">add_shopping_cart</span>
                                </button>
                            </>
                        ) : (
                            <button type="button" className="btn-action ui-btn ui-btn--secondary ui-btn--block" disabled>Sin Stock</button>
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

        if (await confirm({ title: 'Confirmar Pedido', message: `Total: $${formatCurrency(cartTotal)}. ¿Proceder ? ` })) {
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
            <div className="empty-state client-cart-empty ui-empty">
                <span className="material-icons-round ui-empty-icon" aria-hidden="true">shopping_cart</span>
                <h2 className="ui-empty-title">Tu carrito está vacío</h2>
                <p className="ui-empty-text">¡Agrega productos del catálogo!</p>
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
                        <button
                            type="button"
                            className="clear-cart-link ui-btn ui-btn--danger-ghost ui-btn--sm"
                            onClick={clearCart}
                        >
                            <span className="material-icons-round" aria-hidden="true">remove_shopping_cart</span>
                            Vaciar Carrito
                        </button>
                    </div>

                    <div className="items-list ui-stagger">
                        {cart.map(item => (
                            <div key={item.product.id} className="modern-cart-item">
                                <div className="item-image-container">
                                    <img
                                        src={item.product.imageUrl || PLACEHOLDER_IMAGE}
                                        alt={item.product.nombre}
                                        loading="lazy"
                                        decoding="async"
                                    />
                                </div>
                                <div className="item-main-info">
                                    <div className="item-title-row">
                                        <h4>{item.product.nombre}</h4>
                                        <button
                                            type="button"
                                            className="remove-item-btn ui-icon-btn ui-icon-btn--danger"
                                            onClick={() => removeFromCart(item.product.id)}
                                            title="Eliminar"
                                            aria-label="Eliminar"
                                        >
                                            <span className="material-icons-round" aria-hidden="true">delete_outline</span>
                                        </button>
                                    </div>
                                    <p className="item-price-unit">${formatCurrency(item.product.precio)} c/u</p>

                                    <div className="item-controls-row">
                                        <div className="modern-qty-selector">
                                            <button
                                                type="button"
                                                aria-label="Disminuir cantidad"
                                                onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                                            >-</button>
                                            <span>{item.quantity}</span>
                                            <button
                                                type="button"
                                                aria-label="Aumentar cantidad"
                                                onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                                            >+</button>
                                        </div>
                                        <div className="item-subtotal">
                                            <span className="subtotal-label">Subtotal:</span>
                                            <span className="subtotal-value">${formatCurrency(item.product.precio * item.quantity)}</span>
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
                        <h3>
                            <span className="ui-icon-tile ui-icon-tile--sm" aria-hidden="true"><span className="material-icons-round">receipt</span></span>
                            Resumen del Pedido
                        </h3>

                        <div className="summary-details">
                            <div className="summary-line">
                                <span>Subtotal</span>
                                <span>${formatCurrency(cartTotal)}</span>
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
                            <span className="total-amount">${formatCurrency(cartTotal)}</span>
                        </div>

                        <div className="order-notes-container ui-field">
                            <label className="ui-label" htmlFor="client-order-notes">Notas de la orden</label>
                            <textarea
                                id="client-order-notes"
                                className="ui-textarea"
                                placeholder="Escribe instrucciones especiales aquí..."
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                            />
                        </div>

                        <button
                            type="button"
                            className="btn-place-order ui-btn ui-btn--primary ui-btn--lg ui-btn--block"
                            onClick={handleCheckout}
                            disabled={loading}
                        >
                            {loading ? (
                                <><span className="spinner ui-spinner" aria-hidden="true"></span> Procesando...</>
                            ) : (
                                <>Confirmar Pedido <span className="material-icons-round" aria-hidden="true">arrow_forward</span></>
                            )}
                        </button>

                        <p className="checkout-guarantee">
                            <span className="material-icons-round" aria-hidden="true">verified_user</span>
                            Pago y envío garantizado por Vitalexa B2B
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

// === ORDERS LIST ===
// refreshTrigger: botón "Actualizar" del portal. Cada recarga después de la primera (también tras
// cancelar o reordenar) reemplaza la lista en su lugar, sin esqueleto ni salto de scroll.
export const OrdersView = ({ refreshTrigger }) => {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const confirm = useConfirm();
    const toast = useToast();
    const reqRef = useRef(0); // solo la última petición aplica su respuesta
    const loadedRef = useRef(false); // ya terminó la carga inicial

    const loadOrders = useCallback(async () => {
        const reqId = ++reqRef.current;
        if (!loadedRef.current) setLoading(true);
        try {
            const res = await clientService.getOrders();
            if (reqId !== reqRef.current) return;
            setOrders(res.data);
        } catch (error) {
            if (reqId !== reqRef.current) return;
            // Si falla, los pedidos que ya se ven se conservan (el aviso es el mismo de antes)
            console.error(error);
            toast.error('Error cargando pedidos');
        } finally {
            if (reqId === reqRef.current) {
                loadedRef.current = true;
                setLoading(false);
            }
        }
    }, [toast]);

    useEffect(() => {
        loadOrders();
    }, [loadOrders, refreshTrigger]);

    const handleCancel = async (id) => {
        if (await confirm({ title: 'Cancelar', message: '¿Seguro que deseas cancelar este pedido?' })) {
            try {
                await clientService.cancelOrder(id);
                toast.success('Pedido cancelado');
                loadOrders();
            } catch (error) {
                // El backend explica por qué (p. ej. el pedido ya no está pendiente)
                toast.error(error.response?.data?.message || 'No se pudo cancelar el pedido');
                loadOrders();
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

    if (loading) {
        // Esqueletos con la forma de las tarjetas de pedido (texto para lectores de pantalla)
        return (
            <div className="client-loading orders-container" role="status" aria-busy="true">
                <span className="ui-sr-only">Cargando pedidos...</span>
                {[0, 1, 2].map(i => (
                    <div key={i} className="client-skeleton-card" aria-hidden="true">
                        <span className="ui-skeleton ui-skeleton--title" />
                        <span className="ui-skeleton ui-skeleton--text client-skeleton-short" />
                        <span className="ui-skeleton ui-skeleton--text" />
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="orders-container ui-stagger">
            {orders.length === 0 && (
                <div className="client-orders-empty ui-empty">
                    <span className="material-icons-round ui-empty-icon" aria-hidden="true">receipt_long</span>
                    <p className="ui-empty-title">No tienes pedidos recientes.</p>
                </div>
            )}
            {orders.map(order => (
                <div key={order.id} className={`order-card ui-stripe ui-stripe--${ORDER_TONE[order.estado || 'PENDIENTE'] || 'neutral'} ${order.isSROrder ? 'is-sr' : 'is-normal'}`}>
                    <div className="order-header">
                        <div className="order-head-main">
                            <div className="order-head-text">
                                <div className="order-id">
                                    {formatOrderLabel(order)}
                                </div>
                                <div className="order-date">
                                    <span className="material-icons-round" aria-hidden="true">event</span>
                                    {new Date(order.fechaCreacion).toLocaleDateString()}
                                </div>
                            </div>
                            {order.isSROrder && (
                                <span className="tag-badge tag-sr">S/N</span>
                            )}
                        </div>
                        <span className={`order-status ui-badge status-${order.estado ? order.estado.toLowerCase() : 'pending'}`}>
                            {ORDER_ICON[order.estado || 'PENDIENTE'] && (
                                <span className="material-icons-round" aria-hidden="true">{ORDER_ICON[order.estado || 'PENDIENTE']}</span>
                            )}
                            {order.estado || 'PENDIENTE'}
                        </span>
                    </div>
                    <div className="order-items-summary">
                        <span className="material-icons-round" aria-hidden="true">shopping_bag</span>
                        {order.items.length} productos | Total: <strong className="ui-amount--success">${formatCurrency(order.total)}</strong>
                    </div>
                    {order.notas && <p className="client-order-notes">"{order.notas}"</p>}

                    <div className="order-actions">
                        {/* Solo se cancela lo PENDIENTE (el backend rechaza el resto): cancelar devuelve el
                            stock, y en un pedido ya confirmado, anulado o facturado eso lo devolvería dos
                            veces o dejaría pagos huérfanos */}
                        {order.estado === 'PENDIENTE' && (
                            <button
                                type="button"
                                className="btn-action ui-btn ui-btn--danger-ghost ui-btn--sm"
                                onClick={() => handleCancel(order.id)}
                            >Cancelar</button>
                        )}
                        <button
                            type="button"
                            className="btn-action primary ui-btn ui-btn--secondary ui-btn--sm"
                            onClick={() => handleReorder(order.id)}
                        >
                            <span className="material-icons-round" aria-hidden="true">replay</span>
                            Reordenar
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
};

// === SHOPPING LISTS ===
// refreshTrigger: botón "Actualizar" del portal; las listas se reemplazan en su lugar (no se
// pierden la lista expandida ni el nombre de la lista nueva a medio escribir)
export const ShoppingListsView = ({ onConvertToOrder, productToAdd, onProductAdded, refreshTrigger }) => {
    const [lists, setLists] = useState([]);
    const [newName, setNewName] = useState('');
    const [expandedListId, setExpandedListId] = useState(null);
    const confirm = useConfirm();
    const toast = useToast();
    const reqRef = useRef(0); // solo la última petición aplica su respuesta

    const loadLists = useCallback(async () => {
        const reqId = ++reqRef.current;
        try {
            const res = await clientService.getLists();
            if (reqId !== reqRef.current) return;
            setLists(res.data);
        } catch (error) {
            console.error(error);
        }
    }, []);

    useEffect(() => {
        loadLists();
    }, [loadLists, refreshTrigger]);

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
                    <span className="material-icons-round section-icon" aria-hidden="true">format_list_bulleted</span>
                    <div>
                        <h2>Mis Listas de Compras</h2>
                        <p>Organiza tus pedidos recurrentes y ahorra tiempo.</p>
                    </div>
                </div>

                <form className="modern-create-list-form" onSubmit={handleCreate}>
                    <div className="input-with-icon ui-input-group">
                        <span className="material-icons-round ui-input-icon" aria-hidden="true">edit</span>
                        <input
                            type="text"
                            className="ui-input"
                            placeholder="Nombre de la nueva lista..."
                            aria-label="Nombre de la nueva lista"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                        />
                    </div>
                    <button type="submit" className="btn-create-list ui-btn ui-btn--primary">
                        <span className="material-icons-round" aria-hidden="true">add</span>
                        Crear Nueva Lista
                    </button>
                </form>
            </div>

            {/* Contextual Alert for Adding Product */}
            {productToAdd && (
                <div className="add-context-alert ui-alert ui-alert--info" role="status">
                    <div className="alert-content">
                        <span className="material-icons-round" aria-hidden="true">info</span>
                        <span>Selecciona una lista para guardar: <strong>{productToAdd.nombre}</strong></span>
                    </div>
                    <button
                        type="button"
                        className="btn-cancel-add ui-btn ui-btn--secondary ui-btn--sm"
                        onClick={onProductAdded}
                    >Cancelar</button>
                </div>
            )}

            {/* Lists Grid */}
            <div className="modern-lists-grid ui-stagger">
                {lists.length === 0 ? (
                    <div className="empty-lists-state ui-empty">
                        <span className="material-icons-round ui-empty-icon" aria-hidden="true">inventory_2</span>
                        <p className="ui-empty-title">No tienes listas creadas todavía.</p>
                    </div>
                ) : (
                    lists.map(list => (
                        <div key={list.id} className={`modern-list-card ${expandedListId === list.id ? 'is-expanded' : ''}`}>
                            <div className="list-card-header">
                                {/* Cada lista con su color (mismo nombre, mismo color) */}
                                <div className={`list-icon-circle ui-icon-tile ui-icon-tile--lg ui-icon-tile--${avatarTone(list.name)}`} aria-hidden="true">
                                    <span className="material-icons-round">assignment</span>
                                </div>
                                <div className="list-info">
                                    <h3>{list.name}</h3>
                                    <span className="items-count-badge ui-badge ui-badge--neutral">
                                        <span className="material-icons-round" aria-hidden="true">shopping_basket</span>
                                        {list.items.length} productos
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    className={`btn-toggle-details ui-icon-btn ${expandedListId === list.id ? 'active' : ''}`}
                                    onClick={() => setExpandedListId(expandedListId === list.id ? null : list.id)}
                                    title="Ver productos"
                                    aria-label="Ver productos"
                                    aria-expanded={expandedListId === list.id}
                                >
                                    <span className="material-icons-round ui-chevron" aria-hidden="true">expand_more</span>
                                </button>
                            </div>

                            {/* Conditional Add Button */}
                            {productToAdd && (
                                <button
                                    type="button"
                                    className="btn-add-here-pulsing ui-btn ui-btn--primary ui-btn--block"
                                    onClick={() => handleAddProductToList(list.id, list.name)}
                                >
                                    <span className="material-icons-round" aria-hidden="true">add_shopping_cart</span>
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
                                                    <span className="dot" aria-hidden="true"></span>
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
                                    type="button"
                                    className="btn-convert-order ui-btn ui-btn--secondary ui-btn--block"
                                    onClick={() => handleConvert(list.id)}
                                    disabled={list.items.length === 0}
                                >
                                    <span className="material-icons-round" aria-hidden="true">shopping_cart_checkout</span>
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
// refreshTrigger: botón "Actualizar" del portal. El perfil se vuelve a pedir y se reemplaza en su
// lugar; si el cliente está editando, lo que escribió no se pisa (Cancelar vuelve al perfil nuevo).
export const ClientProfile = ({ refreshTrigger }) => {
    const [profile, setProfile] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState({});
    const toast = useToast();
    const reqRef = useRef(0); // solo la última petición aplica su respuesta
    const isEditingRef = useRef(false);

    useEffect(() => {
        isEditingRef.current = isEditing;
    }, [isEditing]);

    useEffect(() => {
        const reqId = ++reqRef.current;
        const fetchProfile = async () => {
            try {
                const res = await clientService.getProfile();
                if (reqId !== reqRef.current) return;
                setProfile(res.data);
                if (!isEditingRef.current) setFormData(res.data);
            } catch (error) {
                console.error(error);
            }
        };
        fetchProfile();
    }, [refreshTrigger]);

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

    if (!profile) {
        return (
            <div className="client-loading ui-loading" role="status">
                <span className="ui-spinner" aria-hidden="true" />
                Cargando perfil...
            </div>
        );
    }

    return (
        <div className="profile-card">
            <div className="profile-card-header">
                <div className="profile-card-heading">
                    <span className={`ui-avatar ui-avatar--lg ui-avatar--${avatarTone(profile.nombre)} profile-card-avatar`} aria-hidden="true">
                        {avatarInitials(profile.nombre)}
                    </span>
                    <h2>Mi Perfil</h2>
                </div>
                {!isEditing && (
                    <button
                        type="button"
                        className="btn-action ui-btn ui-btn--secondary ui-btn--sm"
                        onClick={() => setIsEditing(true)}
                    >
                        <span className="material-icons-round" aria-hidden="true">edit</span>
                        Editar
                    </button>
                )}
            </div>

            <div className="profile-fields ui-grid">
                <div className="form-group ui-field ui-span-full">
                    <div className="profile-label">
                        <span className="ui-icon-tile ui-icon-tile--sm ui-icon-tile--primary" aria-hidden="true"><span className="material-icons-round">storefront</span></span>
                        <label className="ui-label" htmlFor="client-profile-nombre">Nombre</label>
                    </div>
                    <input
                        id="client-profile-nombre"
                        className="ui-input"
                        type="text"
                        value={profile.nombre}
                        disabled
                    />
                </div>

                <div className="form-group ui-field">
                    <div className="profile-label">
                        <span className="ui-icon-tile ui-icon-tile--sm ui-icon-tile--primary" aria-hidden="true"><span className="material-icons-round">email</span></span>
                        <label className="ui-label" htmlFor="client-profile-email">Email</label>
                    </div>
                    <input
                        id="client-profile-email"
                        className="ui-input"
                        type="email"
                        value={isEditing ? formData.email : profile.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        disabled={!isEditing}
                    />
                </div>

                <div className="form-group ui-field">
                    <div className="profile-label">
                        <span className="ui-icon-tile ui-icon-tile--sm ui-icon-tile--success" aria-hidden="true"><span className="material-icons-round">phone</span></span>
                        <label className="ui-label" htmlFor="client-profile-telefono">Teléfono</label>
                    </div>
                    <input
                        id="client-profile-telefono"
                        className="ui-input"
                        type="text"
                        value={isEditing ? formData.telefono : profile.telefono}
                        onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                        disabled={!isEditing}
                    />
                </div>

                <div className="form-group ui-field ui-span-full">
                    <div className="profile-label">
                        <span className="ui-icon-tile ui-icon-tile--sm ui-icon-tile--warning" aria-hidden="true"><span className="material-icons-round">place</span></span>
                        <label className="ui-label" htmlFor="client-profile-direccion">Dirección</label>
                    </div>
                    <input
                        id="client-profile-direccion"
                        className="ui-input"
                        type="text"
                        value={isEditing ? formData.direccion : profile.direccion}
                        onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
                        disabled={!isEditing}
                    />
                </div>

                {isEditing && (
                    <div className="profile-actions ui-span-full">
                        <button type="button" className="btn-primary-gradient ui-btn ui-btn--primary" onClick={handleSave}>Guardar</button>
                        <button
                            type="button"
                            className="btn-action ui-btn ui-btn--secondary"
                            onClick={() => { setIsEditing(false); setFormData(profile); }}
                        >Cancelar</button>
                    </div>
                )}
            </div>
        </div>
    );
};
