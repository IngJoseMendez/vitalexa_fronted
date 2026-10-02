import React, { useState, useEffect, useCallback, useRef } from 'react';
import { formatCurrency, formatOrderLabel, orderReferenceMatches } from '../utils/formatters';
import { PLACEHOLDER_IMAGE } from '../utils/placeholderImage';
import client from '../api/client';
import { useToast } from '../components/ToastContainer';
import { useConfirm } from '../components/ConfirmDialog';
import NotificationService from '../services/NotificationService';
import useSidebarCollapsed from '../hooks/useSidebarCollapsed';
import usePersistentState from '../hooks/usePersistentState';
import SidebarToggle from '../components/SidebarToggle';
import { tagService } from '../api/tagService'; // Added Tag Service
import { TagBadge, TagFilterBar } from '../components/TagComponents';
import { EXPORT_FORMATS } from '../components/ExportButton';
import { avatarTone, avatarInitials } from '../utils/avatarTone';
// Las pestañas Clientes, Stock real, Nómina y Transferencias y los modales de órdenes se cargan
// bajo demanda (ver los lazyWithRetry() debajo de los imports). Sus hojas de estilo se importan
// AQUÍ, en el mismo orden en que llegaban antes a través de cada componente, para que la
// cascada CSS no cambie y los chunks diferidos no traigan CSS al abrirse.
import '../styles/areas/AssortmentSelectionModal.css'; // OrderDetailModal (OrderManagementModal)
import '../components/modals/OrderAnnulationModal.css';
import '../components/modals/OrderRevertAnnulmentModal.css';
import '../components/modals/HistoricalInvoiceModal.css'; // también HistoricalInvoiceModal
import '../components/modals/OrderManagementModal.css';
import '../styles/areas/AdminClientsPanel.css';
import '../components/modals/PhysicalCountModal.css'; // StockReportPanel
import '../styles/areas/StockReportPanel.css';
import '../styles/areas/PayrollPanel.css';
import '../styles/areas/PaymentTransferPanel.css';
import { PanelFallback, ModalFallback, LazyErrorBoundary, lazyWithRetry } from '../components/LazyFallbacks';
import '../styles/OwnerDashboard.css';
import '../styles/ChartStyles.css';

// Carga bajo demanda (el código llega al abrir la pestaña o el modal; "prefetch" lo descarga
// en segundo plano cuando el navegador está libre, así el primer clic casi no espera).
// lazyWithRetry = React.lazy con un reintento si la red falla (ver LazyFallbacks.js).
const AdminClientsPanel = lazyWithRetry(() => import(/* webpackPrefetch: true */ '../components/AdminClientsPanel'));
const StockReportPanel = lazyWithRetry(() => import(/* webpackPrefetch: true */ '../components/StockReportPanel'));
const PayrollPanel = lazyWithRetry(() => import(/* webpackPrefetch: true */ '../components/PayrollPanel'));
const PaymentTransferPanel = lazyWithRetry(() => import(/* webpackPrefetch: true */ '../components/PaymentTransferPanel'));
const OrderDetailModal = lazyWithRetry(() =>
  import(/* webpackPrefetch: true */ '../components/modals/OrderManagementModal').then((m) => ({ default: m.OrderDetailModal }))
);
const HistoricalInvoiceModal = lazyWithRetry(() => import(/* webpackPrefetch: true */ '../components/modals/HistoricalInvoiceModal'));

// ✅ CONFIGURACIÓN CENTRALIZADA





// Solo presentación: variante de badge por estado de la orden (sistema de diseño:
// PENDIENTE=warning, CONFIRMADO=primary, COMPLETADO=success, ANULADA/CANCELADO=danger, otros=neutral).
const ORDER_STATUS_BADGE = {
  PENDIENTE: 'warning',
  CONFIRMADO: 'primary',
  COMPLETADO: 'success',
  ANULADA: 'danger',
  CANCELADO: 'danger',
};
const orderStatusBadgeClass = (estado) => `ui-badge ui-badge--${ORDER_STATUS_BADGE[estado || 'PENDIENTE'] || 'neutral'}`;

// Productos: columnas de la cuadrícula que ofrece el selector (números, como el estado). Es
// también la lista de valores permitidos de la preferencia que se recuerda (usePersistentState).
const OWNER_PRODUCT_COLUMNS = [1, 2, 3];

// ----- Solo presentación (premium-polish-SPEC §1): colores con significado. Ninguno de estos
// ayudantes cambia un cálculo, un dato enviado ni una validación. -----

// Valor 0–100 para .ui-progress (--value es un número sin "%"): NaN, Infinity o negativos → 0
const progressValue = (n) => (Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0);

// Color de una meta según su avance: cumplida o desde 75 % = verde, desde 40 % = ámbar, menos = rojo
// Metas: mismo criterio que el panel de la vendedora (cumplida = verde, desde 50 % = azul
// "en camino", menos = ámbar; sin rojo para no desanimar)
const goalProgressTone = (goal) => {
  const pct = parseFloat(goal?.percentage);
  if (goal?.completed || pct >= 100) return 'success';
  if (pct >= 50) return 'primary';
  return 'warning';
};

// Tasa de éxito de las órdenes: desde 80 % = verde, desde 50 % = ámbar, menos = rojo
const successRateTone = (completed, total) => {
  if (!(total > 0)) return 'primary';
  const rate = (completed / total) * 100;
  if (rate >= 80) return 'success';
  if (rate >= 50) return 'warning';
  return 'danger';
};

// Nombre legible del archivo que se está generando (aviso flotante de Reportes). El nombre real
// lo pone el servidor; aquí se describe con el reporte y la extensión del formato.
const EXPORT_REPORT_NAMES = {
  complete: 'Reporte completo',
  sales: 'Reporte de ventas',
  products: 'Reporte de productos',
  clients: 'Reporte de clientes',
};

// Contenido de un botón de exportación con identidad de formato (el mismo aspecto que
// ExportButton): icono del formato o spinner mientras ESE botón exporta, y la etiqueta normal
// invisible debajo del texto de carga para que el botón no cambie de ancho. El <button> sigue en
// su lugar con su mismo onClick, disabled, title y aria-label.
function ExportLabel({ kind, busy, label }) {
  return (
    <>
      {busy
        ? <span className="ui-spinner" aria-hidden="true" />
        : <span className="material-icons-round" aria-hidden="true">{EXPORT_FORMATS[kind].icon}</span>}
      <span className="ui-btn-label">
        {busy && <span className="ui-btn-label-sizer" aria-hidden="true">{label}</span>}
        <span>{busy ? 'Exportando...' : label}</span>
      </span>
    </>
  );
}

function OwnerDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [vendedores, setVendedores] = useState([]);
  const [tags, setTags] = useState([]); // Added Tags State
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showHistoricalModal, setShowHistoricalModal] = useState(false); // Added State
  // Botón "Actualizar" del menú: spinner en el propio botón mientras llega la recarga que pidió
  const [manualRefreshing, setManualRefreshing] = useState(false);
  // Sube cada vez que termina una recarga: el detalle de orden abierto vuelve a pedir lo suyo
  // en su lugar (antes lo hacía porque se remontaba, perdiendo lo que tuviera abierto)
  const [dataVersion, setDataVersion] = useState(0);
  const [sidebarCollapsed, toggleSidebar] = useSidebarCollapsed('owner');
  const toast = useToast();
  // Número de la última recarga: las ráfagas de INVENTORY_UPDATE lanzan varias a la vez y una
  // respuesta más vieja no debe pisar a la más nueva
  const requestSeqRef = useRef(0);

  // Actualización silenciosa: "Cargando dashboard..." (que reemplaza TODO el panel) solo se ve
  // en la primera carga. Las recargas (INVENTORY_UPDATE, "Actualizar", y lo que hace el dueño
  // en órdenes, productos o metas) cambian los datos en su lugar: el menú, la pestaña, sus
  // filtros y los modales abiertos siguen como estaban. Mismas peticiones que antes.
  const fetchData = useCallback(async () => {
    const requestId = ++requestSeqRef.current;
    const isLatest = () => requestId === requestSeqRef.current;
    try {
      const [ordersRes, productsRes, salesRes] = await Promise.all([
        client.get('/admin/orders'),
        client.get('/admin/products'),
        client.get('/owner/reports/sales')
      ]);

      if (isLatest()) {
        setOrders(ordersRes.data);
        setProducts(productsRes.data);
        calculateStats(productsRes.data, salesRes.data);
      }

      const tagsRes = await tagService.getAll();
      if (isLatest()) setTags(tagsRes.data);

      try {
        const vendedoresRes = await client.get('/admin/sale-goals/vendedores');
        if (isLatest()) setVendedores(vendedoresRes.data);
      } catch (vendedorError) {
        // Se conservan las vendedoras que ya se ven (al inicio la lista ya está vacía)
        console.warn('Error al cargar vendedores:', vendedorError);
      }

    } catch (error) {
      console.error('Error al cargar datos:', error);
      // Los datos que ya se ven se quedan; solo el aviso de siempre
      if (isLatest()) toast.error('Error al cargar datos del dashboard');
    } finally {
      if (isLatest()) {
        setLoading(false);
        setManualRefreshing(false);
        setDataVersion((v) => v + 1);
      }
    }
  }, [toast]);

  useEffect(() => {
    fetchData();

    // Connect with role 'owner'. Al desmontar se quita solo este oyente: la conexión es compartida con la campana
    const unsubscribe = NotificationService.connect((notification) => {
      if (notification.type === 'INVENTORY_UPDATE') {
        console.log("📦 Inventory update received, refreshing dashboard...");
        // Trigger re-fetch of main data
        setRefreshTrigger(Date.now());
      }
    }, 'owner');

    return unsubscribe;
  }, [fetchData]);

  useEffect(() => {
    if (refreshTrigger > 0) {
      fetchData();
    }
  }, [refreshTrigger, fetchData]);



  const calculateStats = (productsData, salesReport) => {
    const activeProducts = productsData.filter(p => p.active).length;
    const lowStockProducts = productsData.filter(p => p.stock < 10 && p.active).length;

    setStats({
      totalOrders: salesReport?.totalOrders ?? 0,
      completedOrders: salesReport?.completedOrders ?? 0,
      pendingOrders: salesReport?.pendingOrders ?? 0,
      totalRevenue: salesReport?.totalRevenue ?? 0,
      activeProducts: activeProducts,
      totalProducts: productsData.length,
      lowStockProducts: lowStockProducts
    });
  };

  // Solo la primera carga: fetchData ya no vuelve a poner loading en true
  if (loading) {
    return (
      <div className="owner-dashboard">
        <div className="loading ui-loading" role="status">
          <span className="ui-spinner" aria-hidden="true"></span>
          Cargando dashboard...
        </div>
      </div>
    );
  }

  return (
    <div className={`owner-dashboard${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>

      {/* ── SIDEBAR IZQUIERDA (plegable a solo iconos en escritorio) ── */}
      <aside className="owner-sidebar">
        <div className="sidebar-brand">
          <span className="material-icons-round" aria-hidden="true">verified_user</span>
          <span className="sidebar-brand-name">Owner</span>
          <SidebarToggle collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
        </div>

        <nav className="sidebar-nav">
          {[
            { key: 'overview', icon: 'dashboard', label: 'Resumen' },
            { key: 'orders', icon: 'inventory', label: `Órdenes (${stats?.totalOrders || 0})` },
            { key: 'products', icon: 'store', label: `Productos (${stats?.totalProducts || 0})` },
            { key: 'clients', icon: 'people', label: 'Clientes' },
            { key: 'metas', icon: 'trending_up', label: `Metas (${vendedores.length})` },
            { key: 'reports', icon: 'insights', label: 'Reportes' },
            { key: 'stock-report', icon: 'warehouse', label: 'Stock Real' },
            { key: 'nomina', icon: 'payments', label: 'Nómina' },
            { key: 'transferencias', icon: 'swap_horiz', label: 'Transferencias' },
          ].map(item => (
            <button
              key={item.key}
              type="button"
              className={`sidebar-item${activeTab === item.key ? ' active' : ''}`}
              aria-current={activeTab === item.key ? 'page' : undefined}
              onClick={() => setActiveTab(item.key)}
              title={item.label}
            >
              <span className="material-icons-round sidebar-icon" aria-hidden="true">{item.icon}</span>
              <span className="sidebar-label">{item.label}</span>
            </button>
          ))}

          <div className="sidebar-divider" />

          <button
            type="button"
            className="sidebar-item sidebar-external"
            onClick={() => window.location.href = '/balances'}
            title="Saldos"
          >
            <span className="material-icons-round sidebar-icon" aria-hidden="true">account_balance_wallet</span>
            <span className="sidebar-label">Saldos</span>
          </button>
        </nav>

        {/* Recarga silenciosa: la pantalla no se vacía; mientras llega, spinner en el botón */}
        <button
          type="button"
          className={`sidebar-refresh${manualRefreshing ? ' is-refreshing' : ''}`}
          onClick={() => { setRefreshTrigger(Date.now()); setManualRefreshing(true); }}
          title="Actualizar datos"
          aria-busy={manualRefreshing || undefined}
        >
          {manualRefreshing
            ? <span className="ui-spinner" aria-hidden="true"></span>
            : <span className="material-icons-round" aria-hidden="true">sync</span>}
          <span className="sidebar-label">Actualizar</span>
        </button>
      </aside>

      {/* ── CONTENIDO PRINCIPAL ── */}
      <main className="owner-main">
        <div className="owner-content">
          {/* Mientras llega el código de una pestaña diferida se ve "Cargando…" en su lugar; si no
              se pudo descargar, un aviso con "Reintentar" (el menú lateral sigue funcionando) */}
          <LazyErrorBoundary resetKey={activeTab}>
          <React.Suspense fallback={<PanelFallback />}>
            {activeTab === 'overview' && <OverviewTab stats={stats} />}
            {activeTab === 'orders' && (
              <OrdersTab
                orders={orders}
                onSelectOrder={setSelectedOrder}
                onOpenHistoricalModal={() => setShowHistoricalModal(true)}
                refreshTrigger={refreshTrigger}
              />
            )}
            {activeTab === 'products' && (
              <ProductsTab
                products={products}
                tags={tags}
                onRefresh={fetchData}
                refreshTrigger={refreshTrigger}
              />
            )}
            {activeTab === 'clients' && <AdminClientsPanel refreshTrigger={refreshTrigger} />}
            {activeTab === 'metas' && (
              <SaleGoalsTab
                vendedores={vendedores}
                onUpdate={fetchData}
                toast={toast}
              />
            )}
            {/* Antes estas pestañas volvían a pedir sus datos porque el panel entero se remontaba
                en cada recarga (perdiendo fechas, formularios y pasos a medio llenar). Ahora
                reciben refreshTrigger y recargan en su lugar, conservando lo que el dueño usa:
                Reportes (mismas fechas), Stock, Nómina (la sub-pestaña que se ve, mismo mes) y
                Transferencias (el historial de la vendedora elegida). */}
            {activeTab === 'reports' && <ReportsTab orders={orders} products={products} vendedores={vendedores} refreshTrigger={refreshTrigger} />}
            {activeTab === 'stock-report' && <StockReportPanel role="owner" refreshTrigger={refreshTrigger} />}
            {activeTab === 'nomina' && <PayrollPanel vendedores={vendedores} refreshTrigger={refreshTrigger} />}
            {activeTab === 'transferencias' && <PaymentTransferPanel vendedores={vendedores} refreshTrigger={refreshTrigger} />}
          </React.Suspense>
          </LazyErrorBoundary>
        </div>
      </main>

      {selectedOrder && (
        <LazyErrorBoundary variant="modal" onClose={() => setSelectedOrder(null)}>
        <React.Suspense fallback={<ModalFallback onClose={() => setSelectedOrder(null)} />}>
          <OrderDetailModal
            order={selectedOrder}
            userRole="ROLE_OWNER"
            onClose={() => setSelectedOrder(null)}
            onRefresh={fetchData}
            refreshKey={dataVersion}
          />
        </React.Suspense>
        </LazyErrorBoundary>
      )}

      {showHistoricalModal && (
        <LazyErrorBoundary variant="modal" onClose={() => setShowHistoricalModal(false)}>
        <React.Suspense fallback={<ModalFallback onClose={() => setShowHistoricalModal(false)} />}>
          <HistoricalInvoiceModal
            onClose={() => setShowHistoricalModal(false)}
            onSuccess={() => { fetchData(); }}
          />
        </React.Suspense>
        </LazyErrorBoundary>
      )}
    </div>
  );
}

// ===== OVERVIEW TAB =====
function OverviewTab({ stats }) {
  return (
    <div className="own-tab own-overview">
      <header className="ui-page-header">
        <div className="ui-page-heading">
          <h2 className="ui-page-title">
            <span className="material-icons-round" aria-hidden="true">dashboard</span>
            Resumen
          </h2>
        </div>
      </header>

      {/* Cada tarjeta lleva el color de lo que cuenta: ingresos en verde, completadas en azul,
          pendientes en ámbar, inventario en teal (decorativo) y stock bajo en rojo */}
      <div className="ui-stat-grid own-stat-grid ui-stagger">
        <div className="ui-stat own-stat own-stat--success">
          <span className="ui-stat-icon ui-stat-icon--success"><span className="material-icons-round" aria-hidden="true">payments</span></span>
          <div className="ui-stat-content">
            <h3 className="ui-stat-label own-stat-label">Ingresos Totales</h3>
            <p className="ui-stat-value own-stat-value ui-text-success">${formatCurrency(stats?.totalRevenue)}</p>
          </div>
        </div>

        <div className="ui-stat own-stat own-stat--primary">
          <span className="ui-stat-icon ui-stat-icon--primary"><span className="material-icons-round" aria-hidden="true">shopping_bag</span></span>
          <div className="ui-stat-content">
            <h3 className="ui-stat-label own-stat-label">Órdenes Completadas</h3>
            <p className="ui-stat-value own-stat-value ui-text-primary">{stats?.completedOrders || 0}</p>
            <span className="own-stat-sub">de {stats?.totalOrders || 0} total</span>
          </div>
        </div>

        <div className="ui-stat own-stat own-stat--warning">
          <span className="ui-stat-icon ui-stat-icon--warning"><span className="material-icons-round" aria-hidden="true">hourglass_top</span></span>
          <div className="ui-stat-content">
            <h3 className="ui-stat-label own-stat-label">Órdenes Pendientes</h3>
            <p className="ui-stat-value own-stat-value ui-text-warning">{stats?.pendingOrders || 0}</p>
          </div>
        </div>

        <div className="ui-stat own-stat own-stat--teal">
          <span className="ui-stat-icon ui-stat-icon--teal"><span className="material-icons-round" aria-hidden="true">inventory_2</span></span>
          <div className="ui-stat-content">
            <h3 className="ui-stat-label own-stat-label">Productos Activos</h3>
            <p className="ui-stat-value own-stat-value">{stats?.activeProducts || 0}</p>
            <span className="own-stat-sub">de {stats?.totalProducts || 0} total</span>
          </div>
        </div>

        {stats?.lowStockProducts > 0 && (
          <div className="ui-stat own-stat own-stat--danger">
            <span className="ui-stat-icon ui-stat-icon--danger"><span className="material-icons-round" aria-hidden="true">warning_amber</span></span>
            <div className="ui-stat-content">
              <h3 className="ui-stat-label own-stat-label">Stock Bajo</h3>
              <p className="ui-stat-value own-stat-value ui-text-danger">{stats.lowStockProducts}</p>
              <span className="own-stat-sub">productos necesitan reabastecimiento</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ===== ORDERS TAB =====
function OrdersTab({ orders, onSelectOrder, onOpenHistoricalModal }) {
  const [filter, setFilter] = useState('pending');
  const [clientSearch, setClientSearch] = useState('');

  const filteredOrders = orders.filter(order => {
    // Basic status filter
    let statusMatch = false;
    if (filter === 'pending') {
      statusMatch = order.estado === 'PENDIENTE' || order.estado === 'CONFIRMADO' || order.estado === 'PENDING_PROMOTION_COMPLETION';
    } else if (filter === 'completed') {
      statusMatch = order.estado === 'COMPLETADO';
    } else if (filter === 'cancelled') {
      statusMatch = order.estado === 'ANULADA' || order.estado === 'CANCELADO';
    } else if (filter === 'historical') {
      // Logic for historical invoices: orders with NO items but have a total
      statusMatch = (!order.items || order.items.length === 0) && parseFloat(order.total) > 0;
    } else if (filter === 'all') {
      statusMatch = true;
    } else {
      statusMatch = order.estado === filter;
    }

    // Comprehensive search filter
    let searchMatch = true;
    if (clientSearch.trim()) {
      const searchStr = clientSearch.toLowerCase().trim();

      // Search fields
      const clientName = String(order.cliente || '').toLowerCase();
      const vendorName = String(order.vendedor || '').toLowerCase(); // If available in owner view

      // Additional client fields if available in order object (often flattened or joined)
      // Check if order object has these fields, or fallback to safe empty strings
      const clientPhone = String(order.clientePhone || order.telefono || '').toLowerCase();
      const clientAddress = String(order.clienteAddress || order.direccion || '').toLowerCase();
      const clientNit = String(order.clienteNit || order.nit || '').toLowerCase();
      const representative = String(order.representanteLegal || '').toLowerCase();

      // Search in items
      const productNames = (order.items || [])
        .map(item => String(item.productName || item.nombre || '').toLowerCase())
        .join(' ');

      searchMatch =
        clientName.includes(searchStr) ||
        // Factura ("1500", "#1500"), pedido ("123", "P-123", "p123") o parte del id
        orderReferenceMatches(order, searchStr) ||
        vendorName.includes(searchStr) ||
        clientPhone.includes(searchStr) ||
        clientAddress.includes(searchStr) ||
        clientNit.includes(searchStr) ||
        representative.includes(searchStr) ||
        productNames.includes(searchStr);
    }

    return statusMatch && searchMatch;
  });

  return (
    <div className="own-tab own-orders">
      <header className="ui-page-header">
        <div className="ui-page-heading">
          <h2 className="ui-page-title"><span className="material-icons-round" aria-hidden="true">assignment</span> Gestión de Órdenes</h2>
        </div>
        <div className="ui-page-actions">
          <button
            type="button"
            className="ui-btn ui-btn--secondary"
            onClick={onOpenHistoricalModal}
          >
            <span className="material-icons-round" aria-hidden="true">history</span>
            Factura Histórica
          </button>
        </div>
      </header>

      <div className="ui-toolbar own-orders-toolbar">
        <div className="ui-search own-orders-search">
          <span className="material-icons-round ui-search-icon" aria-hidden="true">search</span>
          <input
            type="text"
            className="ui-input"
            aria-label="Buscar órdenes"
            placeholder="Buscar por cliente, representante, factura, pedido (P-123), NIT..."
            value={clientSearch}
            onChange={(e) => setClientSearch(e.target.value)}
          />
        </div>
        <div className="ui-tabs own-orders-filters" role="group" aria-label="Filtrar órdenes">
          <button
            type="button"
            className={`ui-tab${filter === 'pending' ? ' is-active' : ''}`}
            aria-pressed={filter === 'pending'}
            onClick={() => setFilter('pending')}
          >
            <span className="material-icons-round" aria-hidden="true">pending_actions</span> Pendientes ({orders.filter(o => o.estado === 'PENDIENTE' || o.estado === 'CONFIRMADO').length})
          </button>
          <button
            type="button"
            className={`ui-tab${filter === 'completed' ? ' is-active' : ''}`}
            aria-pressed={filter === 'completed'}
            onClick={() => setFilter('completed')}
          >
            <span className="material-icons-round" aria-hidden="true">check_circle</span> Completadas ({orders.filter(o => o.estado === 'COMPLETADO').length})
          </button>
          <button
            type="button"
            className={`ui-tab${filter === 'all' ? ' is-active' : ''}`}
            aria-pressed={filter === 'all'}
            onClick={() => setFilter('all')}
          >
            <span className="material-icons-round" aria-hidden="true">analytics</span> Todas ({orders.length})
          </button>

          <div className="own-tabs-divider" aria-hidden="true"></div>

          <button
            type="button"
            className={`ui-tab own-filter--danger${filter === 'cancelled' ? ' is-active' : ''}`}
            aria-pressed={filter === 'cancelled'}
            onClick={() => setFilter('cancelled')}
          >
            <span className="material-icons-round" aria-hidden="true">block</span> Anuladas ({orders.filter(o => o.estado === 'ANULADA' || o.estado === 'CANCELADO').length})
          </button>

          <button
            type="button"
            className={`ui-tab own-filter--warning${filter === 'historical' ? ' is-active' : ''}`}
            aria-pressed={filter === 'historical'}
            onClick={() => setFilter('historical')}
          >
            <span className="material-icons-round" aria-hidden="true">history</span> Historia ({orders.filter(o => !o.items || o.items.length === 0).length})
          </button>
        </div>
      </div>

      <div className="own-orders-grid ui-stagger">
        {filteredOrders.length === 0 ? (
          <div className="ui-empty own-grid-span">
            <span className="material-icons-round ui-empty-icon" aria-hidden="true">search_off</span>
            <p className="ui-empty-title">No se encontraron órdenes</p>
          </div>
        ) : (
          filteredOrders.map(order => {
            // Determine payment status class
            const paymentStatusClass = order.paymentStatus
              ? `payment-${order.paymentStatus.toLowerCase()}`
              : '';

            return (
              <article key={order.id} className={`ui-card own-order-card ${order.isSROrder ? 'is-sr' : 'is-normal'} ${paymentStatusClass}`}>
                <div className="own-order-head">
                  {/* wrap: con "Factura #N · Pedido P-N" los badges bajan de línea en vez de partir la etiqueta */}
                  <div className="own-order-ids">
                    <span className="order-id own-order-id">
                      {formatOrderLabel(order)}
                    </span>
                    {order.isSROrder && (
                      <span className="tag-badge tag-sr">S/N</span>
                    )}
                    {/* Payment Status Badge */}
                    {order.paymentStatus && (
                      <span className={`ui-badge ${order.paymentStatus === 'PAID' ? 'ui-badge--success' : order.paymentStatus === 'PARTIAL' ? 'ui-badge--warning' : 'ui-badge--neutral'}`}>
                        <span className="material-icons-round" aria-hidden="true">
                          {order.paymentStatus === 'PAID' ? 'check_circle' : order.paymentStatus === 'PARTIAL' ? 'pending' : 'schedule'}
                        </span>
                        {order.paymentStatus === 'PAID' ? 'Pagado' : order.paymentStatus === 'PARTIAL' ? 'Parcial' : 'Pendiente'}
                      </span>
                    )}
                  </div>
                  <span className={`${orderStatusBadgeClass(order.estado)} own-order-status`}>
                    {order.estado || 'PENDIENTE'}
                  </span>
                </div>

                <div className="own-order-meta">
                  <p><strong>Vendedor:</strong> {order.vendedor}</p>
                  <p><strong>Cliente:</strong> {order.cliente}</p>
                  <p>
                    <strong>{order.estado === 'COMPLETADO' ? 'Fecha factura:' : 'Fecha:'}</strong>{' '}
                    {order.estado === 'COMPLETADO' && order.completedAt
                      ? new Date(order.completedAt).toLocaleDateString('es-ES')
                      : new Date(order.fecha).toLocaleString('es-ES')}
                  </p>
                  <p className="own-order-total">
                    <strong>Total:</strong> ${formatCurrency(order.total)}
                  </p>
                  {order.discountedTotal && order.discountedTotal !== order.total && (
                    <p className="own-order-discount">
                      <span className="material-icons-round" aria-hidden="true">discount</span>
                      <strong>Con descuento:</strong>
                      <span className="own-order-discount-value">${formatCurrency(order.discountedTotal)}</span>
                    </p>
                  )}

                  {order.notas && (
                    <div className="own-order-notes">
                      <strong><span className="material-icons-round" aria-hidden="true">note</span> Notes:</strong>
                      <p>{order.notas}</p>
                    </div>
                  )}
                </div>

                <details className="own-order-items">
                  <summary>Ver productos ({order.items.length})</summary>
                  <ul>
                    {order.items.map((item, idx) => (
                      <li key={idx}>
                        <span className="own-item-name">{item.productName}</span>
                        <span className="own-item-qty">
                          {item.cantidad} x ${formatCurrency(item.precioUnitario)}
                        </span>
                        <span className="own-item-subtotal">
                          ${formatCurrency(item.subtotal)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>

                <div className="ui-card-footer own-order-actions">
                  <button
                    type="button"
                    className="ui-btn ui-btn--secondary ui-btn--block"
                    onClick={() => onSelectOrder(order)}
                  >
                    <span className="material-icons-round" aria-hidden="true">edit</span>
                    Gestionar Orden / Pagos
                  </button>
                </div>
              </article>
            );
          }))
        }
      </div>
    </div>
  );
}

// ===== ✅ PRODUCTS TAB - CORREGIDO =====
function ProductsTab({ products, tags, onRefresh }) {
  const [filter, setFilter] = useState('all');
  const [activeTagId, setActiveTagId] = useState(null);
  const [localProducts, setLocalProducts] = useState(products);
  const [loading, setLoading] = useState(false);
  // Columnas de la cuadrícula: se recuerdan por usuario (CONVENTIONS §10). Antes se leía
  // 'ownerGridColumns' pero nunca se escribía, por eso al recargar volvía siempre a 2.
  // El filtro (Todos/Activos/Stock Bajo) y la etiqueta son filtros de datos: no se recuerdan.
  const [gridColumns, setGridColumns] = usePersistentState('owner.products.columns', 2, { allowed: OWNER_PRODUCT_COLUMNS, sync: true });

  // Etiqueta cuyos productos se ven ahora y número de la última petición (al cambiar de etiqueta
  // mientras llega una recarga, la respuesta de la etiqueta anterior no pisa a la nueva)
  const shownTagRef = useRef(null);
  const tagRequestSeqRef = useRef(0);

  const fetchProductsByTag = useCallback(async () => {
    const requestId = ++tagRequestSeqRef.current;
    const isLatest = () => requestId === tagRequestSeqRef.current;
    // "Filtrando productos..." solo al elegir otra etiqueta; si el dashboard recargó los
    // productos con la misma etiqueta, la cuadrícula se actualiza en su lugar
    const silent = shownTagRef.current === activeTagId;
    try {
      if (!silent) setLoading(true);
      const res = await client.get(`/admin/products/tag/${activeTagId}`);
      if (isLatest()) {
        setLocalProducts(res.data);
        shownTagRef.current = activeTagId;
      }
    } catch (error) {
      console.error("Error filtering by tag");
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [activeTagId]);

  useEffect(() => {
    if (activeTagId) {
      fetchProductsByTag();
    } else {
      tagRequestSeqRef.current += 1; // una petición de etiqueta en vuelo ya no aplica
      shownTagRef.current = null;
      setLoading(false);
      setLocalProducts(products);
    }
  }, [activeTagId, products, fetchProductsByTag]);

  const filteredProducts = localProducts.filter(product => {
    if (filter === 'all') return true;
    if (filter === 'active') return product.active;
    if (filter === 'inactive') return !product.active;
    if (filter === 'lowstock') return product.stock < 10 && product.active;
    return true;
  });

  return (
    <div className="own-tab own-products">
      <header className="ui-page-header">
        <div className="ui-page-heading">
          <h2 className="ui-page-title">
            <span className="material-icons-round" aria-hidden="true">inventory_2</span>
            Inventario de Productos
          </h2>
        </div>
      </header>

      <div className="ui-toolbar own-products-toolbar">
        <div className="ui-tabs" role="group" aria-label="Filtrar productos">
          <button
            type="button"
            className={`ui-tab${filter === 'all' ? ' is-active' : ''}`}
            aria-pressed={filter === 'all'}
            onClick={() => setFilter('all')}
          >
            Todos ({products.length})
          </button>
          <button
            type="button"
            className={`ui-tab${filter === 'active' ? ' is-active' : ''}`}
            aria-pressed={filter === 'active'}
            onClick={() => setFilter('active')}
          >
            Activos ({products.filter(p => p.active).length})
          </button>
          <button
            type="button"
            className={`ui-tab${filter === 'lowstock' ? ' is-active' : ''}`}
            aria-pressed={filter === 'lowstock'}
            onClick={() => setFilter('lowstock')}
          >
            Stock Bajo ({products.filter(p => p.stock < 10 && p.active).length})
          </button>
        </div>
        <span className="ui-toolbar-spacer" aria-hidden="true"></span>
        <div className="ui-tabs own-grid-selector" role="group" aria-label="Columnas de la cuadrícula">
          {OWNER_PRODUCT_COLUMNS.map(cols => (
            <button
              key={cols}
              type="button"
              className={`ui-tab own-grid-btn${gridColumns === cols ? ' is-active' : ''}`}
              aria-pressed={gridColumns === cols}
              onClick={() => setGridColumns(cols)}
              title={`${cols} columnas`}
            >
              <span className="material-icons-round" aria-hidden="true">dashboard</span>
              {cols}
            </button>
          ))}
        </div>
      </div>

      <TagFilterBar
        tags={tags}
        activeTagId={activeTagId}
        onSelectTag={setActiveTagId}
        onClear={() => setActiveTagId(null)}
      />

      {loading ? (
        <div className="ui-loading" role="status">
          <span className="ui-spinner" aria-hidden="true"></span>
          Filtrando productos...
        </div>
      ) : (
        <div className={`own-products-grid own-products-grid--cols-${gridColumns} ui-stagger`}>
          {filteredProducts.map(product => (
            <article key={product.id} className="ui-card ui-card--flush own-product-card">
              <div className="own-product-media">
                {/* ✅ IMAGEN CORREGIDA */}
                <img
                  src={product.imageUrl || PLACEHOLDER_IMAGE}
                  alt={product.nombre}
                  onError={(e) => {
                    console.warn(`⚠️ Error cargando imagen: ${product.imageUrl}`);
                    e.target.src = PLACEHOLDER_IMAGE;
                  }}
                  loading="lazy"
                  decoding="async"
                />
              </div>

              <div className="own-product-body">
                <div className="own-product-head">
                  <h3 className="ui-card-title">{product.nombre}</h3>
                  {product.tagName && <TagBadge tagName={product.tagName} />}
                </div>
                <p className="own-product-desc">{product.descripcion}</p>

                {/* Precio en azul; stock en verde, o en rojo cuando es bajo (mismo umbral de siempre) */}
                <div className="own-product-stats">
                  <div className="own-product-stat own-product-stat--price">
                    <span className="own-product-stat-label">Precio:</span>
                    <span className="own-product-stat-value">${formatCurrency(product.precio)}</span>
                  </div>
                  <div className={`own-product-stat own-product-stat--stock${product.stock < 10 ? ' is-low' : ''}`}>
                    <span className="own-product-stat-label">Stock:</span>
                    <span className={`own-product-stat-value ${product.stock < 10 ? 'is-low' : ''}`}>
                      {product.stock} unidades
                    </span>
                  </div>
                </div>

                <div className="own-product-status">
                  <span className={`ui-badge ${product.active ? 'ui-badge--success' : 'ui-badge--neutral'}`}>
                    {product.active ? <><span className="material-icons-round" aria-hidden="true">check_circle</span> Activo</> : <><span className="material-icons-round" aria-hidden="true">cancel</span> Inactivo</>}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}


// ===== REPORTS TAB =====
// ===== REPORTS TAB =====
function ReportsTab({ orders, products, vendedores, refreshTrigger }) {
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  // "Actualizar" de esta pestaña: spinner en el botón; el reporte que se ve no se vacía
  const [refreshing, setRefreshing] = useState(false);
  const reportRequestSeqRef = useRef(0);
  const [dateRange, setDateRange] = useState({
    startDate: new Date(new Date().setMonth(new Date().getMonth() - 1))
      .toISOString()
      .split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });

  const toast = useToast();
  const [activeReportTab, setActiveReportTab] = useState('overview');
  const [exporting, setExporting] = useState(false);
  // Qué botón de exportación se pulsó (solo presentación): el spinner y "Exportando..." van solo
  // en ese botón; los demás siguen deshabilitados mientras exporting sea true, como siempre.
  const [exportingKey, setExportingKey] = useState(null);

  useEffect(() => {
    if (!exporting) setExportingKey(null);
  }, [exporting]);

  // Al abrir la pestaña y al cambiar las fechas (lo pide el dueño): esqueletos
  useEffect(() => {
    loadReport('dates');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange.startDate, dateRange.endDate]);

  // Recarga del dashboard (INVENTORY_UPDATE o "Actualizar" del menú): mismo reporte, mismas
  // fechas que eligió el dueño, en silencio (antes la pestaña se remontaba y volvía al último mes)
  const lastRefreshTriggerRef = useRef(refreshTrigger);
  useEffect(() => {
    if (refreshTrigger === lastRefreshTriggerRef.current) return;
    lastRefreshTriggerRef.current = refreshTrigger;
    loadReport('background');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger]);

  // mode: 'dates' (primera carga o fechas nuevas: esqueletos), 'manual' (botón Actualizar de
  // la pestaña: spinner en el botón) o 'background' (recarga del dashboard: sin indicador).
  // Solo la última petición se aplica: cambiar las fechas mientras llega una recarga no deja
  // en pantalla el reporte del rango anterior.
  const loadReport = async (mode) => {
    const requestId = ++reportRequestSeqRef.current;
    const isLatest = () => requestId === reportRequestSeqRef.current;
    try {
      if (mode === 'dates') setLoading(true);
      if (mode === 'manual') setRefreshing(true);
      const response = await client.get('/owner/reports/complete', {
        params: {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
        },
      });
      if (isLatest()) setReportData(response.data);
    } catch (error) {
      console.error('Error al cargar reportes:', error);
      // El reporte que ya se ve se queda; el aviso de siempre
      if (isLatest()) toast.error('Error al cargar reportes');
    } finally {
      if (isLatest()) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  const fetchReportData = () => loadReport('manual');

  const handleDateChange = (field, value) => {
    setDateRange((prev) => ({ ...prev, [field]: value }));
  };

  // =========================
  // Helpers de descarga
  // =========================

  const getExtensionByFormat = (format) => {
    switch (format) {
      case 'excel':
        return 'xlsx';
      case 'pdf':
        return 'pdf';
      case 'csv':
        return 'csv';
      default:
        return format; // fallback
    }
  };

  const getFilenameFromContentDisposition = (contentDisposition) => {
    if (!contentDisposition) return null;

    // Soporta filename= y filename*=UTF-8''
    // Ej: attachment; filename="reporte.xlsx"
    // Ej: attachment; filename*=UTF-8''reporte.xlsx
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

    // Evita memory leak por múltiples createObjectURL
    window.URL.revokeObjectURL(url);
  };

  // =========================
  // Export: completo
  // =========================
  const handleExportReport = async (format) => {
    if (exporting) return;

    try {
      setExporting(true);

      // OJO: tu client.js ya tiene baseURL = http://localhost:8080/api
      // Entonces aquí SIEMPRE va sin /api al inicio.
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

  // =========================
  // Export: específico
  // =========================
  const handleExportSpecific = async (type, format) => {
    if (exporting) return;

    try {
      setExporting(true);

      let endpoint = '';
      let params = undefined;

      switch (type) {
        case 'sales':
          endpoint = `/reports/export/sales/${format}`;
          params = {
            startDate: dateRange.startDate,
            endDate: dateRange.endDate,
          };
          break;
        case 'products':
          endpoint = `/reports/export/products/${format}`;
          params = undefined;
          break;
        case 'clients':
          endpoint = `/reports/export/clients/${format}`;
          params = undefined;
          break;
        default:
          toast.error('Tipo de reporte inválido');
          return;
      }

      const response = await client.get(endpoint, {
        params,
        responseType: 'blob',
      });

      const ext = getExtensionByFormat(format);
      const timestamp = new Date().toISOString().split('T')[0];
      const fallbackName = `reporte_${type}_${timestamp}.${ext}`;

      downloadAxiosBlob(response, fallbackName);
      toast.success(`Reporte de ${type} descargado exitosamente`);
    } catch (error) {
      console.error(`Error al exportar ${type}:`, error);
    } finally {
      setExporting(false);
    }
  };

  // =========================
  // Export: Vendedor Individual
  // =========================
  const handleExportVendorReport = async (vendorId, format) => {
    if (exporting) return;

    try {
      setExporting(true);
      const response = await client.get(`/reports/export/vendor/${vendorId}/${format}`, {
        params: {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
        },
        responseType: 'blob',
      });

      const ext = getExtensionByFormat(format);
      const timestamp = new Date().toISOString().split('T')[0];
      const fallbackName = `reporte_vendedor_${vendorId}_${timestamp}.${ext}`;

      downloadAxiosBlob(response, fallbackName);
      toast.success(`Reporte de vendedor descargado exitosamente`);
    } catch (error) {
      console.error('Error al exportar reporte de vendedor:', error);
      toast.error('Error al exportar reporte de vendedor');
    } finally {
      setExporting(false);
    }
  };

  // =========================
  // Render
  // =========================
  // Solo el botón pulsado muestra la carga (los demás quedan deshabilitados por `exporting`)
  const isExportBusy = (key) => exporting && exportingKey === key;

  // Esqueletos con la forma del reporte (tarjetas de estadística y gráfico) bajo el aviso
  // "Generando reportes..." de siempre
  const reportSkeleton = (
    <div className="ui-loading own-tab own-report-loading" role="status">
      <p className="own-report-loading-label">
        <span className="ui-spinner" aria-hidden="true"></span>
        Generando reportes...
      </p>
      <div className="ui-stat-grid own-stat-grid" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="ui-stat own-stat own-stat--skeleton">
            <span className="ui-skeleton own-skeleton-tile" />
            <div className="ui-skeleton-stack own-skeleton-lines">
              <span className="ui-skeleton ui-skeleton--text" style={{ width: '60%' }} />
              <span className="ui-skeleton ui-skeleton--title" style={{ width: '80%' }} />
            </div>
          </div>
        ))}
      </div>
      <span className="ui-skeleton ui-skeleton--block own-skeleton-chart" aria-hidden="true" />
    </div>
  );

  // Toda la pestaña en esqueleto solo mientras no hay reporte todavía. Con fechas nuevas el
  // esqueleto va solo en el contenido: las fechas que se están eligiendo siguen montadas.
  if (loading && !reportData) {
    return reportSkeleton;
  }

  if (!reportData) {
    return (
      <div className="ui-empty">
        <span className="material-icons-round ui-empty-icon" aria-hidden="true">insights</span>
        <p className="ui-empty-title">No hay datos disponibles</p>
      </div>
    );
  }

  // Aviso flotante: qué archivo se está generando (formato e informe del botón pulsado)
  const exportingFile = (() => {
    if (!exporting || !exportingKey) return null;
    const parts = exportingKey.split(':');
    const scope = parts[0];
    const format = parts[parts.length - 1];
    if (!EXPORT_FORMATS[format]) return null;
    let name = EXPORT_REPORT_NAMES[scope] || 'Reporte';
    if (scope === 'vendor') {
      const vendorId = parts.slice(1, -1).join(':');
      const vendedor = (vendedores || []).find((v) => String(v.id) === vendorId);
      const fromReport = (reportData.vendorReport?.topVendors || []).find((v) => String(v.vendorId) === vendorId);
      const vendorName = vendedor?.username || vendedor?.name || fromReport?.vendorName;
      name = vendorName ? `Reporte de ${vendorName}` : 'Reporte de vendedor';
    }
    return { kind: format, icon: EXPORT_FORMATS[format].icon, name, ext: getExtensionByFormat(format) };
  })();

  return (
    <div className="own-tab own-reports">
      <header className="ui-page-header">
        <div className="ui-page-heading">
          <h2 className="ui-page-title">
            <span className="material-icons-round" aria-hidden="true">insights</span>
            Sistema de Reportes
          </h2>
        </div>
      </header>

      {/* Periodo y exportación completa lado a lado desde 1024px (una columna en móvil) */}
      <div className="own-report-controls">
        <section className="ui-card own-report-period" aria-label="Periodo del reporte">
          <div className="ui-section-head own-report-head">
            <span className="ui-icon-tile ui-icon-tile--primary" aria-hidden="true">
              <span className="material-icons-round">date_range</span>
            </span>
            <div>
              <h3 className="ui-section-title">Periodo del reporte</h3>
            </div>
          </div>
          <div className="own-date-range">
            <label className="ui-field own-date-field">
              <span className="ui-label">Desde:</span>
              <input
                type="date"
                className="ui-input"
                value={dateRange.startDate}
                onChange={(e) => handleDateChange('startDate', e.target.value)}
              />
            </label>

            <label className="ui-field own-date-field">
              <span className="ui-label">Hasta:</span>
              <input
                type="date"
                className="ui-input"
                value={dateRange.endDate}
                onChange={(e) => handleDateChange('endDate', e.target.value)}
              />
            </label>

            <button
              type="button"
              onClick={fetchReportData}
              className={`ui-btn ui-btn--secondary own-date-refresh${refreshing ? ' is-loading' : ''}`}
              disabled={loading || refreshing || exporting}
              aria-busy={refreshing || undefined}
            >
              {refreshing
                ? <span className="ui-spinner" aria-hidden="true"></span>
                : <span className="material-icons-round" aria-hidden="true">sync</span>}
              Actualizar
            </button>
          </div>
        </section>

        <section className="ui-card own-report-export">
          <div className="ui-section-head own-report-head">
            <span className="ui-icon-tile ui-icon-tile--success" aria-hidden="true">
              <span className="material-icons-round">download</span>
            </span>
            <div>
              <h3 className="ui-section-title">Exportar Reporte Completo</h3>
              <p className="ui-section-desc">Ventas, productos, vendedores y clientes del periodo elegido.</p>
            </div>
          </div>
          {/* PDF rojo, Excel verde, CSV azul; columnas iguales: el texto de carga no mueve nada */}
          <div className="own-export-grid">
            <button
              type="button"
              onClickCapture={() => setExportingKey('complete:pdf')}
              onClick={() => handleExportReport('pdf')}
              disabled={exporting}
              className={`ui-btn ui-btn--pdf${isExportBusy('complete:pdf') ? ' is-loading' : ''}`}
              aria-busy={isExportBusy('complete:pdf') || undefined}
            >
              <ExportLabel kind="pdf" busy={isExportBusy('complete:pdf')} label="Descargar PDF" />
            </button>

            <button
              type="button"
              onClickCapture={() => setExportingKey('complete:excel')}
              onClick={() => handleExportReport('excel')}
              disabled={exporting}
              className={`ui-btn ui-btn--excel${isExportBusy('complete:excel') ? ' is-loading' : ''}`}
              aria-busy={isExportBusy('complete:excel') || undefined}
            >
              <ExportLabel kind="excel" busy={isExportBusy('complete:excel')} label="Descargar Excel" />
            </button>

            <button
              type="button"
              onClickCapture={() => setExportingKey('complete:csv')}
              onClick={() => handleExportReport('csv')}
              disabled={exporting}
              className={`ui-btn ui-btn--csv${isExportBusy('complete:csv') ? ' is-loading' : ''}`}
              aria-busy={isExportBusy('complete:csv') || undefined}
            >
              <ExportLabel kind="csv" busy={isExportBusy('complete:csv')} label="Descargar CSV" />
            </button>
          </div>
        </section>
      </div>

      <nav className="ui-tabs own-report-tabs" aria-label="Secciones del reporte">
        <button
          type="button"
          className={`ui-tab${activeReportTab === 'overview' ? ' is-active' : ''}`}
          aria-current={activeReportTab === 'overview' ? 'page' : undefined}
          onClick={() => setActiveReportTab('overview')}
        >
          <span className="material-icons-round" aria-hidden="true">dashboard</span>
          Resumen General
        </button>

        <button
          type="button"
          className={`ui-tab${activeReportTab === 'sales' ? ' is-active' : ''}`}
          aria-current={activeReportTab === 'sales' ? 'page' : undefined}
          onClick={() => setActiveReportTab('sales')}
        >
          <span className="material-icons-round" aria-hidden="true">payments</span>
          Ventas
        </button>

        <button
          type="button"
          className={`ui-tab${activeReportTab === 'products' ? ' is-active' : ''}`}
          aria-current={activeReportTab === 'products' ? 'page' : undefined}
          onClick={() => setActiveReportTab('products')}
        >
          <span className="material-icons-round" aria-hidden="true">inventory_2</span>
          Productos
        </button>

        <button
          type="button"
          className={`ui-tab${activeReportTab === 'vendors' ? ' is-active' : ''}`}
          aria-current={activeReportTab === 'vendors' ? 'page' : undefined}
          onClick={() => setActiveReportTab('vendors')}
        >
          <span className="material-icons-round" aria-hidden="true">groups</span>
          Vendedores
        </button>

        <button
          type="button"
          className={`ui-tab${activeReportTab === 'clients' ? ' is-active' : ''}`}
          aria-current={activeReportTab === 'clients' ? 'page' : undefined}
          onClick={() => setActiveReportTab('clients')}
        >
          <span className="material-icons-round" aria-hidden="true">storefront</span>
          Clientes
        </button>
      </nav>

      {loading ? reportSkeleton : (
      <div className="own-report-content">
        {activeReportTab === 'overview' && <OverviewReport data={reportData} />}

        {activeReportTab === 'sales' && (
          <>
            <div className="ui-actions ui-actions--end own-export-specific">
              <button
                type="button"
                onClickCapture={() => setExportingKey('sales:pdf')}
                onClick={() => handleExportSpecific('sales', 'pdf')}
                disabled={exporting}
                className={`ui-btn ui-btn--pdf ui-btn--sm${isExportBusy('sales:pdf') ? ' is-loading' : ''}`}
                aria-busy={isExportBusy('sales:pdf') || undefined}
              >
                <ExportLabel kind="pdf" busy={isExportBusy('sales:pdf')} label="Exportar Ventas a PDF" />
              </button>
            </div>
            <SalesReport data={reportData.salesReport} />
          </>
        )}

        {activeReportTab === 'products' && (
          <>
            <div className="ui-actions ui-actions--end own-export-specific">
              <button
                type="button"
                onClickCapture={() => setExportingKey('products:excel')}
                onClick={() => handleExportSpecific('products', 'excel')}
                disabled={exporting}
                className={`ui-btn ui-btn--excel ui-btn--sm${isExportBusy('products:excel') ? ' is-loading' : ''}`}
                aria-busy={isExportBusy('products:excel') || undefined}
              >
                <ExportLabel kind="excel" busy={isExportBusy('products:excel')} label="Exportar Productos a Excel" />
              </button>
            </div>
            <ProductsReport data={reportData.productReport} />
          </>
        )}

        {activeReportTab === 'vendors' && (
          <VendorsReport
            data={reportData.vendorReport}
            vendedores={vendedores}
            onExport={handleExportVendorReport}
            exporting={exporting}
            exportingKey={exportingKey}
            onExportStart={setExportingKey}
          />
        )}

        {activeReportTab === 'clients' && (
          <>
            <div className="ui-actions ui-actions--end own-export-specific">
              <button
                type="button"
                onClickCapture={() => setExportingKey('clients:csv')}
                onClick={() => handleExportSpecific('clients', 'csv')}
                disabled={exporting}
                className={`ui-btn ui-btn--csv ui-btn--sm${isExportBusy('clients:csv') ? ' is-loading' : ''}`}
                aria-busy={isExportBusy('clients:csv') || undefined}
              >
                <ExportLabel kind="csv" busy={isExportBusy('clients:csv')} label="Exportar Clientes a CSV" />
              </button>
            </div>
            <ClientsReport data={reportData.clientReport} />
          </>
        )}
      </div>
      )}

      {/* Tarjeta flotante mientras se genera la descarga (no bloquea la pantalla): spinner en
          el color del formato, qué archivo se genera y una barra indeterminada */}
      {exporting && (
        <div
          className={`own-exporting${exportingFile ? ` own-exporting--${exportingFile.kind}` : ''}`}
          role="status"
          aria-live="polite"
        >
          <div className="own-exporting-message">
            <span className="own-exporting-icon" aria-hidden="true">
              <span className="ui-spinner"></span>
            </span>
            <div className="own-exporting-text">
              <p className="own-exporting-title">Generando y descargando reporte...</p>
              {exportingFile && (
                <p className="own-exporting-file">
                  <span className="material-icons-round" aria-hidden="true">{exportingFile.icon}</span>
                  <span className="own-exporting-name">{exportingFile.name}</span>
                  <span className="own-exporting-ext">.{exportingFile.ext}</span>
                </p>
              )}
            </div>
            <span className="own-exporting-bar" aria-hidden="true"></span>
          </div>
        </div>
      )}
    </div>
  );
}



// ===== OVERVIEW REPORT =====
function OverviewReport({ data }) {
  const { salesReport, productReport, clientReport } = data;

  return (
    <div className="own-report-section">
      <div className="ui-stat-grid own-stat-grid ui-stagger">
        <div className="ui-stat own-stat own-stat--success">
          <span className="ui-stat-icon ui-stat-icon--success"><span className="material-icons-round" aria-hidden="true">payments</span></span>
          <div className="ui-stat-content">
            <h3 className="ui-stat-label own-stat-label">Ingresos Totales</h3>
            <p className="ui-stat-value own-stat-value ui-text-success">${formatCurrency(salesReport.totalRevenue)}</p>
            <span className="own-stat-sub">
              Promedio por orden: ${formatCurrency(salesReport.averageOrderValue)}
            </span>
          </div>
        </div>

        <div className="ui-stat own-stat own-stat--primary">
          <span className="ui-stat-icon ui-stat-icon--primary"><span className="material-icons-round" aria-hidden="true">receipt_long</span></span>
          <div className="ui-stat-content">
            <h3 className="ui-stat-label own-stat-label">Órdenes</h3>
            <p className="ui-stat-value own-stat-value ui-text-primary">{salesReport.totalOrders}</p>
            <div className="own-breakdown">
              <span className="own-breakdown-item is-success"><span className="material-icons-round" aria-hidden="true">check_circle</span>{salesReport.completedOrders} completadas</span>
              <span className="own-breakdown-item is-warning"><span className="material-icons-round" aria-hidden="true">schedule</span>{salesReport.pendingOrders} pendientes</span>
              <span className="own-breakdown-item is-danger"><span className="material-icons-round" aria-hidden="true">cancel</span>{salesReport.canceledOrders} canceladas</span>
            </div>
          </div>
        </div>

        <div className="ui-stat own-stat own-stat--teal">
          <span className="ui-stat-icon ui-stat-icon--teal"><span className="material-icons-round" aria-hidden="true">inventory_2</span></span>
          <div className="ui-stat-content">
            <h3 className="ui-stat-label own-stat-label">Inventario</h3>
            <p className="ui-stat-value own-stat-value">{productReport.activeProducts}</p>
            <div className="own-breakdown">
              <span className="own-breakdown-item">Valor total: ${formatCurrency(productReport.totalInventoryValue)}</span>
              {productReport.lowStockProducts > 0 && (
                <span className="own-breakdown-item is-warning"><span className="material-icons-round" aria-hidden="true">warning</span>{productReport.lowStockProducts} con stock bajo</span>
              )}
            </div>
          </div>
        </div>

        <div className="ui-stat own-stat own-stat--sky">
          <span className="ui-stat-icon ui-stat-icon--sky"><span className="material-icons-round" aria-hidden="true">groups</span></span>
          <div className="ui-stat-content">
            <h3 className="ui-stat-label own-stat-label">Clientes</h3>
            <p className="ui-stat-value own-stat-value ui-text-primary">{clientReport.totalClients}</p>
            <span className="own-stat-sub">
              {clientReport.activeClients} activos
            </span>
          </div>
        </div>
      </div>

      <section className="ui-section own-chart-card">
        <h3 className="own-section-title">
          <span className="material-icons-round ui-icon-tile ui-icon-tile--sm ui-icon-tile--primary" aria-hidden="true">show_chart</span>
          Tendencia de Ventas
        </h3>
        <SalesChart data={salesReport.dailySales} />
      </section>

      <section className="ui-section own-chart-card">
        <h3 className="own-section-title">
          <span className="material-icons-round ui-icon-tile ui-icon-tile--sm ui-icon-tile--warning" aria-hidden="true">emoji_events</span>
          Top 5 Productos Más Vendidos
        </h3>
        <TopProductsChart data={productReport.topSellingProducts.slice(0, 5)} />
      </section>
    </div>
  );
}

// ===== SALES REPORT =====
function SalesReport({ data }) {
  // Proporción de cada estado sobre el total (0 si no hay órdenes): solo para dibujar las barras
  const shareOfOrders = (count) => progressValue(data.totalOrders > 0 ? (count / data.totalOrders) * 100 : 0);
  const rateTone = successRateTone(data.completedOrders, data.totalOrders);

  return (
    <div className="own-report-section">
      <div className="ui-stat-grid own-metrics ui-stagger">
        <div className="ui-stat own-stat own-metric own-stat--success">
          <span className="ui-stat-icon ui-stat-icon--success"><span className="material-icons-round" aria-hidden="true">payments</span></span>
          <div className="ui-stat-content">
            <h4 className="own-stat-label">Ingresos Totales</h4>
            <p className="ui-stat-value own-stat-value ui-text-success">${formatCurrency(data.totalRevenue)}</p>
          </div>
        </div>
        <div className="ui-stat own-stat own-metric own-stat--sky">
          <span className="ui-stat-icon ui-stat-icon--sky"><span className="material-icons-round" aria-hidden="true">functions</span></span>
          <div className="ui-stat-content">
            <h4 className="own-stat-label">Promedio por Orden</h4>
            <p className="ui-stat-value own-stat-value">${formatCurrency(data.averageOrderValue)}</p>
          </div>
        </div>
        <div className="ui-stat own-stat own-metric own-stat--primary">
          <span className="ui-stat-icon ui-stat-icon--primary"><span className="material-icons-round" aria-hidden="true">receipt_long</span></span>
          <div className="ui-stat-content">
            <h4 className="own-stat-label">Total Órdenes</h4>
            <p className="ui-stat-value own-stat-value ui-text-primary">{data.totalOrders}</p>
          </div>
        </div>
        <div className={`ui-stat own-stat own-metric own-stat--${rateTone}`}>
          <span className={`ui-stat-icon ui-stat-icon--${rateTone}`}><span className="material-icons-round" aria-hidden="true">verified</span></span>
          <div className="ui-stat-content">
            <h4 className="own-stat-label">Tasa de Éxito</h4>
            <p className={`ui-stat-value own-stat-value ui-text-${rateTone}`}>
              {data.totalOrders > 0
                ? ((data.completedOrders / data.totalOrders) * 100).toFixed(1)
                : 0}%
            </p>
          </div>
        </div>
      </div>

      <section className="ui-section own-status-breakdown">
        <h3 className="own-section-title">
          <span className="material-icons-round ui-icon-tile ui-icon-tile--sm ui-icon-tile--primary" aria-hidden="true">donut_small</span>
          Estado de Órdenes
        </h3>
        <div className="own-status-bars">
          <div className="own-status-bar own-status-bar--success">
            <div className="own-status-label">
              <span>Completadas</span>
              <span>{data.completedOrders}</span>
            </div>
            <div
              className="ui-progress ui-progress--lg ui-progress--success"
              style={{ '--value': shareOfOrders(data.completedOrders) }}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(shareOfOrders(data.completedOrders))}
              aria-label="Completadas"
            >
              <span className="ui-progress-bar" />
            </div>
          </div>
          <div className="own-status-bar own-status-bar--warning">
            <div className="own-status-label">
              <span>Pendientes</span>
              <span>{data.pendingOrders}</span>
            </div>
            <div
              className="ui-progress ui-progress--lg ui-progress--warning"
              style={{ '--value': shareOfOrders(data.pendingOrders) }}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(shareOfOrders(data.pendingOrders))}
              aria-label="Pendientes"
            >
              <span className="ui-progress-bar" />
            </div>
          </div>
          <div className="own-status-bar own-status-bar--danger">
            <div className="own-status-label">
              <span>Canceladas</span>
              <span>{data.canceledOrders}</span>
            </div>
            <div
              className="ui-progress ui-progress--lg ui-progress--danger"
              style={{ '--value': shareOfOrders(data.canceledOrders) }}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(shareOfOrders(data.canceledOrders))}
              aria-label="Canceladas"
            >
              <span className="ui-progress-bar" />
            </div>
          </div>
        </div>
      </section>

      <section className="ui-section own-chart-card">
        <h3 className="own-section-title">
          <span className="material-icons-round ui-icon-tile ui-icon-tile--sm ui-icon-tile--primary" aria-hidden="true">bar_chart</span>
          Ventas Diarias
        </h3>
        <SalesChart data={data.dailySales} />
      </section>

      <section className="ui-section own-table-card">
        <h3 className="own-section-title">
          <span className="material-icons-round ui-icon-tile ui-icon-tile--sm ui-icon-tile--sky" aria-hidden="true">calendar_month</span>
          Ventas Mensuales
        </h3>
        {/**
         * @typedef {Object} MonthlySalesDTO
         * @property {string} month - Month name in Spanish (e.g., "FEBRERO")
         * @property {number} monthNumber - Month number for sorting (1-12)
         * @property {number} year - Year
         * @property {number} revenue - Total revenue for the month
         * @property {number} orders - Number of orders
         */}
        <div className="ui-table-wrap">
          <table className="ui-table">
            <thead>
              <tr>
                <th>Mes</th>
                <th>Año</th>
                <th className="ui-num">Órdenes</th>
                <th className="ui-num">Ingresos</th>
              </tr>
            </thead>
            <tbody className="ui-stagger">
              {data.monthlySales.map((month, idx) => (
                <tr key={idx}>
                  <td>{month.month}</td>
                  <td className="ui-tabular">{month.year}</td>
                  <td className="ui-num">{month.orders}</td>
                  <td className="ui-num own-amount">${formatCurrency(month.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ===== ✅ PRODUCTS REPORT - CORREGIDO =====
function ProductsReport({ data }) {
  return (
    <div className="own-report-section">
      <div className="ui-stat-grid own-metrics ui-stagger">
        <div className="ui-stat own-stat own-metric own-stat--primary">
          <span className="ui-stat-icon ui-stat-icon--primary"><span className="material-icons-round" aria-hidden="true">inventory_2</span></span>
          <div className="ui-stat-content">
            <h4 className="own-stat-label">Total Productos</h4>
            <p className="ui-stat-value own-stat-value ui-text-primary">{data.totalProducts}</p>
          </div>
        </div>
        <div className="ui-stat own-stat own-metric own-stat--success">
          <span className="ui-stat-icon ui-stat-icon--success"><span className="material-icons-round" aria-hidden="true">check_circle</span></span>
          <div className="ui-stat-content">
            <h4 className="own-stat-label">Productos Activos</h4>
            <p className="ui-stat-value own-stat-value ui-text-success">{data.activeProducts}</p>
          </div>
        </div>
        <div className="ui-stat own-stat own-metric own-stat--teal">
          <span className="ui-stat-icon ui-stat-icon--teal"><span className="material-icons-round" aria-hidden="true">account_balance_wallet</span></span>
          <div className="ui-stat-content">
            <h4 className="own-stat-label">Valor Inventario</h4>
            <p className="ui-stat-value own-stat-value">${formatCurrency(data.totalInventoryValue)}</p>
          </div>
        </div>
        <div className="ui-stat own-stat own-metric own-stat--warning is-warning">
          <span className="ui-stat-icon ui-stat-icon--warning"><span className="material-icons-round" aria-hidden="true">warning_amber</span></span>
          <div className="ui-stat-content">
            <h4 className="own-stat-label">Stock Bajo</h4>
            <p className="ui-stat-value own-stat-value ui-text-warning">{data.lowStockProducts}</p>
          </div>
        </div>
      </div>

      <section className="ui-section own-list-card">
        <h3 className="own-section-title">
          <span className="material-icons-round ui-icon-tile ui-icon-tile--sm ui-icon-tile--warning" aria-hidden="true">emoji_events</span>
          Top 10 Productos Más Vendidos
        </h3>
        {/* Podio (#1 a #3) en ámbar, el resto en azul; ingresos en verde */}
        <div className="own-rank-list ui-stagger">
          {data.topSellingProducts.map((product, idx) => (
            <div key={idx} className="own-rank-item ui-row-hover">
              <div className={`own-rank-pos own-rank-badge${idx < 3 ? ' is-podium' : ''}`}>#{idx + 1}</div>
              <div className="own-rank-thumb">
                {/* ✅ IMAGEN CORREGIDA */}
                <img
                  src={product.imageUrl || PLACEHOLDER_IMAGE}
                  alt={product.productName}
                  width="40"
                  height="40"
                  onError={(e) => {
                    console.warn(`⚠️ Error cargando imagen: ${product.imageUrl}`);
                    e.target.src = PLACEHOLDER_IMAGE;
                  }}
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <div className="own-rank-details">
                <h4>{product.productName}</h4>
                <p>{product.quantitySold} unidades vendidas</p>
              </div>
              <div className="own-rank-amount ui-amount--success">
                ${formatCurrency(product.revenue)}
              </div>
            </div>
          ))}
        </div>
      </section>

      {data.lowStockDetails.length > 0 && (
        <section className="ui-section own-table-card">
          <h3 className="own-section-title">
            <span className="material-icons-round ui-icon-tile ui-icon-tile--sm ui-icon-tile--danger" aria-hidden="true">warning</span>
            Productos con Stock Bajo
          </h3>
          <div className="ui-table-wrap">
            <table className="ui-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th className="ui-num">Stock Actual</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.lowStockDetails.map((product, idx) => (
                  <tr key={idx}>
                    <td>{product.productName}</td>
                    <td className={`ui-num ${product.currentStock === 0 ? 'own-stock-out' : 'own-stock-low'}`}>
                      {product.currentStock}
                    </td>
                    <td>
                      <span className={`ui-badge ${product.status === 'SIN STOCK' ? 'ui-badge--danger' : 'ui-badge--warning'}`}>
                        {product.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

// ===== VENDORS REPORT =====
function VendorsReport({ data, vendedores, onExport, exporting, exportingKey, onExportStart }) {
  // Combinar todos los vendedores con sus estadísticas
  // Si un vendedor no tiene órdenes, sus stats serán 0
  const allVendorsWithStats = React.useMemo(() => {
    if (!vendedores || vendedores.length === 0) {
      return data.topVendors || [];
    }

    // Crear un mapa de vendedores con sus estadísticas
    const vendorStatsMap = new Map();

    // Agregar stats de vendedores con órdenes
    (data.topVendors || []).forEach(vendor => {
      // Index by vendorId (which can be UUID or Username)
      vendorStatsMap.set(String(vendor.vendorId), vendor);

      // Also index by vendorName roughly to help matching if IDs fail
      if (vendor.vendorName) {
        vendorStatsMap.set(vendor.vendorName, vendor);
      }
    });

    // Crear lista completa combinando todos los vendedores
    const completeList = vendedores.map(vendedor => {
      // 1. Try exact ID match
      let stats = vendorStatsMap.get(String(vendedor.id));

      // 2. If not found, try username match (for shared users like NinaTorres/YicelaSandoval)
      if (!stats && vendedor.username) {
        stats = vendorStatsMap.get(vendedor.username);
      }

      // 3. Fallback: try matching by name
      if (!stats && vendedor.username) {
        // Maybe the key in map is "NinaTorres" and username is "NinaTorres"
        // This is already covered by #2 but explicit verification doesn't hurt
      }

      if (stats) {
        // Vendedor con órdenes - usar sus stats reales
        return {
          ...stats,
          // Keep the original vendor ID/Name from the list to be consistent in UI
          vendorId: vendedor.id,
          vendorName: vendedor.username || stats.vendorName
        };
      } else {
        // Vendedor sin órdenes - crear objeto con stats en 0
        return {
          vendorId: vendedor.id,
          vendorName: vendedor.username || vendedor.name || `Vendedor ${vendedor.id}`,
          totalOrders: 0,
          totalRevenue: 0,
          averageOrderValue: 0
        };
      }
    });

    // Ordenar por totalRevenue descendente
    return completeList.sort((a, b) => b.totalRevenue - a.totalRevenue);
  }, [vendedores, data.topVendors]);

  // Obtener el máximo de órdenes para la barra de progreso
  const maxOrders = allVendorsWithStats.length > 0
    ? Math.max(...allVendorsWithStats.map(v => v.totalOrders))
    : 1;

  return (
    <div className="own-report-section">
      <div className="ui-stat own-stat own-stat--primary own-vendors-total">
        <span className="ui-stat-icon ui-stat-icon--primary"><span className="material-icons-round" aria-hidden="true">groups</span></span>
        <div className="ui-stat-content">
          <h3 className="ui-stat-label own-stat-label">Total de Vendedores</h3>
          <p className="ui-stat-value own-stat-value ui-text-primary">{vendedores ? vendedores.length : data.totalVendors}</p>
        </div>
      </div>

      <section className="own-vendors-section">
        <h3 className="own-section-title">
          <span className="material-icons-round ui-icon-tile ui-icon-tile--sm ui-icon-tile--primary" aria-hidden="true">groups</span>
          Todos los Vendedores
        </h3>
        <div className="own-vendor-grid ui-stagger">
          {allVendorsWithStats.map((vendor, idx) => {
            // Solo el botón pulsado de ESTA tarjeta muestra la carga
            const excelKey = `vendor:${vendor.vendorId}:excel`;
            const pdfKey = `vendor:${vendor.vendorId}:pdf`;
            const excelBusy = exporting && exportingKey === excelKey;
            const pdfBusy = exporting && exportingKey === pdfKey;
            const performance = progressValue(maxOrders > 0 ? (vendor.totalOrders / maxOrders) * 100 : 0);

            return (
              <article key={vendor.vendorId} className="ui-card own-vendor-card">
                <div className={`own-vendor-rank own-rank-badge${idx < 3 ? ' is-podium' : ''}`}>#{idx + 1}</div>
                <div className="own-vendor-info">
                  <div className="own-vendor-head">
                    <span className={`ui-avatar ui-avatar--${avatarTone(vendor.vendorName)}`} aria-hidden="true">
                      {avatarInitials(vendor.vendorName)}
                    </span>
                    <h4 className="ui-card-title">{vendor.vendorName}</h4>
                  </div>
                  <div className="own-vendor-stats">
                    <span><span className="material-icons-round ui-icon-tile ui-icon-tile--sm ui-icon-tile--primary" aria-hidden="true">receipt_long</span>{vendor.totalOrders} órdenes</span>
                    <span className="own-amount"><span className="material-icons-round ui-icon-tile ui-icon-tile--sm ui-icon-tile--success" aria-hidden="true">payments</span>${formatCurrency(vendor.totalRevenue)}</span>
                    <span><span className="material-icons-round ui-icon-tile ui-icon-tile--sm ui-icon-tile--sky" aria-hidden="true">bar_chart</span>Promedio: ${formatCurrency(vendor.averageOrderValue)}</span>
                  </div>
                </div>
                {/* Órdenes de la vendedora frente a la que más tiene */}
                <div className="own-vendor-performance">
                  <div className="ui-progress ui-progress--primary" style={{ '--value': performance }}>
                    <span className="ui-progress-bar" />
                  </div>
                </div>

                <div className="ui-card-footer own-vendor-actions">
                  <button
                    type="button"
                    className={`ui-btn ui-btn--excel ui-btn--sm${excelBusy ? ' is-loading' : ''}`}
                    aria-busy={excelBusy || undefined}
                    onClickCapture={() => onExportStart?.(excelKey)}
                    onClick={() => onExport(vendor.vendorId, 'excel')}
                    disabled={exporting}
                    title="Descargar Reporte Excel"
                    aria-label="Descargar Reporte Excel"
                  >
                    <ExportLabel kind="excel" busy={excelBusy} label="Excel" />
                  </button>
                  <button
                    type="button"
                    className={`ui-btn ui-btn--pdf ui-btn--sm${pdfBusy ? ' is-loading' : ''}`}
                    aria-busy={pdfBusy || undefined}
                    onClickCapture={() => onExportStart?.(pdfKey)}
                    onClick={() => onExport(vendor.vendorId, 'pdf')}
                    disabled={exporting}
                    title="Descargar Reporte PDF"
                    aria-label="Descargar Reporte PDF"
                  >
                    <ExportLabel kind="pdf" busy={pdfBusy} label="PDF" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

// ===== CLIENTS REPORT =====
function ClientsReport({ data }) {
  return (
    <div className="own-report-section">
      <div className="ui-stat-grid own-metrics ui-stagger">
        <div className="ui-stat own-stat own-metric own-stat--sky">
          <span className="ui-stat-icon ui-stat-icon--sky"><span className="material-icons-round" aria-hidden="true">groups</span></span>
          <div className="ui-stat-content">
            <h4 className="own-stat-label">Total Clientes</h4>
            <p className="ui-stat-value own-stat-value ui-text-primary">{data.totalClients}</p>
          </div>
        </div>
        <div className="ui-stat own-stat own-metric own-stat--success">
          <span className="ui-stat-icon ui-stat-icon--success"><span className="material-icons-round" aria-hidden="true">how_to_reg</span></span>
          <div className="ui-stat-content">
            <h4 className="own-stat-label">Clientes Activos</h4>
            <p className="ui-stat-value own-stat-value ui-text-success">{data.activeClients}</p>
          </div>
        </div>
      </div>

      <section className="ui-section own-table-card">
        <h3 className="own-section-title">
          <span className="material-icons-round ui-icon-tile ui-icon-tile--sm ui-icon-tile--warning" aria-hidden="true">emoji_events</span>
          Top 10 Mejores Clientes
        </h3>
        <div className="ui-table-wrap">
          <table className="ui-table">
            <thead>
              <tr>
                <th className="ui-num">#</th>
                <th>Cliente</th>
                <th>Teléfono</th>
                <th className="ui-num">Órdenes</th>
                <th className="ui-num">Total Gastado</th>
              </tr>
            </thead>
            <tbody className="ui-stagger">
              {data.topClients.map((client, idx) => (
                <tr key={idx}>
                  <td className="ui-num own-muted">
                    <span className={`own-rank-badge${idx < 3 ? ' is-podium' : ''}`}>{idx + 1}</span>
                  </td>
                  <td>
                    <span className="own-client-cell">
                      <span className={`ui-avatar ui-avatar--sm ui-avatar--${avatarTone(client.clientName)}`} aria-hidden="true">
                        {avatarInitials(client.clientName)}
                      </span>
                      <span className="own-client-name">{client.clientName}</span>
                    </span>
                  </td>
                  <td className="ui-tabular">
                    {client.clientPhone || <span className="ui-info-empty">Sin teléfono</span>}
                  </td>
                  <td className="ui-num">{client.totalOrders}</td>
                  <td className="ui-num own-amount">${formatCurrency(client.totalSpent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ===== SALES CHART =====
function SalesChart({ data }) {
  if (!data || data.length === 0) {
    return <div className="ui-empty ui-empty--plain own-no-data">No hay datos para mostrar</div>;
  }

  const maxRevenue = Math.max(...data.map(d => parseFloat(d.revenue)));

  return (
    <div className="sales-chart">
      <div className="chart-bars">
        {data.map((day, idx) => (
          // tabIndex: con teclado o con un toque (móvil, sin :hover) la columna muestra su valor
          <div key={idx} className="chart-bar-container" tabIndex={0}>
            <div
              className="chart-bar"
              style={{
                // Calculate percentage relative to maxRevenue without extra scaling that shrinks bars
                // (la altura mínima visible la da ChartStyles.css)
                height: `${Math.max((parseFloat(day.revenue) / maxRevenue) * 100, 2)}%`
              }}
              title={`$${formatCurrency(day.revenue)}`}
            >
              <span className="bar-value">${formatCurrency(day.revenue)}</span>
            </div>
            <div className="bar-label">
              {new Date(day.date).toLocaleDateString('es-ES', {
                day: '2-digit',
                month: 'short'
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===== TOP PRODUCTS CHART =====
function TopProductsChart({ data }) {
  if (!data || data.length === 0) {
    return <div className="ui-empty ui-empty--plain own-no-data">No hay datos para mostrar</div>;
  }

  const maxQuantity = Math.max(...data.map(d => d.quantitySold));

  return (
    <div className="top-products-chart">
      {data.map((product, idx) => (
        <div key={idx} className="product-bar-row">
          <div className="product-info-col">
            <div className="product-name">{product.productName}</div>
            <div className="product-amount">${formatCurrency(product.revenue)}</div>
          </div>
          <div className="product-bar-container">
            <div
              className="product-bar"
              style={{
                width: `${(product.quantitySold / maxQuantity) * 100}%`
              }}
            >
              <span className="bar-text">{product.quantitySold} unidades</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ... (previous code)

// ===== SALE GOALS TAB =====
function SaleGoalsTab({ vendedores, onUpdate, toast }) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedVendedor, setSelectedVendedor] = useState(null);
  const [currentMonth] = useState(new Date().getMonth() + 1);
  const [currentYear] = useState(new Date().getFullYear());
  const [recalcMonth, setRecalcMonth] = useState(new Date().getMonth() + 1);
  const [recalcYear, setRecalcYear] = useState(new Date().getFullYear());
  const [recalculating, setRecalculating] = useState(false);
  const askConfirm = useConfirm();

  const handleCreateGoal = (vendedor) => {
    setSelectedVendedor(vendedor);
    setShowCreateModal(true);
  };

  const handleDeleteGoal = async (goalId) => {
    const ok = await askConfirm({ title: 'Eliminar meta', message: '¿Estás seguro de eliminar esta meta?', confirmText: 'Eliminar', cancelText: 'Cancelar' });
    if (!ok) return;

    try {
      await client.delete(`/admin/sale-goals/${goalId}`);
      toast.success('Meta eliminada exitosamente');
      onUpdate();
    } catch (error) {
      console.error('Error al eliminar meta:', error);
      toast.error('Error al eliminar meta');
    }
  };

  const handleRecalculate = async () => {
    const ok = await askConfirm({ title: 'Recalcular metas', message: `¿Recalcular metas de ${getMonthName(recalcMonth)} ${recalcYear}? Esto actualizará el progreso de todos los vendedores.`, confirmText: 'Recalcular', cancelText: 'Cancelar' });
    if (!ok) return;
    try {
      setRecalculating(true);
      await client.post(`/owner/sale-goals/recalculate?month=${recalcMonth}&year=${recalcYear}`);
      toast.success(`Metas de ${getMonthName(recalcMonth)} ${recalcYear} recalculadas correctamente`);
      onUpdate();
    } catch (error) {
      console.error('Error al recalcular:', error);
      toast.error('Error al recalcular metas');
    } finally {
      setRecalculating(false);
    }
  };

  return (
    <div className="own-tab own-goals">
      <header className="ui-page-header">
        <div className="ui-page-heading">
          <h2 className="ui-page-title">
            <span className="material-icons-round" aria-hidden="true">trending_up</span>
            Gestión de Metas de Ventas
          </h2>
          <p className="ui-page-desc">
            Mes actual: {getMonthName(currentMonth)} {currentYear}
          </p>
        </div>
        {/* Botón de recalculación */}
        <div className="ui-page-actions own-recalc">
          <select
            className="ui-select own-recalc-select"
            aria-label="Mes a recalcular"
            value={recalcMonth}
            onChange={e => setRecalcMonth(Number(e.target.value))}
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
              <option key={m} value={m}>{getMonthName(m)}</option>
            ))}
          </select>
          <select
            className="ui-select own-recalc-select"
            aria-label="Año a recalcular"
            value={recalcYear}
            onChange={e => setRecalcYear(Number(e.target.value))}
          >
            {[2024, 2025, 2026, 2027].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button
            type="button"
            className="ui-btn ui-btn--secondary"
            onClick={handleRecalculate}
            disabled={recalculating}
          >
            <span className="material-icons-round" aria-hidden="true">
              {recalculating ? 'hourglass_top' : 'calculate'}
            </span>
            {recalculating ? 'Recalculando...' : 'Recalcular metas'}
          </button>
        </div>
      </header>

      <div className="own-goal-grid ui-stagger">
        {vendedores.length === 0 ? (
          <div className="ui-empty own-grid-span">
            <span className="material-icons-round ui-empty-icon" aria-hidden="true">person_off</span>
            <p className="ui-empty-title">No hay vendedores registrados</p>
          </div>
        ) : (
          vendedores.map((vendedor) => {
            // Color del avance (cumplida o desde 75 % verde, desde 40 % ámbar, menos rojo)
            const tone = vendedor.currentGoal ? goalProgressTone(vendedor.currentGoal) : 'neutral';

            return (
            <article key={vendedor.id} className="ui-card own-goal-card">
              <div className="own-goal-header">
                <div className="own-goal-person">
                  <h3 className="ui-card-title own-goal-name">
                    <span className={`ui-avatar ui-avatar--${avatarTone(vendedor.username)} own-goal-avatar`} aria-hidden="true">
                      {avatarInitials(vendedor.username)}
                    </span>
                    {vendedor.username}
                  </h3>
                  <span className={`ui-badge ${vendedor.active ? 'ui-badge--success' : 'ui-badge--neutral'}`}>
                    {vendedor.active ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
              </div>

              {vendedor.currentGoal ? (
                <div className="own-goal-details">
                  <div className="own-goal-stats">
                    <div className="own-goal-stat">
                      <span className="material-icons-round ui-icon-tile ui-icon-tile--sm ui-icon-tile--primary own-goal-stat-icon" aria-hidden="true">flag</span>
                      <span className="own-goal-stat-label">Meta:</span>
                      <span className="own-goal-stat-value">
                        ${formatCurrency(vendedor.currentGoal.targetAmount)}
                      </span>
                    </div>
                    <div className="own-goal-stat">
                      <span className={`material-icons-round ui-icon-tile ui-icon-tile--sm ui-icon-tile--${tone} own-goal-stat-icon`} aria-hidden="true">trending_up</span>
                      <span className="own-goal-stat-label">Actual:</span>
                      <span className={`own-goal-stat-value ui-text-${tone}`}>
                        ${formatCurrency(vendedor.currentGoal.currentAmount)}
                      </span>
                    </div>
                  </div>

                  <div className="own-goal-progress">
                    <div className="own-goal-progress-head">
                      <span>Progreso</span>
                      <span className={`own-goal-percentage ui-text-${tone}`}>{parseFloat(vendedor.currentGoal.percentage).toFixed(1)}%</span>
                    </div>
                    <div
                      className={`ui-progress ui-progress--lg ui-progress--${vendedor.currentGoal.completed ? 'success' : tone}`}
                      style={{ '--value': progressValue(Math.min(parseFloat(vendedor.currentGoal.percentage), 100)) }}
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(progressValue(parseFloat(vendedor.currentGoal.percentage)))}
                      aria-label={`Progreso de la meta de ${vendedor.username}`}
                    >
                      <span className="ui-progress-bar" />
                    </div>
                  </div>

                  {vendedor.currentGoal.completed && (
                    <div className="ui-alert ui-alert--success own-goal-completed">
                      <span className="material-icons-round" aria-hidden="true">check_circle</span>
                      ¡Meta Completada!
                    </div>
                  )}

                  <div className="ui-card-footer own-goal-actions">
                    <button
                      type="button"
                      className="ui-btn ui-btn--secondary ui-btn--sm"
                      onClick={() => handleCreateGoal(vendedor)}
                    >
                      <span className="material-icons-round" aria-hidden="true">edit</span>
                      Editar Meta
                    </button>
                    <button
                      type="button"
                      className="ui-btn ui-btn--danger-ghost ui-btn--sm own-goal-delete"
                      onClick={() => handleDeleteGoal(vendedor.currentGoal.id)}
                    >
                      <span className="material-icons-round" aria-hidden="true">delete</span>
                      Eliminar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="own-goal-empty">
                  <span className="material-icons-round own-goal-empty-icon" aria-hidden="true">report_problem</span>
                  <p>No tiene meta asignada este mes</p>
                  <button
                    type="button"
                    className="ui-btn ui-btn--primary ui-btn--sm"
                    onClick={() => handleCreateGoal(vendedor)}
                  >
                    <span className="material-icons-round" aria-hidden="true">add</span>
                    Asignar Meta
                  </button>
                </div>
              )}
            </article>
            );
          })
        )}
      </div>

      {showCreateModal && (
        <CreateGoalModal
          vendedor={selectedVendedor}
          existingGoal={selectedVendedor.currentGoal}
          onClose={() => {
            setShowCreateModal(false);
            setSelectedVendedor(null);
          }}
          onSuccess={() => {
            setShowCreateModal(false);
            setSelectedVendedor(null);
            onUpdate();
          }}
          toast={toast}
        />
      )}
    </div>
  );
}

// ===== CREATE/EDIT GOAL MODAL =====
function CreateGoalModal({ vendedor, existingGoal, onClose, onSuccess, toast }) {
  const [targetAmount, setTargetAmount] = useState(
    existingGoal ? parseFloat(existingGoal.targetAmount) : ''
  );
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!targetAmount || targetAmount <= 0) {
      toast.error('La meta debe ser mayor a 0');
      return;
    }

    try {
      setLoading(true);

      if (existingGoal) {
        await client.put(`/admin/sale-goals/${existingGoal.id}`, {
          targetAmount: parseFloat(targetAmount)
        });
        toast.success('Meta actualizada exitosamente');
      } else {
        await client.post('/admin/sale-goals', {
          vendedorId: vendedor.id,
          targetAmount: parseFloat(targetAmount),
          month: month,
          year: year
        });
        toast.success('Meta creada exitosamente');
      }

      onSuccess();
    } catch (error) {
      console.error('Error al guardar meta:', error);
      toast.error(error.response?.data?.message || 'Error al guardar meta');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ui-modal-overlay own-goal-modal-overlay">
      <div
        className="ui-modal ui-modal--sm own-goal-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="own-goal-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ui-modal-header">
          <span className="ui-modal-icon" aria-hidden="true">
            <span className="material-icons-round">{existingGoal ? 'edit' : 'flag'}</span>
          </span>
          <div className="ui-modal-heading">
            <h3 id="own-goal-modal-title" className="ui-modal-title">
              {existingGoal ? 'Editar Meta' : 'Crear Nueva Meta'}
            </h3>
          </div>
          <button type="button" className="ui-icon-btn" onClick={onClose} aria-label="Cerrar" title="Cerrar">
            <span className="material-icons-round" aria-hidden="true">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="own-goal-form">
          <div className="ui-modal-body">
            <section className="ui-section own-goal-fields">
              <div className="ui-field">
                <label className="ui-label" htmlFor="own-goal-vendedor">Vendedor</label>
                <input
                  id="own-goal-vendedor"
                  type="text"
                  value={vendedor.username}
                  disabled
                  className="ui-input"
                />
              </div>

              <div className="ui-field">
                <label className="ui-label" htmlFor="own-goal-amount">Meta de Ventas ($) <span className="ui-required">*</span></label>
                <div className="ui-input-group">
                  <span className="ui-input-prefix" aria-hidden="true">$</span>
                  <input
                    id="own-goal-amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    inputMode="decimal"
                    value={targetAmount}
                    onChange={(e) => setTargetAmount(e.target.value)}
                    placeholder="Ej: 50000.00"
                    required
                    className="ui-input"
                  />
                </div>
              </div>

              {!existingGoal && (
                <>
                  <div className="ui-grid">
                    <div className="ui-field">
                      <label className="ui-label" htmlFor="own-goal-month">Mes <span className="ui-required">*</span></label>
                      <select
                        id="own-goal-month"
                        className="ui-select"
                        value={month}
                        onChange={(e) => setMonth(parseInt(e.target.value))}
                        required
                      >
                        {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                          <option key={m} value={m}>
                            {getMonthName(m)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="ui-field">
                      <label className="ui-label" htmlFor="own-goal-year">Año <span className="ui-required">*</span></label>
                      <input
                        id="own-goal-year"
                        className="ui-input"
                        type="number"
                        min="2024"
                        max="2030"
                        inputMode="numeric"
                        value={year}
                        onChange={(e) => setYear(parseInt(e.target.value))}
                        required
                      />
                    </div>
                  </div>
                </>
              )}
            </section>
          </div>

          <div className="ui-modal-footer">
            <button
              type="button"
              onClick={onClose}
              className="ui-btn ui-btn--secondary"
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="ui-btn ui-btn--primary"
              disabled={loading}
            >
              {loading ? 'Guardando...' : (existingGoal ? 'Actualizar' : 'Crear Meta')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function getMonthName(month) {
  const months = [
    '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  return months[month];
}

export default OwnerDashboard;
