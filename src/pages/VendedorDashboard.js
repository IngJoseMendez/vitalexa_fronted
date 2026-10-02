import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { formatCreatedOrdersSummary, formatCurrency, formatOrderLabel } from '../utils/formatters';
import { PLACEHOLDER_IMAGE } from '../utils/placeholderImage';
import { idempotencyKeyFor } from '../utils/idempotency';
import apiClient from '../api/client';
import { tagService } from '../api/tagService';
import { useToast } from '../components/ToastContainer';
import { TagBadge, TagFilterBar } from '../components/TagComponents';
import NotificationService from '../services/NotificationService';
import VendedorPromotionsCatalog from '../components/VendedorPromotionsCatalog';
// "Especiales" y "Mi Nómina" se cargan bajo demanda (ver los lazyWithRetry() debajo de los imports).
// Sus hojas de estilo se importan AQUÍ para que la cascada no cambie y los chunks diferidos no
// traigan CSS. SpecialProducts.css va antes de los CSS de surtidos, en el mismo orden que en el
// panel de admin: si el orden difiere entre dashboards el build de producción falla (CI) por
// "Conflicting order" en el chunk compartido. Son selectores disjuntos (.sp-*, .vendor-sp-* vs
// .asm-*, .assortment-cart-detail*), así que moverlo no cambia ningún estilo.
import '../styles/SpecialProducts.css';
import AssortmentSelectionModal from '../components/modals/AssortmentSelectionModal';
import AssortmentCartDetail from '../components/AssortmentCartDetail';
import VendorProductCard from '../components/VendorProductCard';
import SearchableSelect from '../components/SearchableSelect';
import '../components/MiNominaPanel.css';
import { PanelFallback, LazyErrorBoundary, lazyWithRetry } from '../components/LazyFallbacks';
import vendedorInitService from '../api/vendedorInitService';
import { mergeVendorPromotions } from '../utils/vendorPromotionCatalog';
import { buildAssortmentSelections, isAssortmentPromotion } from '../utils/assortmentPromotion';
import { avatarTone, avatarInitials } from '../utils/avatarTone';
import usePersistentState from '../hooks/usePersistentState';
import '../styles/VendedorDashboard.css';

// Carga bajo demanda ("prefetch": se descarga en segundo plano cuando el navegador está libre,
// así el primer clic casi no espera y el arranque en celulares lentos procesa menos código).
// lazyWithRetry = React.lazy con un reintento si la red falla (ver LazyFallbacks.js).
const VendorSpecialProductsPanel = lazyWithRetry(() => import(/* webpackPrefetch: true */ '../components/VendorSpecialProductsPanel'));
const MiNominaPanel = lazyWithRetry(() => import(/* webpackPrefetch: true */ '../components/MiNominaPanel'));






// Pestañas del panel de vendedor. Mismo orden y comportamiento que antes;
// se define como dato para renderizar el nav (escritorio) y el menú lateral (móvil) sin duplicar markup.
const NAV_TABS = [
  { id: 'nueva-venta', label: 'Nueva Venta', icon: 'add_shopping_cart' },
  { id: 'mis-ventas', label: 'Mis Ventas', icon: 'receipt_long' },
  { id: 'ventas-completadas', label: 'Completadas', icon: 'check_circle' },
  { id: 'mis-metas', label: 'Mis Metas', icon: 'show_chart' },
  { id: 'clientes', label: 'Clientes', icon: 'people' },
  { id: 'productos', label: 'Productos', icon: 'inventory_2' },
  { id: 'special-products', label: 'Especiales', icon: 'star' },
  { id: 'mi-nomina', label: 'Mi Nómina', icon: 'payments' },
];

// Color con significado del estado de una venta (franja izquierda y badge):
// pendiente = ámbar, confirmada = azul, completada = verde, anulada/cancelada = rojo.
// Solo presentación: no cambia qué ventas se muestran ni sus datos.
const ESTADO_TONE = {
  PENDIENTE: 'warning',
  PENDING_PROMOTION_COMPLETION: 'warning',
  CONFIRMADO: 'primary',
  COMPLETADO: 'success',
  CANCELADO: 'danger',
  ANULADA: 'danger',
};

const ESTADO_ICON = {
  PENDIENTE: 'schedule',
  CONFIRMADO: 'task_alt',
  COMPLETADO: 'check_circle',
  CANCELADO: 'cancel',
  ANULADA: 'block',
};

const estadoTone = (estado) => ESTADO_TONE[estado || 'PENDIENTE'] || 'neutral';

// Preferencias de CÓMO VER que se recuerdan al recargar y al volver a entrar (usePersistentState,
// por usuaria). Cada lista es exactamente la de opciones de su control: lo guardado que no esté
// aquí vuelve al valor por defecto. La búsqueda, la fecha y la etiqueta NO se recuerdan.
const GRID_COLUMN_OPTIONS = [1, 2, 3]; // columnas del catálogo de Nueva Venta
const DATE_SORT_OPTIONS = ['desc', 'asc']; // "Más recientes primero" / "Más antiguas primero"
const PAGE_SIZE_OPTIONS = [10, 20, 50]; // ventas por página

// Progreso de una meta (0–100, protegido contra valores no numéricos) y su tono:
// meta cumplida = verde, desde 25 % = azul, arrancando = ámbar.
const goalProgressValue = (percentage) => {
  const pct = parseFloat(percentage);
  return Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0;
};

const goalTone = (percentage, completed) => {
  const pct = parseFloat(percentage);
  if (completed || pct >= 100) return 'success';
  if (pct >= 50) return 'primary';
  return 'warning';
};

