import { useState, useEffect, useCallback, useRef, Suspense } from 'react';

import client from '../api/client';
import { idempotencyKeyFor } from '../utils/idempotency';
import { useToast } from '../components/ToastContainer';
import NotificationService from '../services/NotificationService';
import useSidebarCollapsed from '../hooks/useSidebarCollapsed';
import usePersistentState, { migrateLegacyViewPref } from '../hooks/usePersistentState';
import SidebarToggle from '../components/SidebarToggle';
// Las pestañas (salvo Órdenes y Nueva venta) y los modales de órdenes se cargan bajo demanda:
// ver los lazyWithRetry() debajo de los imports. Sus hojas de estilo se importan AQUÍ, en el mismo orden
// en que llegaban antes a través de cada componente, para que la cascada CSS no cambie y los
// chunks diferidos no traigan CSS al abrirse.
import '../styles/areas/Inventory.css'; // TagsPanel, ProductsPanel, historiales
import '../styles/Promotions.css'; // PromotionsPanel (PromotionFormModal)
import '../styles/SpecialProducts.css'; // VendorMultiSelect, especiales
import '../styles/VendorMultiSelect.css';
import '../styles/areas/AdminClientsPanel.css';
import '../components/modals/ProductFormModal.css'; // ProductsPanel
import '../components/modals/PhysicalCountModal.css'; // ProductsPanel, StockReportPanel
import '../styles/areas/StockReportPanel.css';
import AdminDiscountSection from '../components/AdminDiscountSection';
import '../styles/areas/PayrollPanel.css';
import '../styles/areas/AssortmentSelectionModal.css'; // OrderDetailModal (OrderManagementModal)
import '../components/modals/OrderAnnulationModal.css';
import '../components/modals/OrderRevertAnnulmentModal.css';
import '../components/modals/HistoricalInvoiceModal.css';
import '../components/modals/OrderManagementModal.css';
import '../styles/areas/PromotionBlock.css'; // EditOrderModal
import '../styles/areas/AssortmentCartDetail.css';
import '../components/modals/EditOrderModal.css';
import AssortmentSelectionModal from '../components/modals/AssortmentSelectionModal';
import AssortmentCartDetail from '../components/AssortmentCartDetail';
import '../components/modals/CompleteOrderModal.css';
import AdminPromotionsCatalog from '../components/AdminPromotionsCatalog';
import SearchableSelect from '../components/SearchableSelect';
import { EXPORT_FORMATS } from '../components/ExportButton';
import { PanelFallback, ModalFallback, LazyErrorBoundary, lazyWithRetry } from '../components/LazyFallbacks';
import { getStatusLabel, getStatusBadgeClass } from '../utils/types';
import { buildAssortmentSelections, isAssortmentPromotion } from '../utils/assortmentPromotion';
import { formatCurrency, formatCreatedOrdersSummary, formatOrderLabel, orderPdfFileName } from '../utils/formatters';
import '../styles/AdminDashboard.css';

// Carga bajo demanda (el código llega al abrir la pestaña o el modal; "prefetch" lo descarga
// en segundo plano cuando el navegador está libre, así el primer clic casi no espera).
// lazyWithRetry = React.lazy con un reintento si la red falla (ver LazyFallbacks.js).
const TagsPanel = lazyWithRetry(() => import(/* webpackPrefetch: true */ '../components/TagsPanel'));
const PromotionsPanel = lazyWithRetry(() => import(/* webpackPrefetch: true */ '../components/PromotionsPanel'));
const AdminClientsPanel = lazyWithRetry(() => import(/* webpackPrefetch: true */ '../components/AdminClientsPanel'));
const ProductsPanel = lazyWithRetry(() => import(/* webpackPrefetch: true */ '../components/ProductsPanel'));
const SpecialProductsPanel = lazyWithRetry(() => import(/* webpackPrefetch: true */ '../components/SpecialProductsPanel'));
const SpecialPromotionsPanel = lazyWithRetry(() => import(/* webpackPrefetch: true */ '../components/SpecialPromotionsPanel'));
const InventoryHistoryPanel = lazyWithRetry(() => import(/* webpackPrefetch: true */ '../components/InventoryHistoryPanel'));
const SalesHistoryPanel = lazyWithRetry(() => import(/* webpackPrefetch: true */ '../components/SalesHistoryPanel'));
const StockReportPanel = lazyWithRetry(() => import(/* webpackPrefetch: true */ '../components/StockReportPanel'));
const PayrollPanel = lazyWithRetry(() => import(/* webpackPrefetch: true */ '../components/PayrollPanel'));
const OrderDetailModal = lazyWithRetry(() =>
  import(/* webpackPrefetch: true */ '../components/modals/OrderManagementModal').then((m) => ({ default: m.OrderDetailModal }))
);
const EditOrderModal = lazyWithRetry(() => import(/* webpackPrefetch: true */ '../components/modals/EditOrderModal'));
const CompleteOrderModal = lazyWithRetry(() => import(/* webpackPrefetch: true */ '../components/modals/CompleteOrderModal'));

// Selectores con buscador (SearchableSelect): opciones de vendedoras y clientes
const vendorOptionsById = (vendedores) => vendedores.map(v => ({ value: v.id, label: v.username }));

// Cliente: el nombre como texto de la opción; NIT, teléfono y dirección debajo para distinguir
// homónimos, y el resto de datos de contacto también se pueden escribir para encontrarlo
const clientOptionDescription = (c) => [c.nit && `NIT ${c.nit}`, c.telefono, c.direccion].filter(Boolean).join(' · ');
const clientOptionKeywords = (c) => [c.nit, c.telefono, c.direccion, c.email, c.administrador, c.representanteLegal];

// Nueva Venta: la lista de clientes ya llega filtrada (y ordenada A-Z/Z-A) desde el panel con el
// mismo texto de búsqueda, así el contador "N clientes encontrados" coincide con lo que se ve
const SHOW_ALL_OPTIONS = () => true;

// Reportes: "2026-10-02" → "02/10/2026" partiendo el texto, sin pasar por Date
// (new Date('2026-10-02') es medianoche UTC y en Colombia mostraría el día anterior)
const formatIsoDate = (iso) => {
  const [y, m, d] = String(iso || '').split('-');
  return y && m && d ? `${d}/${m}/${y}` : '—';
};

// Contenido de un botón de exportación con el mismo marcado que ExportButton: icono del formato
// (Excel table_view, PDF picture_as_pdf, CSV description) o spinner mientras exporta, y la
// etiqueta normal invisible reservando su ancho debajo del texto de carga (el botón no se
// encoge). Los botones de Reportes siguen siendo <button> propios con su onClick y su
// disabled de siempre; esto solo pinta lo de adentro.
function ExportButtonContent({ kind, label, busy, loadingLabel = 'Exportando...' }) {
  return (
    <>
      {busy
        ? <span className="ui-spinner" aria-hidden="true" />
        : <span className="material-icons-round" aria-hidden="true">{EXPORT_FORMATS[kind].icon}</span>}
      <span className="ui-btn-label">
        {busy && <span className="ui-btn-label-sizer" aria-hidden="true">{label}</span>}
        <span>{busy ? loadingLabel : label}</span>
      </span>
    </>
  );
}

// Órdenes: tarjetas de esqueleto mientras cargan (misma forma que la tarjeta de orden)
const ORDER_SKELETONS = [0, 1, 2, 3, 4, 5];

// Preferencias de CÓMO VER que se recuerdan al recargar (usePersistentState, CONVENTIONS §10).
// Cada lista es exactamente la de los value de su control, con el mismo tipo que guarda el
// estado: así lo guardado que ya no sea una opción vuelve al valor por defecto.
const ORDER_SORT_OPTIONS = [
  { value: 'fecha', label: 'Fecha' },
  { value: 'cliente', label: 'Nombre Cliente' },
  { value: 'total', label: 'Precio Total' },
  { value: 'invoiceNumber', label: 'Número de Factura' },
  { value: 'orderNumber', label: 'Número de Pedido' },
];
const ORDER_SORT_VALUES = ORDER_SORT_OPTIONS.map((o) => o.value);
const SORT_DIRECTIONS = ['asc', 'desc'];
const ORDER_PAGE_SIZES = [10, 20, 50, 100]; // números: el select hace Number(e.target.value)
const ORDER_COLUMN_OPTIONS = ['auto', '1', '2', '3', '4', '5', '6']; // texto, como el value del select

// Antes las columnas de órdenes se guardaban en 'adminOrdersColumns', sin usuario (y cerrar
// sesión las borraba). Se pasa una sola vez a la preferencia de quien abre Órdenes (sin pisar una
// ya guardada) y se borra la clave vieja, para que el cambio de formato no le reinicie las
// columnas a nadie. Casi siempre es de esa misma persona; si antes una sesión venció sin cerrarse
// (el 401 solo borra token y usuario) puede venir de quien usó el equipo antes: son solo las
// columnas, y cada quien las cambia con el selector.
const migrateLegacyOrdersColumns = () => migrateLegacyViewPref('adminOrdersColumns', 'admin.orders.columns', {
  allowed: ORDER_COLUMN_OPTIONS, // se guardaba como texto, igual que el estado: sin conversión
});

