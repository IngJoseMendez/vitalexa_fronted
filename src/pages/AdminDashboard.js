import { useState, useEffect, useCallback } from 'react';

import client from '../api/client';
import { useToast } from '../components/ToastContainer';
import NotificationService from '../services/NotificationService';
import TagsPanel from '../components/TagsPanel';
import PromotionsPanel from '../components/PromotionsPanel';
import AdminClientsPanel from '../components/AdminClientsPanel';
import ProductsPanel from '../components/ProductsPanel';
import SpecialProductsPanel from '../components/SpecialProductsPanel';
import SpecialPromotionsPanel from '../components/SpecialPromotionsPanel';
import InventoryHistoryPanel from '../components/InventoryHistoryPanel';
import StockReportPanel from '../components/StockReportPanel';
import AdminDiscountSection from '../components/AdminDiscountSection';
import { OrderDetailModal } from '../components/modals/OrderManagementModal';
import EditOrderModal from '../components/modals/EditOrderModal';
import AssortmentSelectionModal from '../components/modals/AssortmentSelectionModal';
import AdminPromotionsCatalog from '../components/AdminPromotionsCatalog';
import { getStatusLabel, getStatusBadgeClass, PromotionType } from '../utils/types';
import { formatCurrency } from '../utils/formatters';
import '../styles/AdminDashboard.css';

