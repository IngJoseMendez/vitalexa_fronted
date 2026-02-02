import { useState, useEffect, useCallback } from 'react';

import client from '../api/client';
import { useToast } from '../components/ToastContainer';
import NotificationService from '../services/NotificationService';
import TagsPanel from '../components/TagsPanel';
import PromotionsPanel from '../components/PromotionsPanel';
import AdminClientsPanel from '../components/AdminClientsPanel';
import ProductsPanel from '../components/ProductsPanel';
import AdminDiscountSection from '../components/AdminDiscountSection';
import { OrderDetailModal } from '../components/modals/OrderManagementModal';
import AssortmentSelectionModal from '../components/modals/AssortmentSelectionModal';
import { getStatusLabel, getStatusBadgeClass } from '../utils/types';
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
          className={activeTab === 'nueva-venta' ? 'active' : ''}
          onClick={() => setActiveTab('nueva-venta')}
        >
          <span className="material-icons-round">add_shopping_cart</span> Nueva Venta
        </button>
        <button
          className={activeTab === 'products' ? 'active' : ''}
          onClick={() => setActiveTab('products')}
        >
          <span className="material-icons-round">inventory_2</span> Productos
        </button>
        <button
          className={activeTab === 'clients' ? 'active' : ''}
          onClick={() => setActiveTab('clients')}
        >
          <span className="material-icons-round">people</span> Clientes
        </button>
        <button
          className={activeTab === 'tags' ? 'active' : ''}
          onClick={() => setActiveTab('tags')}
        >
          <span className="material-icons-round">local_offer</span> Etiquetas
        </button>
        <button
          className={activeTab === 'promotions' ? 'active' : ''}
          onClick={() => setActiveTab('promotions')}
        >
          <span className="material-icons-round">card_giftcard</span> Promociones
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
        {activeTab === 'nueva-venta' && <AdminNuevaVentaPanel />}
        {activeTab === 'products' && <ProductsPanel refreshTrigger={refreshTrigger} />}
        {activeTab === 'clients' && <AdminClientsPanel />}
        {activeTab === 'tags' && <TagsPanel />}
        {activeTab === 'promotions' && <PromotionsPanel />}
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
  const [viewingOrder, setViewingOrder] = useState(null);
  const [filter, setFilter] = useState('pending');
  const [sortBy, setSortBy] = useState('fecha');
  const [sortOrder, setSortOrder] = useState('desc');
  const [downloadingPdf, setDownloadingPdf] = useState(null);
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [vendedores, setVendedores] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [selectedVendedor, setSelectedVendedor] = useState('');
  const [selectedCliente, setSelectedCliente] = useState('');

  // ✅ NEW STATE FOR ASSORTMENT
  const [showAssortmentModal, setShowAssortmentModal] = useState(false);
  const [selectedPromotionForAssortment, setSelectedPromotionForAssortment] = useState(null);
  const [selectedOrderForAssortment, setSelectedOrderForAssortment] = useState(null);

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

  const fetchVendedores = useCallback(async () => {
    try {
      const response = await client.get('/admin/clients/vendedores');
      setVendedores(response.data || []);
    } catch (error) {
      console.error('Error al cargar vendedores:', error);
    }
  }, []);

  const fetchClientesPorVendedor = useCallback(async (vendedorUsername) => {
    try {
      // Find ID for the username to use the new endpoint
      const vendorObj = vendedores.find(v => v.username === vendedorUsername);
      const vendorId = vendorObj ? vendorObj.id : null;

      if (!vendorId) {
        console.warn('No se encontró ID para el vendedor:', vendedorUsername);
        setClientes([]);
        return;
      }

      // Use new endpoint logic
      const response = await client.get(`/admin/clients/seller/${vendorId}`);
      setClientes(response.data || []);
    } catch (error) {
      console.error('Error al cargar clientes:', error);
      setClientes([]);
    }
  }, [vendedores]);

  useEffect(() => {
    fetchOrders();
    fetchVendedores();

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
  }, [fetchOrders, fetchVendedores]);

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

  // ✅ HANDLER FOR OPENING ASSORTMENT MODAL
  const handleOpenAssortment = async (order, item) => {
    try {
      let promotionId = item.promotionId || (item.promotion && item.promotion.id);

      if (!promotionId) {
        console.error("No promotion ID found on item", item);
        toast.error("No se pudo identificar la promoción");
        return;
      }

      const response = await client.get(`/admin/promotions/${promotionId}`);
      setSelectedPromotionForAssortment(response.data);
      setSelectedOrderForAssortment(order);
      setShowAssortmentModal(true);
    } catch (error) {
      console.error('Error fetching promotion:', error);
      toast.error('Error al cargar detalles de la promoción');
    }
  };

  const filteredOrders = orders
    .filter(order => {
      // Vendor filter
      if (selectedVendedor && order.vendedor !== selectedVendedor) {
        return false;
      }

      // Client filter
      if (selectedCliente && order.cliente !== selectedCliente) {
        return false;
      }

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
      if (filter === 'pending') {
        return order.estado === 'PENDIENTE' ||
          order.estado === 'CONFIRMADO' ||
          order.estado === 'PENDING_PROMOTION_COMPLETION';
      }
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
        // Handle empty items arrays for promotion-only orders
        valA = a.items?.reduce((sum, i) => sum + i.cantidad, 0) || 0;
        valB = b.items?.reduce((sum, i) => sum + i.cantidad, 0) || 0;
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
            <span className="material-icons-round">pending_actions</span> Pendientes ({orders.filter(o => o.estado === 'PENDIENTE' || o.estado === 'CONFIRMADO' || o.estado === 'PENDING_PROMOTION_COMPLETION').length})
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
          <div className="invoice-search-box" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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

            {/* Vendor Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="material-icons-round" style={{ color: 'var(--primary)', fontSize: '18px' }}>badge</span>
              <select
                value={selectedVendedor}
                onChange={(e) => {
                  setSelectedVendedor(e.target.value);
                  setSelectedCliente('');
                  if (e.target.value) {
                    fetchClientesPorVendedor(e.target.value);
                  } else {
                    setClientes([]);
                  }
                }}
                style={{
                  padding: '0.5rem 0.75rem',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  fontSize: '0.9rem',
                  background: selectedVendedor ? '#f0fdf4' : 'white'
                }}
              >
                <option value="">Todos los vendedores</option>
                {vendedores.map(v => (
                  <option key={v.id} value={v.username}>{v.username}</option>
                ))}
              </select>
              {selectedVendedor && (
                <button
                  onClick={() => {
                    setSelectedVendedor('');
                    setClientes([]);
                    setSelectedCliente('');
                  }}
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

            {/* Client Filter */}
            {selectedVendedor && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="material-icons-round" style={{ color: 'var(--primary)', fontSize: '18px' }}>person</span>
                <select
                  value={selectedCliente}
                  onChange={(e) => setSelectedCliente(e.target.value)}
                  style={{
                    padding: '0.5rem 0.75rem',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    fontSize: '0.9rem',
                    background: selectedCliente ? '#f0fdf4' : 'white'
                  }}
                >
                  <option value="">Todos los clientes</option>
                  {clientes.map(c => (
                    <option key={c.id} value={c.nombre}>{c.nombre}</option>
                  ))}
                </select>
                {selectedCliente && (
                  <button
                    onClick={() => setSelectedCliente('')}
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

            // Check if order has promotions
            const hasPromotions = order.items?.some(item => item.isPromotionItem || item.isFreeItem) || false;

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
                    {/* Promotion Badge */}
                    {hasPromotions && (
                      <span className="promotion-badge" style={{
                        padding: '0.2rem 0.6rem',
                        fontSize: '0.7rem',
                        background: 'linear-gradient(135deg, #6366f1 0%, #818cf8 100%)',
                        color: 'white',
                        borderRadius: '99px',
                        fontWeight: '800',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem'
                      }}>
                        <span className="material-icons-round" style={{ fontSize: '12px' }}>card_giftcard</span>
                        PROMO
                      </span>
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
                  <span className={`order-status ${getStatusBadgeClass(order.estado)}`}>
                    {getStatusLabel(order.estado)}
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

                {order.items && order.items.length > 0 ? (
                  <details className="order-details">
                    <summary>Ver productos ({order.items.length})</summary>
                    <ul>
                      {order.items.map((item, idx) => (
                        <li key={idx}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span className="item-name">{item.productName}</span>
                              {item.isFreeItem && (
                                <span style={{
                                  fontSize: '0.65rem',
                                  padding: '0.15rem 0.4rem',
                                  background: '#10b981',
                                  color: 'white',
                                  borderRadius: '4px',
                                  fontWeight: 700
                                }}>BONIFICADO</span>
                              )}
                              {item.isPromotionItem && !item.isFreeItem && (
                                <span style={{
                                  fontSize: '0.65rem',
                                  padding: '0.15rem 0.4rem',
                                  background: '#3b82f6',
                                  color: 'white',
                                  borderRadius: '4px',
                                  fontWeight: 700
                                }}>PROMO</span>
                              )}
                              {item.outOfStock && (
                                <span style={{
                                  fontSize: '0.65rem',
                                  padding: '0.15rem 0.4rem',
                                  background: '#f97316',
                                  color: 'white',
                                  borderRadius: '4px',
                                  fontWeight: 700
                                }}>SIN STOCK</span>
                              )}
                            </div>
                            {item.promotionName && (
                              <span style={{ fontSize: '0.75rem', color: '#6b7280', fontStyle: 'italic' }}>
                                🎁 {item.promotionName}
                              </span>
                            )}
                            {item.outOfStock && item.estimatedArrivalDate && (
                              <span style={{ fontSize: '0.75rem', color: '#d97706' }}>
                                📅 ETA: {new Date(item.estimatedArrivalDate).toLocaleDateString('es-ES')}
                                {item.estimatedArrivalNote && ` - ${item.estimatedArrivalNote}`}
                              </span>
                            )}
                          </div>
                          <span className="item-qty">
                            {item.cantidad} x ${item.isFreeItem ? '0.00' : parseFloat(item.precioUnitario || 0).toFixed(2)}
                          </span>
                          <span className="item-subtotal" style={{ color: item.isFreeItem ? '#10b981' : 'inherit', fontWeight: item.isFreeItem ? 700 : 'inherit' }}>
                            ${parseFloat(item.subtotal || 0).toFixed(2)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : (
                  <div style={{
                    padding: '1rem',
                    background: '#fef3c7',
                    borderRadius: '0.5rem',
                    color: '#92400e',
                    fontSize: '0.9rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    border: '1px solid #fde68a'
                  }}>
                    <span className="material-icons-round" style={{ fontSize: '1.25rem' }}>card_giftcard</span>
                    <span>Orden solo con promoción (sin productos regulares)</span>
                  </div>
                )}

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
                  <button
                    className="btn-edit"
                    onClick={() => setViewingOrder(order)}
                    style={{ backgroundColor: '#6366f1', color: 'white' }}
                    title="Ver Detalle y Gestionar"
                  >
                    <span className="material-icons-round">visibility</span> Detalle
                  </button>

                  {order.estado === 'PENDING_PROMOTION_COMPLETION' && (
                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                      {order.items
                        .filter(item => item.isPromotionItem && !item.isFreeItem) // Filter for the main promotion triggers
                        .map((item, idx) => (
                          <button
                            key={idx}
                            className="btn-confirm"
                            style={{ backgroundColor: '#ec4899', fontSize: '0.8rem' }}
                            onClick={() => handleOpenAssortment(order, item)}
                          >
                            <span className="material-icons-round" style={{ fontSize: '14px' }}>inventory_2</span>
                            Surtir {item.productName?.substring(0, 15)}...
                          </button>
                        ))}
                    </div>
                  )}

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
                        style={{ color: '#1f2937' }} // Dark text for visibility
                      >
                        <span className="material-icons-round">edit</span> Editar
                      </button>
                      <button
                        className="btn-complete"
                        onClick={() => changeStatus(order.id, 'COMPLETADO')}
                        style={{ backgroundColor: '#10b981', color: '#ffffff', border: 'none' }}
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

      {viewingOrder && (
        <OrderDetailModal
          order={viewingOrder}
          userRole="ROLE_ADMIN"
          onClose={() => setViewingOrder(null)}
          onRefresh={fetchOrders}
        />
      )}

      {/* ✅ ASSORTMENT MODAL */}
      {showAssortmentModal && selectedPromotionForAssortment && selectedOrderForAssortment && (
        <AssortmentSelectionModal
          orderId={selectedOrderForAssortment.id}
          promotion={selectedPromotionForAssortment}
          onClose={() => {
            setShowAssortmentModal(false);
            setSelectedPromotionForAssortment(null);
            setSelectedOrderForAssortment(null);
          }}
          onSuccess={() => {
            fetchOrders(); // Refresh to see status update
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
  const [productSearch, setProductSearch] = useState('');
  const [isBonifiedMode, setIsBonifiedMode] = useState(false); // ✅ NEW STATE

  // ✅ Detect Promo Order
  const isPromoOrder = order.notas && order.notas.includes('[Promoción]');

  const [formData, setFormData] = useState({
    clientId: null,
    items: [], // Regular items
    bonifiedItems: [], // ✅ Separate bonified items
    notas: order.notas || '',
    includeFreight: order.includeFreight || false,
    isFreightBonified: order.isFreightBonified || false,
    freightCustomText: order.freightCustomText || '',
    freightQuantity: order.freightQuantity || 1
  });

  // Separate list for visual management of freight items, merged back on submit
  // Or kept in formData.items with isFreightItem flag? 
  // Better to handle them unified in formData.items but filtered in UI sections.
  // Actually, UI requested separate section. Let's filter them in the render.

  const [freightProductSearch, setFreightProductSearch] = useState('');
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

      // ✅ MAPEO CORRECTO: Separar items regulares de bonificados
      const regularItems = [];
      const bonified = [];

      order.items.forEach((item, index) => {
        const mappedItem = {
          id: `item-${Date.now()}-${index}`,
          productId: item.productId || item.product?.id || item.id,
          productName: item.productName || item.product?.nombre || 'Producto desconocido',
          cantidad: item.cantidad,
          precioUnitario: parseFloat(item.precioUnitario || item.precio || 0),
          isFreightItem: item.isFreightItem || false
          // removed isBonified property
        };

        if (item.isBonified) {
          bonified.push({
            ...mappedItem,
            precioUnitario: 0 // Ensure 0 for display
          });
        } else {
          regularItems.push(mappedItem);
        }
      });

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
        items: regularItems,
        bonifiedItems: bonified,
        notas: order.notas || '',
        includeFreight: order.includeFreight || false,
        isFreightBonified: order.isFreightBonified || false,
        freightCustomText: order.freightCustomText || '',
        freightQuantity: order.freightQuantity || 1
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

    // ✅ VALIDAR QUE HAYA PRODUCTOS (ignore if promo order, it might validly have 0 items if only freight? No, promos usually have items)
    // Actually, for promo order edits, we might not change items, but backend needs to know not to wipe them if we send empty?
    // The plan says: If Promo Order: Send items: [], bonifiedItems: [] (let backend restore), preserve promotionIds.
    // But if we are editing freight, we need to send that.

    if (formData.items.length === 0 && formData.bonifiedItems.length === 0 && !isPromoOrder) {
      toast.warning('Debe haber al menos un producto en la orden');
      return;
    }

    // ✅ VALIDAR QUE HAYA CAMBIOS
    if (!hasChanges) {
      toast.info('No se han realizado cambios en la orden');
      return;
    }

    const validItems = formData.items.filter(item => item.productId && item.cantidad > 0);
    const validBonified = formData.bonifiedItems.filter(item => item.productId && item.cantidad > 0);

    // If not promo order, must have valid items
    if (!isPromoOrder && validItems.length === 0 && validBonified.length === 0) {
      toast.warning('No hay productos válidos en la orden');
      return;
    }

    try {
      const payload = {
        clientId: formData.clientId || null,
        items: [],
        bonifiedItems: [],
        promotionIds: order.promotionIds || [], // Preserve existing promos
        notas: formData.notas || null,
        allowOutOfStock: true,
        includeFreight: formData.includeFreight,
        isFreightBonified: formData.includeFreight ? formData.isFreightBonified : false,
        freightCustomText: formData.includeFreight ? formData.freightCustomText : null,
        freightQuantity: formData.includeFreight ? (parseInt(formData.freightQuantity) || 1) : 1
      };

      if (isPromoOrder) {
        // If promo order, we DON'T send items/bonifiedItems to avoid overwriting the complex promo structure structure
        // We only allow editing Freight and Notes.
        // IMPORTANT: Backend must handle "if items is empty but promotionIds has values, don't clear items" or similar logic.
        // Or we rely on the fact that we send the same promotionIds.
        // Actually, if we send empty items list, backend might clear them.
        // Let's assume the backend refactor (which we did separately) handles this or we just send what we see.
        // If the UI shows them, we should probably send them back if we want to support editing quantities?
        // Plan said: "Send items: [], bonifiedItems: [] (let backend restore)".
        // So we leave arrays empty.
        payload.items = []; // Only freight
        payload.bonifiedItems = [];
      } else {
        // Standard Order
        payload.items = [
          ...validItems.filter(i => !i.isFreightItem).map(item => ({
            productId: item.productId,
            cantidad: item.cantidad
          })),
          ...formData.items.filter(i => i.isFreightItem).map(item => ({
            productId: item.productId,
            cantidad: item.cantidad,
            isFreightItem: true
          }))
        ];

        payload.bonifiedItems = validBonified.map(item => ({
          productId: item.productId,
          cantidad: item.cantidad
        }));
      }

      // Add Freight Items to payload.items if we are allowed to add freight in promo order
      // Freight items are in formData.items list usually?
      // Wait, in my initialization I put all items in regular/bonified lists. I need to make sure Freight items are handled.
      // My init logic: isFreightItem -> regularItems.
      // So they are in `validItems` or `formData.items`.
      // If isPromoOrder, we effectively cleared validItems from payload.
      // We must explicitly add freight items if they exist.

      if (isPromoOrder && formData.includeFreight) {
        const freightItems = formData.items.filter(i => i.isFreightItem);
        payload.items.push(...freightItems.map(item => ({
          productId: item.productId,
          cantidad: item.cantidad,
          isFreightItem: true
        })));
      }


      console.log('📦 Payload a enviar:', payload);

      await client.put(`/admin/orders/${order.id}`, payload);
      toast.success('Orden actualizada correctamente');
      onSuccess();
    } catch (error) {
      console.error('Error al actualizar orden:', error);
      toast.error('Error al actualizar orden: ' + (error.response?.data?.message || error.message));
    }
  };

  const addItem = (product, isFreight = false, isBonified = false) => {
    setHasChanges(true);

    if (isBonified) {
      const existing = formData.bonifiedItems.find(i => i.productId === product.id);
      if (existing) {
        setFormData(prev => ({
          ...prev,
          bonifiedItems: prev.bonifiedItems.map(i => i.productId === product.id ? { ...i, cantidad: i.cantidad + 1 } : i)
        }));
      } else {
        const newItem = {
          id: `item-bon-${Date.now()}-${Math.random()}`,
          productId: product.id,
          productName: product.nombre,
          cantidad: 1,
          precioUnitario: 0,
          isFreightItem: false
        };
        setFormData(prev => ({ ...prev, bonifiedItems: [...prev.bonifiedItems, newItem] }));
      }
    } else {
      const existing = formData.items.find(i => i.productId === product.id && i.isFreightItem === isFreight);

      if (existing) {
        setFormData(prev => ({
          ...prev,
          items: prev.items.map(i =>
            (i.productId === product.id && i.isFreightItem === isFreight)
              ? { ...i, cantidad: i.cantidad + 1 }
              : i
          )
        }));
      } else {
        const newItem = {
          id: `item-${Date.now()}-${Math.random()}`,
          productId: product.id,
          productName: product.nombre,
          cantidad: 1,
          precioUnitario: parseFloat(product.precio),
          isFreightItem: isFreight
        };

        setFormData(prev => ({
          ...prev,
          items: [...prev.items, newItem]
        }));
      }
    }
  };

  const removeItem = (itemId, isBonifiedList = false) => {
    setHasChanges(true);
    if (isBonifiedList) {
      setFormData(prev => ({
        ...prev,
        bonifiedItems: prev.bonifiedItems.filter(i => i.id !== itemId)
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        items: prev.items.filter(i => i.id !== itemId)
      }));
    }
  };

  const updateQuantity = (itemId, nuevaCantidad, isBonifiedList = false) => {
    setHasChanges(true);
    const cantidad = parseInt(nuevaCantidad);

    if (cantidad <= 0 || isNaN(cantidad)) {
      removeItem(itemId, isBonifiedList);
      return;
    }

    if (isBonifiedList) {
      setFormData(prev => ({
        ...prev,
        bonifiedItems: prev.bonifiedItems.map(i => i.id === itemId ? { ...i, cantidad: cantidad } : i)
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        items: prev.items.map(i =>
          i.id === itemId ? { ...i, cantidad: cantidad } : i
        )
      }));
    }
  };


  const calculateTotal = () => {
    return formData.items.reduce((sum, item) => {
      if (item.isFreightItem) return sum;
      return sum + (item.precioUnitario * item.cantidad);
    }, 0).toFixed(2);
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
    <div className="modal-overlay">
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

            {/* Promo Alert */}
            {isPromoOrder && (
              <div style={{ background: '#ecfdf5', border: '1px solid #10b981', color: '#047857', padding: '1rem', borderRadius: '8px', marginBottom: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span className="material-icons-round">campaign</span>
                <div>
                  <strong>Orden de Promoción</strong>
                  <div style={{ fontSize: '0.9rem' }}>Los productos de esta orden son parte de una promoción y no se pueden editar individualmente. Solo se pueden agregar fletes.</div>
                </div>
              </div>
            )}

            {formData.items.length === 0 && formData.bonifiedItems.length === 0 ? (
              <div className="alert-warning">
                <span className="material-icons-round">warning</span> La orden debe tener al menos un producto.
              </div>
            ) : (
              <div className="order-items-list">
                {/* Items Regulares */}
                {formData.items.filter(i => !i.isFreightItem).length > 0 && (
                  <div style={{ marginBottom: '1rem' }}>
                    <h5 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#4b5563', paddingBottom: '4px', borderBottom: '1px solid #e5e7eb', marginBottom: '8px' }}>📦 Productos</h5>
                    {formData.items.filter(i => !i.isFreightItem).map((item) => (
                      <div key={item.id} className="edit-item">
                        <span className="item-name">{item.productName}</span>
                        {!isPromoOrder ? (
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
                              onWheel={(e) => e.target.blur()}
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
                        ) : (
                          <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>x {item.cantidad}</span>
                        )}
                        <span className="item-price">
                          ${(item.precioUnitario * item.cantidad).toFixed(2)}
                          {(() => {
                            const prod = products.find(p => p.id === item.productId);
                            return prod ? <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: '4px' }}>Stock: {prod.stock}</div> : null;
                          })()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Items Bonificados */}
                {formData.bonifiedItems.length > 0 && (
                  <div style={{ marginBottom: '1rem', background: '#f0fdf4', borderRadius: '8px', padding: '8px', border: '1px solid #bbf7d0' }}>
                    <h5 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#15803d', paddingBottom: '4px', borderBottom: '1px solid #bbf7d0', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span className="material-icons-round" style={{ fontSize: '16px' }}>card_giftcard</span>
                      Regalos (Bonificados)
                    </h5>
                    {formData.bonifiedItems.map((item) => (
                      <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid #dcfce7' }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#166534' }}>{item.productName}</span>
                        {!isPromoOrder ? (
                          <div className="item-controls">
                            <button
                              type="button"
                              className="btn-qty"
                              onClick={() => updateQuantity(item.id, item.cantidad - 1, true)}
                              style={{ background: 'white', border: '1px solid #bbf7d0' }}
                            >
                              −
                            </button>
                            <input
                              type="number"
                              value={item.cantidad}
                              onChange={(e) => updateQuantity(item.id, e.target.value, true)}
                              min="1"
                              className="qty-input"
                              style={{ border: '1px solid #bbf7d0' }}
                              onWheel={(e) => e.target.blur()}
                            />
                            <button
                              type="button"
                              className="btn-qty"
                              onClick={() => updateQuantity(item.id, item.cantidad + 1, true)}
                              style={{ background: 'white', border: '1px solid #bbf7d0' }}
                            >
                              +
                            </button>
                            <button
                              type="button"
                              className="btn-remove-item"
                              onClick={() => removeItem(item.id, true)}
                              title="Eliminar producto"
                            >
                              <span className="material-icons-round">delete_outline</span>
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#15803d' }}>x {item.cantidad}</span>
                        )}
                        <span style={{ fontWeight: 'bold', color: '#15803d', fontSize: '0.9rem', minWidth: '60px', textAlign: 'right' }}>
                          $0.00
                        </span>
                      </div>
                    ))}
                  </div>
                )}


                <div className="order-total-row">
                  <strong>TOTAL:</strong>
                  <strong className="total-amount">${calculateTotal()}</strong>
                </div>
              </div>
            )}
          </div>




          {/* FREIGHT SECTION */}
          <div className="form-section">
            <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer', marginBottom: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={formData.includeFreight}
                  onChange={(e) => {
                    setHasChanges(true);
                    setFormData(p => ({ ...p, includeFreight: e.target.checked }));
                  }}
                />
                Incluir Flete
              </label>

              {formData.includeFreight && (
                <>
                  <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={formData.isFreightBonified}
                        onChange={(e) => {
                          setHasChanges(true);
                          setFormData(p => ({ ...p, isFreightBonified: e.target.checked }))
                        }}
                      />
                      Bonificar Flete (Costo $0)
                    </label>
                    <input
                      type="text"
                      placeholder="Texto personalizado (ej: Envío Express)"
                      value={formData.freightCustomText || ''}
                      onChange={(e) => {
                        setHasChanges(true);
                        setFormData(p => ({ ...p, freightCustomText: e.target.value }))
                      }}
                      style={{ flex: 1, padding: '0.4rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                    />
                    <input
                      type="number"
                      min="1"
                      placeholder="Cant."
                      value={formData.freightQuantity || 1}
                      onChange={(e) => {
                        setHasChanges(true);
                        setFormData(p => ({ ...p, freightQuantity: e.target.value }))
                      }}
                      style={{ width: '70px', padding: '0.4rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.85rem', textAlign: 'center' }}
                      title="Cantidad de fletes"
                      onWheel={(e) => e.target.blur()}
                    />
                  </div>

                  {/* Freight Items */}
                  <div className="freight-items-section">
                    <h5 style={{ fontSize: '0.85rem', marginBottom: '0.5rem', color: '#64748b' }}>📦 Productos por cuenta del Flete</h5>

                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', position: 'relative' }}>
                      <input
                        type="text"
                        placeholder="Buscar producto para flete..."
                        value={freightProductSearch}
                        onChange={(e) => setFreightProductSearch(e.target.value)}
                        style={{ flex: 1, padding: '0.3rem', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                      />
                      {freightProductSearch && (
                        <div style={{ position: 'absolute', background: 'white', border: '1px solid #ddd', borderRadius: '4px', maxHeight: '150px', overflowY: 'auto', width: '250px', zIndex: 10, marginTop: '2rem' }}>
                          {products
                            .filter(p => p.active && p.nombre.toLowerCase().includes(freightProductSearch.toLowerCase()))
                            .slice(0, 5)
                            .map(p => (
                              <div
                                key={p.id}
                                onClick={() => { addItem(p, true); setFreightProductSearch(''); }}
                                style={{ padding: '4px 8px', cursor: 'pointer', borderBottom: '1px solid #eee', fontSize: '0.8rem' }}
                              >
                                {p.nombre}
                              </div>
                            ))
                          }
                        </div>
                      )}
                    </div>

                    {formData.items.filter(i => i.isFreightItem).map((item) => (
                      <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'white', padding: '4px 8px', borderRadius: '4px', marginBottom: '4px', border: '1px solid #e2e8f0' }}>
                        <span style={{ fontSize: '0.8rem' }}>{item.productName}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <input
                            type="number"
                            value={item.cantidad}
                            onChange={(e) => updateQuantity(item.id, parseInt(e.target.value) || 0)}
                            style={{ width: '40px', padding: '2px', textAlign: 'center', fontSize: '0.8rem' }}
                            onWheel={(e) => e.target.blur()}
                          />
                          <button onClick={() => removeItem(item.id)} style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer' }}>&times;</button>
                        </div>
                      </div>
                    ))}
                    {formData.items.filter(i => i.isFreightItem).length === 0 && <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic' }}>Sin productos de flete</span>}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ✅ SECCIÓN MEJORADA: Solo productos con stock */}
          {/* ✅ SECCIÓN MEJORADA: Solo productos con stock */}
          {!isPromoOrder && (
            <div className="form-section">
              <h4>➕ Agregar más productos</h4>

              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--text-secondary)' }}>search</span>
                  <input
                    type="text"
                    placeholder="Buscar producto..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '0.6rem 1rem',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      fontSize: '0.9rem'
                    }}
                  />
                  {productSearch && (
                    <button
                      type="button"
                      onClick={() => setProductSearch('')}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--text-secondary)',
                        padding: '4px'
                      }}
                    >
                      <span className="material-icons-round">close</span>
                    </button>
                  )}
                </div>

                {/* ✅ Toggle Mode */}
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  cursor: 'pointer',
                  background: isBonifiedMode ? '#ecfdf5' : '#f3f4f6',
                  padding: '0.5rem 1rem',
                  borderRadius: '20px',
                  border: isBonifiedMode ? '1px solid #10b981' : '1px solid transparent',
                  transition: 'all 0.2s'
                }}>
                  <input
                    type="checkbox"
                    checked={isBonifiedMode}
                    onChange={(e) => setIsBonifiedMode(e.target.checked)}
                    style={{ accentColor: '#10b981' }}
                  />
                  <span style={{ fontSize: '0.9rem', fontWeight: 600, color: isBonifiedMode ? '#047857' : '#4b5563' }}>
                    {isBonifiedMode ? '🎁 Modo Regalo' : '📦 Modo Normal'}
                  </span>
                </label>
              </div>

              <div className="product-add-grid" style={{
                border: isBonifiedMode ? '2px solid #10b981' : 'none',
                borderRadius: '8px',
                padding: isBonifiedMode ? '1rem' : '0'
              }}>
                {products
                  .filter(p => p.active && p.nombre.toLowerCase().includes(productSearch.toLowerCase()))
                  .sort((a, b) => a.nombre.localeCompare(b.nombre))
                  .map(product => {
                    const hasStock = product.stock > 0;
                    return (
                      <div
                        key={product.id}
                        className={`product-add-card ${!hasStock ? 'out-of-stock' : ''}`}
                        onClick={() => addItem(product, false, isBonifiedMode)}
                        title={hasStock ? `Stock: ${product.stock}` : 'Sin Stock (Admin puede agregar)'}
                        style={{ background: isBonifiedMode ? '#f0fdf4' : 'white' }}
                      >
                        <div className="card-top">
                          <span className="card-name">{product.nombre}</span>
                          <span className={`card-badge ${hasStock ? 'instock' : 'nostock'}`}>
                            {hasStock ? product.stock : '0'}
                          </span>
                        </div>
                        <div className="card-price" style={{ color: isBonifiedMode ? '#10b981' : undefined }}>
                          {isBonifiedMode ? '$0.00' : `$${parseFloat(product.precio).toFixed(2)}`}
                        </div>
                      </div>
                    );
                  })}
              </div>

              {products.filter(p => p.active && p.nombre.toLowerCase().includes(productSearch.toLowerCase())).length === 0 && (
                <p className="no-products-available">
                  <span className="material-icons-round">block</span> {productSearch ? 'No se encontraron productos' : 'No hay productos activos'}
                </p>
              )}
            </div>
          )}

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
        </form >
      </div >
    </div >
  );
}


// ============================================
// PANEL NUEVA VENTA PARA ADMIN
// ============================================
function AdminNuevaVentaPanel() {
  const [clients, setClients] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedVendedor, setSelectedVendedor] = useState('');
  const [vendedores, setVendedores] = useState([]);
  const [cart, setCart] = useState([]);
  const [bonifiedCart, setBonifiedCart] = useState([]); // ✅ NEW: Separate list for bonified items
  const [isBonifiedMode, setIsBonifiedMode] = useState(false); // ✅ NEW: Toggle for adding as bonified
  // const [promotionsCart, setPromotionsCart] = useState([]); // Unused
  const [loading, setLoading] = useState(true);
  const [allowNoClient, setAllowNoClient] = useState(false);
  const [notas, setNotas] = useState('');


  // Freight & Bonification State
  const [includeFreight, setIncludeFreight] = useState(false);
  const [isFreightBonified, setIsFreightBonified] = useState(false);
  const [freightCustomText, setFreightCustomText] = useState('');
  const [freightQuantity, setFreightQuantity] = useState(1);
  const [freightItems, setFreightItems] = useState([]); // Items specific to freight
  const [freightProductSearch, setFreightProductSearch] = useState('');

  const [clientSearch, setClientSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [sortOrder, setSortOrder] = useState('asc'); // Sort state for clients
  const [clientsLoading, setClientsLoading] = useState(false); // Add specific loading state for clients
  const toast = useToast();

  const fetchData = useCallback(async () => {
    try {
      const [vendRes, prodRes] = await Promise.all([
        client.get('/admin/clients/vendedores'),
        client.get('/admin/products')
      ]);
      setVendedores(vendRes.data || []);
      setProducts(prodRes.data.content || prodRes.data || []);
    } catch (error) {
      console.error('Error al cargar datos:', error);
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const fetchClientesPorVendedor = async (vendorId) => {
    try {
      setClientsLoading(true);
      // New endpoint call
      const response = await client.get(`/admin/clients/seller/${vendorId}`);
      setClients(response.data || []);
    } catch (error) {
      console.error('Error al cargar clientes:', error);
      setClients([]);
    } finally {
      setClientsLoading(false);
    }
  };

  const handleVendorChange = (vendorId) => {
    setSelectedVendedor(vendorId);
    setSelectedClient('');
    if (vendorId) {
      fetchClientesPorVendedor(vendorId);
    } else {
      setClients([]);
    }
  };

  const addToCart = (product) => {
    // ✅ Logic depends on current mode
    if (isBonifiedMode) {
      // Add to BONIFIED cart
      const existingItem = bonifiedCart.find(item => item.productId === product.id);
      if (existingItem) {
        setBonifiedCart(bonifiedCart.map(item =>
          item.productId === product.id
            ? { ...item, cantidad: item.cantidad + 1 }
            : item
        ));
      } else {
        setBonifiedCart([...bonifiedCart, {
          productId: product.id,
          nombre: product.nombre,
          precio: 0, // Always 0 for bonified
          cantidad: 1,
          isBonified: true
        }]);
      }
    } else {
      // Add to REGULAR cart
      const existingItem = cart.find(item => item.productId === product.id);
      if (existingItem) {
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
          stockDisponible: product.stock,
          allowOutOfStock: false,
          isBonified: false
        }]);
      }
    }
  };

  // Freight Item Logic
  const addFreightItem = (product) => {
    const existing = freightItems.find(i => i.productId === product.id);
    if (existing) {
      setFreightItems(freightItems.map(i => i.productId === product.id ? { ...i, cantidad: i.cantidad + 1 } : i));
    } else {
      setFreightItems([...freightItems, {
        productId: product.id,
        nombre: product.nombre,
        cantidad: 1,
        isFreightItem: true
      }]);
    }
  };

  const removeFreightItem = (productId) => {
    setFreightItems(freightItems.filter(i => i.productId !== productId));
  };

  const updateFreightItemQty = (productId, qty) => {
    if (qty <= 0) {
      removeFreightItem(productId);
      return;
    }
    setFreightItems(freightItems.map(i => i.productId === productId ? { ...i, cantidad: qty } : i));
  };

  const removeFromCart = (productId, isBonifiedList = false) => {
    if (isBonifiedList) {
      setBonifiedCart(bonifiedCart.filter(item => item.productId !== productId));
    } else {
      setCart(cart.filter(item => item.productId !== productId));
    }
  };

  const updateQuantity = (productId, newQuantity, isBonifiedList = false) => {
    if (newQuantity <= 0) {
      removeFromCart(productId, isBonifiedList);
      return;
    }

    if (isBonifiedList) {
      setBonifiedCart(bonifiedCart.map(item =>
        item.productId === productId ? { ...item, cantidad: newQuantity } : item
      ));
    } else {
      setCart(cart.map(item =>
        item.productId === productId ? { ...item, cantidad: newQuantity } : item
      ));
    }
  };

  const calculateTotal = () => {
    const productsTotal = cart.reduce((sum, item) => {
      // Bonified items in regular cart shouldn't exist anymore, but safety check
      if (item.isBonified) return sum;
      return sum + (item.precio * item.cantidad);
    }, 0);
    return productsTotal.toFixed(2);
  };

  const handleSubmitOrder = async () => {
    if (cart.length === 0 && bonifiedCart.length === 0) {
      toast.warning('Agrega productos al carrito');
      return;
    }

    if (!selectedVendedor) {
      toast.warning('Selecciona un vendedor');
      return;
    }

    if (!selectedClient && !allowNoClient) {
      toast.warning('Selecciona un cliente o marca la casilla');
      return;
    }

    try {
      const orderData = {
        clientId: selectedClient || null,
        items: [
          ...cart.map(item => ({
            productId: item.productId,
            cantidad: item.cantidad,
            allowOutOfStock: item.allowOutOfStock,
            // isBonified removed
          })),
          ...freightItems.map(item => ({
            productId: item.productId,
            cantidad: item.cantidad,
            isFreightItem: true
          }))
        ],
        bonifiedItems: bonifiedCart.map(item => ({
          productId: item.productId,
          cantidad: item.cantidad
        })),
        promotionIds: [],
        notas: notas.trim() || null,
        includeFreight: includeFreight,
        isFreightBonified: includeFreight ? isFreightBonified : false,
        freightCustomText: includeFreight ? freightCustomText : null,
        freightQuantity: includeFreight ? (parseInt(freightQuantity) || 1) : 1,
        sellerId: selectedVendedor
      };

      await client.post('/admin/orders', orderData);
      toast.success('¡Venta registrada exitosamente!');

      setNotas('');
      setCart([]);
      setBonifiedCart([]);
      setFreightItems([]);
      setIncludeFreight(false);
      setIsFreightBonified(false);
      setFreightCustomText('');
      setFreightQuantity(1);
      setSelectedClient('');
      setAllowNoClient(false);
      setIsBonifiedMode(false);
    } catch (error) {
      console.error('Error al crear orden:', error);
      toast.error('Error al registrar la venta: ' + (error.response?.data?.message || 'Error desconocido'));
    }
  };

  if (loading) {
    return <div className="loading">Cargando...</div>;
  }

  const filteredProducts = products.filter(p =>
    p.nombre.toLowerCase().includes(productSearch.toLowerCase())
  ).sort((a, b) => a.nombre.localeCompare(b.nombre));

  const filteredClients = clients.filter(c =>
    c.nombre.toLowerCase().includes(clientSearch.toLowerCase())
  ).sort((a, b) => {
    const nameA = a.nombre || '';
    const nameB = b.nombre || '';
    return sortOrder === 'asc'
      ? nameA.localeCompare(nameB)
      : nameB.localeCompare(nameA);
  });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem', padding: '1.5rem' }}>
      {/* Productos */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="material-icons-round">inventory_2</span>
          Productos
        </h3>

        <div style={{ marginBottom: '1rem' }}>
          {/* Search and Bonified Toggle */}
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--text-secondary)' }}>search</span>
              <input
                type="text"
                placeholder="Buscar producto..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                style={{
                  flex: 1,
                  padding: '0.6rem 1rem',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  fontSize: '0.9rem'
                }}
              />
            </div>

            {/* ✅ Toggle Mode */}
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              cursor: 'pointer',
              background: isBonifiedMode ? '#ecfdf5' : '#f3f4f6',
              padding: '0.5rem 1rem',
              borderRadius: '20px',
              border: isBonifiedMode ? '1px solid #10b981' : '1px solid transparent',
              transition: 'all 0.2s'
            }}>
              <input
                type="checkbox"
                checked={isBonifiedMode}
                onChange={(e) => setIsBonifiedMode(e.target.checked)}
                style={{ accentColor: '#10b981' }}
              />
              <span style={{ fontSize: '0.9rem', fontWeight: 600, color: isBonifiedMode ? '#047857' : '#4b5563' }}>
                {isBonifiedMode ? '🎁 Modo Regalo (Bonificado)' : '📦 Modo Normal'}
              </span>
            </label>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
            gap: '1rem',
            maxHeight: '500px',
            overflowY: 'auto',
            border: isBonifiedMode ? '2px solid #10b981' : 'none',
            borderRadius: '8px',
            padding: isBonifiedMode ? '1rem' : '0'
          }}>
            {filteredProducts.map(product => (
              <div
                key={product.id}
                onClick={() => addToCart(product)}
                style={{
                  padding: '1rem',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  background: isBonifiedMode ? '#f0fdf4' : 'white'
                }}
                onMouseOver={(e) => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)'}
                onMouseOut={(e) => e.currentTarget.style.boxShadow = 'none'}
              >
                <div style={{ fontWeight: '600', fontSize: '0.9rem', marginBottom: '0.5rem' }}>{product.nombre}</div>
                <div style={{ color: isBonifiedMode ? '#10b981' : 'var(--primary)', fontWeight: '700', marginBottom: '0.25rem' }}>
                  {isBonifiedMode ? '$0.00 (Regalo)' : `$${parseFloat(product.precio).toFixed(2)}`}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Stock: {product.stock}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Carrito y Vendedor */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Vendedor */}
        <div style={{ background: 'white', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className="material-icons-round">badge</span>
            Vendedor
          </h3>

          <select
            value={selectedVendedor}
            onChange={(e) => handleVendorChange(e.target.value)}
            style={{
              width: '100%',
              padding: '0.75rem',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              fontSize: '0.95rem'
            }}
          >
            <option value="">Seleccionar vendedor</option>
            {vendedores.map(v => (
              <option key={v.id} value={v.id}>{v.username}</option>
            ))}
          </select>
        </div>

        {/* Cliente */}
        {selectedVendedor && (
          <div style={{ background: 'white', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="material-icons-round">person</span>
              Cliente
            </h3>

            <input
              type="text"
              placeholder="Buscar cliente..."
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '0.6rem',
                marginBottom: '0.75rem',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                fontSize: '0.9rem'
              }}
            />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                {clientsLoading ? 'Cargando...' : `${filteredClients.length} clientes`}
              </div>
              <button
                onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                style={{
                  background: 'none',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  padding: '2px 6px',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  color: 'var(--text-secondary)'
                }}
                title="Ordenar alfabéticamente"
              >
                <span className="material-icons-round" style={{ fontSize: '14px' }}>sort_by_alpha</span>
                {sortOrder === 'asc' ? 'A-Z' : 'Z-A'}
              </button>
            </div>

            <select
              value={selectedClient}
              onChange={(e) => {
                setSelectedClient(e.target.value);
                setAllowNoClient(false);
              }}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                fontSize: '0.95rem',
                marginBottom: '0.75rem'
              }}
            >
              <option value="">Seleccionar cliente</option>
              {filteredClients.map(c => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={allowNoClient}
                onChange={(e) => {
                  setAllowNoClient(e.target.checked);
                  if (e.target.checked) setSelectedClient('');
                }}
              />
              Venta sin cliente
            </label>
          </div>
        )}

        {/* Carrito */}
        <div style={{ background: 'white', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className="material-icons-round">shopping_cart</span>
            Carrito ({cart.length + bonifiedCart.length})
          </h3>

          <div style={{ maxHeight: '400px', overflowY: 'auto', marginBottom: '1rem' }}>
            {cart.length === 0 && bonifiedCart.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>Carrito vacío</p>
            ) : (
              <>
                {/* ✅ REGULAR ITEMS SECTION */}
                {cart.length > 0 && (
                  <div style={{ marginBottom: '1rem' }}>
                    <h5 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#4b5563', paddingBottom: '4px', borderBottom: '1px solid #e5e7eb', marginBottom: '8px' }}>📦 Productos</h5>
                    {cart.map(item => (
                      <div key={item.productId} style={{ padding: '0.75rem', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>{item.nombre}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            {`$${parseFloat(item.precio).toFixed(2)}`}
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          {/* removed isBonified checkbox */}
                          <button
                            onClick={() => updateQuantity(item.productId, item.cantidad - 1, false)}
                            style={{ background: '#f3f4f6', border: 'none', padding: '0.3rem 0.6rem', borderRadius: '4px', cursor: 'pointer' }}
                          >
                            −
                          </button>
                          <input
                            type="number"
                            value={item.cantidad}
                            onChange={(e) => updateQuantity(item.productId, parseInt(e.target.value) || 0, false)}
                            style={{ width: '40px', padding: '0.25rem', textAlign: 'center', border: '1px solid #e5e7eb', borderRadius: '4px' }}
                            onWheel={(e) => e.target.blur()}
                          />
                          <button
                            onClick={() => updateQuantity(item.productId, item.cantidad + 1, false)}
                            style={{ background: '#f3f4f6', border: 'none', padding: '0.3rem 0.6rem', borderRadius: '4px', cursor: 'pointer' }}
                          >
                            +
                          </button>
                          <button
                            onClick={() => removeFromCart(item.productId, false)}
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '18px' }}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* ✅ BONIFIED ITEMS SECTION */}
                {bonifiedCart.length > 0 && (
                  <div style={{ marginBottom: '1rem', background: '#f0fdf4', borderRadius: '8px', padding: '8px', border: '1px solid #bbf7d0' }}>
                    <h5 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#15803d', paddingBottom: '4px', borderBottom: '1px solid #bbf7d0', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span className="material-icons-round" style={{ fontSize: '16px' }}>card_giftcard</span>
                      Regalos (Bonificados)
                    </h5>
                    {bonifiedCart.map(item => (
                      <div key={item.productId} style={{ padding: '0.5rem 0', borderBottom: '1px solid #dcfce7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: '600', fontSize: '0.9rem', color: '#166534' }}>{item.nombre}</div>
                          <div style={{ fontSize: '0.75rem', color: '#15803d' }}>
                            $0.00
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <button
                            onClick={() => updateQuantity(item.productId, item.cantidad - 1, true)}
                            style={{ background: 'white', border: '1px solid #bbf7d0', padding: '0.2rem 0.5rem', borderRadius: '4px', cursor: 'pointer' }}
                          >
                            −
                          </button>
                          <input
                            type="number"
                            value={item.cantidad}
                            onChange={(e) => updateQuantity(item.productId, parseInt(e.target.value) || 0, true)}
                            style={{ width: '40px', padding: '0.2rem', textAlign: 'center', border: '1px solid #bbf7d0', borderRadius: '4px', background: 'white' }}
                            onWheel={(e) => e.target.blur()}
                          />
                          <button
                            onClick={() => updateQuantity(item.productId, item.cantidad + 1, true)}
                            style={{ background: 'white', border: '1px solid #bbf7d0', padding: '0.2rem 0.5rem', borderRadius: '4px', cursor: 'pointer' }}
                          >
                            +
                          </button>
                          <button
                            onClick={() => removeFromCart(item.productId, true)}
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '16px' }}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div style={{ paddingTop: '1rem', borderTop: '2px solid #f3f4f6', marginBottom: '1rem' }}>
            <input
              type="checkbox"
              checked={includeFreight}
              onChange={(e) => setIncludeFreight(e.target.checked)}
            />
            Incluir Flete
          </div>

          {includeFreight && (
            <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '8px', marginBottom: '1rem', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={isFreightBonified}
                    onChange={(e) => setIsFreightBonified(e.target.checked)}
                  />
                  Bonificar Flete (Costo $0)
                </label>
                <input
                  type="text"
                  placeholder="Texto personalizado (ej: Envío Express)"
                  value={freightCustomText}
                  onChange={(e) => setFreightCustomText(e.target.value)}
                  style={{ flex: 1, padding: '0.4rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                />
                <input
                  type="number"
                  min="1"
                  placeholder="Cant."
                  value={freightQuantity}
                  onChange={(e) => setFreightQuantity(e.target.value)}
                  style={{ width: '70px', padding: '0.4rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.85rem', textAlign: 'center' }}
                  title="Cantidad de fletes"
                  onWheel={(e) => e.target.blur()}
                />
              </div>

              <div className="freight-items-section">
                <h5 style={{ fontSize: '0.85rem', marginBottom: '0.5rem', color: '#64748b' }}>📦 Productos por cuenta del Flete</h5>

                {/* Freight Product Search */}
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', position: 'relative' }}>
                  <input
                    type="text"
                    placeholder="Buscar producto para flete..."
                    value={freightProductSearch}
                    onChange={(e) => setFreightProductSearch(e.target.value)}
                    style={{ flex: 1, padding: '0.3rem', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                  />
                  {freightProductSearch && (
                    <div style={{ position: 'absolute', background: 'white', border: '1px solid #ddd', borderRadius: '4px', maxHeight: '150px', overflowY: 'auto', width: '250px', zIndex: 10, marginTop: '2rem' }}>
                      {products
                        .filter(p => p.active && p.nombre.toLowerCase().includes(freightProductSearch.toLowerCase()))
                        .slice(0, 5)
                        .map(p => (
                          <div
                            key={p.id}
                            onClick={() => { addFreightItem(p); setFreightProductSearch(''); }}
                            style={{ padding: '4px 8px', cursor: 'pointer', borderBottom: '1px solid #eee', fontSize: '0.8rem' }}
                          >
                            {p.nombre}
                          </div>
                        ))
                      }
                    </div>
                  )}
                </div>

                {/* Freight Items List */}
                {freightItems.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'white', padding: '4px 8px', borderRadius: '4px', marginBottom: '4px', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '0.8rem' }}>{item.nombre}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <input
                        type="number"
                        value={item.cantidad}
                        onChange={(e) => updateFreightItemQty(item.productId, parseInt(e.target.value) || 0)}
                        style={{ width: '40px', padding: '2px', textAlign: 'center', fontSize: '0.8rem' }}
                        onWheel={(e) => e.target.blur()}
                      />
                      <button onClick={() => removeFreightItem(item.productId)} style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer' }}>&times;</button>
                    </div>
                  </div>
                ))}
                {freightItems.length === 0 && <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic' }}>Sin productos de flete</span>}
              </div>
            </div>
          )}

          <div style={{ fontSize: '1.1rem', fontWeight: '700', textAlign: 'right', marginBottom: '1rem' }}>
            Total: ${calculateTotal()}
          </div>

          <textarea
            placeholder="Notas..."
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            style={{
              width: '100%',
              padding: '0.75rem',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              marginBottom: '1rem',
              fontSize: '0.9rem',
              resize: 'vertical',
              minHeight: '60px'
            }}
          />

          <button
            onClick={handleSubmitOrder}
            style={{
              width: '100%',
              padding: '0.75rem',
              background: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            <span className="material-icons-round" style={{ verticalAlign: 'middle', marginRight: '0.5rem' }}>check</span>
            Finalizar Venta
          </button>
        </div>
      </div>
    </div>


  );
}

// ============================================
// COMPONENTES FALTANTES (Placeholders)
// ============================================




export default AdminDashboard;

