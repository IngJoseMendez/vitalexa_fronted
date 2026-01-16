import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useToast } from '../components/ToastContainer';
import NotificationService from '../services/NotificationService';
import '../styles/EmpacadorDashboard.css';

// ✅ PLACEHOLDER SVG
const PLACEHOLDER_IMAGE = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23f3f4f6" width="200" height="200"/%3E%3Ctext fill="%239ca3af" font-family="Arial, sans-serif" font-size="16" dy="10" font-weight="bold" x="50%25" y="50%25" text-anchor="middle"%3ESin Imagen%3C/text%3E%3C/svg%3E';

function EmpacadorDashboard() {
    const [activeTab, setActiveTab] = useState('nuevo-reembolso');
    // Shared state for cart to persist between tab switches if needed (optional)
    const [cart, setCart] = useState([]);

    const [refreshTrigger, setRefreshTrigger] = useState(0);

    useEffect(() => {
        // Connect to WebSocket using the Empacador role
        NotificationService.connect((notification) => {
            if (notification.type === 'INVENTORY_UPDATE') {
                console.log("📦 Inventory update received, refreshing catalog...");
                setRefreshTrigger(Date.now());
            }
        }, 'empacador');

        return () => {
            NotificationService.disconnect();
        };
    }, []);


    return (
        <div className="empacador-dashboard">
            <nav className="dashboard-nav">
                <button
                    className={activeTab === 'nuevo-reembolso' ? 'active' : ''}
                    onClick={() => setActiveTab('nuevo-reembolso')}
                >
                    <span className="material-icons-round">add_box</span> Nuevo Reembolso
                </button>
                <button
                    className={activeTab === 'historial' ? 'active' : ''}
                    onClick={() => setActiveTab('historial')}
                >
                    <span className="material-icons-round">history</span> Historial
                </button>
            </nav>

            <div className="dashboard-content">
                {activeTab === 'nuevo-reembolso' && (
                    <NuevoReembolsoPanel
                        cart={cart}
                        setCart={setCart}
                        refreshTrigger={refreshTrigger}
                    />
                )}
                {activeTab === 'historial' && <HistorialReembolsosPanel />}
            </div>
        </div>
    );
}

