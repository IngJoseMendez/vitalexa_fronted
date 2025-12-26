import { useState, useEffect } from 'react';
import client from '../api/client';
import { useToast } from '../components/ToastContainer';
import { useConfirm } from '../components/ConfirmDialog';
import '../styles/AdminDashboard.css';

function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('orders');

  return (
    <div className="admin-dashboard">
      <nav className="dashboard-nav">
        <button
          className={activeTab === 'orders' ? 'active' : ''}
          onClick={() => setActiveTab('orders')}
        >
          <span className="material-icons-round">assignment</span> Orders
        </button>
        <button
          className={activeTab === 'products' ? 'active' : ''}
          onClick={() => setActiveTab('products')}
        >
          <span className="material-icons-round">inventory_2</span> Products
        </button>
      </nav>

      <div className="dashboard-content">
        {activeTab === 'orders' && <OrdersPanel />}
        {activeTab === 'products' && <ProductsPanel />}
      </div>
    </div>
  );
}

// ============================================
// PANEL DE ÓRDENES CON AUTO-ACTUALIZACIÓN
// ============================================
// ============================================
// PANEL DE ÓRDENES CON PDF DE FACTURA
// ============================================
function OrdersPanel() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [filter, setFilter] = useState('pending');
  const [downloadingPdf, setDownloadingPdf] = useState(null);
  const toast = useToast();

  useEffect(() => {
    fetchOrders();

    // ✅ LISTENER PARA AUTO-ACTUALIZACIÓN AL RECIBIR NOTIFICACIÓN
    const handleNewOrder = () => {
      console.log('🔄 Auto-actualizando órdenes...');
      fetchOrders();
    };

    window.addEventListener('new-order-notification', handleNewOrder);
    window.addEventListener('order-completed-notification', handleNewOrder);

    return () => {
      window.removeEventListener('new-order-notification', handleNewOrder);
      window.removeEventListener('order-completed-notification', handleNewOrder);
    };
  }, []);

  const fetchOrders = async () => {
    try {
      const response = await client.get('/admin/orders');
      setOrders(response.data);
      console.log('✅ Órdenes actualizadas:', response.data.length);
    } catch (error) {
      console.error('Error al cargar órdenes:', error);
      toast.error('Error al cargar órdenes: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  const changeStatus = async (orderId, newStatus) => {
    try {
      await client.patch(`/admin/orders/${orderId}/status?status=${newStatus}`);
      await fetchOrders();
      toast.success(`Estado actualizado a ${newStatus}`);
    } catch (error) {
      console.error('Error al cambiar estado:', error);
      toast.error('Error al cambiar estado: ' + (error.response?.data?.message || error.message));
    }
  };

  // ✅ NUEVA FUNCIÓN: Descargar factura PDF
  const handleDownloadInvoice = async (orderId) => {
    try {
      setDownloadingPdf(orderId);
      const response = await client.get(`/admin/orders/${orderId}/invoice/pdf`, {
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `factura_orden_${orderId.substring(0, 8)}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      console.log('✅ PDF descargado correctamente');
    } catch (error) {
      console.error('Error al descargar factura:', error);
      toast.error('Error al descargar la factura');
    } finally {
      setDownloadingPdf(null);
    }
  };



  // ✅ NUEVA FUNCIÓN: Vista previa del PDF
  const handlePreviewInvoice = async (orderId) => {
    try {
      // Descargar el PDF con autenticación
      const response = await client.get(`/admin/orders/${orderId}/invoice/pdf`, {
        responseType: 'blob'
      });

      // Crear URL temporal del blob
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);

      // Abrir en nueva pestaña
      const previewWindow = window.open(url, '_blank');

      if (!previewWindow) {
        toast.warning('Por favor permite las ventanas emergentes');
      }

      // Limpiar URL después de 10 segundos
      setTimeout(() => window.URL.revokeObjectURL(url), 10000);
    } catch (error) {
      console.error('Error al previsualizar factura:', error);
      toast.error('Error al abrir la vista previa');
    }
  };

  const filteredOrders = orders.filter(order => {
    if (filter === 'pending') return order.estado === 'PENDIENTE' || order.estado === 'CONFIRMADO';
    if (filter === 'completed') return order.estado === 'COMPLETADO';
    if (filter === 'all') return true;
    return order.estado === filter;
  });

  if (loading) {
    return <div className="loading">Cargando órdenes...</div>;
  }

  return (
    <div className="orders-panel">
      <div className="panel-header">
        <h2><span className="material-icons-round" style={{ fontSize: '32px', color: 'var(--primary)', verticalAlign: 'middle' }}>assignment_turned_in</span> Orders Management</h2>
        <div className="filter-buttons">
          <button
            className={filter === 'pending' ? 'active' : ''}
            onClick={() => setFilter('pending')}
          >
            <span className="material-icons-round">pending_actions</span> Pending ({orders.filter(o => o.estado === 'PENDIENTE' || o.estado === 'CONFIRMADO').length})
          </button>
          <button
            className={filter === 'completed' ? 'active' : ''}
            onClick={() => setFilter('completed')}
          >
            <span className="material-icons-round">check_circle</span> Completed ({orders.filter(o => o.estado === 'COMPLETADO').length})
          </button>
          <button
            className={filter === 'all' ? 'active' : ''}
            onClick={() => setFilter('all')}
          >
            <span className="material-icons-round">analytics</span> All ({orders.length})
          </button>
        </div>
      </div>

      {filteredOrders.length === 0 ? (
        <div className="empty-state">
          <p><span className="material-icons-round" style={{ fontSize: '48px', color: 'var(--text-muted)' }}>inbox</span><br />No orders found in this category</p>
        </div>
      ) : (
        <div className="orders-grid">
          {filteredOrders.map(order => (
            <div key={order.id} className="order-card">
              <div className="order-header">
                <span className="order-id">#{order.id.substring(0, 8)}</span>
                <span className={`order-status status-${order.estado.toLowerCase()}`}>
                  {order.estado}
                </span>
              </div>

              <div className="order-info">
                <p><strong>Vendedor:</strong> {order.vendedor}</p>
                <p><strong>Cliente:</strong> {order.cliente}</p>
                <p><strong>Fecha:</strong> {new Date(order.fecha).toLocaleString('es-ES')}</p>
                <p className="order-total"><strong>Total:</strong> ${parseFloat(order.total).toFixed(2)}</p>

                {order.notas && (
                  <div className="order-notes">
                    <strong><span className="material-icons-round" style={{ fontSize: '16px', verticalAlign: 'middle' }}>note</span> Notes:</strong>
                    <p>{order.notas}</p>
                  </div>
                )}
              </div>

              <details className="order-details">
                <summary>Ver productos ({order.items.length})</summary>
                <ul>
                  {order.items.map((item, idx) => (
                    <li key={idx}>
                      <span className="item-name">{item.productName}</span>
                      <span className="item-qty">{item.cantidad} x ${parseFloat(item.precioUnitario).toFixed(2)}</span>
                      <span className="item-subtotal">${parseFloat(item.subtotal).toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              </details>

              {/* ✅ NUEVA SECCIÓN: BOTONES DE FACTURA PDF */}
              <div className="invoice-actions">
                <h4 style={{ fontSize: '13px', marginBottom: '8px', color: '#6b7280' }}>
                  📄 Factura / Orden de Empaque
                </h4>
                <div className="invoice-buttons">
                  <button
                    className="btn-invoice btn-preview"
                    onClick={() => handlePreviewInvoice(order.id)}
                    title="Ver factura en nueva pestaña"
                  >
                    <span className="material-icons-round">visibility</span> Preview
                  </button>

                  <button
                    className="btn-invoice btn-download"
                    onClick={() => handleDownloadInvoice(order.id)}
                    disabled={downloadingPdf === order.id}
                    title="Descargar archivo PDF"
                  >
                    {downloadingPdf === order.id ? <span className="material-icons-round spin">sync</span> : <span className="material-icons-round">download</span>} Download
                  </button>
                </div>
              </div>

              {/* ✅ BOTONES DE GESTIÓN DE ORDEN */}
              <div className="order-actions">
                {order.estado === 'PENDIENTE' && (
                  <button
                    className="btn-confirm"
                    onClick={() => changeStatus(order.id, 'CONFIRMADO')}
                  >
                    <span className="material-icons-round">check</span> Confirm
                  </button>
                )}

                {order.estado === 'CONFIRMADO' && (
                  <>
                    <button
                      className="btn-edit"
                      onClick={() => setSelectedOrder(order)}
                    >
                      <span className="material-icons-round">edit</span> Edit
                    </button>
                    <button
                      className="btn-complete"
                      onClick={() => changeStatus(order.id, 'COMPLETADO')}
                    >
                      <span className="material-icons-round">done_all</span> Complete
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedOrder && (
        <EditOrderWindow
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onSuccess={() => {
            setSelectedOrder(null);
            fetchOrders();
          }}
        />
      )}
    </div>
  );
}


// ============================================
// MODAL DE EDICIÓN DE ORDEN MEJORADO
// ============================================
function EditOrderWindow({ order, onClose, onSuccess }) {
  const [clients, setClients] = useState([]);
  const [products, setProducts] = useState([]);
  const [formData, setFormData] = useState({
    clientId: null,
    items: [],
    notas: order.notas || ''
  });
  const [loading, setLoading] = useState(true);
  const [hasChanges, setHasChanges] = useState(false);
  const toast = useToast();

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchData = async () => {
    try {
      const [clientsRes, productsRes] = await Promise.all([
        client.get('/admin/clients'),
        client.get('/admin/products')
      ]);

      setClients(clientsRes.data);
      setProducts(productsRes.data);

      // ✅ DEBUG: Ver estructura de la orden
      console.log('🔍 Orden completa:', order);
      console.log('🔍 Items de la orden:', order.items);

      // ✅ MAPEO CORRECTO: Verificar qué campo tiene el ID del producto
      const mappedItems = order.items.map((item, index) => {
        console.log('🔍 Item original:', item);

        return {
          id: `item-${Date.now()}-${index}`,
          productId: item.productId || item.product?.id || item.id,  // ← MÚLTIPLES OPCIONES
          productName: item.productName || item.product?.nombre || 'Producto desconocido',
          cantidad: item.cantidad,
          precioUnitario: parseFloat(item.precioUnitario || item.precio || 0)
        };
      });

      console.log('✅ Items mapeados:', mappedItems);

      // Encontrar cliente actual
      let currentClientId = null;
      if (order.cliente && order.cliente !== 'Sin cliente') {
        const foundClient = clientsRes.data.find(c =>
          c.nombre.toLowerCase() === order.cliente.toLowerCase()
        );
        if (foundClient) {
          currentClientId = foundClient.id;
        }
      }

      setFormData({
        clientId: currentClientId,
        items: mappedItems,
        notas: order.notas || ''
      });

    } catch (error) {
      console.error('Error al cargar datos:', error);
      toast.error('Error al cargar datos: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };


  const handleSubmit = async (e) => {
    e.preventDefault();

    // ✅ VALIDAR QUE HAYA PRODUCTOS
    if (formData.items.length === 0) {
      toast.warning('Debe haber al menos un producto en la orden');
      return;
    }

    // ✅ VALIDAR QUE HAYA CAMBIOS
    if (!hasChanges) {
      toast.info('No se han realizado cambios en la orden');
      return;
    }

    const validItems = formData.items.filter(item => item.productId && item.cantidad > 0);

    if (validItems.length === 0) {
      toast.warning('No hay productos válidos en la orden');
      return;
    }




    try {
      const payload = {
        clientId: formData.clientId || null,
        items: validItems.map(item => ({
          productId: item.productId,
          cantidad: item.cantidad
        })),
        notas: formData.notas || null
      };

      console.log('📦 Payload a enviar:', payload);
      console.log('📊 Items en formData:', formData.items);
      console.log('✅ Items válidos:', validItems);

      await client.put(`/admin/orders/${order.id}`, payload);
      toast.success('Orden actualizada correctamente');
      onSuccess();
    } catch (error) {
      console.error('Error al actualizar orden:', error);
      toast.error('Error al actualizar orden: ' + (error.response?.data?.message || error.message));
    }
  };

  const addItem = (product) => {
    setHasChanges(true);

    // ✅ BUSCAR POR productId (no por id interno)
    const existing = formData.items.find(i => i.productId === product.id);

    if (existing) {
      // ✅ Producto ya existe en la orden - INCREMENTAR cantidad
      const currentQty = existing.cantidad;

      // Validar stock disponible
      if (currentQty >= product.stock) {
        toast.warning(`Stock insuficiente. Solo hay ${product.stock} unidades disponibles de ${product.nombre}`);
        return;
      }

      // Incrementar cantidad del item existente
      setFormData(prev => ({
        ...prev,
        items: prev.items.map(i =>
          i.productId === product.id
            ? { ...i, cantidad: i.cantidad + 1 }
            : i
        )
      }));

      console.log(`✅ Incrementado ${product.nombre} a ${currentQty + 1} unidades`);
    } else {
      // ✅ Producto NO existe - AGREGAR nuevo
      const newItem = {
        id: `item-${Date.now()}-${Math.random()}`,
        productId: product.id,
        productName: product.nombre,
        cantidad: 1,
        precioUnitario: parseFloat(product.precio)
      };

      setFormData(prev => ({
        ...prev,
        items: [...prev.items, newItem]
      }));

      console.log(`✅ Agregado nuevo producto: ${product.nombre}`);
    }
  };


  const removeItem = (itemId) => {
    setHasChanges(true);
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter(i => i.id !== itemId)
    }));
  };

  const updateQuantity = (itemId, nuevaCantidad) => {
    setHasChanges(true);
    const cantidad = parseInt(nuevaCantidad);

    if (cantidad <= 0 || isNaN(cantidad)) {
      removeItem(itemId);
      return;
    }

    setFormData(prev => ({
      ...prev,
      items: prev.items.map(i =>
        i.id === itemId ? { ...i, cantidad: cantidad } : i
      )
    }));
  };

  const calculateTotal = () => {
    return formData.items.reduce((sum, item) =>
      sum + (item.precioUnitario * item.cantidad), 0
    ).toFixed(2);
  };

  if (loading) {
    return (
      <div className="modal-overlay">
        <div className="modal-content-large">
          <div className="loading">Cargando datos...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3><span className="material-icons-round">edit_note</span> Edit Order #{order.id.substring(0, 8)}</h3>
          <button className="btn-close" onClick={onClose}><span className="material-icons-round">close</span></button>
        </div>

        <form onSubmit={handleSubmit} className="edit-order-form">
          <div className="form-section">
            <h4>👤 Cliente</h4>
            <select
              value={formData.clientId || ''}
              onChange={(e) => {
                setHasChanges(true);
                setFormData(prev => ({ ...prev, clientId: e.target.value || null }));
              }}
              className="form-select"
            >
              <option value="">Sin cliente</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>
                  {c.nombre} - {c.telefono}
                </option>
              ))}
            </select>
          </div>

          <div className="form-section">
            <h4>🛒 Productos en la orden</h4>
            {formData.items.length === 0 ? (
              <div className="alert-warning">
                <span className="material-icons-round">warning</span> No items in order. Add at least one.
              </div>
            ) : (
              <div className="order-items-list">
                {formData.items.map((item) => (
                  <div key={item.id} className="edit-item">
                    <span className="item-name">{item.productName}</span>
                    <div className="item-controls">
                      <button
                        type="button"
                        className="btn-qty"
                        onClick={() => updateQuantity(item.id, item.cantidad - 1)}
                      >
                        −
                      </button>
                      <input
                        type="number"
                        value={item.cantidad}
                        onChange={(e) => updateQuantity(item.id, e.target.value)}
                        min="1"
                        className="qty-input"
                      />
                      <button
                        type="button"
                        className="btn-qty"
                        onClick={() => updateQuantity(item.id, item.cantidad + 1)}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        className="btn-remove-item"
                        onClick={() => removeItem(item.id)}
                        title="Eliminar producto"
                      >
                        <span className="material-icons-round">delete_outline</span>
                      </button>
                    </div>
                    <span className="item-price">
                      ${(item.precioUnitario * item.cantidad).toFixed(2)}
                    </span>
                  </div>
                ))}
                <div className="order-total-row">
                  <strong>TOTAL:</strong>
                  <strong className="total-amount">${calculateTotal()}</strong>
                </div>
              </div>
            )}
          </div>

          {/* ✅ SECCIÓN MEJORADA: Solo productos con stock */}
          <div className="form-section">
            <h4>➕ Agregar más productos</h4>
            <div className="products-quick-add">
              {products
                .filter(p => p.active && p.stock > 0) // ✅ SOLO PRODUCTOS CON STOCK
                .map(product => (
                  <button
                    key={product.id}
                    type="button"
                    className="btn-quick-add"
                    onClick={() => addItem(product)}
                    title={`Stock disponible: ${product.stock}`}
                  >
                    + {product.nombre} (${parseFloat(product.precio).toFixed(2)})
                    <span className="stock-badge"><span className="material-icons-round" style={{ fontSize: '12px' }}>inventory</span> {product.stock}</span>
                  </button>
                ))}
            </div>
            {products.filter(p => p.active && p.stock > 0).length === 0 && (
              <p className="no-products-available">
                <span className="material-icons-round">block</span> No products available in stock
              </p>
            )}
          </div>

          <div className="form-section">
            <h4>📝 Notas</h4>
            <textarea
              value={formData.notas}
              onChange={(e) => {
                setHasChanges(true);
                setFormData(prev => ({ ...prev, notas: e.target.value }));
              }}
              rows="3"
              placeholder="Notas adicionales sobre la orden..."
              className="form-textarea"
            />
          </div>

          <div className="form-actions">
            <button type="button" onClick={onClose} className="btn-cancel">
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-save"
              disabled={formData.items.length === 0 || !hasChanges}
            >
              <span className="material-icons-round">save</span> Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


// ============================================
// PANEL DE PRODUCTOS MEJORADO
// ============================================
function ProductsPanel() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const response = await client.get('/admin/products');
      setProducts(response.data);
    } catch (error) {
      console.error('Error al cargar productos:', error);
      toast.error('Error al cargar productos');
    } finally {
      setLoading(false);
    }
  };

  const toggleStatus = async (productId, currentStatus) => {
    try {
      await client.patch(`/admin/products/${productId}/estado?activo=${!currentStatus}`);
      await fetchProducts();
    } catch (error) {
      console.error('Error al cambiar estado:', error);
      toast.error('Error al cambiar el estado del producto');
    }
  };

  const handleDelete = async (product) => {
    const confirmed = await confirm({
      title: '¿Eliminar producto?',
      message: `¿Estás seguro de eliminar "${product.nombre}"? Esta acción no se puede deshacer.`
    });

    if (!confirmed) return;

    try {
      await client.delete(`/admin/products/${product.id}`);
      toast.success('Producto eliminado');
      fetchProducts();
    } catch (error) {
      console.error('Error al eliminar producto:', error);
      toast.error('Error al eliminar producto');
    }
  };

  const filteredProducts = products.filter(p =>
    p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.descripcion?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return <div className="loading">Cargando productos...</div>;
  }

  return (
    <div className="products-panel">
      <div className="panel-header">
        <h2><span className="material-icons-round" style={{ fontSize: '32px', color: 'var(--primary)', verticalAlign: 'middle' }}>inventory</span> Product Management</h2>
        <div className="header-actions">
          <input
            type="text"
            placeholder="🔍 Buscar productos..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
          <button className="btn-add" onClick={() => setShowForm(true)}>
            + Nuevo Producto
          </button>
        </div>
      </div>

      <div className="products-stats">
        <span>Total: {products.length}</span>
        <span>Activos: {products.filter(p => p.active).length}</span>
        <span>Inactivos: {products.filter(p => !p.active).length}</span>
      </div>

      {filteredProducts.length === 0 ? (
        <div className="empty-state">
          <p><span className="material-icons-round" style={{ fontSize: '48px', color: 'var(--text-muted)' }}>search_off</span><br />No products found</p>
        </div>
      ) : (
        <div className="products-grid">
          {filteredProducts.map(product => (
            <div key={product.id} className={`product-card ${!product.active ? 'inactive' : ''}`}>
              <div className="product-image">
                <img
                  src={`http://localhost:8080/api/images/products/${product.imageUrl}`}
                  alt={product.nombre}
                  onError={(e) => {
                    e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23f0f0f0" width="200" height="200"/%3E%3Ctext fill="%23999" font-family="sans-serif" font-size="14" dy="10.5" font-weight="bold" x="50%25" y="50%25" text-anchor="middle"%3ESin Imagen%3C/text%3E%3C/svg%3E';
                  }}
                />
              </div>

              <div className="product-info">
                <h3>{product.nombre}</h3>
                <p className="product-description">{product.descripcion || 'Sin descripción'}</p>
                <div className="product-details">
                  <span className="product-price">${parseFloat(product.precio).toFixed(2)}</span>
                  <span className={`product-stock ${product.stock < 10 ? 'low-stock' : ''}`}>
                    📦 Stock: {product.stock}
                  </span>
                </div>
                <span className={`product-status ${product.active ? 'active' : 'inactive'}`}>
                  {product.active ? <><span className="material-icons-round" style={{ fontSize: '14px' }}>check_circle</span> Active</> : <><span className="material-icons-round" style={{ fontSize: '14px' }}>cancel</span> Inactive</>}
                </span>
              </div>

              <div className="product-actions">
                <button onClick={() => setEditingProduct(product)} className="btn-action">
                  <span className="material-icons-round">edit</span>
                </button>
                <button onClick={() => toggleStatus(product.id, product.active)} className="btn-action">
                  {product.active ? <span className="material-icons-round">lock</span> : <span className="material-icons-round">lock_open</span>}
                </button>
                <button className="btn-action btn-delete" onClick={() => handleDelete(product)}>
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(showForm || editingProduct) && (
        <ProductModal
          product={editingProduct}
          onClose={() => {
            setShowForm(false);
            setEditingProduct(null);
          }}
          onSuccess={() => {
            fetchProducts();
            setShowForm(false);
            setEditingProduct(null);
          }}
        />
      )}
    </div>
  );
}

// ============================================
// FORMULARIO DE PRODUCTO MEJORADO
// ============================================
function ProductModal({ product, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    nombre: product?.nombre || '',
    descripcion: product?.descripcion || '',
    precio: product?.precio || '',
    stock: product?.stock || '',
    reorderPoint: product?.reorderPoint || 10,
    active: product?.active !== undefined ? product.active : true
  });
  const [imageFile, setImageFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);
  const toast = useToast();

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setUploading(true);

    try {
      const formDataToSend = new FormData();
      formDataToSend.append('nombre', formData.nombre);
      formDataToSend.append('descripcion', formData.descripcion || '');
      formDataToSend.append('precio', formData.precio);
      formDataToSend.append('stock', formData.stock);
      formDataToSend.append('reorderPoint', formData.reorderPoint);

      if (imageFile) {
        formDataToSend.append('image', imageFile);
      }

      if (product) {
        formDataToSend.append('active', formData.active);
        await client.put(`/admin/products/${product.id}`, formDataToSend, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        toast.success('Producto actualizado exitosamente');
      } else {
        await client.post('/admin/products', formDataToSend, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        toast.success('Producto creado exitosamente');
      }

      onSuccess();
    } catch (error) {
      console.error('Error completo:', error);
      const errorMsg = error.response?.data?.message || error.response?.data || error.message || 'Error desconocido';
      toast.error('Error al guardar el producto: ' + errorMsg);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content form-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{product ? '✏️ Editar Producto' : '➕ Nuevo Producto'}</h3>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="product-form">
          <div className="form-group">
            <label>Nombre *</label>
            <input
              type="text"
              value={formData.nombre}
              onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
              required
              placeholder="Nombre del producto"
            />
          </div>

          <div className="form-group">
            <label>Descripción</label>
            <textarea
              value={formData.descripcion}
              onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
              rows="3"
              placeholder="Descripción del producto"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Precio *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.precio}
                onChange={(e) => setFormData({ ...formData, precio: e.target.value })}
                required
                placeholder="0.00"
              />
            </div>

            <div className="form-group">
              <label>Stock *</label>
              <input
                type="number"
                min="0"
                value={formData.stock}
                onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                required
                placeholder="0"
              />
            </div>

            <div className="form-group">
              <label>Punto de Reorden</label>
              <input
                type="number"
                min="0"
                value={formData.reorderPoint}
                onChange={(e) => setFormData({ ...formData, reorderPoint: e.target.value })}
                placeholder="10"
              />
            </div>
          </div>

          <div className="form-group">
            <label>Imagen del producto</label>
            <input
              type="file"
              accept="image/*"
              onChange={handleImageChange}
            />

            {preview && (
              <div className="image-preview">
                <img src={preview} alt="Preview" />
              </div>
            )}

            {product?.imageUrl && !preview && (
              <div className="current-image">
                <p>Imagen actual:</p>
                <img
                  src={`http://localhost:8080/api/images/products/${product.imageUrl}`}
                  alt="Current"
                  onError={(e) => e.target.style.display = 'none'}
                />
              </div>
            )}
          </div>

          {product && (
            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.active}
                  onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                />
                Producto activo
              </label>
            </div>
          )}

          <div className="form-actions">
            <button type="button" onClick={onClose} className="btn-cancel">
              Cancelar
            </button>
            <button type="submit" disabled={uploading} className="btn-save">
              {uploading ? '⏳ Guardando...' : (product ? '💾 Actualizar' : '➕ Crear')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AdminDashboard;
