import { useState, useEffect, useCallback } from 'react';
import client from '../api/client';
import { tagService } from '../api/tagService';
import { useToast } from '../components/ToastContainer';
import { TagBadge, TagFilterBar } from '../components/TagComponents';
import NotificationService from '../services/NotificationService';
import '../styles/VendedorDashboard.css';




// ✅ PLACEHOLDER SVG
const PLACEHOLDER_IMAGE = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23f3f4f6" width="200" height="200"/%3E%3Ctext fill="%239ca3af" font-family="Arial, sans-serif" font-size="16" dy="10" font-weight="bold" x="50%25" y="50%25" text-anchor="middle"%3ESin Imagen%3C/text%3E%3C/svg%3E';

function VendedorDashboard() {
  const [activeTab, setActiveTab] = useState('nueva-venta');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    // Connect with role 'vendedor'
    NotificationService.connect((notification) => {
      if (notification.type === 'INVENTORY_UPDATE') {
        console.log("📦 Inventory update received, refreshing seller dashboard...");
        setRefreshTrigger(Date.now());
      }
    }, 'vendedor');

    return () => {
      NotificationService.disconnect();
    };
  }, []);

  return (
    <div className="vendedor-dashboard">
      <nav className="dashboard-nav">
        <button
          className={activeTab === 'nueva-venta' ? 'active' : ''}
          onClick={() => setActiveTab('nueva-venta')}
        >
          <span className="material-icons-round">add_shopping_cart</span> Nueva Venta
        </button>
        <button
          className={activeTab === 'mis-ventas' ? 'active' : ''}
          onClick={() => setActiveTab('mis-ventas')}
        >
          <span className="material-icons-round">receipt_long</span> Mis Ventas
        </button>
        <button
          className={activeTab === 'ventas-completadas' ? 'active' : ''}
          onClick={() => setActiveTab('ventas-completadas')}
        >
          <span className="material-icons-round">check_circle</span> Completadas
        </button>
        <button
          className={activeTab === 'mis-metas' ? 'active' : ''}
          onClick={() => setActiveTab('mis-metas')}
        >
          <span className="material-icons-round">show_chart</span> Mis Metas
        </button>
        <button
          className={activeTab === 'clientes' ? 'active' : ''}
          onClick={() => setActiveTab('clientes')}
        >
          <span className="material-icons-round">people</span> Clientes
        </button>
        <button
          className={activeTab === 'productos' ? 'active' : ''}
          onClick={() => setActiveTab('productos')}
        >
          <span className="material-icons-round">inventory_2</span> Productos
        </button>
      </nav>

      <div className="dashboard-content">
        {activeTab === 'nueva-venta' && <NuevaVentaPanel refreshTrigger={refreshTrigger} />}
        {activeTab === 'mis-ventas' && <MisVentasPanel />}
        {activeTab === 'ventas-completadas' && <VentasCompletadasPanel />}
        {activeTab === 'mis-metas' && <MisMetasPanel />}
        {activeTab === 'clientes' && <ClientesPanel />}
        {activeTab === 'productos' && <ProductosPanel refreshTrigger={refreshTrigger} />}
      </div>
    </div>
  );
}