function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('orders');
  const [refreshTrigger, setRefreshTrigger] = useState(0); // State for refresh
  const [sidebarCollapsed, toggleSidebar] = useSidebarCollapsed('admin');
  const toast = useToast();

  useEffect(() => {
    // Connect with role 'admin'. Al desmontar se quita solo este oyente: la conexión es compartida con la campana
    const unsubscribe = NotificationService.connect((notification) => {
      if (notification.type === 'INVENTORY_UPDATE') {
        console.log("📦 Inventory update received, refreshing data...");
        setRefreshTrigger(Date.now());
      }
    }, 'admin');

    return unsubscribe;
  }, []);

  return (
    <div className={`admin-dashboard${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>

      {/* ── SIDEBAR IZQUIERDA (plegable a solo iconos en escritorio) ── */}
      <aside className="admin-sidebar">
        {/* Logo / Marca */}
        <div className="sidebar-brand">
          <span className="material-icons-round" aria-hidden="true">admin_panel_settings</span>
          <span className="sidebar-brand-name">Admin</span>
          <SidebarToggle collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
        </div>

        {/* Items de navegación */}
        <nav className="sidebar-nav">
          {[
            { key: 'orders', icon: 'assignment', label: 'Órdenes' },
            { key: 'nueva-venta', icon: 'add_shopping_cart', label: 'Nueva Venta' },
            { key: 'products', icon: 'inventory_2', label: 'Productos' },
            { key: 'special-products', icon: 'star', label: 'Especiales' },
            { key: 'special-promotions', icon: 'stars', label: 'Prom. Especiales' },
            { key: 'promotions', icon: 'card_giftcard', label: 'Promociones' },
            { key: 'sales-history', icon: 'receipt_long', label: 'Historial Ventas' },
            { key: 'inventory-history', icon: 'history', label: 'Historial Inv.' },
            { key: 'stock-report', icon: 'warehouse', label: 'Stock Real' },
            { key: 'clients', icon: 'people', label: 'Clientes' },
            { key: 'tags', icon: 'local_offer', label: 'Etiquetas' },
            { key: 'reports', icon: 'analytics', label: 'Reportes' },
            { key: 'nomina', icon: 'payments', label: 'Nómina' },
          ].map(item => (
            <button
              key={item.key}
              type="button"
              className={`sidebar-item${activeTab === item.key ? ' active' : ''}`}
              onClick={() => setActiveTab(item.key)}
              title={item.label}
              aria-current={activeTab === item.key ? 'page' : undefined}
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

        {/* Botón refresh en la parte inferior */}
        <button
          type="button"
          className="sidebar-refresh"
          onClick={() => setRefreshTrigger(Date.now())}
          title="Actualizar datos"
        >
          <span className="material-icons-round" aria-hidden="true">sync</span>
          <span className="sidebar-label">Actualizar</span>
        </button>
      </aside>

      {/* ── CONTENIDO PRINCIPAL ── */}
      <main className="admin-main">
        <div className="dashboard-content">
          {/* Mientras llega el código de una pestaña diferida se ve "Cargando…" en su lugar; si no
              se pudo descargar, un aviso con "Reintentar" (el menú lateral sigue funcionando) */}
          <LazyErrorBoundary resetKey={activeTab}>
          <Suspense fallback={<PanelFallback />}>
            {activeTab === 'orders' && <OrdersPanel refreshTrigger={refreshTrigger} />}
            {activeTab === 'sales-history' && <SalesHistoryPanel />}
            {activeTab === 'nueva-venta' && <AdminNuevaVentaPanel />}
            {activeTab === 'products' && <ProductsPanel refreshTrigger={refreshTrigger} />}
            {activeTab === 'special-products' && <SpecialProductsPanel refreshTrigger={refreshTrigger} />}
            {activeTab === 'special-promotions' && <SpecialPromotionsPanel refreshTrigger={refreshTrigger} />}
            {activeTab === 'inventory-history' && <InventoryHistoryPanel />}
            {activeTab === 'stock-report' && <StockReportPanel role="admin" />}
            {activeTab === 'clients' && <AdminClientsPanel refreshTrigger={refreshTrigger} />}
            {/* refreshTrigger como prop (no como key): el panel recarga sus datos en su lugar sin
                remontarse, así no se cierra el formulario abierto ni se pierde la búsqueda */}
            {activeTab === 'tags' && <TagsPanel refreshTrigger={refreshTrigger} />}
            {activeTab === 'promotions' && <PromotionsPanel refreshTrigger={refreshTrigger} />}
            {activeTab === 'reports' && <AdminReportsPanel toast={toast} />}
            {activeTab === 'nomina' && <PayrollPanel />}
          </Suspense>
          </LazyErrorBoundary>
        </div>
      </main>
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
  const [filter, setFilter] = useState('pending'); // pestaña de estado: no se recuerda (§10.1)
  // Orden, por página y columnas se recuerdan por usuario; la primera petición ya usa lo guardado.
  // Orden, sentido y por página van en la consulta paginada y su handler vuelve a la página 1: sin
  // `sync`, otra pestaña no los cambia aquí (dejaría esta en una página que ya no existe). Las
  // columnas son solo presentación y sí se sincronizan.
  const [sortBy, setSortBy] = usePersistentState('admin.orders.sort', 'fecha', { allowed: ORDER_SORT_VALUES });
  const [sortOrder, setSortOrder] = usePersistentState('admin.orders.sortDir', 'desc', { allowed: SORT_DIRECTIONS });
  const [downloadingPdf, setDownloadingPdf] = useState(null);
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [invoiceSearchInput, setInvoiceSearchInput] = useState(''); // UI state (not debounced)
  const [vendedores, setVendedores] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [selectedVendedor, setSelectedVendedor] = useState('');
  const [selectedCliente, setSelectedCliente] = useState('');
  const [clientSearchTerm, setClientSearchTerm] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);

  // ── PAGINACIÓN ──
  const [currentPage, setCurrentPage] = useState(0);
  const [pageSize, setPageSize] = usePersistentState('admin.orders.pageSize', 20, { allowed: ORDER_PAGE_SIZES });
  useState(migrateLegacyOrdersColumns); // una sola vez y ANTES del hook de columnas, que ya la lee
  const [ordersColumns, setOrdersColumns] = usePersistentState('admin.orders.columns', 'auto', { allowed: ORDER_COLUMN_OPTIONS, sync: true });
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);

  // ✅ NEW STATE FOR ASSORTMENT
  const [showAssortmentModal, setShowAssortmentModal] = useState(false);
  const [selectedPromotionForAssortment, setSelectedPromotionForAssortment] = useState(null);
  const [selectedOrderForAssortment, setSelectedOrderForAssortment] = useState(null);

  // ✅ STATE FOR COMPLETE ORDER MODAL
  const [completeOrderTarget, setCompleteOrderTarget] = useState(null);

  const toast = useToast();

  // ── Actualización silenciosa ──
  // Las recargas de la MISMA consulta que ya se ve (notificación de pedido nuevo o completado,
  // INVENTORY_UPDATE, "Actualizar", o lo que hace el admin: confirmar, completar, editar,
  // descuentos) reemplazan las tarjetas en su lugar: no hay esqueletos, así no se cierran los
  // "Ver productos" abiertos, no se pierde lo escrito en los descuentos, no salta el scroll ni se
  // repiten las animaciones de entrada. Los esqueletos quedan para la primera carga y para lo que
  // pide el admin (página, estado, búsqueda, vendedor, cliente, orden, tamaño de página).
  // requestSeqRef: número de la última petición; una respuesta más vieja no pisa a la nueva (ni
  // devuelve al admin a la página anterior). shownQueryRef: la consulta de las órdenes que se ven.
  const requestSeqRef = useRef(0);
  const shownQueryRef = useRef(null);
  // Sube con cada carga aplicada: las tarjetas (que ya no se remontan) vuelven a pedir sus
  // descuentos (AdminDiscountSection lo recibe como refreshKey y recarga en su lugar), una
  // petición por tarjeta y por recarga, igual que cuando se remontaban
  const [ordersVersion, setOrdersVersion] = useState(0);

  const fetchOrders = useCallback(async (page, size, status, search, vendedor, cliente, sortB, sortO) => {
    const p = page !== undefined ? page : currentPage;
    const s = size !== undefined ? size : pageSize;
    const st = status !== undefined ? status : filter;
    const sr = search !== undefined ? search : invoiceSearch;
    const vd = vendedor !== undefined ? vendedor : selectedVendedor;
    const cl = cliente !== undefined ? cliente : selectedCliente;
    const sby = sortB !== undefined ? sortB : sortBy;
    const so = sortO !== undefined ? sortO : sortOrder;

    const params = {
      page: p,
      size: s,
      status: st,
      sortBy: sby,
      sortOrder: so
    };
    if (sr && sr.trim() !== '') params.search = sr.trim();
    if (vd && vd.trim() !== '') params.vendedor = vd.trim();
    if (cl && cl.trim() !== '') params.cliente = cl.trim();

    const requestId = ++requestSeqRef.current;
    const silent = shownQueryRef.current === JSON.stringify(params);
    if (!silent) setLoading(true);
    try {
      const response = await client.get('/admin/orders/paginated', { params });
      if (requestId !== requestSeqRef.current) return; // llegó otra petición después: esta ya no vale
      const data = response.data;
      const shownPage = data.number || 0;
      setOrders(data.content || []);
      setTotalPages(data.totalPages || 0);
      setTotalElements(data.totalElements || 0);
      setCurrentPage(shownPage);
      shownQueryRef.current = JSON.stringify({ ...params, page: shownPage });
      setOrdersVersion((v) => v + 1);
      console.log(`✅ Órdenes actualizadas: p${data.number + 1}/${data.totalPages}, ${data.totalElements} total`);
    } catch (error) {
      console.error('Error al cargar órdenes:', error);
      // Las órdenes que ya se ven se quedan (también si falla una recarga silenciosa)
      if (requestId === requestSeqRef.current) {
        toast.error('Error al cargar órdenes: ' + (error.response?.data?.message || error.message));
      }
    } finally {
      // Siempre la última (aunque sea silenciosa): si reemplazó a una con esqueletos, los quita
      if (requestId === requestSeqRef.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast, currentPage, pageSize, filter, invoiceSearch, selectedVendedor, selectedCliente, sortBy, sortOrder]);

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

      // Use new endpoint logic. includeArchived: este filtro es del historial de pedidos y
      // facturas, donde las ventas de los clientes eliminados (archivados) siguen apareciendo
      const response = await client.get(`/admin/clients/seller/${vendorId}`, {
        params: { includeArchived: true }
      });
      setClientes(response.data || []);
    } catch (error) {
      console.error('Error al cargar clientes:', error);
      setClientes([]);
    }
  }, [vendedores]);

  useEffect(() => {
    fetchVendedores();
  }, [fetchVendedores]);

  // ── Debounce para el campo de búsqueda de texto ──────────────────────────────
  // invoiceSearchInput: cambia en cada keystroke (no dispara fetch)
  // invoiceSearch: cambia 500ms después de que el usuario dejó de escribir (dispara fetch)
  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      setInvoiceSearch(invoiceSearchInput);
      setCurrentPage(0); // Resetear página solo cuando el search se confirma
    }, 300);
    return () => clearTimeout(debounceTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceSearchInput]);

  useEffect(() => {
    fetchOrders();

    // ✅ LISTENER PARA AUTO-ACTUALIZACIÓN AL RECIBIR NOTIFICACIÓN
    const handleNewOrder = () => {
      console.log('🔄 Auto-actualizando órdenes...');
      fetchOrders(currentPage, pageSize, filter, invoiceSearch, selectedVendedor, selectedCliente, sortBy, sortOrder);
    };

    window.addEventListener('new-order-notification', handleNewOrder);
    window.addEventListener('order-completed-notification', handleNewOrder);

    return () => {
      window.removeEventListener('new-order-notification', handleNewOrder);
      window.removeEventListener('order-completed-notification', handleNewOrder);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger, currentPage, pageSize, filter, invoiceSearch, selectedVendedor, selectedCliente, sortBy, sortOrder, fetchOrders]);

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

  // Cambiar estado de una orden (CONFIRMAR, COMPLETAR, etc.)
  // ⚠️ ANULAR directamente vía status=ANULADA requiere OWNER.
  // El Admin puede anular órdenes PENDIENTES usando POST /annul (desde OrderDetailModal).
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
  const handleDownloadInvoice = async (orderId, order) => {
    try {
      setDownloadingPdf(orderId);
      const response = await client.get(`/admin/orders/${orderId}/invoice/pdf`, {
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      // "factura_1500_P-123.pdf" / "pedido_P-123.pdf" (igual que el backend)
      link.setAttribute('download', orderPdfFileName(order || { id: orderId }));
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

  // Los filtros y el ordenamiento son completamente server-side.
  // NO hacer sort local — el backend ya retorna los datos en el orden correcto.
  const filteredOrders = orders;

  return (
    <div className="orders-panel adm-orders">
      <div className="ui-page-header adm-page-header">
        <div className="ui-page-heading">
          <h2 className="ui-page-title"><span className="material-icons-round" aria-hidden="true">assignment_turned_in</span> Gestión de Órdenes</h2>
        </div>
      </div>

      {/* Filter Buttons Row: pestañas de estado (segmentado del sistema) */}
      <div className="ui-tabs adm-order-tabs" role="tablist" aria-label="Estado de las órdenes">
        <button
          type="button"
          role="tab"
          aria-selected={filter === 'pending'}
          className={`ui-tab${filter === 'pending' ? ' is-active' : ''}`}
          onClick={() => { setFilter('pending'); setCurrentPage(0); }}
        >
          <span className="material-icons-round" aria-hidden="true">pending_actions</span> Pendientes{filter === 'pending' ? ` (${totalElements})` : ''}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={filter === 'completed'}
          className={`ui-tab${filter === 'completed' ? ' is-active' : ''}`}
          onClick={() => { setFilter('completed'); setCurrentPage(0); }}
        >
          <span className="material-icons-round" aria-hidden="true">check_circle</span> Completadas{filter === 'completed' ? ` (${totalElements})` : ''}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={filter === 'all'}
          className={`ui-tab${filter === 'all' ? ' is-active' : ''}`}
          onClick={() => { setFilter('all'); setCurrentPage(0); }}
        >
          <span className="material-icons-round" aria-hidden="true">analytics</span> Todas{filter === 'all' ? ` (${totalElements})` : ''}
        </button>

        <div className="filter-divider adm-tabs-divider" aria-hidden="true"></div>

        <button
          type="button"
          role="tab"
          aria-selected={filter === 'cancelled'}
          className={`ui-tab adm-tab--danger${filter === 'cancelled' ? ' is-active' : ''}`}
          onClick={() => { setFilter('cancelled'); setCurrentPage(0); }}
        >
          <span className="material-icons-round" aria-hidden="true">block</span> Anuladas{filter === 'cancelled' ? ` (${totalElements})` : ''}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={filter === 'historical'}
          className={`ui-tab adm-tab--warning${filter === 'historical' ? ' is-active' : ''}`}
          onClick={() => { setFilter('historical'); setCurrentPage(0); }}
        >
          <span className="material-icons-round" aria-hidden="true">history</span> Historia{filter === 'historical' ? ` (${totalElements})` : ''}
        </button>
      </div>

      {/* Search and Filters Row */}
      <div className="orders-search-filters adm-orders-toolbar">
        <div className="adm-orders-filters">
          {/* Invoice Search Input */}
          <div className="ui-search adm-orders-search">
            <span className="material-icons-round ui-search-icon" aria-hidden="true">search</span>
            <input
              type="text"
              className="ui-input"
              placeholder="Buscar factura, pedido (P-123), cliente, rep..."
              aria-label="Buscar órdenes"
              value={invoiceSearchInput}
              onChange={(e) => setInvoiceSearchInput(e.target.value)}
            />
            {invoiceSearchInput && (
              <button
                type="button"
                className="ui-icon-btn ui-search-clear"
                onClick={() => { setInvoiceSearchInput(''); setInvoiceSearch(''); setCurrentPage(0); }}
                aria-label="Limpiar búsqueda"
                title="Limpiar búsqueda"
              >
                <span className="material-icons-round" aria-hidden="true">close</span>
              </button>
            )}
          </div>

          {/* Vendor Filter */}
          <div className="adm-filter">
            <SearchableSelect
              className={`adm-filter-control${selectedVendedor ? ' is-filtered' : ''}`}
              aria-label="Filtrar por vendedor"
              value={selectedVendedor}
              onChange={(e) => {
                setSelectedVendedor(e.target.value);
                setSelectedCliente('');
                setCurrentPage(0);
                if (e.target.value) {
                  fetchClientesPorVendedor(e.target.value);
                } else {
                  setClientes([]);
                }
              }}
              options={vendedores.map(v => ({ value: v.username, label: v.username }))}
              emptyOption={{ label: 'Todos los vendedores' }}
              placeholder="Todos los vendedores"
              searchPlaceholder="Buscar vendedor…"
              noResultsText="No se encontraron vendedores"
            />
            {selectedVendedor && (
              <button
                type="button"
                className="ui-icon-btn"
                onClick={() => {
                  setSelectedVendedor('');
                  setClientes([]);
                  setSelectedCliente('');
                  setCurrentPage(0);
                }}
                aria-label="Quitar filtro de vendedor"
                title="Quitar filtro de vendedor"
              >
                <span className="material-icons-round" aria-hidden="true">close</span>
              </button>
            )}
          </div>

          {/* Client Filter - Searchable */}
          {selectedVendedor && (
            <div className="adm-filter">
              <div className="client-search-container ui-input-group adm-filter-control adm-client-search">
                <span className="material-icons-round ui-input-icon" aria-hidden="true">person</span>
                <input
                  type="text"
                  className={`ui-input${selectedCliente ? ' is-filtered' : ''}`}
                  placeholder="Buscar cliente..."
                  aria-label="Filtrar por cliente"
                  value={clientSearchTerm}
                  onChange={(e) => {
                    setClientSearchTerm(e.target.value);
                    setShowClientDropdown(true);
                    if (!e.target.value) {
                      setSelectedCliente('');
                      setCurrentPage(0);
                    }
                  }}
                  onFocus={() => setShowClientDropdown(true)}
                />

                {/* Dropdown with filtered clients */}
                {showClientDropdown && (
                  <div className="adm-dropdown">
                    {/* "All clients" option */}
                    <div
                      className={`adm-dropdown-option adm-dropdown-option--all${!selectedCliente ? ' is-selected' : ''}`}
                      onClick={() => {
                        setSelectedCliente('');
                        setClientSearchTerm('');
                        setShowClientDropdown(false);
                        setCurrentPage(0);
                      }}
                      onMouseEnter={(e) => e.target.style.background = 'var(--color-surface-hover)'}
                      onMouseLeave={(e) => e.target.style.background = !selectedCliente ? 'var(--color-primary-soft)' : 'transparent'}
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
                          className={`adm-dropdown-option${selectedCliente === c.nombre ? ' is-selected' : ''}`}
                          onClick={() => {
                            setSelectedCliente(c.nombre);
                            setClientSearchTerm(c.nombre);
                            setShowClientDropdown(false);
                            setCurrentPage(0);
                          }}
                          onMouseEnter={(e) => e.target.style.background = 'var(--color-surface-hover)'}
                          onMouseLeave={(e) => e.target.style.background = selectedCliente === c.nombre ? 'var(--color-primary-soft)' : 'transparent'}
                        >
                          <div className="adm-dropdown-title">
                            {c.nombre}{c.active === false && ' (eliminado)'}
                          </div>
                          {c.representanteLegal && (
                            <div className="adm-dropdown-meta">
                              <span className="material-icons-round" aria-hidden="true">badge</span> {c.representanteLegal}
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
                        <div className="adm-dropdown-empty">
                          No se encontraron clientes
                        </div>
                      )}
                  </div>
                )}
              </div>

              {selectedCliente && (
                <button
                  type="button"
                  className="ui-icon-btn"
                  onClick={() => {
                    setSelectedCliente('');
                    setClientSearchTerm('');
                  }}
                  aria-label="Quitar filtro de cliente"
                  title="Quitar filtro de cliente"
                >
                  <span className="material-icons-round" aria-hidden="true">close</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Orden, tamaño de página, columnas y total en una sola barra que se envuelve en móvil */}
      <div className="adm-viewbar">
        {/* Sorting Controls */}
        <div className="sorting-controls adm-viewbar-group">
          <span className="material-icons-round adm-viewbar-icon" aria-hidden="true">sort</span>
          <select value={sortBy} onChange={(e) => { setSortBy(e.target.value); setCurrentPage(0); }} className="sort-select ui-select" aria-label="Ordenar por">
            {ORDER_SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button
            type="button"
            className="btn-sort-order ui-icon-btn ui-icon-btn--bordered"
            onClick={() => { setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); setCurrentPage(0); }}
            title={sortOrder === 'asc' ? 'Orden Ascendente' : 'Orden Descendente'}
            aria-label={sortOrder === 'asc' ? 'Orden Ascendente' : 'Orden Descendente'}
          >
            <span className="material-icons-round" aria-hidden="true">
              {sortOrder === 'asc' ? 'expand_less' : 'expand_more'}
            </span>
          </button>
        </div>

        {/* Pagination header: pageSize selector + result info */}
        <label className="adm-viewbar-group adm-viewbar-field">
          <span className="material-icons-round adm-viewbar-icon" aria-hidden="true">list_alt</span>
          Mostrar
          <select
            className="ui-select adm-viewbar-select"
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(0); }}
          >
            {ORDER_PAGE_SIZES.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          por página
        </label>
        <label className="adm-viewbar-group adm-viewbar-field">
          <span className="material-icons-round adm-viewbar-icon" aria-hidden="true">view_column</span>
          Columnas
          <select
            className="ui-select adm-viewbar-select"
            value={ordersColumns}
            onChange={(e) => setOrdersColumns(e.target.value)}
            title="Tarjetas por fila"
          >
            {ORDER_COLUMN_OPTIONS.map((v) => <option key={v} value={v}>{v === 'auto' ? 'Auto' : v}</option>)}
          </select>
        </label>
        <span className="adm-viewbar-total">
          {totalElements > 0 && `${totalElements} órdenes totales`}
        </span>
      </div>
      {/* Banner de advertencia si hay filtros locales activos con paginación */}
      {/* Eliminado banner de advertencia sobre filtros locales ya que ahora son server-side */}

      {loading ? (
        <div className="adm-orders-loading" role="status" aria-busy="true">
          <p className="ui-sr-only">Cargando órdenes...</p>
          <div
            className="orders-grid adm-orders-skeleton"
            aria-hidden="true"
            style={ordersColumns === 'auto' ? undefined : { gridTemplateColumns: `repeat(${ordersColumns}, minmax(0, 1fr))` }}
          >
            {ORDER_SKELETONS.map((i) => (
              <div key={i} className="adm-skeleton-card">
                <div className="adm-skeleton-head">
                  <span className="ui-skeleton ui-skeleton--title" />
                  <span className="ui-skeleton adm-skeleton-pill" />
                </div>
                <div className="ui-skeleton-stack">
                  <span className="ui-skeleton ui-skeleton--text" />
                  <span className="ui-skeleton ui-skeleton--text adm-skeleton-w80" />
                  <span className="ui-skeleton ui-skeleton--text adm-skeleton-w60" />
                  <span className="ui-skeleton ui-skeleton--title adm-skeleton-total" />
                </div>
                <div className="adm-skeleton-btns">
                  <span className="ui-skeleton adm-skeleton-btn" />
                  <span className="ui-skeleton adm-skeleton-btn" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="ui-empty adm-orders-empty">
          <span className="material-icons-round ui-empty-icon" aria-hidden="true">inbox</span>
          <p className="ui-empty-title">No se encontraron órdenes en esta categoría</p>
        </div>
      ) : (
        <div className="orders-grid ui-stagger" style={ordersColumns === 'auto' ? undefined : { gridTemplateColumns: `repeat(${ordersColumns}, minmax(0, 1fr))` }}>
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
                  {/* wrap: con "Factura #N · Pedido P-N" los badges bajan de línea en vez de partir la etiqueta */}
                  <div className="adm-order-badges">
                    <span className="order-id">
                      {formatOrderLabel(order)}
                    </span>
                    {order.isSROrder && (
                      <span className="tag-badge tag-sr">S/N</span>
                    )}
                    {/* Promotion Badge */}
                    {hasPromotions && (
                      <span className="ui-badge ui-badge--primary adm-promo-badge">
                        <span className="material-icons-round" aria-hidden="true">card_giftcard</span>
                        PROMO
                      </span>
                    )}
                    {/* Payment Status Badge: Pagado=success, Parcial=warning, Pendiente=neutral */}
                    {order.paymentStatus && (
                      <span className={`payment-status-badge ${order.paymentStatus.toLowerCase()} ui-badge ${order.paymentStatus === 'PAID' ? 'ui-badge--success' : order.paymentStatus === 'PARTIAL' ? 'ui-badge--warning' : 'ui-badge--neutral'}`}>
                        <span className="material-icons-round" aria-hidden="true">
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
                  <p><strong><span className="material-icons-round adm-info-icon adm-info-icon--primary" aria-hidden="true">person</span>Vendedor:</strong> {order.vendedor}</p>
                  <p><strong><span className="material-icons-round adm-info-icon adm-info-icon--teal" aria-hidden="true">storefront</span>Cliente:</strong> {order.cliente}</p>
                  <p>
                    <strong><span className="material-icons-round adm-info-icon adm-info-icon--sky" aria-hidden="true">event</span>{order.estado === 'COMPLETADO' ? 'Fecha factura:' : 'Fecha:'}</strong>{' '}
                    {order.estado === 'COMPLETADO' && order.completedAt
                      ? new Date(order.completedAt).toLocaleDateString('es-ES')
                      : new Date(order.fecha).toLocaleString('es-ES')}
                  </p>
                  {/* Total en verde solo si la orden ya está pagada (mismo valor, solo el color) */}
                  <p className={`order-total${order.paymentStatus === 'PAID' ? ' is-paid' : ''}`}><strong>Total:</strong> ${formatCurrency(order.total)}</p>
                  {order.discountedTotal && order.discountedTotal !== order.total && (
                    <p className="order-discounted-total">
                      <span className="material-icons-round" aria-hidden="true">discount</span>
                      <strong>Con descuento:</strong>
                      <span className="discounted-value">${formatCurrency(order.discountedTotal)}</span>
                    </p>
                  )}

                  {order.notas && (
                    <div className="order-notes">
                      <strong><span className="material-icons-round" aria-hidden="true">note</span> Notas:</strong>
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
                          <div className="adm-item-main">
                            <div className="adm-item-title">
                              <span className="item-name">{item.productName}</span>
                              {item.isFreeItem && (
                                <span className="ui-badge ui-badge--success">BONIFICADO</span>
                              )}
                              {item.isPromotionItem && !item.isFreeItem && (
                                <span className="ui-badge ui-badge--primary">PROMO</span>
                              )}
                              {item.outOfStock && (
                                <span className="ui-badge ui-badge--warning">SIN STOCK</span>
                              )}
                            </div>
                            {item.promotionName && (
                              <span className="adm-item-note">
                                <span className="material-icons-round" aria-hidden="true">card_giftcard</span>
                                {item.promotionName}
                              </span>
                            )}
                            {item.outOfStock && item.estimatedArrivalDate && (
                              <span className="adm-item-note adm-item-note--warning">
                                <span className="material-icons-round" aria-hidden="true">event</span>
                                ETA: {new Date(item.estimatedArrivalDate).toLocaleDateString('es-ES')}
                                {item.estimatedArrivalNote && ` - ${item.estimatedArrivalNote}`}
                              </span>
                            )}
                          </div>
                          <div className="item-price-row">
                            <span className="item-qty">
                              {item.cantidad} x ${item.isFreeItem ? '0.00' : formatCurrency(item.precioUnitario || 0)}
                            </span>
                            <span className={`item-subtotal${item.isFreeItem ? ' is-free' : ''}`}>
                              ${formatCurrency(item.subtotal || 0)}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : (
                  <div className="ui-alert ui-alert--warning adm-order-alert">
                    <span className="material-icons-round" aria-hidden="true">card_giftcard</span>
                    <span>Orden solo con promoción (sin productos regulares)</span>
                  </div>
                )}

                {/* ✅ NUEVA SECCIÓN: BOTONES DE FACTURA PDF */}
                <div className="invoice-actions">
                  <h4 className="adm-block-title">
                    <span className="material-icons-round" aria-hidden="true">description</span>
                    Factura / Orden de Empaque
                  </h4>
                  <div className="invoice-buttons">
                    <button
                      type="button"
                      className="btn-invoice btn-preview ui-btn ui-btn--secondary ui-btn--sm"
                      onClick={() => handlePreviewInvoice(order.id)}
                      title="Ver factura en nueva pestaña"
                    >
                      <span className="material-icons-round" aria-hidden="true">visibility</span> Vista Previa
                    </button>

                    {/* PDF = rojo (identidad de formato); solo la tarjeta que descarga muestra la carga */}
                    <button
                      type="button"
                      className={`btn-invoice btn-download ui-btn ui-btn--pdf ui-btn--sm${downloadingPdf === order.id ? ' is-loading' : ''}`}
                      onClick={() => handleDownloadInvoice(order.id, order)}
                      disabled={downloadingPdf === order.id}
                      aria-busy={downloadingPdf === order.id || undefined}
                      title="Descargar archivo PDF"
                    >
                      {downloadingPdf === order.id ? <span className="ui-spinner" aria-hidden="true" /> : <span className="material-icons-round" aria-hidden="true">picture_as_pdf</span>} Descargar
                    </button>
                  </div>
                </div>

                {/* ✅ SECCIÓN DE DESCUENTOS - ADMIN */}
                <AdminDiscountSection
                  orderId={order.id}
                  orderStatus={order.estado}
                  onDiscountChange={fetchOrders}
                  refreshKey={ordersVersion}
                />

                {/* ✅ BOTONES DE GESTIÓN DE ORDEN */}
                <div className="order-actions">
                  <button
                    type="button"
                    className="btn-edit ui-btn ui-btn--secondary ui-btn--sm"
                    onClick={() => setViewingOrder(order)}
                    title="Ver Detalle y Gestionar"
                  >
                    <span className="material-icons-round" aria-hidden="true">visibility</span> Detalle
                  </button>

                  {order.estado === 'PENDING_PROMOTION_COMPLETION' && (
                    <div className="adm-assort-actions">
                      {order.items
                        .filter(item => item.isPromotionItem && !item.isFreeItem)
                        .map((item, idx) => (
                          <button
                            key={idx}
                            type="button"
                            className="btn-confirm ui-btn ui-btn--primary ui-btn--sm"
                            onClick={() => handleOpenAssortment(order, item)}
                          >
                            <span className="material-icons-round" aria-hidden="true">inventory_2</span>
                            Surtir {item.productName?.substring(0, 15)}...
                          </button>
                        ))}
                    </div>
                  )}

                  {order.estado === 'PENDIENTE' && (
                    <button
                      type="button"
                      className="btn-confirm ui-btn ui-btn--primary ui-btn--sm"
                      onClick={() => changeStatus(order.id, 'CONFIRMADO')}
                    >
                      <span className="material-icons-round" aria-hidden="true">check</span> Confirmar
                    </button>
                  )}

                  {order.estado === 'CONFIRMADO' && (
                    <>
                      <button
                        type="button"
                        className="btn-edit ui-btn ui-btn--secondary ui-btn--sm"
                        onClick={() => setSelectedOrder(order)}
                      >
                        <span className="material-icons-round" aria-hidden="true">edit</span> Editar
                      </button>
                      <button
                        type="button"
                        className="btn-complete ui-btn ui-btn--primary ui-btn--sm"
                        onClick={() => setCompleteOrderTarget(order)}
                      >
                        <span className="material-icons-round" aria-hidden="true">done_all</span> Completar
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
        <LazyErrorBoundary variant="modal" onClose={() => setSelectedOrder(null)}>
        <Suspense fallback={<ModalFallback onClose={() => setSelectedOrder(null)} />}>
          <EditOrderModal
            order={selectedOrder}
            onClose={() => setSelectedOrder(null)}
            onSuccess={() => {
              setSelectedOrder(null);
              fetchOrders();
            }}
          />
        </Suspense>
        </LazyErrorBoundary>
      )}

      {viewingOrder && (
        <LazyErrorBoundary variant="modal" onClose={() => setViewingOrder(null)}>
        <Suspense fallback={<ModalFallback onClose={() => setViewingOrder(null)} />}>
          <OrderDetailModal
            order={viewingOrder}
            userRole="ROLE_ADMIN"
            onClose={() => setViewingOrder(null)}
            onRefresh={fetchOrders}
          />
        </Suspense>
        </LazyErrorBoundary>
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

      {/* ✅ COMPLETE ORDER MODAL */}
      {completeOrderTarget && (
        <LazyErrorBoundary variant="modal" onClose={() => setCompleteOrderTarget(null)}>
        <Suspense fallback={<ModalFallback onClose={() => setCompleteOrderTarget(null)} />}>
          <CompleteOrderModal
            order={completeOrderTarget}
            onClose={() => setCompleteOrderTarget(null)}
            onSuccess={() => {
              setCompleteOrderTarget(null);
              fetchOrders();
            }}
          />
        </Suspense>
        </LazyErrorBoundary>
      )}
      {/* ── PAGINATION FOOTER ── */}
      {totalPages > 1 && (
        <nav className="adm-pagination" aria-label="Paginación de órdenes">
          <button
            type="button"
            className="ui-icon-btn ui-icon-btn--bordered"
            onClick={() => setCurrentPage(0)}
            disabled={currentPage === 0}
            title="Primera página"
            aria-label="Primera página"
          >
            <span className="material-icons-round" aria-hidden="true">first_page</span>
          </button>
          <button
            type="button"
            className="ui-btn ui-btn--secondary ui-btn--sm"
            onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
            disabled={currentPage === 0}
          >
            <span className="material-icons-round" aria-hidden="true">chevron_left</span>
            Anterior
          </button>

          {/* Page numbers */}
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            const start = Math.max(0, Math.min(currentPage - 2, totalPages - 5));
            const pageNum = start + i;
            return (
              <button
                key={pageNum}
                type="button"
                className={`ui-btn ui-btn--sm adm-page-btn ${pageNum === currentPage ? 'ui-btn--primary' : 'ui-btn--secondary'}`}
                aria-current={pageNum === currentPage ? 'page' : undefined}
                onClick={() => setCurrentPage(pageNum)}
              >
                {pageNum + 1}
              </button>
            );
          })}

          <button
            type="button"
            className="ui-btn ui-btn--secondary ui-btn--sm"
            onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={currentPage >= totalPages - 1}
          >
            Siguiente
            <span className="material-icons-round" aria-hidden="true">chevron_right</span>
          </button>
          <button
            type="button"
            className="ui-icon-btn ui-icon-btn--bordered"
            onClick={() => setCurrentPage(totalPages - 1)}
            disabled={currentPage >= totalPages - 1}
            title="Última página"
            aria-label="Última página"
          >
            <span className="material-icons-round" aria-hidden="true">last_page</span>
          </button>

          <span className="adm-pagination-info">
            Página {currentPage + 1} de {totalPages}
          </span>
        </nav>
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
// Exportado solo para tests (AdminNuevaVentaAssortment.test.js)
export function AdminNuevaVentaPanel() {
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
  const [catalogView, setCatalogView] = useState('productos'); // 'productos' | 'promociones'
  // Envío de la venta en curso (evita doble clic) y clave de idempotencia del intento actual
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const idempotencyRef = useRef(null);


  // Assortment Selection State
  const [showAssortmentModal, setShowAssortmentModal] = useState(false);
  const [selectedPromotion, setSelectedPromotion] = useState(null);
  // Surtido con cantidad > 1 en el catálogo: un paquete a la vez, cada uno con SUS gratis
  // (current = paquete que se está armando, total = los pedidos)
  const [assortmentPackages, setAssortmentPackages] = useState({ current: 1, total: 1 });

  const [clientSearch, setClientSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  // Orden A-Z / Z-A de los clientes del selector: se recuerda por usuario (CONVENTIONS §10)
  const [sortOrder, setSortOrder] = usePersistentState('admin.newSaleClients.sortDir', 'asc', { allowed: SORT_DIRECTIONS, sync: true });
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
          isBonified: true,
          isSpecialProduct: product.isSpecialProduct || false
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
  const addPromotionToCart = (promotion, qty = 1) => {
    // ✅ Si el modo Regalo (bonificado) está activo, la promoción se aplica como
    // bonificada: pack a $0 (el inventario se descuenta igual en el backend).
    const bonified = isBonifiedMode;

    const quantity = Math.max(1, parseInt(qty) || 1);

    // Surtido: antes de agregar cada paquete se escogen SUS productos gratis. Con cantidad N
    // el modal se abre N veces seguidas (antes se agregaba 1 solo y se perdía la cantidad).
    if (isAssortmentPromotion(promotion)) {
      setSelectedPromotion({ ...promotion, isBonified: bonified });
      setAssortmentPackages({ current: 1, total: quantity });
      setShowAssortmentModal(true);
      return;
    }

    // Create all instances at once using functional updater to avoid stale closure
    const newInstances = Array.from({ length: quantity }, (_, i) => ({
      ...promotion,
      cartId: `promo-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`,
      // ✅ Capture Special Promotion ID if present
      specialPromotionId: promotion.isSpecial ? promotion.id : null,
      isBonified: bonified
    }));

    setPromotionsCart(prev => [...prev, ...newInstances]);
    if (bonified) {
      toast.success(quantity > 1
        ? `${quantity} promociones bonificadas agregadas (regalo)`
        : 'Promoción bonificada agregada (regalo)');
    } else if (quantity > 1) {
      toast.success(`${quantity} promociones agregadas al carrito`);
    } else {
      toast.success('Promoción agregada');
    }
  };

  // Surtido = PAQUETE: los productos escogidos son GRATIS y viajan con su instancia de la
  // promoción (freeItems → assortmentSelections), no como productos cobrados ni como
  // bonificados sueltos. Pagada = precio del paquete; bonificada (modo Regalo) = todo a $0.
  const handleAssortmentConfirmation = (items) => {
    // ✅ ¿La promoción surtida se agregó en modo Regalo (bonificado)?
    const bonified = !!selectedPromotion?.isBonified;
    const { current, total } = assortmentPackages;

    if (selectedPromotion) {
      const promoInstance = {
        ...selectedPromotion,
        cartId: `promo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        // ✅ Capture Special Promotion ID
        specialPromotionId: selectedPromotion.isSpecial ? selectedPromotion.id : null,
        isBonified: bonified,
        freeItems: items.map(item => ({ productId: item.productId, nombre: item.nombre, cantidad: item.cantidad }))
      };
      setPromotionsCart(prev => [...prev, promoInstance]);
    }

    // Faltan paquetes: el modal sigue abierto (vacío) para escoger los gratis del siguiente
    if (current < total) {
      setAssortmentPackages({ current: current + 1, total });
      toast.success(`Paquete ${current} de ${total} agregado. Escoge los gratis del siguiente.`);
      return;
    }

    setShowAssortmentModal(false);
    setSelectedPromotion(null);
    if (total > 1) {
      toast.success(bonified
        ? `${total} paquetes surtidos bonificados agregados (regalo)`
        : `${total} paquetes surtidos agregados al carrito`);
    } else {
      toast.success(bonified
        ? 'Paquete surtido bonificado agregado (regalo)'
        : 'Paquete surtido agregado al carrito');
    }
  };

  // Cancelar el modal: los paquetes ya confirmados quedan en el carrito, los demás no se agregan
  const handleAssortmentCancel = () => {
    const { current, total } = assortmentPackages;
    setShowAssortmentModal(false);
    setSelectedPromotion(null);
    if (current > 1) {
      toast.info(`Se agregaron ${current - 1} de ${total} paquetes surtidos`);
    }
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
    // Las promociones bonificadas (regalo) no suman al total
    const promotionsTotal = promotionsCart.reduce((sum, item) => item.isBonified ? sum : sum + (item.packPrice || 0), 0);
    return formatCurrency(productsTotal + promotionsTotal);
  };

  const handleSubmitOrder = async () => {
    // Ya hay un envío en curso (doble clic): no mandar otra venta
    if (submittingRef.current) return;

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

    submittingRef.current = true;
    setSubmitting(true);

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
          productId: item.isSpecialProduct ? null : item.productId,
          specialProductId: item.isSpecialProduct ? item.productId : null,
          cantidad: item.cantidad
        })),
        promotionIds: promotionsCart.filter(p => !p.isBonified).map(p => p.id),
        bonifiedPromotionIds: promotionsCart.filter(p => p.isBonified).map(p => p.id),
        // Gratis escogidos de cada surtido (en el orden del carrito, con su estado pagada/bonificada)
        assortmentSelections: buildAssortmentSelections(promotionsCart),
        notas: notas.trim() || null,
        includeFreight: false,
        isFreightBonified: false,
        freightCustomText: null,
        freightQuantity: 1,
        sellerId: selectedVendedor
      };

      // La clave se conserva tras un envío sin confirmar: el reintento no duplica la venta
      const res = await client.post('/admin/orders', orderData, {
        timeout: 45000,
        headers: { 'Idempotency-Key': idempotencyKeyFor(idempotencyRef) }
      });
      idempotencyRef.current = null;
      // "Pedido P-123" (o "Pedidos P-123, P-124" si se dividió); vacío con un backend anterior
      const createdOrders = formatCreatedOrdersSummary(res?.data?.orders);
      toast.success(createdOrders ? `¡Venta registrada exitosamente! ${createdOrders}` : '¡Venta registrada exitosamente!');

      setNotas('');
      setCart([]);
      setBonifiedCart([]);
      setPromotionsCart([]);
      setSelectedClient('');
      setAllowNoClient(false);
      setIsBonifiedMode(false);
    } catch (error) {
      console.error('Error al crear orden:', error);
      const status = error.response?.status;
      if (status >= 400 && status < 500) {
        // Rechazo definitivo: no se creó nada, el próximo intento usa otra clave
        idempotencyRef.current = null;
      }
      if (!error.response) {
        toast.error('No se pudo confirmar la venta por la conexión. Revisa las órdenes o vuelve a intentar: no se duplicará.');
      } else {
        toast.error('Error al registrar la venta: ' + (error.response?.data?.message || 'Error desconocido'));
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="ui-loading adm-sales-loading" role="status">
        <span className="ui-spinner" aria-hidden="true" />
        Cargando...
      </div>
    );
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
          <div className="sales-search-container ui-search">
            <span className="material-icons-round sales-search-icon ui-search-icon" aria-hidden="true">search</span>
            <input
              type="text"
              className="sales-search-input ui-input"
              placeholder="Buscar producto o promoción..."
              aria-label="Buscar en el catálogo"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
            />
          </div>

          {/* Interruptor de modo: botón real (se puede usar con teclado) */}
          <button
            type="button"
            className={`mode-toggle-label ${isBonifiedMode ? 'bonified' : 'normal'}`}
            onClick={() => setIsBonifiedMode(!isBonifiedMode)}
            title="Alternar modo de venta"
          >
            <span className="material-icons-round" aria-hidden="true">
              {isBonifiedMode ? 'card_giftcard' : 'inventory_2'}
            </span>
            {isBonifiedMode ? 'Modo Regalo (Bonificado)' : 'Modo Venta Regular'}
          </button>
        </div>

        {/* PRODUCTS LIST */}
        <div className="sales-products-list">
          {/* Selector segmentado: Productos (por defecto) | Promociones, para que las
              promociones no empujen el catálogo y la admin no tenga que scrollear. */}
          <div className="catalog-switch ui-tabs" role="tablist" aria-label="Catálogo">
            <button
              type="button"
              role="tab"
              aria-selected={catalogView === 'productos'}
              className={`catalog-switch-btn ui-tab${catalogView === 'productos' ? ' is-active' : ''}`}
              onClick={() => setCatalogView('productos')}
            >
              <span className="material-icons-round" aria-hidden="true">inventory_2</span> Productos
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={catalogView === 'promociones'}
              className={`catalog-switch-btn ui-tab${catalogView === 'promociones' ? ' is-active' : ''}`}
              onClick={() => setCatalogView('promociones')}
            >
              <span className="material-icons-round" aria-hidden="true">local_offer</span> Promociones
            </button>
          </div>

          {catalogView === 'promociones' ? (
            /* CATALOGO DE PROMOCIONES - ADMIN */
            <>
              {isBonifiedMode && (
                <div className="ui-alert ui-alert--success adm-gift-notice">
                  <span className="material-icons-round" aria-hidden="true">card_giftcard</span>
                  <span>Modo Regalo activo: las promociones que agregues se aplicarán como bonificadas (pack a $0).</span>
                </div>
              )}
              <AdminPromotionsCatalog onAddToCart={addPromotionToCart} searchTerm={productSearch} />
            </>
          ) : (
            <>
              <h4 className="adm-catalog-title">Catálogo de Productos</h4>

              {filteredProducts.map(product => (
                <div
                  key={product.id}
                  className={`sales-product-item ${isBonifiedMode ? 'bonified-mode' : ''}`}
                  onClick={() => addToCart(product)}
                >
                  {/* Image Placeholder or Actual Image if available */}
                  <div className="product-item-image" aria-hidden="true">
                    <span className="material-icons-round">image</span>
                  </div>

                  <div className="product-item-info">
                    <div className="product-item-name">{product.nombre}</div>
                    {product.isSpecialProduct && (
                      <span className="ui-badge ui-badge--primary adm-special-badge">ESPECIAL</span>
                    )}
                  </div>

                  <div className={`product-item-stock ${product.stock < 10 ? 'low' : ''}`}>
                    <span className="material-icons-round" aria-hidden="true">inventory_2</span>
                    {product.stock}
                  </div>

                  <div className={`product-item-price ${isBonifiedMode ? 'free' : ''}`}>
                    {isBonifiedMode ? 'FREE' : `$${formatCurrency(product.precio)}`}
                  </div>

                  <button type="button" className="btn-add-circle" aria-label={`Agregar ${product.nombre}`}>
                    <span className="material-icons-round" aria-hidden="true">add</span>
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      </div>


      {/* RIGHT COLUMN: CART SIDEBAR */}
      <div className="sales-cart-sidebar">
        <div className="cart-header">
          <div className="cart-title">
            <span className="material-icons-round ui-icon-tile" aria-hidden="true">shopping_cart</span>
            Nueva Venta
          </div>

          <div className="cart-customer-selector">
            {/* Vendedor Selector */}
            <div className="ui-field">
              <label className="ui-label" htmlFor="adm-nv-vendedor">
                Vendedor <span className="ui-required" aria-hidden="true">*</span>
              </label>
              <SearchableSelect
                id="adm-nv-vendedor"
                className="cart-select"
                value={selectedVendedor}
                onChange={(e) => handleVendorChange(e.target.value)}
                options={vendorOptionsById(vendedores)}
                placeholder="Selecciona un vendedor"
                searchPlaceholder="Buscar vendedor…"
                noResultsText="No se encontraron vendedores"
              />
            </div>

            {/* Client Selector: un solo campo escribible (filtra y elige) + orden A-Z */}
            {selectedVendedor && (
              <>
                <div className="ui-field">
                  <label className="ui-label" htmlFor="adm-nv-cliente">Cliente</label>
                  <div className="adm-client-filter">
                    <SearchableSelect
                      id="adm-nv-cliente"
                      className="cart-select"
                      aria-label="Filtrar cliente"
                      value={selectedClient}
                      onChange={(e) => {
                        setSelectedClient(e.target.value);
                        setAllowNoClient(false);
                      }}
                      options={filteredClients.map(client => ({
                        value: client.id,
                        label: client.nombre,
                        description: clientOptionDescription(client),
                        keywords: clientOptionKeywords(client),
                      }))}
                      query={clientSearch}
                      onQueryChange={setClientSearch}
                      filterOption={SHOW_ALL_OPTIONS}
                      loading={clientsLoading}
                      placeholder="Selecciona un cliente"
                      searchPlaceholder="Nombre, NIT, teléfono o dirección…"
                      noResultsText="No se encontraron clientes"
                    />
                    <button
                      type="button"
                      className="ui-icon-btn ui-icon-btn--lg ui-icon-btn--bordered adm-client-sort"
                      onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                      title="Ordenar A-Z"
                      aria-label="Ordenar A-Z"
                    >
                      <span className="material-icons-round" aria-hidden="true">sort_by_alpha</span>
                    </button>
                  </div>

                  <div className="ui-help adm-client-count">
                    {clientsLoading ? 'Cargando clientes...' : `${filteredClients.length} clientes encontrados`}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="cart-items-container">
          {cart.length === 0 && bonifiedCart.length === 0 && promotionsCart.length === 0 && (
            <div className="ui-empty ui-empty--plain adm-cart-empty">
              <span className="material-icons-round ui-empty-icon" aria-hidden="true">shopping_basket</span>
              <p className="ui-empty-title">El carrito está vacío</p>
              <p className="ui-empty-text">Selecciona productos o promociones del panel izquierdo.</p>
            </div>
          )}

          {/* PROMOTIONS */}
          {promotionsCart.length > 0 && (
            <div className="cart-group is-promo">
              <div className="cart-group-header">
                <span className="material-icons-round" aria-hidden="true">local_offer</span> Promociones
              </div>
              {promotionsCart.map((promo) => (
                <div key={promo.cartId} className={`cart-item${promo.isBonified ? ' is-gift' : ''}`}>
                  <div className="cart-item-info">
                    <div className="cart-item-name">
                      {promo.nombre}
                      {promo.isBonified && (
                        <span className="ui-badge ui-badge--success adm-gift-badge">REGALO</span>
                      )}
                    </div>
                    {promo.isBonified ? (
                      <div className="cart-item-price is-free">GRATIS</div>
                    ) : promo.packPrice ? (
                      <div className="cart-item-price is-amount">${formatCurrency(promo.packPrice)}</div>
                    ) : null}
                    {isAssortmentPromotion(promo) && <AssortmentCartDetail promo={promo} />}
                  </div>
                  <button
                    type="button"
                    className="btn-remove-item ui-icon-btn ui-icon-btn--danger"
                    onClick={() => removePromotionFromCart(promo.cartId)}
                    aria-label="Quitar del carrito"
                    title="Quitar del carrito"
                  >
                    <span className="material-icons-round" aria-hidden="true">close</span>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* REGULAR ITEMS */}
          {cart.length > 0 && (
            <div className="cart-group">
              <div className="cart-group-header">
                <span className="material-icons-round" aria-hidden="true">inventory_2</span> Productos
              </div>
              {cart.map(item => (
                <div key={item.productId} className="cart-item">
                  <div className="cart-item-info">
                    <div className="cart-item-name">{item.nombre}</div>
                    <div className="cart-item-price">${formatCurrency(item.precio)}</div>
                  </div>

                  <div className="cart-item-qty-control">
                    <button type="button" className="btn-qty" aria-label="Disminuir cantidad" onClick={() => updateQuantity(item.productId, item.cantidad - 1, false)}>−</button>
                    <input
                      className="qty-input"
                      type="number"
                      aria-label="Cantidad"
                      value={item.cantidad}
                      onChange={(e) => updateQuantity(item.productId, e.target.value, false)}
                      onWheel={(e) => e.target.blur()}
                    />
                    <button type="button" className="btn-qty" aria-label="Aumentar cantidad" onClick={() => updateQuantity(item.productId, item.cantidad + 1, false)}>+</button>
                  </div>

                  <button
                    type="button"
                    className="btn-remove-item ui-icon-btn ui-icon-btn--danger"
                    onClick={() => removeFromCart(item.productId, false)}
                    aria-label="Quitar del carrito"
                    title="Quitar del carrito"
                  >
                    <span className="material-icons-round" aria-hidden="true">close</span>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* BONIFIED ITEMS */}
          {bonifiedCart.length > 0 && (
            <div className="cart-group is-gift">
              <div className="cart-group-header">
                <span className="material-icons-round" aria-hidden="true">card_giftcard</span> Regalos
              </div>
              {bonifiedCart.map(item => (
                <div key={item.productId} className="cart-item is-gift">
                  <div className="cart-item-info">
                    <div className="cart-item-name">{item.nombre}</div>
                    <div className="cart-item-price is-free">GRATIS</div>
                  </div>

                  <div className="cart-item-qty-control">
                    <button type="button" className="btn-qty" aria-label="Disminuir cantidad" onClick={() => updateQuantity(item.productId, item.cantidad - 1, true)}>−</button>
                    <input
                      className="qty-input"
                      type="number"
                      aria-label="Cantidad"
                      value={item.cantidad}
                      onChange={(e) => updateQuantity(item.productId, e.target.value, true)}
                      onWheel={(e) => e.target.blur()}
                    />
                    <button type="button" className="btn-qty" aria-label="Aumentar cantidad" onClick={() => updateQuantity(item.productId, item.cantidad + 1, true)}>+</button>
                  </div>

                  <button
                    type="button"
                    className="btn-remove-item ui-icon-btn ui-icon-btn--danger"
                    onClick={() => removeFromCart(item.productId, true)}
                    aria-label="Quitar del carrito"
                    title="Quitar del carrito"
                  >
                    <span className="material-icons-round" aria-hidden="true">close</span>
                  </button>
                </div>
              ))}
            </div>
          )}

        </div>

        <div className="cart-footer">
          <div className="cart-total">
            <span>Total</span>
            <span className="cart-total-value">${calculateTotal()}</span>
          </div>

          <div className="ui-field">
            <label className="ui-label" htmlFor="adm-nv-notas">
              Notas <span className="ui-optional">(opcional)</span>
            </label>
            <textarea
              id="adm-nv-notas"
              className="cart-notes ui-textarea"
              placeholder="Notas de la venta..."
              rows="2"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
            />
          </div>

          <button
            type="button"
            className="btn-checkout ui-btn ui-btn--primary ui-btn--lg ui-btn--block"
            onClick={handleSubmitOrder}
            disabled={submitting || (cart.length === 0 && bonifiedCart.length === 0 && promotionsCart.length === 0)}
          >
            {submitting
              ? <span className="ui-spinner" aria-hidden="true" />
              : <span className="material-icons-round" aria-hidden="true">check_circle</span>}
            {submitting ? 'Registrando…' : 'Finalizar Venta'}
          </button>
        </div>
      </div>

      {/* Assortment Modal */}
      {
        showAssortmentModal && selectedPromotion && (
          <AssortmentSelectionModal
            // Un modal nuevo (sin gratis escogidos) por cada paquete
            key={`assortment-package-${assortmentPackages.current}`}
            orderId={null} // New order, so no ID yet
            promotion={selectedPromotion}
            onClose={handleAssortmentCancel}
            onConfirm={handleAssortmentConfirmation}
            // handleAssortmentConfirmation decide si cierra o pasa al siguiente paquete
            closeOnConfirm={false}
            progressLabel={assortmentPackages.total > 1
              ? `Paquete ${assortmentPackages.current} de ${assortmentPackages.total}`
              : null}
            isStandalone={true} // Mode for new sale (client-side selection)
            existingProducts={products} // mismo catálogo de Nueva Venta (sin otra petición)
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
  // Cuál botón se pulsó (SPEC §3): `exporting` sigue siendo la única guarda y el disabled de
  // los cinco botones; la clave solo decide cuál muestra "Exportando..." (antes lo decían todos)
  const [exportingKey, setExportingKey] = useState(null);
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

  // Terminó la exportación (bien o con error): ningún botón queda marcado
  useEffect(() => {
    if (!exporting) setExportingKey(null);
  }, [exporting]);

  const isExportingKey = (key) => exporting && exportingKey === key;
  const rangeLabel = `Del ${formatIsoDate(dateRange.startDate)} al ${formatIsoDate(dateRange.endDate)}`;

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
    <div className="reports-panel adm-reports">
      <div className="ui-page-header">
        <div className="ui-page-heading">
          <h2 className="ui-page-title">
            <span className="material-icons-round" aria-hidden="true">analytics</span>
            Reportes Administrativos
          </h2>
        </div>
      </div>

      {/* Todo el ancho: rango de fechas + reporte completo en una fila (≥1024px) y los reportes
          por vendedor debajo; en el celular una sola columna */}
      <div className="adm-reports-grid ui-stagger">
        <section className="ui-section adm-reports-card">
          <div className="ui-section-head">
            <span className="ui-icon-tile ui-icon-tile--lg ui-icon-tile--sky" aria-hidden="true">
              <span className="material-icons-round">date_range</span>
            </span>
            <div>
              <h3 className="ui-section-title">Seleccionar Rango de Fechas</h3>
            </div>
          </div>

          <div className="ui-grid adm-date-grid">
            <div className="ui-field">
              <label className="ui-label" htmlFor="adm-report-desde">
                Desde:
              </label>
              <input
                id="adm-report-desde"
                className="ui-input"
                type="date"
                value={dateRange.startDate}
                onChange={(e) => handleDateChange('startDate', e.target.value)}
              />
            </div>

            <div className="ui-field">
              <label className="ui-label" htmlFor="adm-report-hasta">
                Hasta:
              </label>
              <input
                id="adm-report-hasta"
                className="ui-input"
                type="date"
                value={dateRange.endDate}
                onChange={(e) => handleDateChange('endDate', e.target.value)}
              />
            </div>
          </div>
        </section>

        <section className="ui-section adm-reports-card">
          <div className="ui-section-head">
            <span className="ui-icon-tile ui-icon-tile--lg ui-icon-tile--success" aria-hidden="true">
              <span className="material-icons-round">summarize</span>
            </span>
            <div>
              <h3 className="ui-section-title">Exportar Reporte Completo</h3>
              <p className="ui-section-desc">{rangeLabel}</p>
            </div>
          </div>
          {/* Excel verde, PDF rojo, CSV azul. onClickCapture marca el botón justo antes de su
              onClick (un botón deshabilitado no lo dispara) */}
          <div className="adm-export-grid">
            <button
              type="button"
              className={`ui-btn ui-btn--excel ui-btn--lg${isExportingKey('excel') ? ' is-loading' : ''}`}
              onClickCapture={() => setExportingKey('excel')}
              onClick={() => handleExportReport('excel')}
              disabled={exporting}
              aria-busy={isExportingKey('excel') || undefined}
            >
              <ExportButtonContent kind="excel" label="Excel" busy={isExportingKey('excel')} />
            </button>

            <button
              type="button"
              className={`ui-btn ui-btn--pdf ui-btn--lg${isExportingKey('pdf') ? ' is-loading' : ''}`}
              onClickCapture={() => setExportingKey('pdf')}
              onClick={() => handleExportReport('pdf')}
              disabled={exporting}
              aria-busy={isExportingKey('pdf') || undefined}
            >
              <ExportButtonContent kind="pdf" label="PDF" busy={isExportingKey('pdf')} />
            </button>

            <button
              type="button"
              className={`ui-btn ui-btn--csv ui-btn--lg${isExportingKey('csv') ? ' is-loading' : ''}`}
              onClickCapture={() => setExportingKey('csv')}
              onClick={() => handleExportReport('csv')}
              disabled={exporting}
              aria-busy={isExportingKey('csv') || undefined}
            >
              <ExportButtonContent kind="csv" label="CSV" busy={isExportingKey('csv')} />
            </button>
          </div>

          <div className="ui-alert ui-alert--info adm-reports-note">
            <span className="material-icons-round" aria-hidden="true">info</span>
            <p>Los reportes incluyen datos de ventas, productos, vendedores y clientes para el rango de fechas seleccionado.</p>
          </div>
        </section>

        {/* Vendor-Specific Reports Section */}
        <section className="ui-section adm-reports-card adm-reports-card--wide">
          <div className="ui-section-head">
            <span className="ui-icon-tile ui-icon-tile--lg ui-icon-tile--primary" aria-hidden="true">
              <span className="material-icons-round">person</span>
            </span>
            <div>
              <h3 className="ui-section-title">Reportes por Vendedor</h3>
              <p className="ui-section-desc">{rangeLabel}</p>
            </div>
          </div>

          <div className="adm-vendor-row">
            <div className="ui-field adm-reports-vendor">
              <label className="ui-label" htmlFor="adm-report-vendedor">
                Seleccionar Vendedor:
              </label>
              <SearchableSelect
                id="adm-report-vendedor"
                value={selectedVendor}
                onChange={(e) => setSelectedVendor(e.target.value)}
                options={vendorOptionsById(vendedores)}
                placeholder="Selecciona un vendedor"
                searchPlaceholder="Buscar vendedor…"
                noResultsText="No se encontraron vendedores"
              />
            </div>

            <div className="adm-export-grid adm-export-grid--2">
              <button
                type="button"
                className={`ui-btn ui-btn--excel ui-btn--lg${isExportingKey('vendor-excel') ? ' is-loading' : ''}`}
                onClickCapture={() => setExportingKey('vendor-excel')}
                onClick={() => handleExportVendorReport('excel')}
                disabled={!selectedVendor || exporting}
                aria-busy={isExportingKey('vendor-excel') || undefined}
              >
                <ExportButtonContent kind="excel" label="Excel Completo" busy={isExportingKey('vendor-excel')} />
              </button>

              <button
                type="button"
                className={`ui-btn ui-btn--pdf ui-btn--lg${isExportingKey('vendor-pdf') ? ' is-loading' : ''}`}
                onClickCapture={() => setExportingKey('vendor-pdf')}
                onClick={() => handleExportVendorReport('pdf')}
                disabled={!selectedVendor || exporting}
                aria-busy={isExportingKey('vendor-pdf') || undefined}
              >
                <ExportButtonContent kind="pdf" label="PDF Ventas Diarias" busy={isExportingKey('vendor-pdf')} />
              </button>
            </div>
          </div>

          <div className="ui-alert ui-alert--warning adm-reports-note">
            <span className="material-icons-round" aria-hidden="true">info</span>
            <p><strong>Nota:</strong> NinaTorres y YicelaSandoval tienen datos unificados. El reporte de cualquiera mostrará datos combinados.</p>
          </div>
        </section>
      </div>
    </div>
  );
}

export default AdminDashboard;