// ============================================
// PANEL NUEVO REEMBOLSO
// ============================================
function NuevoReembolsoPanel({ cart, setCart, refreshTrigger }) {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [notas, setNotas] = useState('');
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const toast = useToast();

    const fetchProducts = useCallback(async () => {
        try {
            const response = await client.get('/empacador/products');
            setProducts(response.data);
        } catch (error) {
            console.error('Error al cargar productos:', error);
            toast.error('Error al cargar catálogo de productos');
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        fetchProducts();
    }, [refreshTrigger, fetchProducts]);

    const addToCart = (product) => {
        const existingItem = cart.find(item => item.productoId === product.id);

        if (existingItem) {
            if (existingItem.cantidad >= product.stock) {
                toast.warning('No hay suficiente stock disponible');
                return;
            }
            setCart(cart.map(item =>
                item.productoId === product.id
                    ? { ...item, cantidad: item.cantidad + 1 }
                    : item
            ));
        } else {
            setCart([...cart, {
                productoId: product.id,
                nombre: product.nombre,
                precio: product.precio,
                imageUrl: product.imageUrl,
                cantidad: 1,
                stockDisponible: product.stock
            }]);
        }
    };

    const removeFromCart = (productId) => {
        setCart(cart.filter(item => item.productoId !== productId));
    };

    const updateQuantity = (productId, newQuantity) => {
        const item = cart.find(i => i.productoId === productId);
        if (!item) return;

        if (newQuantity > item.stockDisponible) {
            toast.warning('No hay suficiente stock disponible');
            return;
        }

        if (newQuantity <= 0) {
            removeFromCart(productId);
            return;
        }

        setCart(cart.map(item =>
            item.productoId === productId
                ? { ...item, cantidad: newQuantity }
                : item
        ));
    };

    const calculateTotalItems = () => {
        return cart.reduce((sum, item) => sum + item.cantidad, 0);
    };

    const handleConfirmReembolso = async () => {
        try {
            const request = {
                items: cart.map(item => ({
                    productoId: item.productoId,
                    cantidad: item.cantidad
                })),
                notas: notas
            };

            await client.post('/empacador/reembolsos', request);
            toast.success('Reembolso creado exitosamente');

            setCart([]);
            setNotas('');
            setShowConfirmModal(false);
            fetchProducts(); // Refresh stock immediately
        } catch (error) {
            console.error('Error al crear reembolso:', error);
            toast.error('Error al crear reembolso: ' + (error.response?.data?.message || 'Error desconocido'));
        }
    };

    const filteredProducts = products.filter(p =>
        p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.descripcion && p.descripcion.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <div className="nuevo-reembolso-panel">
            {/* SECCION IZQUIERDA - CATALOGO */}
            <div className="catalog-section">
                <div className="catalog-header">
                    <h3>Productos Disponibles</h3>
                    <div className="search-container">
                        <span className="material-icons-round search-icon">search</span>
                        <input
                            type="text"
                            placeholder="Buscar productos..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="search-input"
                        />
                    </div>
                </div>

                {loading ? (
                    <div className="loading">Cargando productos...</div>
                ) : (
                    <div className="products-grid">
                        {filteredProducts.map(product => (
                            <div key={product.id} className="product-card">
                                <img
                                    src={product.imageUrl || PLACEHOLDER_IMAGE}
                                    alt={product.nombre}
                                    onError={(e) => { e.target.src = PLACEHOLDER_IMAGE }}
                                    loading="lazy"
                                />
                                <div className="product-info">
                                    <h4>{product.nombre}</h4>
                                    <p className="product-stock">Stock: {product.stock}</p>
                                    <button
                                        onClick={() => addToCart(product)}
                                        className="btn-add-cart"
                                    >
                                        + Agregar
                                    </button>
                                </div>
                            </div>
                        ))}
                        {filteredProducts.length === 0 && (
                            <div className="empty-search">No se encontraron productos</div>
                        )}
                    </div>
                )}
            </div>

            {/* SECCION DERECHA - CARRITO */}
            <div className="cart-section">
                <h3><span className="material-icons-round">shopping_cart</span> Carrito de Reembolso</h3>

                <div className="cart-items-container">
                    {cart.length === 0 ? (
                        <div className="empty-cart-state">
                            <span className="material-icons-round">remove_shopping_cart</span>
                            <p>Selecciona productos para agregar al reembolso</p>
                        </div>
                    ) : (
                        <div className="cart-list">
                            {cart.map(item => (
                                <div key={item.productoId} className="cart-item">
                                    <div className="item-details">
                                        <h5>{item.nombre}</h5>
                                        <span className="item-price">Stock Max: {item.stockDisponible}</span>
                                    </div>
                                    <div className="item-controls">
                                        <button onClick={() => updateQuantity(item.productoId, item.cantidad - 1)}>-</button>
                                        <span className="quantity">{item.cantidad}</span>
                                        <button onClick={() => updateQuantity(item.productoId, item.cantidad + 1)}>+</button>
                                        <button className="btn-remove" onClick={() => removeFromCart(item.productoId)}>
                                            <span className="material-icons-round">close</span>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="cart-footer">
                    <div className="form-group">
                        <label>Notas (Opcional)</label>
                        <textarea
                            value={notas}
                            onChange={(e) => setNotas(e.target.value)}
                            placeholder="Razón del reembolso, # de envío, etc."
                            rows="3"
                        />
                    </div>

                    <div className="cart-summary">
                        <span>Total Items: <strong>{calculateTotalItems()}</strong></span>
                    </div>

                    <button
                        className="btn-confirm-action"
                        disabled={cart.length === 0}
                        onClick={() => setShowConfirmModal(true)}
                    >
                        Confirmar Reembolso
                    </button>
                </div>
            </div>

            {/* MODAL CONFIRMACION */}
            {showConfirmModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3>Confirmar Reembolso</h3>
                        <p>¿Estás seguro de crear este reembolso? <br /> <strong>Se descontarán {calculateTotalItems()} items del inventario.</strong></p>

                        <div className="modal-list-preview">
                            <ul>
                                {cart.map(i => <li key={i.productoId}>{i.nombre} (x{i.cantidad})</li>)}
                            </ul>
                        </div>

                        <div className="modal-actions">
                            <button className="btn-cancel" onClick={() => setShowConfirmModal(false)}>Cancelar</button>
                            <button className="btn-confirm" onClick={handleConfirmReembolso}>Confirmar</button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}

// ============================================
// PANEL HISTORIAL
// ============================================
function HistorialReembolsosPanel() {
    const [reembolsos, setReembolsos] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchHistory = useCallback(async () => {
        try {
            const response = await client.get('/empacador/reembolsos');
            setReembolsos(response.data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchHistory();
    }, [fetchHistory]);

    if (loading) return <div className="loading">Cargando historial...</div>;

    return (
        <div className="historial-panel">
            <h2>Historial de Reembolsos</h2>
            {reembolsos.length === 0 ? (
                <div className="empty-state">No has realizado reembolsos aún.</div>
            ) : (
                <div className="reembolsos-list">
                    {reembolsos.map(r => (
                        <div key={r.id} className="reembolso-card">
                            <div className="reembolso-header">
                                <span className="reembolso-id">#{r.id}</span>
                                <span className="reembolso-date">{new Date(r.fecha).toLocaleString()}</span>
                                <span className="reembolso-status">{r.estado}</span>
                            </div>
                            <div className="reembolso-body">
                                <p><strong>Notas:</strong> {r.notas || 'Sin notas'}</p>
                                <details>
                                    <summary>Ver {r.items.length} productos</summary>
                                    <ul>
                                        {r.items.map((item, idx) => (
                                            <li key={idx}>{item.productoNombre} - Cantidad: {item.cantidad}</li>
                                        ))}
                                    </ul>
                                </details>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default EmpacadorDashboard;