// Esqueletos de carga con la forma del contenido (premium-polish-SPEC §2). El texto
// "Cargando..." se conserva para lectores de pantalla; aria-busy hace que el panel entre
// solo con fade y el contenido, al llegar, con la subida.
// showHeading={false}: esqueleto solo de la lista (el encabezado y el buscador del panel siguen
// montados mientras se piden otra página, búsqueda o filtro).
function PanelSkeleton({ label, text = 'Cargando...', variant = 'cards', count = 4, showHeading = true }) {
  return (
    <div className="vd-skeleton" role="status" aria-busy="true" aria-label={label}>
      <span className="ui-sr-only">{text}</span>
      {showHeading && <span className="ui-skeleton ui-skeleton--title vd-skeleton-heading" />}
      {variant === 'stats' ? (
        <div className="vd-skeleton-stats">
          {[0, 1, 2].map(i => (
            <div key={i} className="vd-skeleton-card">
              <div className="vd-skeleton-row">
                <span className="ui-skeleton vd-skeleton-tile" />
                <div className="ui-skeleton-stack vd-skeleton-grow">
                  <span className="ui-skeleton ui-skeleton--title" />
                  <span className="ui-skeleton ui-skeleton--text" />
                </div>
              </div>
            </div>
          ))}
          <span className="ui-skeleton ui-skeleton--block vd-skeleton-wide" />
        </div>
      ) : (
        <div className={`vd-skeleton-grid vd-skeleton-grid--${variant}`}>
          {Array.from({ length: count }, (_, i) => (
            <div key={i} className="vd-skeleton-card">
              {variant === 'products' && <span className="ui-skeleton ui-skeleton--block vd-skeleton-media" />}
              <div className="vd-skeleton-row">
                {variant === 'clients' && <span className="ui-skeleton ui-skeleton--circle vd-skeleton-avatar" />}
                <div className="ui-skeleton-stack vd-skeleton-grow">
                  <span className="ui-skeleton ui-skeleton--title" />
                  <span className="ui-skeleton ui-skeleton--text" />
                  <span className="ui-skeleton ui-skeleton--text vd-skeleton-short" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function VendedorDashboard() {
  const [activeTab, setActiveTab] = useState('nueva-venta');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    // Connect with role 'vendedor'. Al desmontar se quita solo este oyente: la conexión es compartida con la campana
    const unsubscribe = NotificationService.connect((notification) => {
      if (notification.type === 'INVENTORY_UPDATE') {
        console.log("📦 Inventory update received, refreshing seller dashboard...");
        setRefreshTrigger(Date.now());
      }
    }, 'vendedor');

    return unsubscribe;
  }, []);

  // Menú lateral (móvil): cerrar con Escape y bloquear el scroll del fondo mientras está abierto.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('vendedor-nav-open');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('vendedor-nav-open');
    };
  }, [menuOpen]);

  const activeMeta = NAV_TABS.find(t => t.id === activeTab);

  // Cambiar de pestaña también cierra el menú lateral en móvil.
  const selectTab = (tab) => {
    setActiveTab(tab);
    setMenuOpen(false);
  };

  return (
    <div className="vendedor-dashboard">
      {/* Barra superior móvil: hamburguesa + sección actual + refrescar (solo visible en móvil) */}
      <div className="vendedor-mobile-bar">
        <button
          type="button"
          className="vendedor-hamburger ui-icon-btn"
          onClick={() => setMenuOpen(true)}
          aria-label="Abrir menú"
          aria-expanded={menuOpen}
        >
          <span className="material-icons-round" aria-hidden="true">menu</span>
        </button>
        <span className="vendedor-mobile-title">
          {activeMeta && <span className="material-icons-round" aria-hidden="true">{activeMeta.icon}</span>}
          {activeMeta ? activeMeta.label : 'Menú'}
        </span>
        <button
          type="button"
          className="vendedor-mobile-refresh ui-icon-btn"
          onClick={() => setRefreshTrigger(Date.now())}
          aria-label="Actualizar datos"
        >
          <span className="material-icons-round" aria-hidden="true">sync</span>
        </button>
      </div>

      {/* Velo detrás del menú lateral (móvil) */}
      <div
        className={`vendedor-nav-scrim ${menuOpen ? 'open' : ''}`}
        onClick={() => setMenuOpen(false)}
        aria-hidden="true"
      />

      <nav className={`dashboard-nav ${menuOpen ? 'open' : ''}`} aria-label="Secciones del panel">
        {/* Cabecera del drawer — solo visible en móvil */}
        <div className="vendedor-nav-head">
          <span>Menú</span>
          <button
            type="button"
            className="vendedor-nav-close ui-icon-btn"
            onClick={() => setMenuOpen(false)}
            aria-label="Cerrar menú"
          >
            <span className="material-icons-round" aria-hidden="true">close</span>
          </button>
        </div>

        {NAV_TABS.map(tab => (
          <button
            type="button"
            key={tab.id}
            className={activeTab === tab.id ? 'active' : ''}
            aria-current={activeTab === tab.id ? 'page' : undefined}
            onClick={() => selectTab(tab.id)}
          >
            <span className="material-icons-round" aria-hidden="true">{tab.icon}</span> {tab.label}
          </button>
        ))}
        <button
          type="button"
          className="nav-external"
          onClick={() => window.location.href = '/balances'}
        >
          <span className="material-icons-round" aria-hidden="true">account_balance_wallet</span> Saldos
        </button>
        <button type="button" className="vendedor-nav-refresh ui-icon-btn ui-icon-btn--bordered" onClick={() => setRefreshTrigger(Date.now())} title="Actualizar datos">
          <span className="material-icons-round" aria-hidden="true">sync</span>
        </button>
      </nav>

      <div className="dashboard-content">
        {/* Mientras llega el código de una pestaña diferida se ve "Cargando…" en su lugar; si no
            se pudo descargar, un aviso con "Reintentar" (las demás pestañas siguen funcionando) */}
        <LazyErrorBoundary resetKey={activeTab}>
        <React.Suspense fallback={<PanelFallback />}>
          {/* Actualización silenciosa: refreshTrigger (INVENTORY_UPDATE o "Actualizar") hace que
              cada panel vuelva a pedir sus datos y los reemplace EN SU LUGAR. Antes 4 paneles
              usaban key={refreshTrigger} y se montaban de cero: se cerraban formularios y
              "Ver productos", se perdían búsqueda/página y la lista volvía a animarse. */}
          {activeTab === 'nueva-venta' && <NuevaVentaPanel refreshTrigger={refreshTrigger} />}
          {activeTab === 'mis-ventas' && <MisVentasPanel refreshTrigger={refreshTrigger} />}
          {activeTab === 'ventas-completadas' && <VentasCompletadasPanel refreshTrigger={refreshTrigger} />}
          {activeTab === 'mis-metas' && <MisMetasPanel refreshTrigger={refreshTrigger} />}
          {activeTab === 'clientes' && <ClientesPanel refreshTrigger={refreshTrigger} />}
          {activeTab === 'productos' && <ProductosPanel refreshTrigger={refreshTrigger} />}
          {activeTab === 'special-products' && <VendorSpecialProductsPanel refreshTrigger={refreshTrigger} />}
          {activeTab === 'mi-nomina' && <MiNominaPanel />}
        </React.Suspense>
        </LazyErrorBoundary>
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
  const [clientSearchTerm, setClientSearchTerm] = useState('');
  const [cart, setCart] = useState([]);
  const [bonifiedCart, setBonifiedCart] = useState([]); // ✅ Bonified Cart
  const [isBonifiedMode] = useState(false); // ✅ Mode Toggle
  const [promotionsCart, setPromotionsCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [allowNoClient, setAllowNoClient] = useState(false);
  const [notas, setNotas] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [gridColumns, setGridColumns] = usePersistentState('vendedora.newSale.columns', 2, {
    allowed: GRID_COLUMN_OPTIONS,
    sync: true,
  });
  const [includeFreight, setIncludeFreight] = useState(false);
  // ✅ Custom Freight State
  const [isFreightBonified, setIsFreightBonified] = useState(false);
  const [freightCustomText, setFreightCustomText] = useState('');
  const [freightQuantity, setFreightQuantity] = useState(1);
  const [freightItems, setFreightItems] = useState([]);
  const [freightProductSearch, setFreightProductSearch] = useState('');
  const [vendedores, setVendedores] = useState([]);
  const [assignedVendor, setAssignedVendor] = useState('');
  const [userRole] = useState(localStorage.getItem('role'));
  const [showMobileCart, setShowMobileCart] = useState(false); // Mobile cart modal
  // Envío de la venta en curso: el ref bloquea de forma síncrona (doble toque) y el
  // estado deshabilita los botones. idempotencyRef guarda la clave del intento actual.
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const idempotencyRef = useRef(null);
  const [catalogView, setCatalogView] = useState('productos'); // 'productos' | 'promociones'
  const toast = useToast();

  const [tags, setTags] = useState([]);
  const [activeTagId, setActiveTagId] = useState(null);

  // ✅ Datos del endpoint unificado /vendedor/init (1 sola petición al iniciar)
  const [initPromociones, setInitPromociones] = useState(null);
  const [promosLoading, setPromosLoading] = useState(true); // ✅ Estado de carga INDEPENDIENTE para promociones
  // Cambio de etiqueta (lo pide la vendedora): "Cargando" solo en la grilla de productos; el
  // carrito, el cliente elegido y lo escrito siguen montados.
  const [catalogLoading, setCatalogLoading] = useState(false);
  // Recarga silenciosa: cada petición lleva un número; solo la última aplica su respuesta (una
  // recarga vieja no pisa la de otra etiqueta). initLoadedRef: ya terminó la carga inicial.
  const initReqRef = useRef(0);
  const initLoadedRef = useRef(false);
  const lastInitTagRef = useRef(undefined);
  const clientsReqRef = useRef(0);

  // Check if user is Admin or Owner
  const isAdminOrOwner = userRole === 'ROLE_ADMIN' || userRole === 'ROLE_OWNER';

  // Assortment Selection State
  const [showAssortmentModal, setShowAssortmentModal] = useState(false);
  const [selectedPromotion, setSelectedPromotion] = useState(null);
  // Catálogo completo (sin el filtro de etiqueta): los gratis del surtido son "de cualquier tipo"
  const [catalogProducts, setCatalogProducts] = useState([]);

  const fetchTags = useCallback(async () => {
    try {
      const res = await tagService.getAll();
      setTags(res.data);
    } catch (e) {
      console.error("Error loading tags");
    }
  }, []);

  const fetchVendedores = useCallback(async () => {
    if (!isAdminOrOwner) return;
    try {
      const response = await apiClient.get('/admin/clients/vendedores');
      setVendedores(response.data || []);
    } catch (error) {
      console.error('Error al cargar vendedores:', error);
    }
  }, [isAdminOrOwner]);

  const fetchClients = useCallback(async () => {
    const reqId = ++clientsReqRef.current;
    try {
      const response = await apiClient.get('/vendedor/clients');
      if (reqId !== clientsReqRef.current) return; // llegó una petición más nueva
      setClients(response.data);
    } catch (error) {
      console.error('Error al cargar clientes:', error);
    }
  }, []);

  // Opciones de los selectores con buscador (carrito y hoja del celular). Mismo valor y mismo
  // texto visible que las <option> de antes; se arman una vez por lista (celulares de gama baja).
  // Cliente: se encuentra por nombre, teléfono (también sin espacios), NIT o correo.
  const clientOptions = useMemo(() => (Array.isArray(clients) ? clients : []).map(c => ({
    value: c.id,
    label: `${c.nombre ?? ''} - ${c.telefono ?? ''}`,
    description: [c.nit && `NIT ${c.nit}`, c.direccion].filter(Boolean).join(' · '),
    keywords: [c.telefono, c.telefono && String(c.telefono).replace(/\D/g, ''), c.nit, c.email],
  })), [clients]);

  const vendedorOptions = useMemo(
    () => (Array.isArray(vendedores) ? vendedores : []).map(v => ({ value: v.id, label: v.username })),
    [vendedores]
  );


  // ✅ Carga inicial unificada: 1 sola petición para productos + promociones + promos especiales
  // Con caché local para funcionar con internet débil o sin conexión
  //
  // Tres modos, mismas peticiones en todos:
  //  - 'initial': primera carga (sin datos todavía) → "Cargando..." en todo el panel.
  //  - 'tag': la vendedora cambió de etiqueta → "Cargando" solo en la grilla de productos.
  //  - 'silent': INVENTORY_UPDATE o "Actualizar" con el catálogo ya visible → los datos se
  //    reemplazan en su lugar, sin desmontar nada (modal de surtido, selectores de cliente,
  //    notas, cantidades, hoja del carrito y scroll quedan como estaban).
  const fetchInitData = useCallback(async () => {
    const reqId = ++initReqRef.current;
    const isCurrent = () => reqId === initReqRef.current;
    const tagChanged = lastInitTagRef.current !== activeTagId;
    lastInitTagRef.current = activeTagId;
    const mode = !initLoadedRef.current ? 'initial' : (tagChanged ? 'tag' : 'silent');
    if (mode === 'initial') {
      setLoading(true);
      setPromosLoading(true); // ✅ Indicar que las promociones también están cargando
    } else if (mode === 'tag') {
      setCatalogLoading(true);
    }
    try {
      const datos = await vendedorInitService.cargarDatosInicio();
      if (isCurrent()) setCatalogProducts(datos.productos || []);
      if (activeTagId) {
        const tagRes = await apiClient.get(`/vendedor/products/tag/${activeTagId}`);
        if (isCurrent()) setProducts(tagRes.data.content || tagRes.data || []);
      } else if (isCurrent()) {
        setProducts(datos.productos || []);
      }
      // Normales + especiales asignadas (marcadas isSpecial). La venta envía el id de la
      // especial en promotionIds y el backend la reconoce y valida que le corresponda.
      if (isCurrent()) setInitPromociones(mergeVendorPromotions(datos.promociones, datos.promocionesEspeciales));
    } catch (error) {
      console.error('❌ [VendedorInit] Error al cargar datos de inicio:', error);
      // Fallback silencioso: intentar cargar al menos los productos (lógica inline, sin dependencia extra)
      try {
        let url = activeTagId ? `/vendedor/products/tag/${activeTagId}` : '/vendedor/products';
        const response = await apiClient.get(url);
        if (isCurrent()) setProducts(response.data.content || response.data || []);
      } catch (e) {
        console.error('Error al cargar productos en fallback:', e);
      }
      // En la carga inicial, ante un error de red, dejar las promociones vacías para no
      // bloquear la UI. Si ya se veían promociones, se conservan (no se borra lo visible).
      if (isCurrent() && mode === 'initial') setInitPromociones([]);
    } finally {
      // Solo la petición vigente apaga los indicadores (una silenciosa que reemplazó a otra
      // también los apaga, para que nunca quede "Cargando" pegado)
      if (isCurrent()) {
        initLoadedRef.current = true;
        setLoading(false);
        setPromosLoading(false); // ✅ Siempre marcar como terminado
        setCatalogLoading(false);
      }
    }
  }, [activeTagId]); // ✅ SIN fetchProducts en dependencias — evita bucle infinito

  useEffect(() => {
    fetchInitData();
    fetchClients();
    fetchTags();
    fetchVendedores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger, activeTagId]); // ✅ SIN fetchInitData/fetchClients/etc. en deps — evita bucle infinito de renders

  const addToCart = (product, quantity = 1) => {
    if (isBonifiedMode) { // ✅ Logic for Bonified Items
      const existing = bonifiedCart.find(item => item.productId === product.id);
      if (existing) {
        setBonifiedCart(bonifiedCart.map(item => item.productId === product.id ? { ...item, cantidad: item.cantidad + quantity } : item));
      } else {
        setBonifiedCart([...bonifiedCart, {
          productId: product.id,
          nombre: product.nombre,
          precio: 0, // Price 0
          cantidad: quantity,
          stockDisponible: product.stock,
          allowOutOfStock: true,
          isSpecialProduct: product.isSpecialProduct || false
        }]);
      }
      toast.success(`Agregado (+${quantity}) como Bonificado`);
      return;
    }

    // Regular Items Logic
    const existingItem = cart.find(item => item.productId === product.id);

    if (existingItem) {
      // Logic for stock check warning, BUT if we want to allow OOS sales, we might warn but proceed?
      // Prompt says: Checkbox "Permitir venta sin stock" visible when stock < cantidad.
      // So we allow adding.
      if (existingItem.cantidad >= product.stock && product.stock > 0) {
        // Standard warning if they haven't opted into OOS yet? 
        // Let's just allow adding and rely on the cart checkbox.
      }
      setCart(cart.map(item =>
        item.productId === product.id
          ? { ...item, cantidad: item.cantidad + quantity }
          : item
      ));
    } else {
      setCart([...cart, {
        productId: product.id,
        nombre: product.nombre,
        precio: product.precio,
        cantidad: quantity,
        stockDisponible: product.stock,
        allowOutOfStock: true, // AUTO-ALLOW for negative stock support
        isSpecialProduct: product.isSpecialProduct
      }]);
    }
    // Feedback al agregar (igual que bonificados y promociones, que sí avisaban)
    toast.success(`Agregado: ${product.nombre}${quantity > 1 ? ` (x${quantity})` : ''}`);
  };

  const addPromotionToCart = (promotion) => {
    // Surtido: antes de agregar el paquete se escogen sus productos gratis
    if (isAssortmentPromotion(promotion)) {
      setSelectedPromotion(promotion);
      setShowAssortmentModal(true);
      return;
    }

    // Add unique ID for cart processing to allow duplicates
    const promoInstance = {
      ...promotion,
      cartId: `promo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };

    setPromotionsCart([...promotionsCart, promoInstance]);
    toast.success('Promoción agregada');
  };

  // Surtido = PAQUETE: los productos escogidos son GRATIS y viajan con su instancia de la
  // promoción (freeItems → assortmentSelections), NO como productos cobrados del carrito.
  // El total de la instancia es el precio del paquete.
  const handleAssortmentConfirmation = (items) => {
    if (selectedPromotion) {
      const promoInstance = {
        ...selectedPromotion,
        cartId: `promo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        freeItems: items.map(item => ({ productId: item.productId, nombre: item.nombre, cantidad: item.cantidad }))
      };
      setPromotionsCart([...promotionsCart, promoInstance]);
    }

    setShowAssortmentModal(false);
    setSelectedPromotion(null);
    toast.success('Paquete surtido agregado al carrito');
  };

  const removePromotionFromCart = (cartId) => {
    setPromotionsCart(promotionsCart.filter(p => p.cartId !== cartId));
  };

  const removeFromCart = (productId, isBonified = false) => {
    if (isBonified) {
      setBonifiedCart(bonifiedCart.filter(item => item.productId !== productId));
    } else {
      setCart(cart.filter(item => item.productId !== productId));
    }
  };

  const updateQuantity = (productId, newQuantity, isBonified = false) => {
    if (isBonified) {
      setBonifiedCart(bonifiedCart.map(item =>
        item.productId === productId ? { ...item, cantidad: newQuantity } : item
      ));
    } else {
      setCart(cart.map(item =>
        item.productId === productId
          ? { ...item, cantidad: newQuantity }
          : item
      ));
    }
  };

  const toggleAllowOutOfStock = (productId) => {
    setCart(cart.map(item =>
      item.productId === productId
        ? { ...item, allowOutOfStock: !item.allowOutOfStock }
        : item
    ));
  };

  // ✅ Freight Logic
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

  const calculateTotal = () => {
    const productsTotal = cart.reduce((sum, item) => {
      const q = parseFloat(item.cantidad) || 0;
      return sum + (item.precio * q);
    }, 0);
    const promotionsTotal = promotionsCart.reduce((sum, item) => sum + (item.packPrice || 0), 0);
    return productsTotal + promotionsTotal;
  };

  // Devuelve true solo si la venta quedó registrada
  const handleSubmitOrder = async () => {
    // Ya hay un envío en curso (doble toque / doble clic): no mandar otra venta
    if (submittingRef.current) return false;

    // ✅ ACTUALIZADO: Permite órdenes solo con bonificados
    if (cart.length === 0 && bonifiedCart.length === 0 && promotionsCart.length === 0) {
      toast.warning('Agrega productos, promociones o bonificados al carrito');
      return false;
    }

    if (!selectedClient && !allowNoClient) {
      toast.warning('Selecciona un cliente o marca la casilla para confirmar venta sin cliente');
      return false;
    }

    // If Admin/Owner and trying to create order, vendor must be assigned
    if (isAdminOrOwner && !assignedVendor) {
      toast.warning('Debe asignar un vendedor para crear esta orden');
      return false;
    }

    submittingRef.current = true;
    setSubmitting(true);

    try {
      const orderData = {
        clientId: selectedClient || null,
        items: [
          ...cart.map(item => ({
            productId: item.isSpecialProduct ? null : item.productId,
            specialProductId: item.isSpecialProduct ? item.productId : null,
            cantidad: item.cantidad,
            allowOutOfStock: item.allowOutOfStock,
            relatedPromotionId: item.promotionId || null
          })),
          // ✅ Add Freight Items (now allowed even with promotions)
          ...freightItems.map(item => ({
            productId: item.productId,
            cantidad: item.cantidad,
            isFreightItem: true
          }))
        ],
        bonifiedItems: bonifiedCart.map(item => ({
          productId: item.isSpecialProduct ? null : item.productId,
          specialProductId: item.isSpecialProduct ? item.productId : null,
          cantidad: item.cantidad
        })),
        promotionIds: promotionsCart.map(p => p.id),
        // Gratis escogidos de cada surtido, en el mismo orden que promotionIds
        assortmentSelections: buildAssortmentSelections(promotionsCart),
        notas: notas.trim() || null,
        includeFreight: includeFreight || false,
        isFreightBonified: includeFreight ? isFreightBonified : false,
        freightCustomText: includeFreight ? freightCustomText : null,
        freightQuantity: includeFreight ? (parseInt(freightQuantity) || 1) : 1,
        sellerId: isAdminOrOwner ? assignedVendor : null
      };


      const endpoint = isAdminOrOwner ? '/admin/orders' : '/vendedor/orders';
      // La clave se conserva tras un envío sin confirmar (timeout/red): el reintento no
      // duplica la venta. Timeout amplio solo en esta llamada.
      const res = await apiClient.post(endpoint, orderData, {
        timeout: 45000,
        headers: { 'Idempotency-Key': idempotencyKeyFor(idempotencyRef) }
      });
      idempotencyRef.current = null;

      // Venta dividida: el backend devuelve { orders, wasSplit, message }
      // "Pedido P-123" / "Pedidos P-123, P-124"; vacío con un backend anterior
      const createdOrders = formatCreatedOrdersSummary(res.data?.orders);
      if (res.data?.orders?.length > 1) {
        toast.info(`Venta registrada: se generaron ${res.data.orders.length} órdenes (S/R o promociones van por separado).${createdOrders ? ` ${createdOrders}` : ''}`, 6000);
      } else {
        toast.success(createdOrders ? `¡Venta registrada exitosamente! ${createdOrders}` : '¡Venta registrada exitosamente!');
      }

      // Limpiar formulario
      setNotas('');
      setCart([]);
      setBonifiedCart([]); // ✅ Clear bonified
      setPromotionsCart([]);
      setIncludeFreight(false);
      // ✅ Clear Freight State
      setIsFreightBonified(false);
      setFreightCustomText('');
      setFreightQuantity(1);
      setFreightItems([]);
      setAssignedVendor('');
      // ✅ Invalidar caché del init porque el stock cambió al crear el pedido
      vendedorInitService.invalidarCache();
      fetchInitData();
      return true;
    } catch (error) {
      console.error('Error al crear orden:', error);
      const status = error.response?.status;
      if (status >= 400 && status < 500) {
        // Rechazo definitivo (validación, crédito...): no se creó nada, el próximo intento usa otra clave
        idempotencyRef.current = null;
      }
      if (status === 403 && error.response?.data?.message?.includes('Límite de crédito')) {
        toast.error(error.response.data.message);
      } else if (!error.response) {
        // Timeout o sin conexión: la venta pudo quedar registrada; reintentar el mismo carrito no la duplica
        toast.error('No se pudo confirmar la venta por la conexión. Revisa "Mis Ventas" o vuelve a intentar: no se duplicará.');
      } else {
        toast.error('Error al registrar la venta: ' + (error.response?.data?.message || 'Error desconocido'));
      }
      return false;
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  // Solo la carga inicial reemplaza todo el panel (las recargas posteriores son silenciosas)
  if (loading) {
    return <div className="ui-loading vd-loading" role="status"><span className="ui-spinner" aria-hidden="true" />Cargando...</div>;
  }

  const filteredProducts = (products || []).filter(p => {
    const matchesSearch = p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.descripcion && p.descripcion.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesTag = !activeTagId || p.tagId === activeTagId;
    return matchesSearch && matchesTag;
  });

  // Número de promociones disponibles (para el badge del selector Productos | Promociones)
  const promoCount = (initPromociones || []).length;

  return (
    <div className="nueva-venta-panel">
      <header className="ui-page-header vd-page-header">
        <div className="ui-page-heading">
          <h2 className="ui-page-title"><span className="material-icons-round" aria-hidden="true">add_shopping_cart</span> Nueva Venta</h2>
        </div>
      </header>

      <div className="venta-layout">
        {/* ✅ SECCIÓN IZQUIERDA - PRODUCTOS CON IMÁGENES CORREGIDAS */}
        <div className="productos-section">
          <div className="products-header">
            {/* Selector segmentado: por defecto "Productos" (se ven de inmediato) y las
                "Promociones" a un toque, para que NO empujen los productos hacia abajo. */}
            <div className="catalog-switch ui-tabs" role="tablist" aria-label="Catálogo">
              <button
                type="button"
                role="tab"
                aria-selected={catalogView === 'productos'}
                className={`catalog-switch-btn ui-tab ${catalogView === 'productos' ? 'active' : ''}`}
                onClick={() => setCatalogView('productos')}
              >
                <span className="material-icons-round" aria-hidden="true">inventory_2</span>
                Productos
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={catalogView === 'promociones'}
                className={`catalog-switch-btn ui-tab ${catalogView === 'promociones' ? 'active' : ''}`}
                onClick={() => setCatalogView('promociones')}
              >
                <span className="material-icons-round" aria-hidden="true">local_offer</span>
                Promociones
                {promoCount > 0 && <span className="catalog-switch-badge ui-tab-count">{promoCount}</span>}
              </button>
            </div>
            <div className="products-header-toolbar">
              {/* Selector de columnas (solo aplica a la vista de productos) */}
              {catalogView === 'productos' && (
                <div className="grid-columns-selector ui-tabs" role="group" aria-label="Columnas del catálogo">
                  {GRID_COLUMN_OPTIONS.map(cols => (
                    <button
                      type="button"
                      key={cols}
                      className={`grid-btn ui-tab ${gridColumns === cols ? 'active is-active' : ''}`}
                      onClick={() => setGridColumns(cols)}
                      title={`${cols} columnas`}
                      aria-pressed={gridColumns === cols}
                    >
                      <span className="material-icons-round" aria-hidden="true">dashboard</span>
                      {cols}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {catalogView === 'promociones' ? (
            /* CATALOGO DE PROMOCIONES */
            <VendedorPromotionsCatalog onAddToCart={addPromotionToCart} initialPromotions={initPromociones} initLoading={promosLoading} />
          ) : (
            <>
              {/* Buscador de Productos con botón limpiar */}
              <div className="ui-search vd-catalog-search">
                <span className="material-icons-round ui-search-icon" aria-hidden="true">search</span>
                <input
                  type="text"
                  placeholder="Buscar productos..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="ui-input"
                  aria-label="Buscar productos"
                />
                {searchTerm && (
                  <button
                    type="button"
                    className="ui-icon-btn ui-search-clear"
                    onClick={() => setSearchTerm('')}
                    title="Limpiar búsqueda"
                    aria-label="Limpiar búsqueda"
                  >
                    <span className="material-icons-round" aria-hidden="true">close</span>
                  </button>
                )}
              </div>

              <TagFilterBar
                tags={tags}
                activeTagId={activeTagId}
                onSelectTag={setActiveTagId}
                onClear={() => setActiveTagId(null)}
              />

              {/* El número de columnas viaja como variable CSS; en teléfonos el CSS fuerza 1 columna */}
              {catalogLoading ? (
                <div className="ui-loading vd-loading" role="status"><span className="ui-spinner" aria-hidden="true" />Cargando productos...</div>
              ) : (
              <div
                className={`productos-grid ${gridColumns === 1 ? 'vpc-grid--row' : ''}`}
                style={{ '--vd-grid-cols': gridColumns }}
              >
                {filteredProducts.length === 0 ? (
                  <div className="ui-empty ui-empty--plain vd-grid-empty">
                    <span className="material-icons-round ui-empty-icon" aria-hidden="true">inventory_2</span>
                    <p className="ui-empty-text">No se encontraron productos</p>
                  </div>
                ) : (
                  filteredProducts.map(product => (
                    <VendorProductCard
                      key={product.id}
                      product={product}
                      cartItem={cart.find(item => item.productId === product.id)}
                      onAddToCart={addToCart}
                    />
                  ))
                )}
              </div>
              )}
            </>
          )}
        </div>

        {/* SECCIÓN DERECHA - CARRITO */}
        <div className="carrito-section">
          <div className="vd-cart-head">
            <h3 className="vd-cart-title">
              <span className="material-icons-round" aria-hidden="true">shopping_cart</span>
              Carrito
            </h3>
          </div>

          <div className="vd-cart-body">
            <div className="ui-field vd-field">
              <label htmlFor="cliente-select" className="ui-label vd-label">
                <span className="material-icons-round" aria-hidden="true">person</span>
                Cliente
              </label>
              {/* Un solo campo: se escribe nombre o teléfono y la lista se va filtrando */}
              <SearchableSelect
                id="cliente-select"
                value={selectedClient}
                onChange={(e) => {
                  setSelectedClient(e.target.value);
                  setAllowNoClient(false);
                }}
                disabled={allowNoClient}
                options={clientOptions}
                query={clientSearchTerm}
                onQueryChange={setClientSearchTerm}
                placeholder="Selecciona un cliente"
                searchPlaceholder="Nombre, teléfono o NIT…"
                noResultsText="Ningún cliente coincide"
                aria-label="Buscar cliente"
              />
            </div>

            <div className="vd-check">
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

            <div className="ui-field vd-field">
              <label htmlFor="notas" className="ui-label vd-label">
                <span className="material-icons-round" aria-hidden="true">notes</span>
                Notas / Productos sin stock
              </label>
              <textarea
                id="notas"
                className="ui-textarea"
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                rows="3"
                placeholder="Ej: Cliente solicita producto X sin stock, contactar proveedor..."
              />
              <small className="ui-help vd-help">
                <span className="material-icons-round" aria-hidden="true">lightbulb</span> Use este campo para solicitudes sin stock o instrucciones especiales
              </small>
            </div>

            {/* ADMIN/OWNER ONLY: Asignar Vendedor */}
            {isAdminOrOwner && (
              <div className="ui-field vd-field">
                <label id="vendedor-select-label" htmlFor="vendedor-select" className="ui-label vd-label">
                  <span className="material-icons-round" aria-hidden="true">badge</span>
                  Asignar Vendedor <span className="ui-required">*</span>
                </label>
                {/* aria-labelledby: la lista se anuncia con la etiqueta sin el nombre del icono */}
                <SearchableSelect
                  id="vendedor-select"
                  value={assignedVendor}
                  onChange={(e) => setAssignedVendor(e.target.value)}
                  options={vendedorOptions}
                  placeholder="Selecciona un vendedor"
                  searchPlaceholder="Buscar vendedor…"
                  noResultsText="Ningún vendedor coincide"
                  aria-labelledby="vendedor-select-label"
                />
              </div>
            )}

            {/* ADMIN/OWNER ONLY: Incluir Flete */}
            {isAdminOrOwner && (
              <div className="vd-freight">
                <div className="vd-check">
                  <input
                    id="incluir-flete"
                    type="checkbox"
                    checked={includeFreight}
                    onChange={(e) => setIncludeFreight(e.target.checked)}
                  />
                  <label htmlFor="incluir-flete" className="vd-label">
                    <span className="material-icons-round" aria-hidden="true">local_shipping</span>
                    Incluir Flete en Orden
                  </label>
                </div>

                {includeFreight && (
                  <div className="freight-custom-section vd-freight-body">
                    <div className="vd-freight-row">
                      <label className="vd-check vd-check--inline">
                        <input
                          type="checkbox"
                          checked={isFreightBonified}
                          onChange={(e) => setIsFreightBonified(e.target.checked)}
                        />
                        Bonificar ($0)
                      </label>
                      <input
                        type="text"
                        className="ui-input vd-freight-text"
                        placeholder="Texto personalizado (ej: Envío Express)"
                        value={freightCustomText}
                        onChange={(e) => setFreightCustomText(e.target.value)}
                      />
                      <input
                        type="number"
                        min="1"
                        className="ui-input vd-freight-qty"
                        placeholder="Cant."
                        value={freightQuantity}
                        onChange={(e) => setFreightQuantity(e.target.value)}
                        onWheel={(e) => e.target.blur()}
                      />
                    </div>

                    {/* Freight Search */}
                    <div className="vd-freight-search">
                      <input
                        type="text"
                        className="ui-input"
                        placeholder="Buscar producto flete..."
                        value={freightProductSearch}
                        onChange={(e) => setFreightProductSearch(e.target.value)}
                      />
                      {freightProductSearch && (
                        <div className="vd-freight-results">
                          {products
                            .filter(p => p.active && p.nombre.toLowerCase().includes(freightProductSearch.toLowerCase()))
                            .slice(0, 5)
                            .map(p => (
                              <div
                                key={p.id}
                                className="vd-freight-option"
                                onClick={() => { addFreightItem(p); setFreightProductSearch(''); }}
                              >
                                {p.nombre}
                              </div>
                            ))
                          }
                        </div>
                      )}
                    </div>

                    {/* List Freight Items */}
                    {freightItems.map(item => (
                      <div key={item.productId} className="vd-freight-item">
                        <span className="vd-freight-item-name">{item.nombre}</span>
                        <div className="vd-freight-item-controls">
                          <input
                            type="number"
                            className="ui-input vd-freight-item-qty"
                            value={item.cantidad}
                            onChange={(e) => updateFreightItemQty(item.productId, parseInt(e.target.value) || 0)}
                            onWheel={(e) => e.target.blur()}
                            aria-label={`Cantidad de ${item.nombre}`}
                          />
                          <button type="button" className="ui-icon-btn ui-icon-btn--danger vd-freight-remove" onClick={() => removeFreightItem(item.productId)} aria-label={`Quitar ${item.nombre}`}>&times;</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="cart-items">
              {cart.length === 0 && promotionsCart.length === 0 ? (
                <div className="empty-cart">
                  <span className="material-icons-round" aria-hidden="true">shopping_bag</span>
                  <span>El carrito está vacío</span>
                </div>
              ) : (
                <>
                  {/* PROMOTIONS IN CART */}
                  {promotionsCart.map(promo => (
                    <div key={promo.cartId} className="cart-item promotion-item">
                      <div className="cart-item-info">
                        <h4>
                          <span className="material-icons-round" aria-hidden="true">local_offer</span>
                          {promo.nombre}
                        </h4>
                        <p>{promo.type === 'PACK' ? 'Pack' : isAssortmentPromotion(promo) ? 'Paquete surtido' : 'Oferta'}</p>
                        {isAssortmentPromotion(promo) && <AssortmentCartDetail promo={promo} />}
                      </div>
                      <div className="cart-item-controls">
                        {promo.packPrice && (
                          <span className="vd-promo-price">${promo.packPrice}</span>
                        )}
                        <button
                          type="button"
                          className="vd-remove ui-icon-btn ui-icon-btn--danger"
                          onClick={() => removePromotionFromCart(promo.cartId)}
                          title="Eliminar promoción"
                        >
                          <span className="material-icons-round" aria-hidden="true">delete_outline</span>
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* PRODUCTS IN CART */}
                  {cart.map(item => {
                    const isOutOfStock = item.cantidad > item.stockDisponible;


                    return (
                      <div key={item.productId} className={`cart-item ${isOutOfStock ? 'has-warning' : ''}`}>
                        <div className={`cart-item-avatar ui-avatar ui-avatar--${avatarTone(item.nombre)}`} aria-hidden="true">
                          {(item.nombre || '?').trim().charAt(0).toUpperCase()}
                        </div>
                        <div className="cart-item-info">
                          <h4>{item.nombre}</h4>
                          <p>${formatCurrency(item.precio)} c/u</p>
                          {isOutOfStock && (
                            <div className="out-of-stock-controls">
                              <label className="vd-check vd-check--inline vd-check--warning">
                                <input
                                  type="checkbox"
                                  checked={item.allowOutOfStock}
                                  onChange={() => toggleAllowOutOfStock(item.productId)}
                                />
                                Permitir sin stock
                              </label>
                              {!item.allowOutOfStock && (
                                <div className="ui-error vd-stock-error">
                                  <span className="material-icons-round" aria-hidden="true">warning</span>
                                  Excede stock ({item.stockDisponible})
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="cart-item-controls">
                          <div className="vd-stepper">
                            <button type="button" onClick={() => updateQuantity(item.productId, Math.max(0, (parseInt(item.cantidad) || 0) - 1))} title="Reducir cantidad">−</button>
                            <input
                              type="number"
                              value={item.cantidad}
                              onChange={(e) => {
                                const val = e.target.value;
                                updateQuantity(item.productId, val === '' ? '' : parseInt(val) || 0);
                              }}
                              onBlur={(e) => {
                                if (e.target.value === '' || parseInt(e.target.value) <= 0) {
                                  updateQuantity(item.productId, 1);
                                }
                              }}
                              min="1"
                              onWheel={(e) => e.target.blur()}
                            />
                            <button type="button" onClick={() => updateQuantity(item.productId, (parseInt(item.cantidad) || 0) + 1)} title="Aumentar cantidad">+</button>
                          </div>
                        </div>
                        <div className="cart-item-subtotal">
                          ${formatCurrency(item.precio * item.cantidad)}
                        </div>
                        <button
                          type="button"
                          className="vd-remove ui-icon-btn ui-icon-btn--danger"
                          onClick={() => removeFromCart(item.productId)}
                          title="Eliminar del carrito"
                        >
                          <span className="material-icons-round" aria-hidden="true">delete_outline</span>
                        </button>
                      </div>
                    );
                  })}
                </>
              )}
              {/* Bonified Items Section */}
              {bonifiedCart.length > 0 && (
                <div className="bonified-section">
                  <h4 className="bonified-title">
                    <span className="material-icons-round" aria-hidden="true">card_giftcard</span>
                    Bonificados
                  </h4>
                  {bonifiedCart.map(item => (
                    <div key={item.productId} className="cart-item cart-item--bonified">
                      <div className="cart-item-info">
                        <h5>{item.nombre}</h5>
                        <p className="vd-free-price">$0.00</p>
                      </div>
                      <div className="cart-item-controls">
                        <div className="vd-stepper">
                          <button type="button" onClick={() => updateQuantity(item.productId, Math.max(0, (parseInt(item.cantidad) || 0) - 1), true)} aria-label="Reducir cantidad">−</button>
                          <input
                            type="number"
                            value={item.cantidad}
                            onChange={(e) => updateQuantity(item.productId, parseInt(e.target.value) || 0, true)}
                            min="1"
                            onWheel={(e) => e.target.blur()}
                            aria-label={`Cantidad de ${item.nombre}`}
                          />
                          <button type="button" onClick={() => updateQuantity(item.productId, (parseInt(item.cantidad) || 0) + 1, true)} aria-label="Aumentar cantidad">+</button>
                        </div>
                        <button type="button" className="vd-remove ui-icon-btn ui-icon-btn--danger" onClick={() => removeFromCart(item.productId, true)} aria-label="Eliminar bonificado">
                          <span className="material-icons-round" aria-hidden="true">delete_outline</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Total y "Finalizar Venta" siempre visibles al pie del carrito */}
          <div className="vd-cart-footer">
            <div className="cart-total">
              Total: <span className="cart-total-amount">${formatCurrency(calculateTotal())}</span>
            </div>

            <button
              type="button"
              className="btn-finalizar-venta ui-btn ui-btn--primary ui-btn--lg ui-btn--block"
              onClick={handleSubmitOrder}
              disabled={
                submitting ||
                (cart.length === 0 && promotionsCart.length === 0 && bonifiedCart.length === 0) ||
                (!selectedClient && !allowNoClient) ||
                cart.some(i => (parseFloat(i.cantidad) || 0) <= 0) ||
                cart.some(i => i.cantidad > i.stockDisponible && !i.allowOutOfStock)
              }
            >
              <span className="material-icons-round" aria-hidden="true">check_circle</span>
              {submitting ? 'Registrando…' : 'Finalizar Venta'}
            </button>
          </div>
        </div>
      </div>

      {/* Assortment Selection Modal */}
      {showAssortmentModal && selectedPromotion && (
        <AssortmentSelectionModal
          orderId={null} // Standalone mode
          promotion={selectedPromotion}
          isStandalone={true}
          existingProducts={catalogProducts.length > 0 ? catalogProducts : products}
          onClose={() => {
            setShowAssortmentModal(false);
            setSelectedPromotion(null);
          }}
          onConfirm={handleAssortmentConfirmation}
        />
      )}

      {/* Sticky Cart Footer - Mobile Only */}
      <div className="sticky-cart-footer">
        <div className="cart-summary">
          <div className="cart-summary-label">{(cart.length || 0) + (promotionsCart.length || 0)} Productos</div>
          <div className="cart-summary-total">${formatCurrency(calculateTotal())}</div>
        </div>
        <button type="button" className="btn-show-cart ui-btn ui-btn--primary ui-btn--lg" onClick={() => setShowMobileCart(true)}>
          <span className="material-icons-round" aria-hidden="true">shopping_cart</span>
          Ver Carrito
        </button>
      </div>

      {/* Mobile Cart Modal */}
      {/* Mientras se registra la venta el carrito no se cierra (evita reabrirlo y reenviar) */}
      <div className={`mobile-cart-modal-overlay ui-modal-overlay ${!showMobileCart ? 'hidden' : ''}`} onClick={() => { if (!submitting) setShowMobileCart(false); }}>
        <div
          className="mobile-cart-modal ui-modal ui-modal--md"
          role="dialog"
          aria-modal="true"
          aria-labelledby="vd-mobile-cart-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="ui-modal-header">
            <span className="ui-modal-icon" aria-hidden="true">
              <span className="material-icons-round">shopping_cart</span>
            </span>
            <div className="ui-modal-heading">
              <h3 id="vd-mobile-cart-title" className="ui-modal-title">
                Carrito
              </h3>
            </div>
            <button type="button" className="modal-close ui-icon-btn" onClick={() => setShowMobileCart(false)} disabled={submitting} aria-label="Cerrar carrito">
              <span className="material-icons-round" aria-hidden="true">close</span>
            </button>
          </div>
          <div className="ui-modal-body ui-modal-body--plain vd-sheet-body">
            {/* Render the same cart content */}
            <div className="carrito-section carrito-section--sheet">
              <div className="ui-field vd-field">
                <label htmlFor="cliente-select-mobile" className="ui-label vd-label">
                  <span className="material-icons-round" aria-hidden="true">person</span>
                  Cliente
                </label>
                {/* Un solo campo: se escribe nombre o teléfono y la lista se va filtrando */}
                <SearchableSelect
                  id="cliente-select-mobile"
                  value={selectedClient}
                  onChange={(e) => {
                    setSelectedClient(e.target.value);
                    setAllowNoClient(false);
                  }}
                  disabled={allowNoClient}
                  options={clientOptions}
                  query={clientSearchTerm}
                  onQueryChange={setClientSearchTerm}
                  placeholder="Selecciona un cliente"
                  searchPlaceholder="Nombre, teléfono o NIT…"
                  noResultsText="Ningún cliente coincide"
                  aria-label="Buscar cliente"
                />
              </div>

              <div className="vd-check">
                <input
                  id="sin-cliente-mobile"
                  type="checkbox"
                  checked={allowNoClient}
                  onChange={(e) => {
                    setAllowNoClient(e.target.checked);
                    if (e.target.checked) {
                      setSelectedClient('');
                    }
                  }}
                />
                <label htmlFor="sin-cliente-mobile">
                  Venta sin cliente (confirmo que estoy seguro)
                </label>
              </div>

              <div className="ui-field vd-field">
                <label htmlFor="notas-mobile" className="ui-label vd-label">
                  <span className="material-icons-round" aria-hidden="true">notes</span>
                  Notas / Productos sin stock
                </label>
                <textarea
                  id="notas-mobile"
                  className="ui-textarea"
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  rows="3"
                  placeholder="Ej: Cliente solicita producto X sin stock, contactar proveedor..."
                />
              </div>

              {/* ADMIN/OWNER ONLY: Asignar Vendedor */}
              {isAdminOrOwner && (
                <div className="ui-field vd-field">
                  <label id="vendedor-select-mobile-label" htmlFor="vendedor-select-mobile" className="ui-label vd-label">
                    <span className="material-icons-round" aria-hidden="true">badge</span>
                    Asignar Vendedor <span className="ui-required">*</span>
                  </label>
                  {/* aria-labelledby: la lista se anuncia con la etiqueta sin el nombre del icono */}
                  <SearchableSelect
                    id="vendedor-select-mobile"
                    value={assignedVendor}
                    onChange={(e) => setAssignedVendor(e.target.value)}
                    options={vendedorOptions}
                    placeholder="Selecciona un vendedor"
                    searchPlaceholder="Buscar vendedor…"
                    noResultsText="Ningún vendedor coincide"
                    aria-labelledby="vendedor-select-mobile-label"
                  />
                </div>
              )}

              {/* Cart Items Display */}
              <div className="cart-items">
                {cart.length === 0 && promotionsCart.length === 0 ? (
                  <div className="empty-cart">
                    <span className="material-icons-round" aria-hidden="true">shopping_bag</span>
                    <span>El carrito está vacío</span>
                  </div>
                ) : (
                  <>
                    {/* Regular Items */}
                    {cart.map(item => (
                      <div key={item.productId} className="cart-item">
                        <div className={`cart-item-avatar ui-avatar ui-avatar--${avatarTone(item.nombre)}`} aria-hidden="true">
                          {(item.nombre || '?').trim().charAt(0).toUpperCase()}
                        </div>
                        <div className="cart-item-info">
                          <h5>{item.nombre}</h5>
                          <p>${formatCurrency(item.precio)} c/u</p>
                        </div>
                        <div className="cart-item-controls">
                          <div className="vd-stepper">
                            <button type="button" onClick={() => updateQuantity(item.productId, Math.max(0, (parseInt(item.cantidad) || 0) - 1))} aria-label="Reducir cantidad">−</button>
                            <input
                              type="number"
                              value={item.cantidad}
                              onChange={(e) => updateQuantity(item.productId, parseInt(e.target.value) || 0)}
                              min="1"
                              onWheel={(e) => e.target.blur()}
                              aria-label={`Cantidad de ${item.nombre}`}
                            />
                            <button type="button" onClick={() => updateQuantity(item.productId, (parseInt(item.cantidad) || 0) + 1)} aria-label="Aumentar cantidad">+</button>
                          </div>
                        </div>
                        <div className="cart-item-subtotal">
                          ${formatCurrency((parseFloat(item.precio) || 0) * (parseFloat(item.cantidad) || 0))}
                        </div>
                        <button type="button" className="vd-remove ui-icon-btn ui-icon-btn--danger" onClick={() => removeFromCart(item.productId)} aria-label="Eliminar del carrito">
                          <span className="material-icons-round" aria-hidden="true">delete_outline</span>
                        </button>
                      </div>
                    ))}

                    {/* Promotions */}
                    {promotionsCart.map(promo => (
                      <div key={promo.cartId} className="cart-item promotion-item">
                        <div className="cart-item-info">
                          <h5><span className="material-icons-round" aria-hidden="true">local_offer</span>{promo.nombre}</h5>
                          <p>${formatCurrency(parseFloat(promo.packPrice || 0))}</p>
                          {isAssortmentPromotion(promo) && <AssortmentCartDetail promo={promo} />}
                        </div>
                        <button type="button" className="vd-remove ui-icon-btn ui-icon-btn--danger" onClick={() => removePromotionFromCart(promo.cartId)} aria-label="Eliminar promoción">
                          <span className="material-icons-round" aria-hidden="true">delete_outline</span>
                        </button>
                      </div>
                    ))}

                    {/* Bonified Items */}
                    {bonifiedCart.length > 0 && (
                      <div className="bonified-section">
                        <h4 className="bonified-title"><span className="material-icons-round" aria-hidden="true">card_giftcard</span>Bonificaciones</h4>
                        {bonifiedCart.map(item => (
                          <div key={item.productId} className="cart-item cart-item--bonified">
                            <div className="cart-item-info">
                              <h5>{item.nombre}</h5>
                              <p className="vd-free-price">$0.00</p>
                            </div>
                            <div className="cart-item-controls">
                              <div className="vd-stepper">
                                <button type="button" onClick={() => updateQuantity(item.productId, Math.max(0, (parseInt(item.cantidad) || 0) - 1), true)} aria-label="Reducir cantidad">−</button>
                                <input
                                  type="number"
                                  value={item.cantidad}
                                  onChange={(e) => updateQuantity(item.productId, parseInt(e.target.value) || 0, true)}
                                  min="1"
                                  onWheel={(e) => e.target.blur()}
                                  aria-label={`Cantidad de ${item.nombre}`}
                                />
                                <button type="button" onClick={() => updateQuantity(item.productId, (parseInt(item.cantidad) || 0) + 1, true)} aria-label="Aumentar cantidad">+</button>
                              </div>
                              <button type="button" className="vd-remove ui-icon-btn ui-icon-btn--danger" onClick={() => removeFromCart(item.productId, true)} aria-label="Eliminar bonificado">
                                <span className="material-icons-round" aria-hidden="true">delete_outline</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Pie fijo: total + "Finalizar Venta" siempre visibles mientras se revisa el carrito */}
          <div className="mobile-cart-actions ui-modal-footer">
            <div className="cart-total">
              Total: <span className="cart-total-amount">${formatCurrency(calculateTotal())}</span>
            </div>

            <button
              type="button"
              className="btn-finalizar-venta ui-btn ui-btn--primary ui-btn--lg"
              onClick={async () => {
                // El carrito se cierra solo cuando la venta quedó registrada; mientras tanto
                // el botón queda deshabilitado mostrando "Registrando…"
                if (await handleSubmitOrder()) setShowMobileCart(false);
              }}
              disabled={
                submitting ||
                (cart.length === 0 && promotionsCart.length === 0 && bonifiedCart.length === 0) ||
                (!selectedClient && !allowNoClient) ||
                cart.some(i => (parseFloat(i.cantidad) || 0) <= 0) ||
                cart.some(i => i.cantidad > i.stockDisponible && !i.allowOutOfStock)
              }
            >
              <span className="material-icons-round" aria-hidden="true">check_circle</span>
              {submitting ? 'Registrando…' : 'Finalizar Venta'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// PANEL VENTAS COMPLETADAS
// ============================================
function VentasCompletadasPanel({ refreshTrigger }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false); // ya terminó la primera carga
  const [searchTerm, setSearchTerm] = useState('');
  // Orden y ventas por página se recuerdan (la primera petición ya usa el tamaño guardado); la
  // búsqueda y la fecha no. Sin `sync`: el tamaño va en la consulta paginada y su handler vuelve
  // a la página 1, así que otra pestaña no lo cambia aquí (dejaría esta en una página que ya no
  // existe y sin paginación para volver); lo último elegido se usa al recargar.
  const [dateSort, setDateSort] = usePersistentState('vendedora.completed.sortDir', 'desc', {
    allowed: DATE_SORT_OPTIONS,
  });
  const [filterDate, setFilterDate] = useState(''); // fecha exacta de completado (yyyy-MM-dd)

  // ── PAGINACIÓN ──
  const [currentPage, setCurrentPage] = useState(0);
  const [pageSize, setPageSize] = usePersistentState('vendedora.completed.pageSize', 20, {
    allowed: PAGE_SIZE_OPTIONS,
  });
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);

  // Recarga silenciosa: número de petición (solo la última aplica su respuesta, así una vieja no
  // devuelve a la página anterior) y parámetros de la última petición (si son los mismos, solo
  // llegó INVENTORY_UPDATE o "Actualizar": se reemplaza la lista sin esqueleto).
  const reqRef = useRef(0);
  const lastParamsRef = useRef(null);

  const fetchCompletedOrders = useCallback(async (page = 0, size = 20, search = "", completedDate = "") => {
    const reqId = ++reqRef.current;
    const paramsKey = JSON.stringify([page, size, search, completedDate]);
    const silent = lastParamsRef.current === paramsKey;
    lastParamsRef.current = paramsKey;
    if (!silent) setLoading(true);
    try {
      const p = { statusGroup: 'completed', page, size };
      if (search && search.trim() !== '') p.search = search.trim();
      if (completedDate) p.completedDate = completedDate; // filtro por fecha exacta de completado
      const response = await apiClient.get('/vendedor/orders/my/paginated', {
        params: p
      });
      if (reqId !== reqRef.current) return; // llegó una petición más nueva
      const data = response.data;
      setOrders(data.content || []);
      setTotalPages(data.totalPages || 0);
      setTotalElements(data.totalElements || 0);
      setCurrentPage(data.number || 0);
    } catch (error) {
      // Si falla, la lista que ya se ve se conserva
      console.error('Error al cargar ventas completadas:', error);
    } finally {
      if (reqId === reqRef.current) {
        setLoading(false);
        setHasLoaded(true);
      }
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCompletedOrders(currentPage, pageSize, searchTerm, filterDate);
    }, 400);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, pageSize, searchTerm, filterDate, fetchCompletedOrders, refreshTrigger]);

  const filteredAndSortedOrders = [...orders]
    .sort((a, b) => {
      const dateA = new Date(a.completedAt || a.fecha);
      const dateB = new Date(b.completedAt || b.fecha);
      return dateSort === 'desc' ? dateB - dateA : dateA - dateB;
    });

  // Esqueleto de todo el panel solo en la primera carga; después (otra página, búsqueda o
  // fecha) solo la lista, para que el buscador y la fecha no se desmonten mientras se escribe.
  if (loading && !hasLoaded) {
    return <PanelSkeleton label="Cargando ventas completadas" />;
  }

  return (
    <div className="ventas-completadas-panel">
      <header className="ui-page-header vd-page-header">
        <div className="ui-page-heading">
          <h2 className="ui-page-title"><span className="material-icons-round" aria-hidden="true">check_circle</span> Ventas Completadas</h2>
        </div>
      </header>

      <div className="ventas-filter-toolbar ui-toolbar">
        <div className="ventas-search-container ui-search">
          <span className="material-icons-round ui-search-icon" aria-hidden="true">search</span>
          <input
            type="text"
            className="ventas-search-input ui-input"
            placeholder="Buscar por cliente, factura, pedido (P-123), producto, estado, nota..."
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setCurrentPage(0); }}
            aria-label="Buscar ventas completadas"
          />
          {searchTerm && (
            <button type="button" className="ui-icon-btn ui-search-clear" onClick={() => { setSearchTerm(''); setCurrentPage(0); }} aria-label="Limpiar búsqueda">
              <span className="material-icons-round" aria-hidden="true">close</span>
            </button>
          )}
        </div>
        <div className="ventas-date-container vd-filter">
          <span className="material-icons-round vd-filter-icon" title="Filtrar por fecha de completado">event</span>
          <input
            type="date"
            className="ventas-date-input ui-input"
            value={filterDate}
            onChange={e => { setFilterDate(e.target.value); setCurrentPage(0); }}
            title="Mostrar solo ventas completadas en esta fecha exacta"
          />
          {filterDate && (
            <button type="button" className="ui-icon-btn" onClick={() => { setFilterDate(''); setCurrentPage(0); }} title="Limpiar fecha">
              <span className="material-icons-round" aria-hidden="true">close</span>
            </button>
          )}
        </div>
        <div className="ventas-sort-container vd-filter">
          <span className="material-icons-round vd-filter-icon" aria-hidden="true">sort</span>
          <select
            className="ventas-sort-select ui-select"
            value={dateSort}
            onChange={e => setDateSort(e.target.value)}
            aria-label="Ordenar por fecha"
          >
            <option value="desc">Más recientes primero</option>
            <option value="asc">Más antiguas primero</option>
          </select>
        </div>
      </div>

      {loading ? (
        <PanelSkeleton label="Cargando ventas completadas" showHeading={false} />
      ) : filteredAndSortedOrders.length === 0 ? (
        <div className="ui-empty vd-list-empty">
          <span className="material-icons-round ui-empty-icon" aria-hidden="true">receipt_long</span>
          <p className="ui-empty-text">{(searchTerm || filterDate) ? 'No se encontraron ventas con esos filtros' : 'No tienes ventas completadas aún'}</p>
        </div>
      ) : (
        <div className="ventas-list ui-stagger">
          {filteredAndSortedOrders.map(order => (
            <div key={order.id} className={`venta-card completed ui-stripe ui-stripe--success payment-${order.paymentStatus?.toLowerCase() || 'pending'}`}>
              <div className="venta-header">
                <span className="venta-id">{formatOrderLabel(order)}</span>
                <span className="venta-status status-completado ui-badge ui-badge--success">
                  <span className="material-icons-round" aria-hidden="true">check_circle</span> COMPLETADO
                </span>
              </div>

              <div className="venta-info">
                <p>
                  <strong>Cliente:</strong>{' '}
                  <span className="venta-client">
                    {order.cliente && (
                      <span className={`ui-avatar ui-avatar--sm ui-avatar--${avatarTone(order.cliente)} venta-client-avatar`} aria-hidden="true">
                        {avatarInitials(order.cliente)}
                      </span>
                    )}
                    {order.cliente || 'Sin cliente'}
                  </span>
                </p>
                <p>
                  <strong>{order.estado === 'COMPLETADO' ? 'Fecha factura:' : 'Fecha:'}</strong>{' '}
                  {order.estado === 'COMPLETADO' && order.completedAt
                    ? new Date(order.completedAt).toLocaleDateString('es-ES')
                    : new Date(order.fecha).toLocaleString()}
                </p>
                <p className="venta-total-row"><strong>Total:</strong> <span className="venta-total ui-amount--success">${formatCurrency(parseFloat(order.total))}</span></p>

                {order.notas && (
                  <div className="venta-notes">
                    <strong><span className="material-icons-round" aria-hidden="true">note</span> Notes:</strong>
                    <p>{order.notas}</p>
                  </div>
                )}
              </div>

              <details className="venta-details">
                <summary>Ver productos</summary>
                <ul>
                  {order.items.map((item, idx) => (
                    <li key={idx}>
                      {item.productName} - {item.cantidad} x ${formatCurrency(parseFloat(item.precioUnitario))}
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          ))}
        </div>
      )}
      {/* ─ PAGINACIÓN VENTAS COMPLETADAS ─ */}
      {totalPages > 1 && (
        <nav className="vd-pagination" aria-label="Paginación">
          <div className="vd-pagination-size">
            Mostrar
            <select
              className="ui-select vd-pagination-select"
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(0); }}
              aria-label="Ventas por página"
            >
              {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            por página &bull; {totalElements} total
          </div>
          <div className="vd-pagination-pages">
            <button type="button" className="ui-icon-btn ui-icon-btn--bordered" onClick={() => setCurrentPage(p => Math.max(0, p - 1))} disabled={currentPage === 0}
              aria-label="Página anterior">
              <span className="material-icons-round" aria-hidden="true">chevron_left</span>
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const start = Math.max(0, Math.min(currentPage - 2, totalPages - 5));
              const pageNum = start + i;
              return (
                <button type="button" key={pageNum} onClick={() => setCurrentPage(pageNum)}
                  className={`vd-page-btn ${pageNum === currentPage ? 'is-active' : ''}`}
                  aria-current={pageNum === currentPage ? 'page' : undefined}>
                  {pageNum + 1}
                </button>
              );
            })}
            <button type="button" className="ui-icon-btn ui-icon-btn--bordered" onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))} disabled={currentPage >= totalPages - 1}
              aria-label="Página siguiente">
              <span className="material-icons-round" aria-hidden="true">chevron_right</span>
            </button>
            <span className="vd-pagination-info">Pág. {currentPage + 1}/{totalPages}</span>
          </div>
        </nav>
      )}
    </div>
  );
}

// ============================================
// PANEL CLIENTES
// ============================================
function ClientesPanel({ refreshTrigger }) {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const reqRef = useRef(0); // solo la última petición aplica su respuesta

  // Recarga en su lugar con cada refreshTrigger: "loading" solo es true en la carga inicial,
  // así los modales de crear/editar cliente y la búsqueda siguen como estaban.
  useEffect(() => {
    fetchClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger]);

  const fetchClients = async () => {
    const reqId = ++reqRef.current;
    try {
      const response = await apiClient.get('/vendedor/clients');
      if (reqId !== reqRef.current) return; // llegó una petición más nueva
      setClients(response.data);
    } catch (error) {
      // Si falla, la lista que ya se ve se conserva
      console.error('Error al cargar clientes:', error);
    } finally {
      if (reqId === reqRef.current) setLoading(false);
    }
  };

  const handleEdit = (cliente) => {
    setEditingClient(cliente);
  };

  const handleCloseEdit = () => {
    setEditingClient(null);
  };

  // Filter clients by nombre, administrador, or representanteLegal
  const filteredClients = clients.filter(c => {
    const term = searchTerm.toLowerCase();
    return (
      (c.nombre || '').toLowerCase().includes(term) ||
      (c.administrador || '').toLowerCase().includes(term) ||
      (c.representanteLegal || '').toLowerCase().includes(term)
    );
  });

  if (loading) {
    return <PanelSkeleton label="Cargando clientes" variant="clients" />;
  }

  return (
    <div className="clientes-panel">
      <header className="ui-page-header vd-page-header">
        <div className="ui-page-heading">
          <h2 className="ui-page-title"><span className="material-icons-round" aria-hidden="true">people</span> Clientes</h2>
        </div>
        <div className="ui-page-actions">
          <button type="button" className="ui-btn ui-btn--primary vd-page-cta" onClick={() => setShowModal(true)}>
            + Nuevo Cliente
          </button>
        </div>
      </header>

      {/* Modal de Detalle de Venta */}
      <div className="ui-toolbar vd-list-toolbar">
        <div className="ui-search">
          <span className="material-icons-round ui-search-icon" aria-hidden="true">search</span>
          <input
            type="text"
            placeholder="Buscar por nombre, administrador o representante legal..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="ui-input"
            aria-label="Buscar clientes"
          />
        </div>
      </div>

      <div className="clientes-grid ui-stagger">
        {filteredClients.length === 0 ? (
          <div className="ui-empty vd-grid-empty">
            <span className="material-icons-round ui-empty-icon" aria-hidden="true">person_search</span>
            <p className="ui-empty-text">No se encontraron clientes</p>
          </div>
        ) : (
          filteredClients.map(cliente => (
            <div key={cliente.id} className="cliente-card">
              <div className="cliente-card-head">
                <span className={`ui-avatar ui-avatar--${avatarTone(cliente.nombre)}`} aria-hidden="true">
                  {avatarInitials(cliente.nombre)}
                </span>
                <h3>{cliente.nombre}</h3>
              </div>
              {/* Contacto con icono de color por categoría; el dato vacío en texto tenue */}
              <ul className="ui-info-list cliente-info">
                <li className={`ui-info-row${cliente.email ? '' : ' is-empty'}`}>
                  <span className="ui-icon-tile ui-icon-tile--sm ui-icon-tile--primary" aria-hidden="true"><span className="material-icons-round">email</span></span>
                  <span>{cliente.email || 'Sin correo'}</span>
                </li>
                <li className={`ui-info-row${cliente.telefono ? '' : ' is-empty'}`}>
                  <span className="ui-icon-tile ui-icon-tile--sm ui-icon-tile--success" aria-hidden="true"><span className="material-icons-round">phone</span></span>
                  <span>{cliente.telefono || 'Sin teléfono'}</span>
                </li>
                <li className={`ui-info-row${cliente.direccion ? '' : ' is-empty'}`}>
                  <span className="ui-icon-tile ui-icon-tile--sm ui-icon-tile--warning" aria-hidden="true"><span className="material-icons-round">place</span></span>
                  <span>{cliente.direccion || 'Sin dirección'}</span>
                </li>
                <li className={`ui-info-row${cliente.nit ? '' : ' is-empty'}`}>
                  <span className="ui-icon-tile ui-icon-tile--sm ui-icon-tile--teal" aria-hidden="true"><span className="material-icons-round">home_work</span></span>
                  <span>{cliente.nit || 'Sin NIT'}</span>
                </li>
              </ul>
              <div className="cliente-stats">
                <span><span className="material-icons-round" aria-hidden="true">shopping_bag</span> Compras: <span className="ui-amount--success">${formatCurrency(parseFloat(cliente.totalCompras || 0))}</span></span>
              </div>
              <button
                type="button"
                className="btn-edit-client ui-btn ui-btn--secondary ui-btn--sm ui-btn--block"
                onClick={() => handleEdit(cliente)}
              >
                <span className="material-icons-round" aria-hidden="true">edit</span>
                Editar
              </button>
            </div>
          ))
        )}
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

      {editingClient && (
        <ClientEditModal
          clientData={editingClient}
          onClose={handleCloseEdit}
          onSuccess={() => {
            handleCloseEdit();
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
    nit: '',
    nombre: '',
    administrador: '',
    representanteLegal: '',
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
      await apiClient.post('/vendedor/clients', formData);
      toast.success(`¡Cliente creado! Credenciales de acceso - Usuario: ${formData.nit} | Contraseña: ${formData.nit}`);
      onSuccess();
    } catch (error) {
      console.error('Error al crear cliente:', error);
      toast.error('Error al crear cliente: ' + (error.response?.data?.message || error.message));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ui-modal-overlay vd-modal-overlay" onClick={(e) => e.stopPropagation()}>
      <div
        className="ui-modal ui-modal--md"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vd-client-new-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ui-modal-header">
          <span className="ui-modal-icon" aria-hidden="true">
            <span className="material-icons-round">person_add</span>
          </span>
          <div className="ui-modal-heading">
            <h3 id="vd-client-new-title" className="ui-modal-title">Nuevo Cliente</h3>
            <p className="ui-modal-subtitle">Datos del establecimiento y de contacto.</p>
          </div>
          <button type="button" className="ui-icon-btn" onClick={onClose} aria-label="Cerrar">
            <span className="material-icons-round" aria-hidden="true">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="client-form vd-modal-form">
          <div className="ui-modal-body">
            {/* Información sobre credenciales del cliente */}
            <div className="client-credentials-info ui-alert ui-alert--info">
              <span className="material-icons-round" aria-hidden="true">info</span>
              <div>
                <strong className="ui-alert-title">Credenciales del cliente:</strong>
                El cliente podrá acceder al sistema usando su <strong>NIT</strong> como usuario y contraseña.
              </div>
            </div>

            <section className="ui-section">
              <div className="ui-section-head">
                <span className="ui-icon-tile ui-icon-tile--primary" aria-hidden="true">
                  <span className="material-icons-round">storefront</span>
                </span>
                <div>
                  <h4 className="ui-section-title">Establecimiento</h4>
                  <p className="ui-section-desc">Identificación y responsables del negocio.</p>
                </div>
              </div>
              <div className="ui-grid">
                <div className="ui-field ui-span-full">
                  <label className="ui-label" htmlFor="vd-new-nit">NIT <span className="ui-required">*</span></label>
                  <input
                    id="vd-new-nit"
                    className="ui-input"
                    type="text"
                    value={formData.nit}
                    onChange={(e) => setFormData({ ...formData, nit: e.target.value })}
                    placeholder="Ej: 123456789"
                    required
                  />
                  <small className="ui-help vd-help">
                    <span className="material-icons-round" aria-hidden="true">vpn_key</span>
                    Este será el usuario y contraseña del cliente
                  </small>
                </div>

                <div className="ui-field ui-span-full">
                  <label className="ui-label" htmlFor="vd-new-nombre">Nombre de Establecimiento <span className="ui-required">*</span></label>
                  <input
                    id="vd-new-nombre"
                    className="ui-input"
                    type="text"
                    value={formData.nombre}
                    onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                    placeholder="Nombre del establecimiento"
                    required
                  />
                </div>

                <div className="ui-field">
                  <label className="ui-label" htmlFor="vd-new-admin">Administrador <span className="ui-required">*</span></label>
                  <input
                    id="vd-new-admin"
                    className="ui-input"
                    type="text"
                    value={formData.administrador}
                    onChange={(e) => setFormData({ ...formData, administrador: e.target.value })}
                    placeholder="Nombre del administrador"
                    required
                  />
                </div>

                <div className="ui-field">
                  <label className="ui-label" htmlFor="vd-new-rep">Representante Legal <span className="ui-required">*</span></label>
                  <input
                    id="vd-new-rep"
                    className="ui-input"
                    type="text"
                    value={formData.representanteLegal}
                    onChange={(e) => setFormData({ ...formData, representanteLegal: e.target.value })}
                    placeholder="Nombre del representante legal"
                    required
                  />
                </div>
              </div>
            </section>

            <section className="ui-section">
              <div className="ui-section-head">
                <span className="ui-icon-tile ui-icon-tile--success" aria-hidden="true">
                  <span className="material-icons-round">contact_phone</span>
                </span>
                <div>
                  <h4 className="ui-section-title">Contacto</h4>
                  <p className="ui-section-desc">Para comunicarte con el cliente y entregar los pedidos.</p>
                </div>
              </div>
              <div className="ui-grid">
                <div className="ui-field">
                  <label className="ui-label" htmlFor="vd-new-email">Email <span className="ui-required">*</span></label>
                  <input
                    id="vd-new-email"
                    className="ui-input"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="correo@ejemplo.com"
                    required
                  />
                </div>

                <div className="ui-field">
                  <label className="ui-label" htmlFor="vd-new-tel">Teléfono <span className="ui-required">*</span></label>
                  <input
                    id="vd-new-tel"
                    className="ui-input"
                    type="tel"
                    value={formData.telefono}
                    onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                    placeholder="Número de teléfono"
                    required
                  />
                </div>

                <div className="ui-field ui-span-full">
                  <label className="ui-label" htmlFor="vd-new-dir">Dirección <span className="ui-required">*</span></label>
                  <textarea
                    id="vd-new-dir"
                    className="ui-textarea"
                    value={formData.direccion}
                    onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
                    rows="2"
                    placeholder="Dirección del cliente"
                    required
                  />
                </div>
              </div>
            </section>
          </div>

          <div className="ui-modal-footer">
            <button type="button" onClick={onClose} className="ui-btn ui-btn--secondary">
              Cancelar
            </button>
            <button type="submit" disabled={saving || !formData.nit.trim() || !formData.nombre.trim() || !formData.administrador.trim() || !formData.representanteLegal.trim()} className="ui-btn ui-btn--primary">
              {saving ? 'Guardando...' : 'Crear Cliente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================
// MODAL EDITAR CLIENTE
// ============================================
function ClientEditModal({ clientData, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    nit: clientData.nit || '',
    nombre: clientData.nombre || '',
    administrador: clientData.administrador || '',
    representanteLegal: clientData.representanteLegal || '',
    email: clientData.email || '',
    telefono: clientData.telefono || '',
    direccion: clientData.direccion || ''
  });
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      await apiClient.patch(`/vendedor/clients/${clientData.id}`, formData);
      toast.success('¡Cliente actualizado exitosamente!');
      onSuccess();
    } catch (error) {
      console.error('Error al actualizar cliente:', error);
      toast.error('Error al actualizar cliente: ' + (error.response?.data?.message || error.message));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ui-modal-overlay vd-modal-overlay" onClick={(e) => e.stopPropagation()}>
      <div
        className="ui-modal ui-modal--md"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vd-client-edit-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ui-modal-header">
          <span className="ui-modal-icon" aria-hidden="true">
            <span className="material-icons-round">edit</span>
          </span>
          <div className="ui-modal-heading">
            <h3 id="vd-client-edit-title" className="ui-modal-title">
              Editar Cliente
            </h3>
            <p className="ui-modal-subtitle">{clientData.nombre}</p>
          </div>
          <button type="button" className="ui-icon-btn" onClick={onClose} aria-label="Cerrar">
            <span className="material-icons-round" aria-hidden="true">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="client-form vd-modal-form">
          <div className="ui-modal-body">
            <section className="ui-section">
              <div className="ui-section-head">
                <span className="ui-icon-tile ui-icon-tile--primary" aria-hidden="true">
                  <span className="material-icons-round">storefront</span>
                </span>
                <div>
                  <h4 className="ui-section-title">Establecimiento</h4>
                  <p className="ui-section-desc">Identificación y responsables del negocio.</p>
                </div>
              </div>
              <div className="ui-grid">
                <div className="ui-field ui-span-full">
                  <label className="ui-label" htmlFor="vd-edit-nit">NIT <span className="ui-required">*</span></label>
                  <input
                    id="vd-edit-nit"
                    className="ui-input"
                    type="text"
                    value={formData.nit}
                    onChange={(e) => setFormData({ ...formData, nit: e.target.value })}
                    placeholder="Ej: 123456789"
                    required
                  />
                </div>

                <div className="ui-field ui-span-full">
                  <label className="ui-label" htmlFor="vd-edit-nombre">Nombre de Establecimiento <span className="ui-required">*</span></label>
                  <input
                    id="vd-edit-nombre"
                    className="ui-input"
                    type="text"
                    value={formData.nombre}
                    onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                    placeholder="Nombre del establecimiento"
                    required
                  />
                </div>

                <div className="ui-field">
                  <label className="ui-label" htmlFor="vd-edit-admin">Administrador <span className="ui-required">*</span></label>
                  <input
                    id="vd-edit-admin"
                    className="ui-input"
                    type="text"
                    value={formData.administrador}
                    onChange={(e) => setFormData({ ...formData, administrador: e.target.value })}
                    placeholder="Nombre del administrador"
                    required
                  />
                </div>

                <div className="ui-field">
                  <label className="ui-label" htmlFor="vd-edit-rep">Representante Legal <span className="ui-required">*</span></label>
                  <input
                    id="vd-edit-rep"
                    className="ui-input"
                    type="text"
                    value={formData.representanteLegal}
                    onChange={(e) => setFormData({ ...formData, representanteLegal: e.target.value })}
                    placeholder="Nombre del representante legal"
                    required
                  />
                </div>
              </div>
            </section>

            <section className="ui-section">
              <div className="ui-section-head">
                <span className="ui-icon-tile ui-icon-tile--success" aria-hidden="true">
                  <span className="material-icons-round">contact_phone</span>
                </span>
                <div>
                  <h4 className="ui-section-title">Contacto</h4>
                  <p className="ui-section-desc">Para comunicarte con el cliente y entregar los pedidos.</p>
                </div>
              </div>
              <div className="ui-grid">
                <div className="ui-field">
                  <label className="ui-label" htmlFor="vd-edit-email">Email</label>
                  <input
                    id="vd-edit-email"
                    className="ui-input"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="correo@ejemplo.com (Opcional)"
                  />
                </div>

                <div className="ui-field">
                  <label className="ui-label" htmlFor="vd-edit-tel">Teléfono</label>
                  <input
                    id="vd-edit-tel"
                    className="ui-input"
                    type="tel"
                    value={formData.telefono}
                    onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                    placeholder="Número de teléfono (Opcional)"
                  />
                </div>

                <div className="ui-field ui-span-full">
                  <label className="ui-label" htmlFor="vd-edit-dir">Dirección</label>
                  <textarea
                    id="vd-edit-dir"
                    className="ui-textarea"
                    value={formData.direccion}
                    onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
                    rows="2"
                    placeholder="Dirección del cliente (Opcional)"
                  />
                </div>
              </div>
            </section>
          </div>

          <div className="ui-modal-footer">
            <button type="button" onClick={onClose} className="ui-btn ui-btn--secondary">
              Cancelar
            </button>
            <button type="submit" disabled={saving || !formData.nit.trim() || !formData.nombre.trim() || !formData.administrador.trim() || !formData.representanteLegal.trim()} className="ui-btn ui-btn--primary">
              {saving ? 'Guardando...' : 'Guardar Cambios'}
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
function MisVentasPanel({ refreshTrigger }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false); // ya terminó la primera carga
  const [searchTerm, setSearchTerm] = useState('');
  // Orden y ventas por página se recuerdan, sin `sync` (ver VentasCompletadasPanel); la búsqueda no
  const [dateSort, setDateSort] = usePersistentState('vendedora.myOrders.sortDir', 'desc', {
    allowed: DATE_SORT_OPTIONS,
  });

  // ── PAGINACIÓN ──
  const [currentPage, setCurrentPage] = useState(0);
  const [pageSize, setPageSize] = usePersistentState('vendedora.myOrders.pageSize', 20, {
    allowed: PAGE_SIZE_OPTIONS,
  });
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);

  // Recarga silenciosa (ver VentasCompletadasPanel): número de petición + parámetros de la última
  const reqRef = useRef(0);
  const lastParamsRef = useRef(null);

  const fetchMyOrders = useCallback(async (page = 0, size = 20, search = '') => {
    const reqId = ++reqRef.current;
    const paramsKey = JSON.stringify([page, size, search]);
    const silent = lastParamsRef.current === paramsKey;
    lastParamsRef.current = paramsKey;
    if (!silent) setLoading(true);
    try {
      const p = { statusGroup: 'pending', page, size };
      if (search && search.trim() !== '') p.search = search.trim();
      const response = await apiClient.get('/vendedor/orders/my/paginated', {
        params: p
      });
      if (reqId !== reqRef.current) return; // llegó una petición más nueva
      const data = response.data;
      setOrders(data.content || []);
      setTotalPages(data.totalPages || 0);
      setTotalElements(data.totalElements || 0);
      setCurrentPage(data.number || 0);
    } catch (error) {
      // Si falla, la lista que ya se ve se conserva
      console.error('Error al cargar mis ventas:', error);
    } finally {
      if (reqId === reqRef.current) {
        setLoading(false);
        setHasLoaded(true);
      }
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchMyOrders(currentPage, pageSize, searchTerm);
    }, 400);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, pageSize, searchTerm, fetchMyOrders, refreshTrigger]);

  const filteredAndSortedOrders = [...orders]
    .sort((a, b) => {
      const dateA = new Date(a.fecha);
      const dateB = new Date(b.fecha);
      return dateSort === 'desc' ? dateB - dateA : dateA - dateB;
    });

  // Esqueleto de todo el panel solo en la primera carga; después, solo en la lista (el
  // buscador no se desmonta: no se pierde el foco ni se cierra el teclado del celular)
  if (loading && !hasLoaded) {
    return <PanelSkeleton label="Cargando mis ventas" />;
  }

  return (
    <div className="mis-ventas-panel">
      <header className="ui-page-header vd-page-header">
        <div className="ui-page-heading">
          <h2 className="ui-page-title"><span className="material-icons-round" aria-hidden="true">receipt_long</span> Mis Ventas (En Progreso)</h2>
        </div>
      </header>

      <div className="ventas-filter-toolbar ui-toolbar">
        <div className="ventas-search-container ui-search">
          <span className="material-icons-round ui-search-icon" aria-hidden="true">search</span>
          <input
            type="text"
            className="ventas-search-input ui-input"
            placeholder="Buscar por cliente, factura, pedido (P-123), producto, estado, nota..."
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setCurrentPage(0); }}
            aria-label="Buscar mis ventas"
          />
          {searchTerm && (
            <button type="button" className="ui-icon-btn ui-search-clear" onClick={() => { setSearchTerm(''); setCurrentPage(0); }} aria-label="Limpiar búsqueda">
              <span className="material-icons-round" aria-hidden="true">close</span>
            </button>
          )}
        </div>
        <div className="ventas-sort-container vd-filter">
          <span className="material-icons-round vd-filter-icon" aria-hidden="true">sort</span>
          <select
            className="ventas-sort-select ui-select"
            value={dateSort}
            onChange={e => setDateSort(e.target.value)}
            aria-label="Ordenar por fecha"
          >
            <option value="desc">Más recientes primero</option>
            <option value="asc">Más antiguas primero</option>
          </select>
        </div>
      </div>

      {loading ? (
        <PanelSkeleton label="Cargando mis ventas" showHeading={false} />
      ) : filteredAndSortedOrders.length === 0 ? (
        <div className="ui-empty vd-list-empty">
          <span className="material-icons-round ui-empty-icon" aria-hidden="true">receipt_long</span>
          <p className="ui-empty-text">{searchTerm ? 'No se encontraron ventas con esa búsqueda' : 'No tienes ventas en proceso'}</p>
        </div>
      ) : (
        <div className="ventas-list ui-stagger">
          {filteredAndSortedOrders.map(order => (
            <div key={order.id} className={`venta-card ui-stripe ui-stripe--${estadoTone(order.estado)} ${order.isSROrder ? 'is-sr' : 'is-normal'} payment-${order.paymentStatus?.toLowerCase() || 'pending'}`}>
              <div className="venta-header">
                <div className="venta-header-main">
                  <span className="venta-id">
                    {formatOrderLabel(order)}
                  </span>
                  {order.isSROrder && (
                    <span className="tag-badge tag-sr">S/N</span>
                  )}
                </div>
                <span className={`venta-status ui-badge status-${order.estado ? order.estado.toLowerCase() : 'pendiente'}`}>
                  {order.estado === 'PENDING_PROMOTION_COMPLETION' ? (
                    <span className="venta-status-inline">
                      <span className="material-icons-round" aria-hidden="true">warning_amber</span>
                      PENDIENTE SURTIDO
                    </span>
                  ) : (
                    <>
                      {ESTADO_ICON[order.estado || 'PENDIENTE'] && (
                        <span className="material-icons-round" aria-hidden="true">{ESTADO_ICON[order.estado || 'PENDIENTE']}</span>
                      )}
                      {order.estado || 'PENDIENTE'}
                    </>
                  )}
                </span>
              </div>

              <div className="venta-info">
                <p>
                  <strong>Cliente:</strong>{' '}
                  <span className="venta-client">
                    {order.cliente && (
                      <span className={`ui-avatar ui-avatar--sm ui-avatar--${avatarTone(order.cliente)} venta-client-avatar`} aria-hidden="true">
                        {avatarInitials(order.cliente)}
                      </span>
                    )}
                    {order.cliente || 'Sin cliente'}
                  </span>
                </p>
                <p>
                  <strong>{order.estado === 'COMPLETADO' ? 'Fecha factura:' : 'Fecha:'}</strong>{' '}
                  {order.estado === 'COMPLETADO' && order.completedAt
                    ? new Date(order.completedAt).toLocaleDateString('es-ES')
                    : new Date(order.fecha).toLocaleString()}
                </p>
                <p className="venta-total-row"><strong>Total:</strong> <span className="venta-total ui-amount--success">${formatCurrency(parseFloat(order.total))}</span></p>

                {order.notas && (
                  <div className="venta-notes">
                    <strong><span className="material-icons-round" aria-hidden="true">note</span> Notes:</strong>
                    <p>{order.notas}</p>
                  </div>
                )}
              </div>

              <details className="venta-details">
                <summary>Ver productos</summary>
                <ul>
                  {order.items.map((item, idx) => (
                    <li key={idx}>
                      <div className="venta-item">
                        <div>
                          {item.productName} - {item.cantidad} x ${formatCurrency(parseFloat(item.precioUnitario))}
                        </div>
                        <div className="venta-item-badges">
                          {item.outOfStock && (
                            <span className="ui-badge ui-badge--danger">Sin Stock</span>
                          )}
                          {item.isPromotionItem && (
                            <span className="ui-badge ui-badge--primary">Promo</span>
                          )}
                          {item.isFreeItem && (
                            <span className="ui-badge ui-badge--success">Bonificado</span>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          ))}
        </div>
      )}
      {/* ─ PAGINACIÓN MIS VENTAS ─ */}
      {totalPages > 1 && (
        <nav className="vd-pagination" aria-label="Paginación">
          <div className="vd-pagination-size">
            Mostrar
            <select
              className="ui-select vd-pagination-select"
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(0); }}
              aria-label="Ventas por página"
            >
              {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            por página &bull; {totalElements} total
          </div>
          <div className="vd-pagination-pages">
            <button type="button" className="ui-icon-btn ui-icon-btn--bordered" onClick={() => setCurrentPage(p => Math.max(0, p - 1))} disabled={currentPage === 0}
              aria-label="Página anterior">
              <span className="material-icons-round" aria-hidden="true">chevron_left</span>
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const start = Math.max(0, Math.min(currentPage - 2, totalPages - 5));
              const pageNum = start + i;
              return (
                <button type="button" key={pageNum} onClick={() => setCurrentPage(pageNum)}
                  className={`vd-page-btn ${pageNum === currentPage ? 'is-active' : ''}`}
                  aria-current={pageNum === currentPage ? 'page' : undefined}>
                  {pageNum + 1}
                </button>
              );
            })}
            <button type="button" className="ui-icon-btn ui-icon-btn--bordered" onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))} disabled={currentPage >= totalPages - 1}
              aria-label="Página siguiente">
              <span className="material-icons-round" aria-hidden="true">chevron_right</span>
            </button>
            <span className="vd-pagination-info">Pág. {currentPage + 1}/{totalPages}</span>
          </div>
        </nav>
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
      const response = await apiClient.get(url);
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
    return <PanelSkeleton label="Cargando productos" variant="products" count={6} />;
  }

  return (
    <div className="productos-catalogo">
      <header className="ui-page-header vd-page-header">
        <div className="ui-page-heading">
          <h2 className="ui-page-title"><span className="material-icons-round" aria-hidden="true">inventory_2</span> Catálogo de Productos</h2>
        </div>
        <div className="ui-search vd-header-search">
          <span className="material-icons-round ui-search-icon" aria-hidden="true">search</span>
          <input
            type="text"
            placeholder="Buscar productos..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="ui-input"
            aria-label="Buscar productos"
          />
        </div>
      </header>

      <TagFilterBar
        tags={tags}
        activeTagId={activeTagId}
        onSelectTag={setActiveTagId}
        onClear={() => setActiveTagId(null)}
      />

      <div className="productos-grid-catalogo ui-stagger">
        {filteredProducts.length === 0 && (
          <div className="ui-empty vd-grid-empty">
            <span className="material-icons-round ui-empty-icon" aria-hidden="true">inventory_2</span>
            <p className="ui-empty-text">No se encontraron productos</p>
          </div>
        )}
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
                decoding="async"
              />
            </div>
            <div className="producto-info">
              <div className="producto-title-row">
                <h3>{product.nombre}</h3>
                {product.tagName && <TagBadge tagName={product.tagName} />}
              </div>
              <p className="producto-descripcion">{product.descripcion}</p>
              <div className="producto-details">
                <span className="producto-precio">${formatCurrency(product.precio)}</span>
                <span className={`producto-stock ui-badge ${product.stock <= 5 ? 'low ui-badge--danger' : 'ui-badge--success'}`}>
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
function MisMetasPanel({ refreshTrigger }) {
  const [currentGoal, setCurrentGoal] = useState(null);
  const [goalHistory, setGoalHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  // Recarga silenciosa: solo la última petición aplica su respuesta; goalLoadedRef = ya terminó
  // la carga inicial (las siguientes no muestran el esqueleto ni cierran el historial)
  const goalReqRef = useRef(0);
  const historyReqRef = useRef(0);
  const goalLoadedRef = useRef(false);

  useEffect(() => {
    fetchCurrentGoal();
    fetchGoalHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger]);

  const fetchCurrentGoal = async () => {
    const reqId = ++goalReqRef.current;
    const silent = goalLoadedRef.current;
    try {
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      const response = await apiClient.get('/vendedor/sale-goals/my');
      if (reqId !== goalReqRef.current) return; // llegó una petición más nueva
      setCurrentGoal(response.data);
      setError(null);
    } catch (error) {
      if (reqId !== goalReqRef.current) return;
      console.error('Error al cargar meta actual:', error);
      if (error.response?.status === 404) {
        // Respuesta del servidor (no un fallo): no hay meta este mes, p. ej. al empezar un mes nuevo
        setCurrentGoal(null);
        setError('No tienes una meta asignada para este mes');
      } else if (!silent) {
        setError('Error al cargar tu meta actual');
      }
      // Recarga silenciosa que falla: se conserva lo que ya se ve (meta o aviso)
    } finally {
      if (reqId === goalReqRef.current) {
        goalLoadedRef.current = true;
        setLoading(false);
      }
    }
  };

  const fetchGoalHistory = async () => {
    const reqId = ++historyReqRef.current;
    try {
      const response = await apiClient.get('/vendedor/sale-goals/history');
      if (reqId !== historyReqRef.current) return;
      setGoalHistory(response.data);
    } catch (error) {
      console.error('Error al cargar historial:', error);
    }
  };

  // ✅ DESCARGA EXCEL
  const toast = useToast();
  const [exportingExcel, setExportingExcel] = useState(false);
  const [dateRange, setDateRange] = useState({
    startDate: new Date(new Date().setDate(1)).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });

  const handleDownloadExcel = async () => {
    if (exportingExcel) return;
    setExportingExcel(true);
    try {
      const response = await apiClient.get('/reports/export/complete/excel', {
        params: { startDate: dateRange.startDate, endDate: dateRange.endDate },
        responseType: 'blob',
      });
      const contentDisposition = response.headers?.['content-disposition'];
      let filename = `mis_ventas_${dateRange.startDate}_${dateRange.endDate}.xlsx`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i) ||
          contentDisposition.match(/filename\s*=\s*"?([^";]+)"?/i);
        if (match?.[1]) filename = decodeURIComponent(match[1].replace(/"/g, ''));
      }
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Reporte Excel descargado exitosamente');
    } catch (err) {
      console.error('Error al descargar Excel:', err);
      toast.error('Error al descargar el reporte Excel');
    } finally {
      setExportingExcel(false);
    }
  };

  if (loading) {
    return <PanelSkeleton label="Cargando tu meta" text="Cargando tu meta..." variant="stats" />;
  }

  return (
    <div className="mis-metas-panel">
      <header className="ui-page-header vd-page-header">
        <div className="ui-page-heading">
          <h2 className="ui-page-title">
            <span className="material-icons-round" aria-hidden="true">
              show_chart
            </span>
            {' '}Mis Metas de Ventas
          </h2>
        </div>
      </header>

      {/* ✅ SECCIÓN DESCARGA EXCEL */}
      <section className="ui-section vd-export">
        <div className="ui-section-head">
          <span className="ui-icon-tile ui-icon-tile--success" aria-hidden="true">
            <span className="material-icons-round">download</span>
          </span>
          <div>
            <h3 className="ui-section-title">
              Descargar Mi Reporte Excel
            </h3>
            <p className="ui-section-desc">Elige el rango de fechas del reporte.</p>
          </div>
        </div>
        <div className="vd-export-row">
          <div className="ui-field">
            <label className="ui-label" htmlFor="vd-excel-desde">Desde:</label>
            <input
              id="vd-excel-desde"
              type="date"
              className="ui-input"
              value={dateRange.startDate}
              onChange={e => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
            />
          </div>
          <div className="ui-field">
            <label className="ui-label" htmlFor="vd-excel-hasta">Hasta:</label>
            <input
              id="vd-excel-hasta"
              type="date"
              className="ui-input"
              value={dateRange.endDate}
              onChange={e => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
            />
          </div>
          {/* Botón de formato Excel (verde), mismo marcado que ExportButton: mientras descarga,
              spinner en lugar del icono, "Descargando..." sin que el botón cambie de ancho y
              barra fina inferior. Mismo handler y misma guarda (exportingExcel) que antes. */}
          <button
            type="button"
            className={`ui-btn ui-btn--excel vd-export-btn${exportingExcel ? ' is-loading' : ''}`}
            onClick={handleDownloadExcel}
            disabled={exportingExcel}
            aria-busy={exportingExcel || undefined}
          >
            {exportingExcel
              ? <span className="ui-spinner" aria-hidden="true" />
              : <span className="material-icons-round" aria-hidden="true">table_view</span>}
            <span className="ui-btn-label">
              {exportingExcel && <span className="ui-btn-label-sizer" aria-hidden="true">Descargar Excel</span>}
              <span>{exportingExcel ? 'Descargando...' : 'Descargar Excel'}</span>
            </span>
          </button>
        </div>
        <p className="ui-help vd-help vd-export-note">
          <span className="material-icons-round" aria-hidden="true">lightbulb</span>
          El reporte incluye únicamente tus propias ventas en el rango de fechas seleccionado.
        </p>
      </section>

      {error && !currentGoal ? (
        <div className="no-goal-message ui-empty">
          <span className="material-icons-round ui-empty-icon" aria-hidden="true">
            trending_up
          </span>
          <h3 className="ui-empty-title">{error}</h3>
          <p className="ui-empty-text">Contacta a tu supervisor para que te asigne una meta mensual</p>
        </div>
      ) : currentGoal && (
        <div className="current-goal-section">
          <div className="goal-card-large">
            <div className="goal-header">
              <div className="goal-period">
                <span className="material-icons-round" aria-hidden="true">calendar_today</span>
                <span>{getMonthName(currentGoal.month)} {currentGoal.year}</span>
              </div>
              {currentGoal.completed && (
                <div className="goal-completed-badge ui-badge ui-badge--success">
                  <span className="material-icons-round" aria-hidden="true">emoji_events</span>
                  ¡Meta Completada!
                </div>
              )}
            </div>

            <div className="goal-stats-large ui-stat-grid">
              <div className="stat-box ui-stat">
                <div className="stat-icon target ui-stat-icon ui-stat-icon--primary">
                  <span className="material-icons-round" aria-hidden="true">flag</span>
                </div>
                <div className="stat-content ui-stat-content">
                  <span className="stat-label ui-stat-label">Meta del Mes</span>
                  <span className="stat-value ui-stat-value ui-text-primary">${parseFloat(currentGoal.targetAmount).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </div>

              <div className="stat-box ui-stat">
                <div className="stat-icon current ui-stat-icon ui-stat-icon--success">
                  <span className="material-icons-round" aria-hidden="true">payments</span>
                </div>
                <div className="stat-content ui-stat-content">
                  <span className="stat-label ui-stat-label">Ventas Actuales</span>
                  <span className="stat-value ui-stat-value ui-text-success">${parseFloat(currentGoal.currentAmount).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </div>

              <div className="stat-box ui-stat">
                <div className="stat-icon remaining ui-stat-icon ui-stat-icon--warning">
                  <span className="material-icons-round" aria-hidden="true">trending_up</span>
                </div>
                <div className="stat-content ui-stat-content">
                  <span className="stat-label ui-stat-label">Falta por Lograr</span>
                  <span className={`stat-value ui-stat-value ${currentGoal.completed ? 'ui-text-success' : 'ui-text-warning'}`}>
                    ${Math.max(0, parseFloat(currentGoal.targetAmount) - parseFloat(currentGoal.currentAmount)).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            <div className="progress-section-large ui-card">
              <div className="progress-header">
                <span className="progress-label">Progreso de la Meta</span>
                <span className={`progress-percentage ui-text-${goalTone(currentGoal.percentage, currentGoal.completed)}`}>
                  {parseFloat(currentGoal.percentage).toFixed(1)}%
                </span>
              </div>
              {/* Barra de color (transform: scaleX, crece al montar); el texto va encima, al final
                  del tramo lleno, y aparece con un fade cuando la barra termina de crecer */}
              <div
                className={`progress-bar-large ui-progress ui-progress--${goalTone(currentGoal.percentage, currentGoal.completed)}`}
                style={{ '--value': goalProgressValue(currentGoal.percentage) }}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(goalProgressValue(currentGoal.percentage))}
                aria-label="Progreso de la Meta"
              >
                <span className={`progress-fill ui-progress-bar ${currentGoal.completed ? 'completed' : ''}`} />
                {parseFloat(currentGoal.percentage) > 10 && (
                  <span className="progress-text" aria-hidden="true">
                    {parseFloat(currentGoal.percentage).toFixed(1)}%
                  </span>
                )}
              </div>
              <div className="progress-labels">
                <span>$0</span>
                <span>${parseFloat(currentGoal.targetAmount).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
              </div>
            </div>

            {!currentGoal.completed && (
              <div className="motivation-message ui-alert ui-alert--info">
                {parseFloat(currentGoal.percentage) < 25 && (
                  <>
                    <span className="material-icons-round" aria-hidden="true">rocket_launch</span>
                    <p>¡Vamos! Apenas estás comenzando el mes. ¡Tú puedes lograrlo!</p>
                  </>
                )}
                {parseFloat(currentGoal.percentage) >= 25 && parseFloat(currentGoal.percentage) < 50 && (
                  <>
                    <span className="material-icons-round" aria-hidden="true">directions_run</span>
                    <p>¡Buen ritmo! Ya llevas el {parseFloat(currentGoal.percentage).toFixed(1)}% de tu meta.</p>
                  </>
                )}
                {parseFloat(currentGoal.percentage) >= 50 && parseFloat(currentGoal.percentage) < 75 && (
                  <>
                    <span className="material-icons-round" aria-hidden="true">local_fire_department</span>
                    <p>¡Excelente! Ya superaste la mitad de tu meta. ¡Sigue así!</p>
                  </>
                )}
                {parseFloat(currentGoal.percentage) >= 75 && parseFloat(currentGoal.percentage) < 100 && (
                  <>
                    <span className="material-icons-round" aria-hidden="true">military_tech</span>
                    <p>¡Increíble! Estás a punto de lograr tu meta. ¡El último empujón!</p>
                  </>
                )}
              </div>
            )}

            {currentGoal.completed && (
              <div className="completion-celebration">
                <span className="material-icons-round celebration-icon" aria-hidden="true">celebration</span>
                <h3>¡Felicidades!</h3>
                <p>Has superado tu meta de ventas para este mes</p>
              </div>
            )}

            <div className="goal-timestamps">
              <p>
                <span className="material-icons-round" aria-hidden="true">update</span>
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
            type="button"
            className="btn-toggle-history ui-btn ui-btn--secondary"
            onClick={() => setShowHistory(!showHistory)}
            aria-expanded={showHistory}
          >
            <span className="material-icons-round" aria-hidden="true">history</span>
            {showHistory ? 'Ocultar Historial' : 'Ver Historial de Metas'}
            <span className="material-icons-round" aria-hidden="true">
              {showHistory ? 'expand_less' : 'expand_more'}
            </span>
          </button>

          {showHistory && (
            <div className="history-grid ui-stagger">
              {goalHistory.map((goal) => (
                <div key={goal.id} className={`history-card ${goal.completed ? 'completed' : ''}`}>
                  <div className="history-header">
                    <h4>{getMonthName(goal.month)} {goal.year}</h4>
                    {goal.completed && (
                      <span className="completed-icon">
                        <span className="material-icons-round" aria-hidden="true">check_circle</span>
                      </span>
                    )}
                  </div>

                  <div className="history-stats">
                    <div className="history-stat">
                      <span className="history-stat-label">Meta:</span>
                      <span className="history-stat-value">${formatCurrency(parseFloat(goal.targetAmount))}</span>
                    </div>
                    <div className="history-stat">
                      <span className="history-stat-label">Logrado:</span>
                      <span className="history-stat-value ui-amount--success">${formatCurrency(parseFloat(goal.currentAmount))}</span>
                    </div>
                  </div>

                  <div className="history-progress">
                    <div
                      className={`progress-bar-small ui-progress ui-progress--${goalTone(goal.percentage, goal.completed)}`}
                      style={{ '--value': goalProgressValue(goal.percentage) }}
                      aria-hidden="true"
                    >
                      <span className={`progress-fill ui-progress-bar ${goal.completed ? 'completed' : ''}`} />
                    </div>
                    <span className={`percentage-text ui-text-${goalTone(goal.percentage, goal.completed)}`}>
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