function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('orders');
  const [refreshTrigger, setRefreshTrigger] = useState(0); // State for refresh
  const toast = useToast();

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
          title="Órdenes"
        >
          <span className="material-icons-round">assignment</span>
          <span className="nav-label">Órdenes</span>
        </button>
        <button
          className={activeTab === 'nueva-venta' ? 'active' : ''}
          onClick={() => setActiveTab('nueva-venta')}
          title="Nueva Venta"
        >
          <span className="material-icons-round">add_shopping_cart</span>
          <span className="nav-label">Nueva Venta</span>
        </button>
        <button
          className={activeTab === 'products' ? 'active' : ''}
          onClick={() => setActiveTab('products')}
          title="Productos"
        >
          <span className="material-icons-round">inventory_2</span>
          <span className="nav-label">Productos</span>
        </button>
        <button
          className={activeTab === 'special-products' ? 'active' : ''}
          onClick={() => setActiveTab('special-products')}
          title="Especiales"
        >
          <span className="material-icons-round">star</span>
          <span className="nav-label">Especiales</span>
        </button>
        <button
          className={activeTab === 'special-promotions' ? 'active' : ''}
          onClick={() => setActiveTab('special-promotions')}
          title="Promociones Especiales"
        >
          <span className="material-icons-round">stars</span>
          <span className="nav-label">Promociones Especiales</span>
        </button>
        <button
          className={activeTab === 'promotions' ? 'active' : ''}
          onClick={() => setActiveTab('promotions')}
          title="Promociones"
        >
          <span className="material-icons-round">card_giftcard</span>
          <span className="nav-label">Promociones</span>
        </button>
        <button
          className={activeTab === 'inventory-history' ? 'active' : ''}
          onClick={() => setActiveTab('inventory-history')}
          title="Historial Inventario"
        >
          <span className="material-icons-round">history</span>
          <span className="nav-label">Historial Inventario</span>
        </button>
        <button
          className={activeTab === 'stock-report' ? 'active' : ''}
          onClick={() => setActiveTab('stock-report')}
          title="Stock Real"
        >
          <span className="material-icons-round">warehouse</span>
          <span className="nav-label">Stock Real</span>
        </button>
        <button
          className={activeTab === 'clients' ? 'active' : ''}
          onClick={() => setActiveTab('clients')}
          title="Clientes"
        >
          <span className="material-icons-round">people</span>
          <span className="nav-label">Clientes</span>
        </button>
        <button
          className={activeTab === 'tags' ? 'active' : ''}
          onClick={() => setActiveTab('tags')}
          title="Etiquetas"
        >
          <span className="material-icons-round">local_offer</span>
          <span className="nav-label">Etiquetas</span>
        </button>
        <button
          className={activeTab === 'reports' ? 'active' : ''}
          onClick={() => setActiveTab('reports')}
          title="Reportes"
        >
          <span className="material-icons-round">analytics</span>
          <span className="nav-label">Reportes</span>
        </button>
        <button
          className="nav-external"
          onClick={() => window.location.href = '/balances'}
          title="Saldos"
        >
          <span className="material-icons-round">account_balance_wallet</span>
          <span className="nav-label">Saldos</span>
        </button>
      </nav>

      <button className="btn-refresh-dashboard" onClick={() => setRefreshTrigger(Date.now())} title="Actualizar datos">
        <span className="material-icons-round">sync</span>
      </button>

      <div className="dashboard-content">
        {activeTab === 'orders' && <OrdersPanel refreshTrigger={refreshTrigger} />}
        {activeTab === 'nueva-venta' && <AdminNuevaVentaPanel />}
        {activeTab === 'products' && <ProductsPanel refreshTrigger={refreshTrigger} />}
        {activeTab === 'special-products' && <SpecialProductsPanel refreshTrigger={refreshTrigger} />}
        {activeTab === 'special-promotions' && <SpecialPromotionsPanel refreshTrigger={refreshTrigger} />}
        {activeTab === 'inventory-history' && <InventoryHistoryPanel />}
        {activeTab === 'stock-report' && <StockReportPanel role="admin" />}
        {activeTab === 'clients' && <AdminClientsPanel refreshTrigger={refreshTrigger} />}
        {activeTab === 'tags' && <TagsPanel key={refreshTrigger} />}
        {activeTab === 'promotions' && <PromotionsPanel key={refreshTrigger} />}
        {activeTab === 'reports' && <AdminReportsPanel toast={toast} />}
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
function OrdersPanel({ refreshTrigger }) {
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
  const [clientSearchTerm, setClientSearchTerm] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);

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
  }, [fetchOrders, fetchVendedores, refreshTrigger]);

  // Close client dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showClientDropdown && !event.target.closest('.client-search-container')) {
        setShowClientDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showClientDropdown]);

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
      // Vendor filter - case-insensitive comparison
      if (selectedVendedor) {
        const orderVendor = (order.vendedor || '').trim().toLowerCase();
        const selectedVendor = selectedVendedor.trim().toLowerCase();
        if (orderVendor !== selectedVendor) {
          return false;
        }
      }


      // Client filter - case-insensitive comparison
      if (selectedCliente) {
        const orderClient = (order.cliente || '').trim().toLowerCase();
        const selectedClient = selectedCliente.trim().toLowerCase();
        if (orderClient !== selectedClient) {
          return false;
        }
      }

      // Comprehensive search filter - searches ALL order and client fields
      if (invoiceSearch.trim()) {
        const searchStr = invoiceSearch.toLowerCase().trim();

        // Search in order basic fields
        const invoiceNum = String(order.invoiceNumber || '').toLowerCase();
        const orderId = String(order.id || '').toLowerCase();
        const vendorName = String(order.vendedor || '').toLowerCase();
        const clientName = String(order.cliente || '').toLowerCase();
        const orderDate = String(order.fecha || '').toLowerCase();
        const orderTotal = String(order.total || '').toLowerCase();
        const orderStatus = String(order.estado || '').toLowerCase();

        // Search in client data (if available)
        const clientPhone = String(order.clientePhone || order.telefono || '').toLowerCase();
        const clientAddress = String(order.clienteAddress || order.direccion || '').toLowerCase();
        const clientNit = String(order.clienteNit || order.nit || '').toLowerCase();
        const clientEmail = String(order.clienteEmail || order.email || '').toLowerCase();
        const clientRep = String(order.clienteRepresentative || order.representanteLegal || '').toLowerCase();

        // Search in order items (product names)
        const productNames = (order.items || [])
          .map(item => String(item.nombre || item.productName || '').toLowerCase())
          .join(' ');

        // Check if search term is found in any field
        const matchesSearch =
          invoiceNum.includes(searchStr) ||
          orderId.includes(searchStr) ||
          vendorName.includes(searchStr) ||
          clientName.includes(searchStr) ||
          clientPhone.includes(searchStr) ||
          clientAddress.includes(searchStr) ||
          clientNit.includes(searchStr) ||
          clientEmail.includes(searchStr) ||
          clientRep.includes(searchStr) ||
          orderDate.includes(searchStr) ||
          orderTotal.includes(searchStr) ||
          orderStatus.includes(searchStr) ||
          productNames.includes(searchStr);

        if (!matchesSearch) {
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
      if (filter === 'cancelled') return order.estado === 'ANULADA' || order.estado === 'CANCELADO';
      if (filter === 'historical') {
        // Logic for historical invoices:
        // Suggestion: Filter by those with NO items but have a total (HistoricalInvoiceModal creates orders with empty items but totalValue)
        // Note: HistoricalInvoiceModal saves data. But does it create items?
        // In HistoricalInvoiceModal logic, it sends `totalValue`, etc. It does NOT seem to send `items` array populated with products. 
        // So `order.items.length === 0` is a good heuristic for now combined with `total > 0`.
        return (!order.items || order.items.length === 0) && parseFloat(order.total) > 0;
      }
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
      </div>

      {/* Filter Buttons Row */}
      <div className="filter-buttons" style={{ marginBottom: '1.5rem' }}>
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

        <div className="filter-divider" style={{ width: '1px', height: '24px', background: 'var(--border)', margin: '0 0.5rem' }}></div>

        <button
          className={filter === 'cancelled' ? 'active' : ''}
          onClick={() => setFilter('cancelled')}
          style={{ color: filter === 'cancelled' ? '#ef4444' : 'var(--text-secondary)' }}
        >
          <span className="material-icons-round">block</span> Anuladas ({orders.filter(o => o.estado === 'ANULADA' || o.estado === 'CANCELADO').length})
        </button>

        <button
          className={filter === 'historical' ? 'active' : ''}
          onClick={() => setFilter('historical')}
          style={{ color: filter === 'historical' ? '#d97706' : 'var(--text-secondary)' }}
        >
          <span className="material-icons-round">history</span> Historia ({orders.filter(o => !o.items || o.items.length === 0).length})
        </button>
      </div>

      {/* Search and Filters Row */}
      <div className="orders-search-filters" style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Invoice Search Input */}
        <div className="invoice-search-box" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: '1 1 auto', minWidth: '250px' }}>
          {/* Invoice Search Input */}
          <div className="invoice-search-box">
            <span className="material-icons-round" style={{ color: 'var(--text-secondary)' }}>search</span>
            <input
              type="text"
              placeholder="Buscar orden, cliente, rep..."
              value={invoiceSearch}
              onChange={(e) => setInvoiceSearch(e.target.value)}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: '0 1 auto' }}>
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

          {/* Client Filter - Searchable */}
          {selectedVendedor && (
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="material-icons-round" style={{ color: 'var(--primary)', fontSize: '18px' }}>person</span>
              <div className="client-search-container" style={{ position: 'relative' }}>
                <input
                  type="text"
                  placeholder="Buscar cliente..."
                  value={clientSearchTerm}
                  onChange={(e) => {
                    setClientSearchTerm(e.target.value);
                    setShowClientDropdown(true);
                    if (!e.target.value) {
                      setSelectedCliente('');
                    }
                  }}
                  onFocus={() => setShowClientDropdown(true)}
                  style={{
                    padding: '0.5rem 0.75rem',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    fontSize: '0.9rem',
                    background: selectedCliente ? '#f0fdf4' : 'white',
                    minWidth: '200px'
                  }}
                />

                {/* Dropdown with filtered clients */}
                {showClientDropdown && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      marginTop: '4px',
                      background: 'white',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      maxHeight: '300px',
                      overflowY: 'auto',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                      zIndex: 1000
                    }}
                  >
                    {/* "All clients" option */}
                    <div
                      onClick={() => {
                        setSelectedCliente('');
                        setClientSearchTerm('');
                        setShowClientDropdown(false);
                      }}
                      style={{
                        padding: '0.75rem',
                        cursor: 'pointer',
                        borderBottom: '1px solid var(--border)',
                        background: !selectedCliente ? '#f0fdf4' : 'transparent',
                        fontWeight: !selectedCliente ? 600 : 400
                      }}
                      onMouseEnter={(e) => e.target.style.background = '#f8fafc'}
                      onMouseLeave={(e) => e.target.style.background = !selectedCliente ? '#f0fdf4' : 'transparent'}
                    >
                      Todos los clientes
                    </div>

                    {/* Filtered client list */}
                    {clientes
                      .filter(c => {
                        const searchLower = clientSearchTerm.toLowerCase();
                        const nameMatch = (c.nombre || '').toLowerCase().includes(searchLower);
                        const repMatch = (c.representanteLegal || '').toLowerCase().includes(searchLower);
                        return nameMatch || repMatch;
                      })
                      .map(c => (
                        <div
                          key={c.id}
                          onClick={() => {
                            setSelectedCliente(c.nombre);
                            setClientSearchTerm(c.nombre);
                            setShowClientDropdown(false);
                          }}
                          style={{
                            padding: '0.75rem',
                            cursor: 'pointer',
                            background: selectedCliente === c.nombre ? '#f0fdf4' : 'transparent',
                            fontWeight: selectedCliente === c.nombre ? 600 : 400
                          }}
                          onMouseEnter={(e) => e.target.style.background = '#f8fafc'}
                          onMouseLeave={(e) => e.target.style.background = selectedCliente === c.nombre ? '#f0fdf4' : 'transparent'}
                        >
                          <div style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>{c.nombre}</div>
                          {c.representanteLegal && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                              <span className="material-icons-round" style={{ fontSize: '0.7rem', verticalAlign: 'middle' }}>badge</span> {c.representanteLegal}
                            </div>
                          )}
                        </div>
                      ))}

                    {/* No results message */}
                    {clientes.filter(c => {
                      const searchLower = clientSearchTerm.toLowerCase();
                      const nameMatch = (c.nombre || '').toLowerCase().includes(searchLower);
                      const repMatch = (c.representanteLegal || '').toLowerCase().includes(searchLower);
                      return nameMatch || repMatch;
                    }).length === 0 && (
                        <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                          No se encontraron clientes
                        </div>
                      )}
                  </div>
                )}
              </div>

              {selectedCliente && (
                <button
                  onClick={() => {
                    setSelectedCliente('');
                    setClientSearchTerm('');
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
          )}
        </div>
      </div>

      {/* Sorting Controls Row */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
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

            // Check if order is a promotion order
            const hasPromotions = order.isPromotionOrder === true;

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
                  <p className="order-total"><strong>Total:</strong> ${formatCurrency(order.total)}</p>
                  {order.discountedTotal && order.discountedTotal !== order.total && (
                    <p className="order-discounted-total">
                      <span className="material-icons-round" style={{ fontSize: '14px', color: '#10b981' }}>discount</span>
                      <strong>Con descuento:</strong>
                      <span className="discounted-value">${formatCurrency(order.discountedTotal)}</span>
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
                              <span style={{ fontSize: '0.75rem', color: '#6b7280', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                <span className="material-icons-round" style={{ fontSize: '12px', color: '#f59e0b' }}>card_giftcard</span>
                                {item.promotionName}
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
                            {item.cantidad} x ${item.isFreeItem ? '0.00' : formatCurrency(item.precioUnitario || 0)}
                          </span>
                          <span className="item-subtotal" style={{ color: item.isFreeItem ? '#10b981' : 'inherit', fontWeight: item.isFreeItem ? 700 : 'inherit' }}>
                            ${formatCurrency(item.subtotal || 0)}
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
        <EditOrderModal
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
// PANEL NUEVA VENTA PARA ADMIN
// ============================================
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
  const [bonifiedCart, setBonifiedCart] = useState([]);
  const [isBonifiedMode, setIsBonifiedMode] = useState(false);
  const [promotionsCart, setPromotionsCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [allowNoClient, setAllowNoClient] = useState(false);
  const [notas, setNotas] = useState('');


  // Assortment Selection State
  const [showAssortmentModal, setShowAssortmentModal] = useState(false);
  const [selectedPromotion, setSelectedPromotion] = useState(null);

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
          allowOutOfStock: true, // Admin can sell without stock
          isBonified: false,
          isSpecialProduct: product.isSpecialProduct
        }]);
      }
    }
  };

  // Promotion Logic
  const addPromotionToCart = (promotion) => {
    // Check for Assortment Promotion (BUY_GET_FREE / Surtido)
    if (promotion.type === PromotionType.BUY_GET_FREE || promotion.type === 'ASSORTMENT_PROMOTION') {
      setSelectedPromotion(promotion);
      setShowAssortmentModal(true);
      return;
    }

    // Add unique ID for cart processing to allow duplicates
    const promoInstance = {
      ...promotion,
      cartId: `promo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      // ✅ Capture Special Promotion ID if present
      specialPromotionId: promotion.isSpecial ? promotion.id : null
    };

    setPromotionsCart([...promotionsCart, promoInstance]);
    toast.success('Promoción agregada');
  };

  const handleAssortmentConfirmation = (items) => {
    // Process items to match cart structure
    const newCartItems = [...cart];

    items.forEach(item => {
      const existingItemIndex = newCartItems.findIndex(cartItem => cartItem.productId === item.productId);

      if (existingItemIndex >= 0) {
        newCartItems[existingItemIndex].cantidad += item.cantidad;
      } else {
        newCartItems.push({
          productId: item.productId,
          nombre: item.nombre,
          precio: item.precio, // NORMAL PRICE (These are the buy items)
          cantidad: item.cantidad,
          stockDisponible: item.stock || 9999,
          allowOutOfStock: true,
          promotionId: item.promotionId,
          // ✅ Pass down specialPromotionId from the selected promotion
          specialPromotionId: selectedPromotion?.isSpecial ? selectedPromotion.id : null
        });
      }
    });

    setCart(newCartItems);

    // Add the promotion itself to track it (for the ID)
    if (selectedPromotion) {
      const promoInstance = {
        ...selectedPromotion,
        cartId: `promo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        // ✅ Capture Special Promotion ID
        specialPromotionId: selectedPromotion.isSpecial ? selectedPromotion.id : null
      };
      setPromotionsCart([...promotionsCart, promoInstance]);
    }

    setShowAssortmentModal(false);
    setSelectedPromotion(null);
    toast.success('Productos de la promoción agregados al carrito');
  };

  const removePromotionFromCart = (cartId) => {
    setPromotionsCart(promotionsCart.filter(p => p.cartId !== cartId));
  };

  const removeFromCart = (productId, isBonifiedList = false) => {
    if (isBonifiedList) {
      setBonifiedCart(bonifiedCart.filter(item => item.productId !== productId));
    } else {
      setCart(cart.filter(item => item.productId !== productId));
    }
  };

  const updateQuantity = (productId, newQuantity, isBonifiedList = false) => {
    // Permite que el input quede vacío temporalmente
    if (newQuantity === '') {
      if (isBonifiedList) {
        setBonifiedCart(bonifiedCart.map(item =>
          item.productId === productId ? { ...item, cantidad: '' } : item
        ));
      } else {
        setCart(cart.map(item =>
          item.productId === productId ? { ...item, cantidad: '' } : item
        ));
      }
      return;
    }

    const qty = parseInt(newQuantity);

    if (isNaN(qty) || qty <= 0) {
      removeFromCart(productId, isBonifiedList);
      return;
    }

    if (isBonifiedList) {
      setBonifiedCart(bonifiedCart.map(item =>
        item.productId === productId ? { ...item, cantidad: qty } : item
      ));
    } else {
      setCart(cart.map(item =>
        item.productId === productId ? { ...item, cantidad: qty } : item
      ));
    }
  };

  const calculateTotal = () => {
    const productsTotal = cart.reduce((sum, item) => {
      // Bonified items in regular cart shouldn't exist anymore, but safety check
      if (item.isBonified) return sum;
      return sum + (item.precio * item.cantidad);
    }, 0);
    const promotionsTotal = promotionsCart.reduce((sum, item) => sum + (item.packPrice || 0), 0);
    return formatCurrency(productsTotal + promotionsTotal);
  };

  const handleSubmitOrder = async () => {
    // ✅ ACTUALIZADO: Permite órdenes solo con bonificados
    if (cart.length === 0 && bonifiedCart.length === 0 && promotionsCart.length === 0) {
      toast.warning('Agrega productos, promociones o bonificados al carrito');
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
            isValid: true,
            productId: item.isSpecialProduct ? null : item.productId,
            specialProductId: item.isSpecialProduct ? item.productId : null,
            cantidad: item.cantidad,
            allowOutOfStock: item.allowOutOfStock,
            relatedPromotionId: item.promotionId || null,
            // ✅ Include specialPromotionId in item payload
            specialPromotionId: item.specialPromotionId || null
            // isBonified removed
          }))
        ],
        bonifiedItems: bonifiedCart.map(item => ({
          productId: item.productId,
          cantidad: item.cantidad
        })),
        promotionIds: promotionsCart.map(p => p.id),
        notas: notas.trim() || null,
        includeFreight: false,
        isFreightBonified: false,
        freightCustomText: null,
        freightQuantity: 1,
        sellerId: selectedVendedor
      };

      await client.post('/admin/orders', orderData);
      toast.success('¡Venta registrada exitosamente!');

      setNotas('');
      setCart([]);
      setBonifiedCart([]);
      setPromotionsCart([]);
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

  const filteredClients = clients.filter(c => {
    const term = clientSearch.toLowerCase();
    if (!term) return true;
    return (
      (c.nombre || '').toLowerCase().includes(term) ||
      (c.nit || '').toLowerCase().includes(term) ||
      (c.email || '').toLowerCase().includes(term) ||
      (c.telefono || '').toLowerCase().includes(term) ||
      (c.direccion || '').toLowerCase().includes(term) ||
      (c.administrador || '').toLowerCase().includes(term) ||
      (c.representanteLegal || '').toLowerCase().includes(term)
    );
  }).sort((a, b) => {
    const nameA = a.nombre || '';
    const nameB = b.nombre || '';
    return sortOrder === 'asc'
      ? nameA.localeCompare(nameB)
      : nameB.localeCompare(nameA);
  });

  return (
    <div className="admin-sales-panel">
      {/* LEFT COLUMN: PRODUCTS & FILTERS */}
      <div className="sales-products-column">
        {/* FILTERS BAR */}
        <div className="sales-filters-bar">
          <div className="sales-search-container">
            <span className="material-icons-round sales-search-icon">search</span>
            <input
              type="text"
              className="sales-search-input"
              placeholder="Buscar producto..."
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
            />
          </div>

          <div
            className={`mode-toggle-label ${isBonifiedMode ? 'bonified' : 'normal'}`}
            onClick={() => setIsBonifiedMode(!isBonifiedMode)}
            title="Alternar modo de venta"
          >
            <span className="material-icons-round" style={{ fontSize: '20px' }}>
              {isBonifiedMode ? 'card_giftcard' : 'inventory_2'}
            </span>
            {isBonifiedMode ? 'Modo Regalo (Bonificado)' : 'Modo Venta Regular'}
          </div>
        </div>

        {/* PRODUCTS LIST */}
        <div className="sales-products-list">
          {/* CATALOGO DE PROMOCIONES - ADMIN */}
          <div style={{ marginBottom: '1rem' }}>
            <AdminPromotionsCatalog onAddToCart={addPromotionToCart} />
          </div>

          <h4 style={{ margin: '0.5rem 0 1rem 0', color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 700, textTransform: 'uppercase' }}>Catálogo de Productos</h4>

          {filteredProducts.map(product => (
            <div
              key={product.id}
              className={`sales-product-item ${isBonifiedMode ? 'bonified-mode' : ''}`}
              onClick={() => addToCart(product)}
            >
              {/* Image Placeholder or Actual Image if available */}
              <div className="product-item-image">
                <span className="material-icons-round" style={{ fontSize: '24px', color: '#cbd5e1' }}>image</span>
              </div>

              <div className="product-item-info">
                <div className="product-item-name">{product.nombre}</div>
                {product.isSpecialProduct && (
                  <span style={{ fontSize: '0.65rem', background: 'linear-gradient(135deg, #8b5cf6, #d946ef)', color: 'white', padding: '1px 4px', borderRadius: '3px', width: 'fit-content' }}>ESPECIAL</span>
                )}
              </div>

              <div className={`product-item-stock ${product.stock < 10 ? 'low' : ''}`}>
                <span className="material-icons-round" style={{ fontSize: '12px' }}>inventory_2</span>
                {product.stock}
              </div>

              <div className={`product-item-price ${isBonifiedMode ? 'free' : ''}`}>
                {isBonifiedMode ? 'FREE' : `$${formatCurrency(product.precio)}`}
              </div>

              <button className="btn-add-circle">
                <span className="material-icons-round" style={{ fontSize: '20px' }}>add</span>
              </button>
            </div>
          ))}
        </div>
      </div>


      {/* RIGHT COLUMN: CART SIDEBAR */}
      <div className="sales-cart-sidebar">
        <div className="cart-header">
          <div className="cart-title">
            <span className="material-icons-round" style={{ color: 'var(--primary)' }}>shopping_cart</span>
            Nueva Venta
          </div>

          <div className="cart-customer-selector">
            {/* Vendedor Selector */}
            <select
              className="cart-select"
              value={selectedVendedor}
              onChange={(e) => handleVendorChange(e.target.value)}
            >
              <option value="">-- Seleccionar Vendedor --</option>
              {vendedores.map(v => (
                <option key={v.id} value={v.id}>{v.username}</option>
              ))}
            </select>

            {/* Client Selector */}
            {selectedVendedor && (
              <>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    placeholder="Filtrar cliente..."
                    className="cart-select"
                    style={{ paddingRight: '2.5rem' }}
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                  />
                  <button
                    onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                    style={{
                      position: 'absolute',
                      right: '8px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer'
                    }}
                    title="Ordenar A-Z"
                  >
                    <span className="material-icons-round" style={{ fontSize: '18px' }}>sort_by_alpha</span>
                  </button>
                </div>

                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', textAlign: 'right' }}>
                  {clientsLoading ? 'Cargando clientes...' : `${filteredClients.length} clientes encontrados`}
                </div>

                <select
                  className="cart-select"
                  value={selectedClient}
                  onChange={(e) => {
                    setSelectedClient(e.target.value);
                    setAllowNoClient(false);
                  }}
                >
                  <option value="">-- Seleccionar Cliente --</option>
                  {filteredClients.map(client => (
                    <option key={client.id} value={client.id}>{client.nombre}</option>
                  ))}
                </select>
              </>
            )}
          </div>
        </div>

        <div className="cart-items-container">
          {cart.length === 0 && bonifiedCart.length === 0 && promotionsCart.length === 0 && (
            <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
              <span className="material-icons-round" style={{ fontSize: '48px', color: '#e2e8f0' }}>shopping_basket</span>
              <p>El carrito está vacío</p>
              <p style={{ fontSize: '0.8rem' }}>Selecciona productos o promociones del panel izquierdo.</p>
            </div>
          )}

          {/* PROMOTIONS */}
          {promotionsCart.length > 0 && (
            <div className="cart-group">
              <div className="cart-group-header">
                Promociones
              </div>
              {promotionsCart.map((promo) => (
                <div key={promo.cartId} className="cart-item">
                  <div className="cart-item-info">
                    <div className="cart-item-name" style={{ color: '#0369a1' }}>{promo.nombre}</div>
                    {promo.packPrice && (
                      <div className="cart-item-price" style={{ color: '#0ea5e9', fontWeight: 700 }}>${formatCurrency(promo.packPrice)}</div>
                    )}
                  </div>
                  <button className="btn-remove-item" onClick={() => removePromotionFromCart(promo.cartId)}>
                    <span className="material-icons-round" style={{ fontSize: '18px' }}>close</span>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* REGULAR ITEMS */}
          {cart.length > 0 && (
            <div className="cart-group">
              <div className="cart-group-header">
                Productos
              </div>
              {cart.map(item => (
                <div key={item.productId} className="cart-item">
                  <div className="cart-item-info">
                    <div className="cart-item-name">{item.nombre}</div>
                    <div className="cart-item-price">${formatCurrency(item.precio)}</div>
                  </div>

                  <div className="cart-item-qty-control">
                    <button className="btn-qty" onClick={() => updateQuantity(item.productId, item.cantidad - 1, false)}>−</button>
                    <input
                      className="qty-input"
                      type="number"
                      value={item.cantidad}
                      onChange={(e) => updateQuantity(item.productId, e.target.value, false)}
                      onWheel={(e) => e.target.blur()}
                    />
                    <button className="btn-qty" onClick={() => updateQuantity(item.productId, item.cantidad + 1, false)}>+</button>
                  </div>

                  <button className="btn-remove-item" onClick={() => removeFromCart(item.productId, false)}>
                    <span className="material-icons-round" style={{ fontSize: '18px' }}>close</span>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* BONIFIED ITEMS */}
          {bonifiedCart.length > 0 && (
            <div className="cart-group" style={{ border: '1px solid #bbf7d0' }}>
              <div className="cart-group-header" style={{ color: '#15803d', background: '#f0fdf4', borderBottomColor: '#dcfce7' }}>
                <span className="material-icons-round" style={{ fontSize: '14px', verticalAlign: 'middle' }}>card_giftcard</span> Regalos
              </div>
              {bonifiedCart.map(item => (
                <div key={item.productId} className="cart-item" style={{ background: '#f0fdf4' }}>
                  <div className="cart-item-info">
                    <div className="cart-item-name" style={{ color: '#166534' }}>{item.nombre}</div>
                    <div className="cart-item-price" style={{ color: '#15803d', fontWeight: 700 }}>GRATIS</div>
                  </div>

                  <div className="cart-item-qty-control" style={{ background: 'white', border: '1px solid #bbf7d0' }}>
                    <button className="btn-qty" onClick={() => updateQuantity(item.productId, item.cantidad - 1, true)}>−</button>
                    <input
                      className="qty-input"
                      type="number"
                      value={item.cantidad}
                      onChange={(e) => updateQuantity(item.productId, e.target.value, true)}
                      onWheel={(e) => e.target.blur()}
                    />
                    <button className="btn-qty" onClick={() => updateQuantity(item.productId, item.cantidad + 1, true)}>+</button>
                  </div>

                  <button className="btn-remove-item" onClick={() => removeFromCart(item.productId, true)}>
                    <span className="material-icons-round" style={{ fontSize: '18px' }}>close</span>
                  </button>
                </div>
              ))}
            </div>
          )}

        </div>

        <div className="cart-footer">
          <div className="cart-total">
            <span>Total</span>
            <span style={{ color: 'var(--primary)' }}>${calculateTotal()}</span>
          </div>

          <textarea
            className="cart-notes"
            placeholder="Notas de la venta..."
            rows="2"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
          />

          <button
            className="btn-checkout"
            onClick={handleSubmitOrder}
            disabled={cart.length === 0 && bonifiedCart.length === 0 && promotionsCart.length === 0}
          >
            <span className="material-icons-round">check_circle</span>
            Finalizar Venta
          </button>
        </div>
      </div>

      {/* Assortment Modal */}
      {
        showAssortmentModal && selectedPromotion && (
          <AssortmentSelectionModal
            orderId={null} // New order, so no ID yet
            promotion={selectedPromotion}
            onClose={() => {
              setShowAssortmentModal(false);
              setSelectedPromotion(null);
            }}
            onConfirm={handleAssortmentConfirmation}
            isStandalone={true} // Mode for new sale (client-side selection)
          />
        )
      }
    </div>
  );
}

// ============================================
// ADMIN REPORTS PANEL
// ============================================
function AdminReportsPanel({ toast }) {
  const [exporting, setExporting] = useState(false);
  const [vendedores, setVendedores] = useState([]);
  const [selectedVendor, setSelectedVendor] = useState('');
  const [dateRange, setDateRange] = useState({
    startDate: new Date(new Date().setMonth(new Date().getMonth() - 1))
      .toISOString()
      .split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    const fetchVendedores = async () => {
      try {
        const response = await client.get('/admin/clients/vendedores');
        setVendedores(response.data || []);
      } catch (error) {
        console.error('Error al cargar vendedores:', error);
      }
    };
    fetchVendedores();
  }, []);

  const handleDateChange = (field, value) => {
    setDateRange((prev) => ({ ...prev, [field]: value }));
  };

  const getExtensionByFormat = (format) => {
    switch (format) {
      case 'excel':
        return 'xlsx';
      case 'pdf':
        return 'pdf';
      case 'csv':
        return 'csv';
      default:
        return format;
    }
  };

  const getFilenameFromContentDisposition = (contentDisposition) => {
    if (!contentDisposition) return null;
    const utf8Match = contentDisposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1].replace(/"/g, ''));
    const simpleMatch = contentDisposition.match(/filename\s*=\s*"?([^";]+)"?/i);
    if (simpleMatch?.[1]) return simpleMatch[1];
    return null;
  };

  const downloadAxiosBlob = (axiosResponse, fallbackFilename) => {
    const contentType = axiosResponse.headers?.['content-type'] || 'application/octet-stream';
    const contentDisposition = axiosResponse.headers?.['content-disposition'];

    const serverFilename = getFilenameFromContentDisposition(contentDisposition);
    const filename = serverFilename || fallbackFilename;

    const blob = new Blob([axiosResponse.data], { type: contentType });
    const url = window.URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);

    document.body.appendChild(link);
    link.click();
    link.remove();

    window.URL.revokeObjectURL(url);
  };

  const handleExportReport = async (format) => {
    if (exporting) return;

    try {
      setExporting(true);

      const response = await client.get(`/reports/export/complete/${format}`, {
        params: {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
        },
        responseType: 'blob',
      });

      const ext = getExtensionByFormat(format);
      const fallbackName = `reporte_completo_${dateRange.startDate}_${dateRange.endDate}.${ext}`;

      downloadAxiosBlob(response, fallbackName);
      toast.success(`Reporte ${format.toUpperCase()} descargado exitosamente`);
    } catch (error) {
      console.error(`Error al exportar a ${format}:`, error);
      toast.error(`Error al exportar reporte a ${format.toUpperCase()}`);
    } finally {
      setExporting(false);
    }
  };

  const handleExportVendorReport = async (format) => {
    if (!selectedVendor) {
      toast.warning('Selecciona un vendedor');
      return;
    }
    if (exporting) return;

    try {
      setExporting(true);

      const response = await client.get(`/reports/export/vendor/${selectedVendor}/${format}`, {
        params: {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
        },
        responseType: 'blob',
      });

      const ext = getExtensionByFormat(format);
      const vendorName = vendedores.find(v => v.id === selectedVendor)?.username || selectedVendor;
      const fallbackName = `reporte_vendedor_${vendorName}_${dateRange.startDate}_${dateRange.endDate}.${ext}`;

      downloadAxiosBlob(response, fallbackName);
      toast.success(`Reporte de ${vendorName} descargado exitosamente`);
    } catch (error) {
      console.error(`Error al exportar reporte de vendedor:`, error);
      toast.error(`Error al exportar reporte de vendedor`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="reports-panel" style={{ padding: '2rem' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <h2 style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span className="material-icons-round" style={{ fontSize: '32px', color: 'var(--primary)' }}>analytics</span>
          Reportes Administrativos
        </h2>

        <div style={{
          background: 'white',
          borderRadius: '12px',
          padding: '2rem',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          border: '1px solid #e5e7eb'
        }}>
          <h3 style={{ marginBottom: '1.5rem' }}>Seleccionar Rango de Fechas</h3>

          <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: '#374151' }}>
                Desde:
              </label>
              <input
                type="date"
                value={dateRange.startDate}
                onChange={(e) => handleDateChange('startDate', e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  fontSize: '0.95rem'
                }}
              />
            </div>

            <div style={{ flex: 1, minWidth: '200px' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: '#374151' }}>
                Hasta:
              </label>
              <input
                type="date"
                value={dateRange.endDate}
                onChange={(e) => handleDateChange('endDate', e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  fontSize: '0.95rem'
                }}
              />
            </div>
          </div>

          <h3 style={{ marginBottom: '1rem' }}>Exportar Reporte Completo</h3>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => handleExportReport('excel')}
              disabled={exporting}
              style={{
                flex: 1,
                minWidth: '150px',
                background: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                padding: '1rem',
                fontSize: '0.95rem',
                fontWeight: 600,
                cursor: exporting ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                opacity: exporting ? 0.7 : 1
              }}
            >
              <span className="material-icons-round">table_chart</span>
              {exporting ? 'Exportando...' : 'Excel'}
            </button>

            <button
              onClick={() => handleExportReport('pdf')}
              disabled={exporting}
              style={{
                flex: 1,
                minWidth: '150px',
                background: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                padding: '1rem',
                fontSize: '0.95rem',
                fontWeight: 600,
                cursor: exporting ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                opacity: exporting ? 0.7 : 1
              }}
            >
              <span className="material-icons-round">picture_as_pdf</span>
              {exporting ? 'Exportando...' : 'PDF'}
            </button>

            <button
              onClick={() => handleExportReport('csv')}
              disabled={exporting}
              style={{
                flex: 1,
                minWidth: '150px',
                background: '#6366f1',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                padding: '1rem',
                fontSize: '0.95rem',
                fontWeight: 600,
                cursor: exporting ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                opacity: exporting ? 0.7 : 1
              }}
            >
              <span className="material-icons-round">description</span>
              {exporting ? 'Exportando...' : 'CSV'}
            </button>
          </div>

          <div style={{
            marginTop: '1.5rem',
            padding: '1rem',
            background: '#f3f4f6',
            borderRadius: '8px',
            fontSize: '0.85rem',
            color: '#6b7280'
          }}>
            <span className="material-icons-round" style={{ fontSize: '16px', verticalAlign: 'middle', marginRight: '0.5rem' }}>info</span>
            Los reportes incluyen datos de ventas, productos, vendedores y clientes para el rango de fechas seleccionado.
          </div>

          {/* Vendor-Specific Reports Section */}
          <div style={{ marginTop: '2rem', paddingTop: '2rem', borderTop: '2px solid #e5e7eb' }}>
            <h3 style={{ marginBottom: '1.5rem' }}>Reportes por Vendedor</h3>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: '#374151' }}>
                Seleccionar Vendedor:
              </label>
              <select
                value={selectedVendor}
                onChange={(e) => setSelectedVendor(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  fontSize: '0.95rem',
                  background: selectedVendor ? '#f0fdf4' : 'white'
                }}
              >
                <option value="">-- Seleccionar Vendedor --</option>
                {vendedores.map(v => (
                  <option key={v.id} value={v.id}>{v.username}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <button
                onClick={() => handleExportVendorReport('excel')}
                disabled={!selectedVendor || exporting}
                style={{
                  flex: 1,
                  minWidth: '200px',
                  background: selectedVendor && !exporting ? '#10b981' : '#d1d5db',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '1rem',
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  cursor: selectedVendor && !exporting ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  opacity: selectedVendor && !exporting ? 1 : 0.6
                }}
              >
                <span className="material-icons-round">table_chart</span>
                {exporting ? 'Exportando...' : 'Excel Completo'}
              </button>

              <button
                onClick={() => handleExportVendorReport('pdf')}
                disabled={!selectedVendor || exporting}
                style={{
                  flex: 1,
                  minWidth: '200px',
                  background: selectedVendor && !exporting ? '#ef4444' : '#d1d5db',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '1rem',
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  cursor: selectedVendor && !exporting ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  opacity: selectedVendor && !exporting ? 1 : 0.6
                }}
              >
                <span className="material-icons-round">picture_as_pdf</span>
                {exporting ? 'Exportando...' : 'PDF Ventas Diarias'}
              </button>
            </div>

            <div style={{
              marginTop: '1rem',
              padding: '0.75rem',
              background: '#fef3c7',
              borderRadius: '8px',
              fontSize: '0.8rem',
              color: '#92400e',
              border: '1px solid #fde68a'
            }}>
              <span className="material-icons-round" style={{ fontSize: '14px', verticalAlign: 'middle', marginRight: '0.4rem' }}>info</span>
              <strong>Nota:</strong> NinaTorres y YicelaSandoval tienen datos unificados. El reporte de cualquiera mostrará datos combinados.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminDashboard;
