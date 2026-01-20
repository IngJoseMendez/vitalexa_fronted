import { useState, useEffect, useCallback } from 'react';
import client from '../api/client';
import { tagService } from '../api/tagService'; // Import Tag service
import { useToast } from '../components/ToastContainer';
import { useConfirm } from '../components/ConfirmDialog';
import NotificationService from '../services/NotificationService'; // Import Service
import TagsPanel from '../components/TagsPanel'; // Import TagsPanel
import { TagBadge, TagSelect, TagFilterBar } from '../components/TagComponents'; // Import Tag UI components
import '../styles/AdminDashboard.css';

function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('orders');
  const [refreshTrigger, setRefreshTrigger] = useState(0); // State for refresh

  useEffect(() => {
    // Connect with role 'admin'
    NotificationService.connect((notification) => {
      if (notification.type === 'INVENTORY_UPDATE') {
        console.log("📦 Inventory update received, refreshing data...");
        setRefreshTrigger(Date.now());
      }
    }, 'admin');

    return () => {
      NotificationService.disconnect();
    };
  }, []);

  return (
    <div className="admin-dashboard">
      <nav className="dashboard-nav">
        <button
          className={activeTab === 'orders' ? 'active' : ''}
          onClick={() => setActiveTab('orders')}
        >
          <span className="material-icons-round">assignment</span> Órdenes
        </button>
        <button
          className={activeTab === 'products' ? 'active' : ''}
          onClick={() => setActiveTab('products')}
        >
          <span className="material-icons-round">inventory_2</span> Productos
        </button>
        <button
          className={activeTab === 'tags' ? 'active' : ''}
          onClick={() => setActiveTab('tags')}
        >
          <span className="material-icons-round">local_offer</span> Etiquetas
        </button>
        <button
          className="nav-external"
          onClick={() => window.location.href = '/balances'}
        >
          <span className="material-icons-round">account_balance_wallet</span> Saldos
        </button>
      </nav>

      <div className="dashboard-content">
        {activeTab === 'orders' && <OrdersPanel refreshTrigger={refreshTrigger} />}
        {activeTab === 'products' && <ProductsPanel refreshTrigger={refreshTrigger} />}
        {activeTab === 'tags' && <TagsPanel />}
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
  const [sortBy, setSortBy] = useState('fecha');
  const [sortOrder, setSortOrder] = useState('desc');
  const [downloadingPdf, setDownloadingPdf] = useState(null);
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const toast = useToast();

  const fetchOrders = useCallback(async () => {
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
  }, [toast]);

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
  }, [fetchOrders]);

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

  const filteredOrders = orders
    .filter(order => {
      // Invoice search filter (if provided)
      if (invoiceSearch.trim()) {
        const searchStr = invoiceSearch.toLowerCase().trim();
        const invoiceNum = String(order.invoiceNumber || '').toLowerCase();
        const orderId = String(order.id || '').toLowerCase();
        if (!invoiceNum.includes(searchStr) && !orderId.includes(searchStr)) {
          return false;
        }
      }
      // Status filter
      if (filter === 'pending') return order.estado === 'PENDIENTE' || order.estado === 'CONFIRMADO';
      if (filter === 'completed') return order.estado === 'COMPLETADO';
      if (filter === 'all') return true;
      return order.estado === filter;
    })
    .sort((a, b) => {
      let valA, valB;
      if (sortBy === 'fecha') {
        valA = new Date(a.fecha);
        valB = new Date(b.fecha);
      } else if (sortBy === 'total') {
        valA = parseFloat(a.total);
        valB = parseFloat(b.total);
      } else if (sortBy === 'cantidad') {
        valA = a.items.reduce((sum, i) => sum + i.cantidad, 0);
        valB = b.items.reduce((sum, i) => sum + i.cantidad, 0);
      }

      return sortOrder === 'desc' ? valB - valA : valA - valB;
    });

  if (loading) {
    return <div className="loading">Cargando órdenes...</div>;
  }

  return (
    <div className="orders-panel">
      <div className="panel-header">
        <h2><span className="material-icons-round" style={{ fontSize: '32px', color: 'var(--primary)', verticalAlign: 'middle' }}>assignment_turned_in</span> Gestión de Órdenes</h2>
        <div className="filter-buttons">
          <button
            className={filter === 'pending' ? 'active' : ''}
            onClick={() => setFilter('pending')}
          >
            <span className="material-icons-round">pending_actions</span> Pendientes ({orders.filter(o => o.estado === 'PENDIENTE' || o.estado === 'CONFIRMADO').length})
          </button>
          <button
            className={filter === 'completed' ? 'active' : ''}
            onClick={() => setFilter('completed')}
          >
            <span className="material-icons-round">check_circle</span> Completadas ({orders.filter(o => o.estado === 'COMPLETADO').length})
          </button>
          <button
            className={filter === 'all' ? 'active' : ''}
            onClick={() => setFilter('all')}
          >
            <span className="material-icons-round">analytics</span> Todas ({orders.length})
          </button>

          {/* Invoice Search Input */}
          <div className="invoice-search-box" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className="material-icons-round" style={{ color: 'var(--text-secondary)' }}>search</span>
            <input
              type="text"
              placeholder="Buscar por factura..."
              value={invoiceSearch}
              onChange={(e) => setInvoiceSearch(e.target.value)}
              style={{
                padding: '0.5rem 1rem',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                fontSize: '0.9rem',
                width: '180px'
              }}
            />
            {invoiceSearch && (
              <button
                onClick={() => setInvoiceSearch('')}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                  padding: '4px'
                }}
              >
                <span className="material-icons-round" style={{ fontSize: '18px' }}>close</span>
              </button>
            )}
          </div>
        </div>

        <div className="sorting-controls">
          <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--text-secondary)' }}>sort</span>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="sort-select">
            <option value="fecha">Fecha</option>
            <option value="total">Precio Total</option>
            <option value="cantidad">Cantidad Productos</option>
          </select>
          <button
            className="btn-sort-order"
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            title={sortOrder === 'asc' ? 'Orden Ascendente' : 'Orden Descendente'}
          >
            <span className="material-icons-round">
              {sortOrder === 'asc' ? 'expand_less' : 'expand_more'}
            </span>
          </button>
        </div>
      </div>

      {filteredOrders.length === 0 ? (
        <div className="empty-state">
          <p><span className="material-icons-round" style={{ fontSize: '48px', color: 'var(--text-muted)' }}>inbox</span><br />No se encontraron órdenes en esta categoría</p>
        </div>
      ) : (
        <div className="orders-grid">
          {filteredOrders.map(order => {
            // Determine payment status class
            const paymentStatusClass = order.paymentStatus
              ? `payment-${order.paymentStatus.toLowerCase()}`
              : '';

            return (
              <div key={order.id} className={`order-card ${order.isSROrder ? 'is-sr' : 'is-normal'} ${paymentStatusClass}`}>
                <div className="order-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span className="order-id">
                      {order.invoiceNumber ? `Factura #${order.invoiceNumber}` : `#${order.id.substring(0, 8)}`}
                    </span>
                    {order.isSROrder && (
                      <span className="tag-badge tag-sr" style={{ padding: '0.2rem 0.6rem', fontSize: '0.7rem' }}>S/N</span>
                    )}
                    {/* Payment Status Badge */}
                    {order.paymentStatus && (
                      <span className={`payment-status-badge ${order.paymentStatus.toLowerCase()}`}>
                        <span className="material-icons-round" style={{ fontSize: '12px' }}>
                          {order.paymentStatus === 'PAID' ? 'check_circle' : order.paymentStatus === 'PARTIAL' ? 'pending' : 'schedule'}
                        </span>
                        {order.paymentStatus === 'PAID' ? 'Pagado' : order.paymentStatus === 'PARTIAL' ? 'Parcial' : 'Pendiente'}
                      </span>
                    )}
                  </div>
                  <span className={`order-status status-${order.estado ? order.estado.toLowerCase() : 'pendiente'}`}>
                    {order.estado || 'PENDIENTE'}
                  </span>
                </div>

                <div className="order-info">
                  <p><strong>Vendedor:</strong> {order.vendedor}</p>
                  <p><strong>Cliente:</strong> {order.cliente}</p>
                  <p><strong>Fecha:</strong> {new Date(order.fecha).toLocaleString('es-ES')}</p>
                  <p className="order-total"><strong>Total:</strong> ${parseFloat(order.total).toFixed(2)}</p>
                  {order.discountedTotal && order.discountedTotal !== order.total && (
                    <p className="order-discounted-total">
                      <span className="material-icons-round" style={{ fontSize: '14px', color: '#10b981' }}>discount</span>
                      <strong>Con descuento:</strong>
                      <span className="discounted-value">${parseFloat(order.discountedTotal).toFixed(2)}</span>
                    </p>
                  )}

                  {order.notas && (
                    <div className="order-notes">
                      <strong><span className="material-icons-round" style={{ fontSize: '16px', verticalAlign: 'middle' }}>note</span> Notas:</strong>
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
                      <span className="material-icons-round">visibility</span> Vista Previa
                    </button>

                    <button
                      className="btn-invoice btn-download"
                      onClick={() => handleDownloadInvoice(order.id)}
                      disabled={downloadingPdf === order.id}
                      title="Descargar archivo PDF"
                    >
                      {downloadingPdf === order.id ? <span className="material-icons-round spin">sync</span> : <span className="material-icons-round">download</span>} Descargar
                    </button>
                  </div>
                </div>

                {/* ✅ SECCIÓN DE DESCUENTOS - ADMIN */}
                <AdminDiscountSection
                  orderId={order.id}
                  onSuccess={fetchOrders}
                />

                {/* ✅ BOTONES DE GESTIÓN DE ORDEN */}
                <div className="order-actions">
                  {order.estado === 'PENDIENTE' && (
                    <button
                      className="btn-confirm"
                      onClick={() => changeStatus(order.id, 'CONFIRMADO')}
                    >
                      <span className="material-icons-round">check</span> Confirmar
                    </button>
                  )}

                  {order.estado === 'CONFIRMADO' && (
                    <>
                      <button
                        className="btn-edit"
                        onClick={() => setSelectedOrder(order)}
                      >
                        <span className="material-icons-round">edit</span> Editar
                      </button>
                      <button
                        className="btn-complete"
                        onClick={() => changeStatus(order.id, 'COMPLETADO')}
                      >
                        <span className="material-icons-round">done_all</span> Completar
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
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
          <h3><span className="material-icons-round">edit_note</span> Editar Orden #{order.id.substring(0, 8)}</h3>
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
                <span className="material-icons-round">warning</span> La orden debe tener al menos un producto.
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
                <span className="material-icons-round">block</span> No hay productos disponibles en stock
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
              <span className="material-icons-round">save</span> Guardar Cambios
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
// ============================================
// PANEL DE PRODUCTOS MEJORADO
// ============================================
function ProductsPanel({ refreshTrigger }) {
  const [products, setProducts] = useState([]);
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTagId, setActiveTagId] = useState(null);
  const [gridColumns, setGridColumns] = useState(() => {
    const saved = localStorage.getItem('adminGridColumns');
    return saved ? parseInt(saved) : 2;
  });
  const toast = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    localStorage.setItem('adminGridColumns', gridColumns.toString());
  }, [gridColumns]);

  const fetchTags = useCallback(async () => {
    try {
      const res = await tagService.getAll();
      setTags(res.data);
    } catch (error) {
      console.error('Error al cargar etiquetas');
    }
  }, []);

  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true);
      let url = '/admin/products';
      if (activeTagId) {
        url = `/admin/products/tag/${activeTagId}`;
      }
      const response = await client.get(url);
      setProducts(response.data.content || response.data || []);
    } catch (error) {
      console.error('Error al cargar productos:', error);
      toast.error('Error al cargar productos');
    } finally {
      setLoading(false);
    }
  }, [activeTagId, toast]);

  useEffect(() => {
    fetchProducts();
    fetchTags();
  }, [refreshTrigger, activeTagId, fetchProducts, fetchTags]);

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
        <h2><span className="material-icons-round" style={{ fontSize: '32px', color: 'var(--primary)', verticalAlign: 'middle' }}>inventory</span> Gestión de Productos</h2>
        <div className="header-actions">
          <input
            type="text"
            placeholder="🔍 Buscar productos..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
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
          <button className="btn-add" onClick={() => setShowForm(true)}>
            + Nuevo Producto
          </button>
        </div>
      </div>

      <TagFilterBar
        tags={tags}
        activeTagId={activeTagId}
        onSelectTag={setActiveTagId}
        onClear={() => setActiveTagId(null)}
      />

      <div className="products-stats">
        <span>Total: {products.length}</span>
        <span>Activos: {products.filter(p => p.active).length}</span>
        <span>Inactivos: {products.filter(p => !p.active).length}</span>
      </div>

      {filteredProducts.length === 0 ? (
        <div className="empty-state">
          <p><span className="material-icons-round" style={{ fontSize: '48px', color: 'var(--text-muted)' }}>search_off</span><br />No se encontraron productos</p>
        </div>
      ) : (
        <div className="products-grid" style={{
          gridTemplateColumns: `repeat(${gridColumns}, 1fr)`
        }}>
          {filteredProducts.map(product => (
            <div key={product.id} className="product-card">
              <div className={`product-status-blob ${product.active ? 'active' : 'inactive'}`} />

              <div className="product-image">
                <img
                  src={product.imageUrl || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23f0f0f0" width="200" height="200"/%3E%3Ctext fill="%23999" font-family="sans-serif" font-size="14" dy="10.5" font-weight="bold" x="50%25" y="50%25" text-anchor="middle"%3ESin Imagen%3C/text%3E%3C/svg%3E'}
                  alt={product.nombre}
                  onError={(e) => {
                    e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23f0f0f0" width="200" height="200"/%3E%3Ctext fill="%23999" font-family="sans-serif" font-size="14" dy="10.5" font-weight="bold" x="50%25" y="50%25" text-anchor="middle"%3ESin Imagen%3C/text%3E%3C/svg%3E';
                  }}
                />
              </div>

              <div className="product-info">
                <h3>{product.nombre}</h3>

                {product.tagName && (
                  <div style={{ marginBottom: '0.5rem' }}>
                    <TagBadge tagName={product.tagName} />
                  </div>
                )}

                <div className="product-meta">
                  <span className="product-price">${parseFloat(product.precio).toFixed(2)}</span>
                  <span className={`product-stock-badge ${product.stock < 10 ? 'low' : ''}`}>
                    <span className="material-icons-round" style={{ fontSize: '14px' }}>inventory_2</span> {product.stock}
                  </span>
                </div>
              </div>

              <div className="product-actions-overlay">
                <button onClick={() => setEditingProduct(product)} className="btn-icon-action edit" title="Editar">
                  <span className="material-icons-round">edit</span>
                </button>
                <button onClick={() => toggleStatus(product.id, product.active)} className="btn-icon-action toggle" title={product.active ? "Desactivar" : "Activar"}>
                  <span className="material-icons-round">{product.active ? 'lock' : 'lock_open'}</span>
                </button>
                <button onClick={() => handleDelete(product)} className="btn-icon-action delete" title="Eliminar">
                  <span className="material-icons-round">delete_outline</span>
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
    active: product?.active !== undefined ? product.active : true,
    tagId: product?.tagId || null
  });
  const [tags, setTags] = useState([]);
  const [imageFile, setImageFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);
  const toast = useToast();

  useEffect(() => {
    fetchTags();
  }, []);

  const fetchTags = async () => {
    try {
      const res = await tagService.getAll();
      setTags(res.data);
    } catch (error) {
      console.error('Error al cargar etiquetas');
    }
  };

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
        const url = `/admin/products/${product.id}${formData.tagId ? `?tagId=${formData.tagId}` : ''}`;
        await client.put(url, formDataToSend, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        toast.success('Producto actualizado exitosamente');
      } else {
        const url = `/admin/products${formData.tagId ? `?tagId=${formData.tagId}` : ''}`;
        await client.post(url, formDataToSend, {
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

          <TagSelect
            tags={tags}
            value={formData.tagId}
            onChange={(val) => setFormData({ ...formData, tagId: val })}
            disabled={uploading}
          />

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
                  src={product.imageUrl || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23f0f0f0" width="200" height="200"/%3E%3Ctext fill="%23999" font-family="sans-serif" font-size="14" dy="10.5" font-weight="bold" x="50%25" y="50%25" text-anchor="middle"%3ESin Imagen%3C/text%3E%3C/svg%3E'}
                  alt={product.nombre}
                  onError={(e) => {
                    e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23f0f0f0" width="200" height="200"/%3E%3Ctext fill="%23999" font-family="sans-serif" font-size="14" dy="10.5" font-weight="bold" x="50%25" y="50%25" text-anchor="middle"%3ESin Imagen%3C/text%3E%3C/svg%3E';
                  }}
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

// ============================================
// ADMIN DISCOUNT SECTION COMPONENT
// ============================================
function AdminDiscountSection({ orderId, onSuccess }) {
  const [discounts, setDiscounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(null);
  const [showCustom, setShowCustom] = useState(false);
  const [customPercentage, setCustomPercentage] = useState('');
  const toast = useToast();

  // Fetch discounts for this order
  const fetchDiscounts = useCallback(async () => {
    try {
      setLoading(true);
      const discountService = (await import('../api/discountService')).default;
      const response = await discountService.getOrderDiscounts(orderId);
      setDiscounts(response.data || []);
    } catch (error) {
      if (error.response?.status !== 404) {
        console.error('Error fetching discounts:', error);
      }
      setDiscounts([]);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchDiscounts();
  }, [fetchDiscounts]);

  // Apply preset discount
  const applyPresetDiscount = async (percentage) => {
    try {
      setApplying(percentage);
      const discountService = (await import('../api/discountService')).default;

      if (percentage === 10) {
        await discountService.applyDiscount10(orderId);
      } else if (percentage === 12) {
        await discountService.applyDiscount12(orderId);
      } else if (percentage === 15) {
        await discountService.applyDiscount15(orderId);
      }

      toast.success(`Descuento del ${percentage}% aplicado`);
      fetchDiscounts();
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error('Error applying discount:', error);
      toast.error('Error al aplicar descuento: ' + (error.response?.data?.message || error.message));
    } finally {
      setApplying(null);
    }
  };

  // Apply custom discount
  const applyCustomDiscount = async () => {
    if (!customPercentage || parseFloat(customPercentage) <= 0 || parseFloat(customPercentage) > 100) {
      toast.warning('Ingrese un porcentaje válido (1-100)');
      return;
    }

    try {
      setApplying('custom');
      const discountService = (await import('../api/discountService')).default;
      await discountService.applyCustomDiscount({
        orderId,
        percentage: parseFloat(customPercentage)
      });

      toast.success(`Descuento del ${customPercentage}% aplicado`);
      setCustomPercentage('');
      setShowCustom(false);
      fetchDiscounts();
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error('Error applying custom discount:', error);
      toast.error('Error al aplicar descuento: ' + (error.response?.data?.message || error.message));
    } finally {
      setApplying(null);
    }
  };

  // Check if there's an active discount
  const hasActiveDiscount = discounts.some(d => d.status === 'APPLIED');

  return (
    <div className="discount-section-admin">
      <h4 className="discount-section-title">
        <span className="material-icons-round">discount</span>
        Descuentos
      </h4>

      {/* Current Discounts */}
      {loading ? (
        <div className="discount-loading">Cargando...</div>
      ) : discounts.length > 0 ? (
        <div className="discount-badges">
          {discounts.map(d => (
            <span
              key={d.id}
              className={`discount-badge ${d.status?.toLowerCase()}`}
            >
              {d.percentage}% - {d.status === 'APPLIED' ? 'Activo' : 'Revocado'}
            </span>
          ))}
        </div>
      ) : null}

      {/* Discount Buttons */}
      {!hasActiveDiscount && (
        <div className="discount-buttons-row">
          <button
            className="btn-discount"
            onClick={() => applyPresetDiscount(10)}
            disabled={applying !== null}
          >
            {applying === 10 ? '...' : '10%'}
          </button>
          <button
            className="btn-discount"
            onClick={() => applyPresetDiscount(12)}
            disabled={applying !== null}
          >
            {applying === 12 ? '...' : '12%'}
          </button>
          <button
            className="btn-discount"
            onClick={() => applyPresetDiscount(15)}
            disabled={applying !== null}
          >
            {applying === 15 ? '...' : '15%'}
          </button>
          <button
            className="btn-discount custom"
            onClick={() => setShowCustom(!showCustom)}
            disabled={applying !== null}
          >
            <span className="material-icons-round">tune</span>
          </button>
        </div>
      )}

      {/* Custom Discount Input */}
      {showCustom && !hasActiveDiscount && (
        <div className="custom-discount-row">
          <input
            type="number"
            value={customPercentage}
            onChange={(e) => setCustomPercentage(e.target.value)}
            placeholder="Ej: 8"
            min="0.1"
            max="100"
            step="0.1"
          />
          <span className="suffix">%</span>
          <button
            className="btn-apply-custom"
            onClick={applyCustomDiscount}
            disabled={applying === 'custom'}
          >
            {applying === 'custom' ? '...' : 'Aplicar'}
          </button>
        </div>
      )}

      {hasActiveDiscount && (
        <div className="discount-active-note">
          <span className="material-icons-round">check_circle</span>
          Descuento ya aplicado
        </div>
      )}
    </div>
  );
}

export default AdminDashboard;