// ============================================
// ✅ PANEL NUEVA VENTA - CORREGIDO
// ============================================
function NuevaVentaPanel({ refreshTrigger }) {
  const [clients, setClients] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [allowNoClient, setAllowNoClient] = useState(false);
  const [notas, setNotas] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [gridColumns, setGridColumns] = useState(() => {
    const saved = localStorage.getItem('vendedorGridColumns');
    return saved ? parseInt(saved) : 2;
  });
  const toast = useToast();

  const [tags, setTags] = useState([]);
  const [activeTagId, setActiveTagId] = useState(null);

  useEffect(() => {
    localStorage.setItem('vendedorGridColumns', gridColumns.toString());
  }, [gridColumns]);

  const fetchTags = useCallback(async () => {
    try {
      const res = await tagService.getAll();
      setTags(res.data);
    } catch (e) {
      console.error("Error loading tags");
    }
  }, []);

  const fetchClients = useCallback(async () => {
    try {
      const response = await client.get('/vendedor/clients');
      setClients(response.data);
    } catch (error) {
      console.error('Error al cargar clientes:', error);
    }
  }, []);

  const fetchProducts = useCallback(async () => {
    try {
      let url = '/vendedor/products';
      if (activeTagId) {
        url = `/vendedor/products/tag/${activeTagId}`;
      }
      const response = await client.get(url);
      setProducts(response.data.content || response.data || []);
    } catch (error) {
      console.error('Error al cargar productos:', error);
    } finally {
      setLoading(false);
    }
  }, [activeTagId]);

  useEffect(() => {
    fetchClients();
    fetchProducts();
    fetchTags();
  }, [refreshTrigger, activeTagId, fetchClients, fetchProducts, fetchTags]);

  const addToCart = (product) => {
    const existingItem = cart.find(item => item.productId === product.id);

    if (existingItem) {
      if (existingItem.cantidad >= product.stock) {
        toast.warning('No hay suficiente stock disponible');
        return;
      }
      setCart(cart.map(item =>
        item.productId === product.id
          ? { ...item, cantidad: item.cantidad + 1 }
          : item
      ));
    } else {
      setCart([...cart, {
        productId: product.id,
        nombre: product.nombre,
        precio: product.precio,
        cantidad: 1,
        stockDisponible: product.stock
      }]);
    }
  };

  const removeFromCart = (productId) => {
    setCart(cart.filter(item => item.productId !== productId));
  };

  const updateQuantity = (productId, newQuantity) => {
    const item = cart.find(i => i.productId === productId);

    if (newQuantity > item.stockDisponible) {
      toast.warning('No hay suficiente stock disponible');
      return;
    }

    if (newQuantity <= 0) {
      removeFromCart(productId);
      return;
    }

    setCart(cart.map(item =>
      item.productId === productId
        ? { ...item, cantidad: newQuantity }
        : item
    ));
  };

  const calculateTotal = () => {
    return cart.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
  };

  const handleSubmitOrder = async () => {
    if (cart.length === 0) {
      toast.warning('Agrega productos al carrito');
      return;
    }

    if (!selectedClient && !allowNoClient) {
      toast.warning('Selecciona un cliente o marca la casilla para confirmar venta sin cliente');
      return;
    }

    try {
      const orderData = {
        clientId: selectedClient || null,
        items: cart.map(item => ({
          productId: item.productId,
          cantidad: item.cantidad
        })),
        notas: notas.trim() || null
      };

      const res = await client.post('/vendedor/orders', orderData);

      // Check if it was a split order (2 orders created)
      if (res.data && res.data.createdOrders && res.data.createdOrders.length > 1) {
        toast.info('Se detectaron productos S/R: se generaron 2 órdenes con facturas consecutivas.', { duration: 6000 });
      } else {
        toast.success('¡Venta registrada exitosamente!');
      }

      // Limpiar formulario
      setCart([]);
      setSelectedClient('');
      setAllowNoClient(false);
      setNotas('');
      fetchProducts();
    } catch (error) {
      console.error('Error al crear orden:', error);
      toast.error('Error al registrar la venta: ' + (error.response?.data?.message || 'Error desconocido'));
    }
  };

  if (loading) {
    return <div className="loading">Cargando...</div>;
  }

  const filteredProducts = (products || []).filter(p => {
    const matchesSearch = p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.descripcion && p.descripcion.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesTag = !activeTagId || p.tagId === activeTagId;
    return matchesSearch && matchesTag;
  });

  return (
    <div className="nueva-venta-panel">
      <h2><span className="material-icons-round" style={{ fontSize: '32px', color: 'var(--primary)', verticalAlign: 'middle' }}>add_shopping_cart</span> Nueva Venta</h2>

      <div className="venta-layout">
        {/* ✅ SECCIÓN IZQUIERDA - PRODUCTOS CON IMÁGENES CORREGIDAS */}
        <div className="productos-section">
          <div className="products-header">
            <h3>Productos Disponibles</h3>
            <div className="products-header-toolbar">
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
              <div className="grid-columns-selector">
                {[1, 2, 3].map(cols => (
                  <button
                    key={cols}
                    className={`grid-btn ${gridColumns === cols ? 'active' : ''}`}
                    onClick={() => setGridColumns(cols)}
                    title={`${cols} columnas`}
                  >
                    <span className="material-icons-round">dashboard</span>
                    {cols}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <TagFilterBar
            tags={tags}
            activeTagId={activeTagId}
            onSelectTag={setActiveTagId}
            onClear={() => setActiveTagId(null)}
          />

          <div className="productos-grid" style={{ 
            gridTemplateColumns: `repeat(${gridColumns}, 1fr)`
          }}>
            {filteredProducts.length === 0 ? (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
                <span className="material-icons-round" style={{ fontSize: '3rem', opacity: 0.3 }}>inventory_2</span>
                <p style={{ marginTop: '1rem', fontSize: '0.95rem' }}>No se encontraron productos</p>
              </div>
            ) : (
              filteredProducts.map(product => (
                <div key={product.id} className="product-card">
                  {/* ✅ IMAGEN CORREGIDA */}
                  <img
                    src={product.imageUrl || PLACEHOLDER_IMAGE}
                    alt={product.nombre}
                    onError={(e) => {
                      console.warn(`⚠️ Error cargando imagen: ${product.imageUrl}`);
                      e.target.src = PLACEHOLDER_IMAGE;
                    }}
                    loading="lazy"
                  />
                  {/* Stock indicator badge showing items in cart */}
                  {cart.some(item => item.productId === product.id) && (
                    <span className="product-cart-badge" title="Cantidad en carrito">
                      <span className="material-icons-round">shopping_cart</span>
                      {cart.find(item => item.productId === product.id)?.cantidad || 0}
                    </span>
                  )}
                  <div className="product-info">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.25rem', gap: '0.5rem' }}>
                      <h4 style={{ margin: 0, flex: 1 }}>{product.nombre}</h4>
                      {product.tagName && <TagBadge tagName={product.tagName} />}
                    </div>
                    <p className="product-price">${parseFloat(product.precio).toFixed(2)}</p>
                    
                    {/* Visual Stock Display */}
                    <div className="stock-visual-indicator">
                      <div className="stock-bar-small">
                        <div 
                          className="stock-fill-small" 
                          style={{
                            width: `${Math.max(0, ((product.stock - (cart.find(item => item.productId === product.id)?.cantidad || 0)) / product.stock) * 100)}%`
                          }}
                        />
                      </div>
                      <span className="stock-text">
                        {Math.max(0, product.stock - (cart.find(item => item.productId === product.id)?.cantidad || 0))}/{product.stock} disponibles
                      </span>
                    </div>
                    
                    <button
                      onClick={() => addToCart(product)}
                      disabled={product.stock === 0 || product.stock - (cart.find(item => item.productId === product.id)?.cantidad || 0) <= 0}
                      className="btn-add-cart"
                    >
                      <span className="material-icons-round" style={{ fontSize: '1.1rem' }}>
                        {product.stock === 0 || product.stock - (cart.find(item => item.productId === product.id)?.cantidad || 0) <= 0 ? 'block' : 'add'}
                      </span>
                      {product.stock === 0 ? 'Sin Stock' : product.stock - (cart.find(item => item.productId === product.id)?.cantidad || 0) <= 0 ? 'Agotado' : 'Agregar'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* SECCIÓN DERECHA - CARRITO */}
        <div className="carrito-section">
          <h3>
            <span className="material-icons-round" style={{ fontSize: '1.25rem' }}>shopping_cart</span>
            Carrito
          </h3>

          <div className="form-group">
            <label htmlFor="cliente-select">
              <span className="material-icons-round" style={{ fontSize: '1rem', marginRight: '0.35rem', verticalAlign: 'middle' }}>person</span>
              Cliente
            </label>
            <select
              id="cliente-select"
              value={selectedClient}
              onChange={(e) => {
                setSelectedClient(e.target.value);
                setAllowNoClient(false);
              }}
              disabled={allowNoClient}
            >
              <option value="">Selecciona un cliente</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>
                  {c.nombre} - {c.telefono}
                </option>
              ))}
            </select>
          </div>

          <div className="checkbox-group">
            <input
              id="sin-cliente"
              type="checkbox"
              checked={allowNoClient}
              onChange={(e) => {
                setAllowNoClient(e.target.checked);
                if (e.target.checked) {
                  setSelectedClient('');
                }
              }}
            />
            <label htmlFor="sin-cliente">
              Venta sin cliente (confirmo que estoy seguro)
            </label>
          </div>

          <div className="form-group">
            <label htmlFor="notas">
              <span className="material-icons-round" style={{ fontSize: '1rem', marginRight: '0.35rem', verticalAlign: 'middle' }}>notes</span>
              Notas / Productos sin stock
            </label>
            <textarea
              id="notas"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows="3"
              placeholder="Ej: Cliente solicita producto X sin stock, contactar proveedor..."
            />
            <small style={{ color: '#6b7280', fontSize: '12px', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span className="material-icons-round" style={{ fontSize: '14px' }}>lightbulb</span> Use este campo para solicitudes sin stock o instrucciones especiales
            </small>
          </div>

          <div className="cart-items">
            {cart.length === 0 ? (
              <div className="empty-cart">
                <span className="material-icons-round" style={{ fontSize: '2.5rem', opacity: 0.5 }}>shopping_bag</span>
                <span>El carrito está vacío</span>
              </div>
            ) : (
              <>
                {cart.map(item => {
                  const product = products.find(p => p.id === item.productId);
                  
                  
                  return (
                    <div key={item.productId} className="cart-item">
                      <div className="cart-item-info">
                        <h4>{item.nombre}</h4>
                        <p>${parseFloat(item.precio).toFixed(2)} c/u</p>
                      </div>
                      <div className="cart-item-controls">
                        <div>
                          <button onClick={() => updateQuantity(item.productId, item.cantidad - 1)} title="Reducir cantidad">−</button>
                          <input
                            type="number"
                            value={item.cantidad}
                            onChange={(e) => updateQuantity(item.productId, parseInt(e.target.value) || 0)}
                            min="1"
                            max={item.stockDisponible}
                          />
                          <button onClick={() => updateQuantity(item.productId, item.cantidad + 1)} title="Aumentar cantidad">+</button>
                        </div>
                        <button
                          className="btn-remove"
                          onClick={() => removeFromCart(item.productId)}
                          title="Eliminar del carrito"
                        >
                          <span className="material-icons-round">delete_outline</span>
                        </button>
                      </div>
                      <div className="cart-item-subtotal">
                        ${(item.precio * item.cantidad).toFixed(2)}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>

          <div className="cart-total">
            Total: <span style={{ color: 'var(--primary)', fontSize: '1.5rem', fontWeight: 900 }}>${calculateTotal().toFixed(2)}</span>
          </div>

          <button
            className="btn-finalizar-venta"
            onClick={handleSubmitOrder}
            disabled={cart.length === 0 || (!selectedClient && !allowNoClient)}
          >
            <span className="material-icons-round" style={{ fontSize: '1.2rem' }}>check_circle</span>
            Finalizar Venta
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// PANEL VENTAS COMPLETADAS
// ============================================
function VentasCompletadasPanel() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCompletedOrders();
  }, []);

  const fetchCompletedOrders = async () => {
    try {
      const response = await client.get('/vendedor/orders/my');
      const completed = response.data.filter(order => order.estado === 'COMPLETADO');
      setOrders(completed);
    } catch (error) {
      console.error('Error al cargar ventas completadas:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Cargando...</div>;
  }

  return (
    <div className="ventas-completadas-panel">
      <h2><span className="material-icons-round" style={{ color: 'var(--success)', verticalAlign: 'middle' }}>check_circle</span> Ventas Completadas</h2>

      {orders.length === 0 ? (
        <div className="empty-state">
          <p>No tienes ventas completadas aún</p>
        </div>
      ) : (
        <div className="ventas-list">
          {orders.map(order => (
            <div key={order.id} className="venta-card completed">
              <div className="venta-header">
                <span className="venta-id">#{order.id.substring(0, 8)}</span>
                <span className="venta-status status-completado">
                  <span className="material-icons-round" style={{ fontSize: '14px' }}>check_circle</span> COMPLETADO
                </span>
              </div>

              <div className="venta-info">
                <p><strong>Cliente:</strong> {order.cliente || 'Sin cliente'}</p>
                <p><strong>Fecha:</strong> {new Date(order.fecha).toLocaleString()}</p>
                <p><strong>Total:</strong> ${parseFloat(order.total).toFixed(2)}</p>

                {order.notas && (
                  <div className="venta-notes">
                    <strong><span className="material-icons-round" style={{ fontSize: '14px' }}>note</span> Notes:</strong>
                    <p>{order.notas}</p>
                  </div>
                )}
              </div>

              <details className="venta-details">
                <summary>Ver productos</summary>
                <ul>
                  {order.items.map((item, idx) => (
                    <li key={idx}>
                      {item.productName} - {item.cantidad} x ${parseFloat(item.precioUnitario).toFixed(2)}
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// PANEL CLIENTES
// ============================================
function ClientesPanel() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    try {
      const response = await client.get('/vendedor/clients');
      setClients(response.data);
    } catch (error) {
      console.error('Error al cargar clientes:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Cargando...</div>;
  }

  return (
    <div className="clientes-panel">
      <div className="panel-header">
        <h2><span className="material-icons-round" style={{ fontSize: '32px', color: 'var(--primary)', verticalAlign: 'middle' }}>people</span> Clientes</h2>
        <button className="btn-add" onClick={() => setShowModal(true)}>
          + Nuevo Cliente
        </button>
      </div>

      <div className="clientes-grid">
        {clients.map(cliente => (
          <div key={cliente.id} className="cliente-card">
            <h3>{cliente.nombre}</h3>
            <p><span className="material-icons-round" style={{ fontSize: '16px', verticalAlign: 'middle' }}>email</span> {cliente.email}</p>
            <p><span className="material-icons-round" style={{ fontSize: '16px', verticalAlign: 'middle' }}>phone</span> {cliente.telefono}</p>
            <p><span className="material-icons-round" style={{ fontSize: '16px', verticalAlign: 'middle' }}>place</span> {cliente.direccion || 'Sin dirección'}</p>
            <div className="cliente-stats">
              <span><span className="material-icons-round" style={{ fontSize: '16px', verticalAlign: 'middle' }}>shopping_bag</span> Compras: ${parseFloat(cliente.totalCompras || 0).toFixed(2)}</span>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <ClientFormModal
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false);
            fetchClients();
          }}
        />
      )}
    </div>
  );
}

// ============================================
// MODAL CREAR CLIENTE
// ============================================
function ClientFormModal({ onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    nombre: '',
    email: '',
    telefono: '',
    direccion: ''
  });
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      await client.post('/vendedor/clients', formData);
      toast.success('Cliente creado exitosamente');
      onSuccess();
    } catch (error) {
      console.error('Error al crear cliente:', error);
      toast.error('Error al crear cliente: ' + (error.response?.data?.message || error.message));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Nuevo Cliente</h3>
          <button className="btn-close" onClick={onClose}><span className="material-icons-round">close</span></button>
        </div>

        <form onSubmit={handleSubmit} className="client-form">
          <div className="form-group">
            <label>Nombre *</label>
            <input
              type="text"
              value={formData.nombre}
              onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label>Email *</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label>Teléfono *</label>
            <input
              type="tel"
              value={formData.telefono}
              onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label>Dirección</label>
            <textarea
              value={formData.direccion}
              onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
              rows="3"
            />
          </div>

          <div className="form-actions">
            <button type="button" onClick={onClose} className="btn-cancel">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="btn-save">
              {saving ? 'Guardando...' : 'Crear Cliente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================
// PANEL MIS VENTAS
// ============================================
function MisVentasPanel() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMyOrders();
  }, []);

  const fetchMyOrders = async () => {
    try {
      const response = await client.get('/vendedor/orders/my');
      const pending = response.data.filter(order =>
        order.estado === 'PENDIENTE' || order.estado === 'CONFIRMADO'
      );
      setOrders(pending);
    } catch (error) {
      console.error('Error al cargar mis ventas:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Cargando...</div>;
  }

  return (
    <div className="mis-ventas-panel">
      <h2><span className="material-icons-round" style={{ verticalAlign: 'middle' }}>receipt_long</span> Mis Ventas (En Progreso)</h2>

      {orders.length === 0 ? (
        <div className="empty-state">
          <p>No tienes ventas en proceso</p>
        </div>
      ) : (
        <div className="ventas-list">
          {orders.map(order => (
            <div key={order.id} className={`venta-card ${order.isSROrder ? 'is-sr' : 'is-normal'}`}>
              <div className="venta-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span className="venta-id">
                    {order.invoiceNumber ? `Factura #${order.invoiceNumber}` : `#${order.id.substring(0, 8)}`}
                  </span>
                  {order.isSROrder && (
                    <span className="tag-badge tag-sr" style={{ padding: '0.15rem 0.5rem', fontSize: '0.65rem' }}>S/N</span>
                  )}
                </div>
                <span className={`venta-status status-${order.estado ? order.estado.toLowerCase() : 'pendiente'}`}>
                  {order.estado || 'PENDIENTE'}
                </span>
              </div>

              <div className="venta-info">
                <p><strong>Cliente:</strong> {order.cliente || 'Sin cliente'}</p>
                <p><strong>Fecha:</strong> {new Date(order.fecha).toLocaleString()}</p>
                <p><strong>Total:</strong> ${parseFloat(order.total).toFixed(2)}</p>

                {order.notas && (
                  <div className="venta-notes">
                    <strong><span className="material-icons-round" style={{ fontSize: '14px' }}>note</span> Notes:</strong>
                    <p>{order.notas}</p>
                  </div>
                )}
              </div>

              <details className="venta-details">
                <summary>Ver productos</summary>
                <ul>
                  {order.items.map((item, idx) => (
                    <li key={idx}>
                      {item.productName} - {item.cantidad} x ${parseFloat(item.precioUnitario).toFixed(2)}
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// ✅ PANEL PRODUCTOS CATÁLOGO - CORREGIDO
// ============================================
// ============================================
// ✅ PANEL PRODUCTOS CATÁLOGO - CORREGIDO
// ============================================
function ProductosPanel() {
  const [products, setProducts] = useState([]);
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTagId, setActiveTagId] = useState(null);

  const fetchTags = useCallback(async () => {
    try {
      const res = await tagService.getAll();
      setTags(res.data);
    } catch (e) {
      console.error("Error loading tags");
    }
  }, []);

  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true);
      let url = '/vendedor/products';
      if (activeTagId) {
        url = `/vendedor/products/tag/${activeTagId}`;
      }
      const response = await client.get(url);
      setProducts(response.data.content || response.data || []);
    } catch (error) {
      console.error('Error al cargar productos:', error);
    } finally {
      setLoading(false);
    }
  }, [activeTagId]);

  useEffect(() => {
    fetchProducts();
    fetchTags();
  }, [activeTagId, fetchProducts, fetchTags]);

  const filteredProducts = (products || []).filter(p => {
    const matchesSearch = p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.descripcion && p.descripcion.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesTag = !activeTagId || p.tagId === activeTagId;
    return matchesSearch && matchesTag;
  });

  if (loading) {
    return <div className="loading">Cargando...</div>;
  }

  return (
    <div className="productos-catalogo">
      <div className="panel-header-catalogo">
        <h2><span className="material-icons-round" style={{ fontSize: '32px', verticalAlign: 'middle' }}>inventory_2</span> Catálogo de Productos</h2>
        <div className="search-container-catalogo">
          <span className="material-icons-round search-icon">search</span>
          <input
            type="text"
            placeholder="Buscar productos..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input-catalogo"
          />
        </div>
      </div>

      <TagFilterBar
        tags={tags}
        activeTagId={activeTagId}
        onSelectTag={setActiveTagId}
        onClear={() => setActiveTagId(null)}
      />

      <div className="productos-grid-catalogo">
        {filteredProducts.map(product => (
          <div key={product.id} className="producto-card">
            {/* ✅ IMAGEN CORREGIDA */}
            <div className="producto-img-container">
              <img
                src={product.imageUrl || PLACEHOLDER_IMAGE}
                alt={product.nombre}
                onError={(e) => {
                  console.warn(`⚠️ Error cargando imagen: ${product.imageUrl}`);
                  e.target.src = PLACEHOLDER_IMAGE;
                }}
                loading="lazy"
              />
            </div>
            <div className="producto-info">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <h3 style={{ margin: 0 }}>{product.nombre}</h3>
                {product.tagName && <TagBadge tagName={product.tagName} />}
              </div>
              <p className="producto-descripcion">{product.descripcion}</p>
              <div className="producto-details">
                <span className="producto-precio">${parseFloat(product.precio).toFixed(2)}</span>
                <span className={`producto-stock ${product.stock <= 5 ? 'low' : ''}`}>
                  Stock: {product.stock}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================
// PANEL MIS METAS
// ============================================
function MisMetasPanel() {
  const [currentGoal, setCurrentGoal] = useState(null);
  const [goalHistory, setGoalHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    fetchCurrentGoal();
    fetchGoalHistory();
  }, []);

  const fetchCurrentGoal = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await client.get('/vendedor/sale-goals/my');
      setCurrentGoal(response.data);
    } catch (error) {
      console.error('Error al cargar meta actual:', error);
      if (error.response?.status === 404) {
        setError('No tienes una meta asignada para este mes');
      } else {
        setError('Error al cargar tu meta actual');
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchGoalHistory = async () => {
    try {
      const response = await client.get('/vendedor/sale-goals/history');
      setGoalHistory(response.data);
    } catch (error) {
      console.error('Error al cargar historial:', error);
    }
  };

  if (loading) {
    return <div className="loading">Cargando tu meta...</div>;
  }

  return (
    <div className="mis-metas-panel">
      <div className="panel-header">
        <h2>
          <span className="material-icons-round" style={{ fontSize: '32px', color: 'var(--primary)', verticalAlign: 'middle' }}>
            show_chart
          </span>
          {' '}Mis Metas de Ventas
        </h2>
      </div>

      {error && !currentGoal ? (
        <div className="no-goal-message">
          <span className="material-icons-round" style={{ fontSize: '64px', color: 'var(--text-muted)' }}>
            trending_up
          </span>
          <h3>{error}</h3>
          <p>Contacta a tu supervisor para que te asigne una meta mensual</p>
        </div>
      ) : currentGoal && (
        <div className="current-goal-section">
          <div className="goal-card-large">
            <div className="goal-header">
              <div className="goal-period">
                <span className="material-icons-round">calendar_today</span>
                <span>{getMonthName(currentGoal.month)} {currentGoal.year}</span>
              </div>
              {currentGoal.completed && (
                <div className="goal-completed-badge">
                  <span className="material-icons-round">emoji_events</span>
                  ¡Meta Completada!
                </div>
              )}
            </div>

            <div className="goal-stats-large">
              <div className="stat-box">
                <div className="stat-icon target">
                  <span className="material-icons-round">flag</span>
                </div>
                <div className="stat-content">
                  <span className="stat-label">Meta del Mes</span>
                  <span className="stat-value">${parseFloat(currentGoal.targetAmount).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </div>

              <div className="stat-box">
                <div className="stat-icon current">
                  <span className="material-icons-round">payments</span>
                </div>
                <div className="stat-content">
                  <span className="stat-label">Ventas Actuales</span>
                  <span className="stat-value">${parseFloat(currentGoal.currentAmount).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </div>

              <div className="stat-box">
                <div className="stat-icon remaining">
                  <span className="material-icons-round">trending_up</span>
                </div>
                <div className="stat-content">
                  <span className="stat-label">Falta por Lograr</span>
                  <span className="stat-value">
                    ${Math.max(0, parseFloat(currentGoal.targetAmount) - parseFloat(currentGoal.currentAmount)).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            <div className="progress-section-large">
              <div className="progress-header">
                <span className="progress-label">Progreso de la Meta</span>
                <span className="progress-percentage">
                  {parseFloat(currentGoal.percentage).toFixed(1)}%
                </span>
              </div>
              <div className="progress-bar-large">
                <div
                  className={`progress-fill ${currentGoal.completed ? 'completed' : ''}`}
                  style={{ width: `${Math.min(parseFloat(currentGoal.percentage), 100)}%` }}
                >
                  {parseFloat(currentGoal.percentage) > 10 && (
                    <span className="progress-text">
                      {parseFloat(currentGoal.percentage).toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>
              <div className="progress-labels">
                <span>$0</span>
                <span>${parseFloat(currentGoal.targetAmount).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
              </div>
            </div>

            {!currentGoal.completed && (
              <div className="motivation-message">
                {parseFloat(currentGoal.percentage) < 25 && (
                  <>
                    <span className="material-icons-round">rocket_launch</span>
                    <p>¡Vamos! Apenas estás comenzando el mes. ¡Tú puedes lograrlo!</p>
                  </>
                )}
                {parseFloat(currentGoal.percentage) >= 25 && parseFloat(currentGoal.percentage) < 50 && (
                  <>
                    <span className="material-icons-round">directions_run</span>
                    <p>¡Buen ritmo! Ya llevas el 25% de tu meta.</p>
                  </>
                )}
                {parseFloat(currentGoal.percentage) >= 50 && parseFloat(currentGoal.percentage) < 75 && (
                  <>
                    <span className="material-icons-round">local_fire_department</span>
                    <p>¡Excelente! Ya superaste la mitad de tu meta. ¡Sigue así!</p>
                  </>
                )}
                {parseFloat(currentGoal.percentage) >= 75 && parseFloat(currentGoal.percentage) < 100 && (
                  <>
                    <span className="material-icons-round">military_tech</span>
                    <p>¡Increíble! Estás a punto de lograr tu meta. ¡El último empujón!</p>
                  </>
                )}
              </div>
            )}

            {currentGoal.completed && (
              <div className="completion-celebration">
                <span className="material-icons-round celebration-icon">celebration</span>
                <h3>¡Felicidades!</h3>
                <p>Has superado tu meta de ventas para este mes</p>
              </div>
            )}

            <div className="goal-timestamps">
              <p>
                <span className="material-icons-round" style={{ fontSize: '16px', verticalAlign: 'middle' }}>update</span>
                {' '}Última actualización: {new Date(currentGoal.updatedAt).toLocaleString('es-ES')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* HISTORIAL DE METAS */}
      {goalHistory.length > 0 && (
        <div className="goal-history-section">
          <button
            className="btn-toggle-history"
            onClick={() => setShowHistory(!showHistory)}
          >
            <span className="material-icons-round">history</span>
            {showHistory ? 'Ocultar Historial' : 'Ver Historial de Metas'}
            <span className="material-icons-round">
              {showHistory ? 'expand_less' : 'expand_more'}
            </span>
          </button>

          {showHistory && (
            <div className="history-grid">
              {goalHistory.map((goal) => (
                <div key={goal.id} className={`history-card ${goal.completed ? 'completed' : ''}`}>
                  <div className="history-header">
                    <h4>{getMonthName(goal.month)} {goal.year}</h4>
                    {goal.completed && (
                      <span className="completed-icon">
                        <span className="material-icons-round">check_circle</span>
                      </span>
                    )}
                  </div>

                  <div className="history-stats">
                    <div className="history-stat">
                      <span className="label">Meta:</span>
                      <span className="value">${parseFloat(goal.targetAmount).toFixed(2)}</span>
                    </div>
                    <div className="history-stat">
                      <span className="label">Logrado:</span>
                      <span className="value">${parseFloat(goal.currentAmount).toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="history-progress">
                    <div className="progress-bar-small">
                      <div
                        className={`progress-fill ${goal.completed ? 'completed' : ''}`}
                        style={{ width: `${Math.min(parseFloat(goal.percentage), 100)}%` }}
                      />
                    </div>
                    <span className="percentage-text">
                      {parseFloat(goal.percentage).toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Utilidad para nombres de meses
function getMonthName(month) {
  const months = [
    '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  return months[month];
}

export default VendedorDashboard;
