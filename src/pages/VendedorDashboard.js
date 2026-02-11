import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../api/client';
import { tagService } from '../api/tagService';
import { useToast } from '../components/ToastContainer';
import { TagBadge, TagFilterBar } from '../components/TagComponents';
import NotificationService from '../services/NotificationService';
import VendedorPromotionsCatalog from '../components/VendedorPromotionsCatalog';
import AssortmentSelectionModal from '../components/modals/AssortmentSelectionModal';
import { PromotionType } from '../utils/types';
import VendorSpecialProductsPanel from '../components/VendorSpecialProductsPanel';
import VendorProductCard from '../components/VendorProductCard';
import '../styles/VendedorDashboard.css';





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
        <button
          className={activeTab === 'special-products' ? 'active' : ''}
          onClick={() => setActiveTab('special-products')}
        >
          <span className="material-icons-round">star</span> Especiales
        </button>
        <button
          className="nav-external"
          onClick={() => window.location.href = '/balances'}
        >
          <span className="material-icons-round">account_balance_wallet</span> Saldos
        </button>
        <button className="btn-refresh-dashboard" onClick={() => setRefreshTrigger(Date.now())} title="Actualizar datos">
          <span className="material-icons-round">sync</span>
        </button>
      </nav>

      <div className="dashboard-content">
        {activeTab === 'nueva-venta' && <NuevaVentaPanel refreshTrigger={refreshTrigger} />}
        {activeTab === 'mis-ventas' && <MisVentasPanel key={refreshTrigger} />}
        {activeTab === 'ventas-completadas' && <VentasCompletadasPanel key={refreshTrigger} />}
        {activeTab === 'mis-metas' && <MisMetasPanel key={refreshTrigger} />}
        {activeTab === 'clientes' && <ClientesPanel key={refreshTrigger} />}
        {activeTab === 'productos' && <ProductosPanel refreshTrigger={refreshTrigger} />}
        {activeTab === 'special-products' && <VendorSpecialProductsPanel refreshTrigger={refreshTrigger} />}
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
  const [isBonifiedMode, setIsBonifiedMode] = useState(false); // ✅ Mode Toggle
  const [promotionsCart, setPromotionsCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [allowNoClient, setAllowNoClient] = useState(false);
  const [notas, setNotas] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [gridColumns, setGridColumns] = useState(() => {
    const saved = localStorage.getItem('vendedorGridColumns');
    return saved ? parseInt(saved) : 2;
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
  const toast = useToast();

  const [tags, setTags] = useState([]);
  const [activeTagId, setActiveTagId] = useState(null);

  // Check if user is Admin or Owner
  const isAdminOrOwner = userRole === 'ROLE_ADMIN' || userRole === 'ROLE_OWNER';

  // Assortment Selection State
  const [showAssortmentModal, setShowAssortmentModal] = useState(false);
  const [selectedPromotion, setSelectedPromotion] = useState(null);

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
    try {
      const response = await apiClient.get('/vendedor/clients');
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
      const response = await apiClient.get(url);
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
    fetchVendedores();
  }, [refreshTrigger, activeTagId, fetchClients, fetchProducts, fetchTags, fetchVendedores]);

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
          allowOutOfStock: true // Usually gifts can be OOS if authorized? Or assume stock check needed? Let's assume standard stock check but price 0.
        }]);
      }
      toast.success(`Agregado (+${quantity}) como Bonificado 🎁`);
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
        allowOutOfStock: false, // Default false
        isSpecialProduct: product.isSpecialProduct
      }]);
    }
  };

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
      cartId: `promo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
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
          promotionId: item.promotionId
        });
      }
    });

    setCart(newCartItems);

    // Add the promotion itself to track it (for the ID)
    if (selectedPromotion) {
      const promoInstance = {
        ...selectedPromotion,
        cartId: `promo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
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

  const handleSubmitOrder = async () => {
    // Allow orders with products OR promotions (or both)
    if (cart.length === 0 && promotionsCart.length === 0) {
      toast.warning('Agrega productos o promociones al carrito');
      return;
    }

    if (!selectedClient && !allowNoClient) {
      toast.warning('Selecciona un cliente o marca la casilla para confirmar venta sin cliente');
      return;
    }

    // If Admin/Owner and trying to create order, vendor must be assigned
    if (isAdminOrOwner && !assignedVendor) {
      toast.warning('Debe asignar un vendedor para crear esta orden');
      return;
    }

    // Constraint: No freight with promotions
    const hasPromotions = promotionsCart.length > 0;

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
          // ✅ Add Freight Items (Only if no promotions)
          ...(hasPromotions ? [] : freightItems.map(item => ({
            productId: item.productId,
            cantidad: item.cantidad,
            isFreightItem: true
          })))
        ],
        bonifiedItems: bonifiedCart.map(item => ({
          productId: item.productId,
          cantidad: item.cantidad
        })),
        promotionIds: promotionsCart.map(p => p.id),
        notas: notas.trim() || null,
        includeFreight: hasPromotions ? false : (includeFreight || false),
        // ✅ Add Custom Freight Fields (Only if no promotions)
        isFreightBonified: (hasPromotions ? false : includeFreight) ? isFreightBonified : false,
        freightCustomText: (hasPromotions ? false : includeFreight) ? freightCustomText : null,
        freightQuantity: (hasPromotions ? false : includeFreight) ? (parseInt(freightQuantity) || 1) : 1,
        sellerId: isAdminOrOwner ? assignedVendor : null
      };


      const endpoint = isAdminOrOwner ? '/admin/orders' : '/vendedor/orders';
      const res = await apiClient.post(endpoint, orderData);

      // Check if it was a split order (2 orders created)
      if (res.data && res.data.createdOrders && res.data.createdOrders.length > 1) {
        toast.info('Se detectaron productos S/R: se generaron 2 órdenes con facturas consecutivas.', { duration: 6000 });
      } else {
        toast.success('¡Venta registrada exitosamente!');
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
      fetchProducts();
    } catch (error) {
      console.error('Error al crear orden:', error);
      if (error.response?.status === 403 && error.response?.data?.message?.includes('Límite de crédito')) {
        toast.error('⛔ ' + error.response.data.message);
      } else {
        toast.error('Error al registrar la venta: ' + (error.response?.data?.message || 'Error desconocido'));
      }
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

              {/* ✅ Mode Toggle aligned */}
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                cursor: 'pointer',
                background: isBonifiedMode ? '#ecfdf5' : 'white',
                padding: '0.3rem 0.6rem',
                borderRadius: '20px',
                border: isBonifiedMode ? '1px solid #10b981' : '1px solid #e5e7eb',
                transition: 'all 0.2s',
                marginRight: 'auto' // Push other controls to right if needed, or keep unified
              }}>
                <input
                  type="checkbox"
                  checked={isBonifiedMode}
                  onChange={(e) => setIsBonifiedMode(e.target.checked)}
                  style={{ accentColor: '#10b981' }}
                />
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: isBonifiedMode ? '#047857' : '#4b5563' }}>
                  {isBonifiedMode ? '🎁 Regalo' : '📦 Normal'}
                </span>
              </label>

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

          {/* CATALOGO DE PROMOCIONES */}
          <VendedorPromotionsCatalog onAddToCart={addPromotionToCart} />

          {/* Buscador de Productos movido abajo de promociones */}
          <div className="search-container search-container-sm">
            <span className="material-icons-round search-icon">search</span>
            <input
              type="text"
              placeholder="Buscar productos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input search-input-sm"
            />
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
                <VendorProductCard
                  key={product.id}
                  product={product}
                  cartItem={cart.find(item => item.productId === product.id)}
                  onAddToCart={addToCart}
                />
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
            <div className="client-search-wrapper" style={{ position: 'relative', marginBottom: '0.5rem' }}>
              <span className="material-icons-round" style={{
                position: 'absolute',
                left: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#9ca3af',
                fontSize: '18px'
              }}>search</span>
              <input
                type="text"
                placeholder="Buscar cliente..."
                className="client-search-input"
                value={clientSearchTerm}
                onChange={(e) => setClientSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.6rem 0.6rem 0.6rem 2.2rem',
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb',
                  fontSize: '0.9rem'
                }}
              />
            </div>

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
              {clients
                .filter(c => {
                  if (!clientSearchTerm) return true;
                  const term = clientSearchTerm.toLowerCase();
                  return c.nombre.toLowerCase().includes(term) ||
                    (c.telefono && c.telefono.includes(term));
                })
                .map(c => (
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

          {/* ADMIN/OWNER ONLY: Asignar Vendedor */}
          {isAdminOrOwner && (
            <div className="form-group">
              <label htmlFor="vendedor-select">
                <span className="material-icons-round" style={{ fontSize: '1rem', marginRight: '0.35rem', verticalAlign: 'middle' }}>badge</span>
                Asignar Vendedor <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                id="vendedor-select"
                value={assignedVendor}
                onChange={(e) => setAssignedVendor(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb',
                  fontSize: '0.95rem',
                  background: assignedVendor ? '#f0fdf4' : 'white'
                }}
              >
                <option value="">-- Seleccionar vendedor --</option>
                {vendedores.map(v => (
                  <option key={v.id} value={v.id}>{v.username}</option>
                ))}
              </select>
            </div>
          )}

          {/* ADMIN/OWNER ONLY: Incluir Flete */}
          {isAdminOrOwner && (
            <div className="form-group" style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div className="checkbox-group" style={{ marginBottom: '0.5rem' }}>
                <input
                  id="incluir-flete"
                  type="checkbox"
                  checked={includeFreight}
                  disabled={promotionsCart.length > 0}
                  onChange={(e) => setIncludeFreight(e.target.checked)}
                />
                <label htmlFor="incluir-flete" style={{ color: promotionsCart.length > 0 ? '#9ca3af' : 'inherit' }}>
                  <span className="material-icons-round" style={{ fontSize: '1rem', marginRight: '0.35rem', verticalAlign: 'middle' }}>local_shipping</span>
                  Incluir Flete en Orden
                </label>
              </div>
              {promotionsCart.length > 0 && (
                <div style={{ fontSize: '0.8rem', color: '#ef4444', marginLeft: '1.5rem', marginBottom: '0.5rem' }}>
                  <span className="material-icons-round" style={{ fontSize: '12px', verticalAlign: 'middle', marginRight: '4px' }}>block</span>
                  El flete no está disponible en órdenes con promociones.
                </div>
              )}

              {includeFreight && !promotionsCart.length > 0 && (
                <div className="freight-custom-section" style={{ marginTop: '0.5rem', paddingLeft: '1.5rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                      <input
                        type="checkbox"
                        checked={isFreightBonified}
                        onChange={(e) => setIsFreightBonified(e.target.checked)}
                      />
                      Bonificar ($0)
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
                      style={{ width: '60px', padding: '0.4rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.85rem', textAlign: 'center' }}
                      onWheel={(e) => e.target.blur()}
                    />
                  </div>

                  {/* Freight Search */}
                  <div style={{ position: 'relative', marginBottom: '0.5rem' }}>
                    <input
                      type="text"
                      placeholder="Buscar producto flete..."
                      value={freightProductSearch}
                      onChange={(e) => setFreightProductSearch(e.target.value)}
                      style={{ width: '100%', padding: '0.3rem', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                    />
                    {freightProductSearch && (
                      <div style={{ position: 'absolute', background: 'white', border: '1px solid #ddd', borderRadius: '4px', maxHeight: '150px', overflowY: 'auto', width: '100%', zIndex: 10, marginTop: '2px' }}>
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

                  {/* List Freight Items */}
                  {freightItems.map(item => (
                    <div key={item.productId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', padding: '4px 8px', marginBottom: '4px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                      <span style={{ fontSize: '0.8rem' }}>{item.nombre}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <input
                          type="number"
                          value={item.cantidad}
                          onChange={(e) => updateFreightItemQty(item.productId, parseInt(e.target.value) || 0)}
                          style={{ width: '40px', textAlign: 'center', padding: '2px', fontSize: '0.8rem' }}
                          onWheel={(e) => e.target.blur()}
                        />
                        <button onClick={() => removeFreightItem(item.productId)} style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer' }}>&times;</button>
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
                <span className="material-icons-round" style={{ fontSize: '2.5rem', opacity: 0.5 }}>shopping_bag</span>
                <span>El carrito está vacío</span>
              </div>
            ) : (
              <>
                {/* PROMOTIONS IN CART */}
                {promotionsCart.map(promo => (
                  <div key={promo.cartId} className="cart-item promotion-item" style={{ background: '#fff1f2', border: '1px solid #fecdd3' }}>
                    <div className="cart-item-info">
                      <h4 style={{ color: '#be123c' }}>
                        <span className="material-icons-round" style={{ fontSize: '14px', verticalAlign: 'middle', marginRight: '4px' }}>local_offer</span>
                        {promo.nombre}
                      </h4>
                      <p style={{ fontSize: '0.8rem' }}>{promo.type === 'PACK' ? 'Pack' : 'Oferta'}</p>
                    </div>
                    <div className="cart-item-controls">
                      {promo.packPrice && (
                        <span style={{ fontWeight: 700, color: '#059669', marginRight: '0.5rem' }}>${promo.packPrice}</span>
                      )}
                      <button
                        className="btn-remove"
                        onClick={() => removePromotionFromCart(promo.cartId)}
                        title="Eliminar promoción"
                      >
                        <span className="material-icons-round">delete_outline</span>
                      </button>
                    </div>
                  </div>
                ))}

                {/* PRODUCTS IN CART */}
                {cart.map(item => {
                  const isOutOfStock = item.cantidad > item.stockDisponible;


                  return (
                    <div key={item.productId} className={`cart-item ${isOutOfStock ? 'has-warning' : ''}`}>
                      <div className="cart-item-info">
                        <h4>{item.nombre}</h4>
                        <p>${parseFloat(item.precio).toFixed(2)} c/u</p>
                        {isOutOfStock && (
                          <div className="out-of-stock-controls" style={{ marginTop: '0.5rem' }}>
                            <label className="checkbox-small" style={{ color: '#d97706', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={item.allowOutOfStock}
                                onChange={() => toggleAllowOutOfStock(item.productId)}
                              />
                              Permitir sin stock
                            </label>
                            {!item.allowOutOfStock && (
                              <div style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '2px' }}>
                                ⚠️ Excede stock ({item.stockDisponible})
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="cart-item-controls">
                        <div>
                          <button onClick={() => updateQuantity(item.productId, Math.max(0, (parseInt(item.cantidad) || 0) - 1))} title="Reducir cantidad">−</button>
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
                          <button onClick={() => updateQuantity(item.productId, (parseInt(item.cantidad) || 0) + 1)} title="Aumentar cantidad">+</button>
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
            {/* Bonified Items Section */}
            {bonifiedCart.length > 0 && (
              <div className="bonified-section" style={{ marginTop: '1rem', padding: '0.5rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px' }}>
                <h4 style={{ color: '#15803d', fontSize: '0.9rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span className="material-icons-round" style={{ fontSize: '16px' }}>card_giftcard</span>
                  Bonificados
                </h4>
                {bonifiedCart.map(item => (
                  <div key={item.productId} className="cart-item" style={{ background: 'white' }}>
                    <div className="cart-item-info">
                      <h5>{item.nombre}</h5>
                      <p style={{ color: '#15803d', fontWeight: 'bold' }}>$0.00</p>
                    </div>
                    <div className="cart-item-controls">
                      <div>
                        <button onClick={() => updateQuantity(item.productId, Math.max(0, (parseInt(item.cantidad) || 0) - 1), true)}>−</button>
                        <input
                          type="number"
                          value={item.cantidad}
                          onChange={(e) => updateQuantity(item.productId, parseInt(e.target.value) || 0, true)}
                          min="1"
                          onWheel={(e) => e.target.blur()}
                        />
                        <button onClick={() => updateQuantity(item.productId, (parseInt(item.cantidad) || 0) + 1, true)}>+</button>
                      </div>
                      <button className="btn-remove" onClick={() => removeFromCart(item.productId, true)}>
                        <span className="material-icons-round">delete_outline</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>



          <div className="cart-total">
            Total: <span style={{ color: 'var(--primary)', fontSize: '1.5rem', fontWeight: 900 }}>${calculateTotal().toFixed(2)}</span>
          </div>

          <button
            className="btn-finalizar-venta"
            onClick={handleSubmitOrder}
            disabled={
              (cart.length === 0 && promotionsCart.length === 0 && bonifiedCart.length === 0) ||
              (!selectedClient && !allowNoClient) ||
              (!selectedClient && !allowNoClient) ||
              cart.some(i => (parseFloat(i.cantidad) || 0) <= 0) ||
              cart.some(i => i.cantidad > i.stockDisponible && !i.allowOutOfStock)
            }
          >
            <span className="material-icons-round" style={{ fontSize: '1.2rem' }}>check_circle</span>
            Finalizar Venta
          </button>
        </div>
      </div>

      {/* Assortment Selection Modal */}
      {showAssortmentModal && selectedPromotion && (
        <AssortmentSelectionModal
          orderId={null} // Standalone mode
          promotion={selectedPromotion}
          isStandalone={true}
          existingProducts={products}
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
          <div className="label">{(cart.length || 0) + (promotionsCart.length || 0)} Productos</div>
          <div className="total">${calculateTotal().toFixed(2)}</div>
        </div>
        <button className="btn-show-cart" onClick={() => setShowMobileCart(true)}>
          <span className="material-icons-round">shopping_cart</span>
          Ver Carrito
        </button>
      </div>

      {/* Mobile Cart Modal */}
      <div className={`mobile-cart-modal-overlay ${!showMobileCart ? 'hidden' : ''}`} onClick={() => setShowMobileCart(false)}>
        <div className="mobile-cart-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3>
              <span className="material-icons-round">shopping_cart</span>
              Carrito
            </h3>
            <button className="modal-close" onClick={() => setShowMobileCart(false)}>
              <span className="material-icons-round">close</span>
            </button>
          </div>
          <div className="modal-body">
            {/* Render the same cart content */}
            <div className="carrito-section" style={{ display: 'block', width: '100%', padding: 0 }}>
              <div className="form-group">
                <label htmlFor="cliente-select-mobile">
                  <span className="material-icons-round" style={{ fontSize: '1rem', marginRight: '0.35rem', verticalAlign: 'middle' }}>person</span>
                  Cliente
                </label>
                <div className="client-search-wrapper" style={{ position: 'relative', marginBottom: '0.5rem' }}>
                  <span className="material-icons-round" style={{
                    position: 'absolute',
                    left: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#9ca3af',
                    fontSize: '18px'
                  }}>search</span>
                  <input
                    type="text"
                    placeholder="Buscar cliente..."
                    className="client-search-input"
                    value={clientSearchTerm}
                    onChange={(e) => setClientSearchTerm(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.6rem 0.6rem 0.6rem 2.2rem',
                      borderRadius: '8px',
                      border: '1px solid #e5e7eb',
                      fontSize: '0.9rem'
                    }}
                  />
                </div>

                <select
                  id="cliente-select-mobile"
                  value={selectedClient}
                  onChange={(e) => {
                    setSelectedClient(e.target.value);
                    setAllowNoClient(false);
                  }}
                  disabled={allowNoClient}
                >
                  <option value="">Selecciona un cliente</option>
                  {clients
                    .filter(c => {
                      if (!clientSearchTerm) return true;
                      const term = clientSearchTerm.toLowerCase();
                      return c.nombre.toLowerCase().includes(term) ||
                        (c.telefono && c.telefono.includes(term));
                    })
                    .map(c => (
                      <option key={c.id} value={c.id}>
                        {c.nombre} - {c.telefono}
                      </option>
                    ))}
                </select>
              </div>

              <div className="checkbox-group">
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

              <div className="form-group">
                <label htmlFor="notas-mobile">
                  <span className="material-icons-round" style={{ fontSize: '1rem', marginRight: '0.35rem', verticalAlign: 'middle' }}>notes</span>
                  Notas / Productos sin stock
                </label>
                <textarea
                  id="notas-mobile"
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  rows="3"
                  placeholder="Ej: Cliente solicita producto X sin stock, contactar proveedor..."
                />
              </div>

              {/* ADMIN/OWNER ONLY: Asignar Vendedor */}
              {isAdminOrOwner && (
                <div className="form-group">
                  <label htmlFor="vendedor-select-mobile">
                    <span className="material-icons-round" style={{ fontSize: '1rem', marginRight: '0.35rem', verticalAlign: 'middle' }}>badge</span>
                    Asignar Vendedor <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <select
                    id="vendedor-select-mobile"
                    value={assignedVendor}
                    onChange={(e) => setAssignedVendor(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      border: '1px solid #e5e7eb',
                      fontSize: '0.95rem',
                      background: assignedVendor ? '#f0fdf4' : 'white'
                    }}
                  >
                    <option value="">-- Seleccionar vendedor --</option>
                    {vendedores.map(v => (
                      <option key={v.id} value={v.id}>{v.username}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Cart Items Display */}
              <div className="cart-items">
                {cart.length === 0 && promotionsCart.length === 0 ? (
                  <div className="empty-cart">
                    <span className="material-icons-round" style={{ fontSize: '2.5rem', opacity: 0.5 }}>shopping_bag</span>
                    <span>El carrito está vacío</span>
                  </div>
                ) : (
                  <>
                    {/* Regular Items */}
                    {cart.map(item => (
                      <div key={item.productId} className="cart-item">
                        <div className="cart-item-info">
                          <h5>{item.nombre}</h5>
                          <p>${(parseFloat(item.precio) * (parseFloat(item.cantidad) || 0)).toFixed(2)}</p>
                        </div>
                        <div className="cart-item-controls">
                          <div>
                            <button onClick={() => updateQuantity(item.productId, Math.max(0, (parseInt(item.cantidad) || 0) - 1))}>−</button>
                            <input
                              type="number"
                              value={item.cantidad}
                              onChange={(e) => updateQuantity(item.productId, parseInt(e.target.value) || 0)}
                              min="1"
                              onWheel={(e) => e.target.blur()}
                            />
                            <button onClick={() => updateQuantity(item.productId, (parseInt(item.cantidad) || 0) + 1)}>+</button>
                          </div>
                          <button className="btn-remove" onClick={() => removeFromCart(item.productId)}>
                            <span className="material-icons-round">delete_outline</span>
                          </button>
                        </div>
                      </div>
                    ))}

                    {/* Promotions */}
                    {promotionsCart.map(promo => (
                      <div key={promo.cartId} className="cart-item promotion-item">
                        <div className="cart-item-info">
                          <h5>🎁 {promo.nombre}</h5>
                          <p>${parseFloat(promo.packPrice || 0).toFixed(2)}</p>
                        </div>
                        <button className="btn-remove" onClick={() => removePromotionFromCart(promo.cartId)}>
                          <span className="material-icons-round">delete_outline</span>
                        </button>
                      </div>
                    ))}

                    {/* Bonified Items */}
                    {bonifiedCart.length > 0 && (
                      <div style={{ marginTop: '1rem', borderTop: '2px solid #10b981', paddingTop: '1rem' }}>
                        <h4 style={{ color: '#047857', marginBottom: '0.5rem', fontSize: '0.9rem' }}>🎁 Bonificaciones</h4>
                        {bonifiedCart.map(item => (
                          <div key={item.productId} className="cart-item" style={{ background: 'white' }}>
                            <div className="cart-item-info">
                              <h5>{item.nombre}</h5>
                              <p style={{ color: '#15803d', fontWeight: 'bold' }}>$0.00</p>
                            </div>
                            <div className="cart-item-controls">
                              <div>
                                <button onClick={() => updateQuantity(item.productId, Math.max(0, (parseInt(item.cantidad) || 0) - 1), true)}>−</button>
                                <input
                                  type="number"
                                  value={item.cantidad}
                                  onChange={(e) => updateQuantity(item.productId, parseInt(e.target.value) || 0, true)}
                                  min="1"
                                  onWheel={(e) => e.target.blur()}
                                />
                                <button onClick={() => updateQuantity(item.productId, (parseInt(item.cantidad) || 0) + 1, true)}>+</button>
                              </div>
                              <button className="btn-remove" onClick={() => removeFromCart(item.productId, true)}>
                                <span className="material-icons-round">delete_outline</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="cart-total">
                Total: <span style={{ color: 'var(--primary)', fontSize: '1.5rem', fontWeight: 900 }}>${calculateTotal().toFixed(2)}</span>
              </div>

              <button
                className="btn-finalizar-venta"
                onClick={() => {
                  handleSubmitOrder();
                  setShowMobileCart(false);
                }}
                disabled={
                  (cart.length === 0 && promotionsCart.length === 0 && bonifiedCart.length === 0) ||
                  (!selectedClient && !allowNoClient) ||
                  cart.some(i => (parseFloat(i.cantidad) || 0) <= 0) ||
                  cart.some(i => i.cantidad > i.stockDisponible && !i.allowOutOfStock)
                }
              >
                <span className="material-icons-round" style={{ fontSize: '1.2rem' }}>check_circle</span>
                Finalizar Venta
              </button>
            </div>
          </div>
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
      const response = await apiClient.get('/vendedor/orders/my');
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
            <div key={order.id} className={`venta-card completed payment-${order.paymentStatus?.toLowerCase() || 'pending'}`}>
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
  const [editingClient, setEditingClient] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    try {
      const response = await apiClient.get('/vendedor/clients');
      setClients(response.data);
    } catch (error) {
      console.error('Error al cargar clientes:', error);
    } finally {
      setLoading(false);
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

      {/* Modal de Detalle de Venta */}
      <div className="search-container" style={{ marginBottom: '1rem' }}>
        <span className="material-icons-round search-icon">search</span>
        <input
          type="text"
          placeholder="Buscar por nombre, administrador o representante legal..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
          style={{ width: '100%', maxWidth: '400px' }}
        />
      </div>

      <div className="clientes-grid">
        {filteredClients.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
            <span className="material-icons-round" style={{ fontSize: '3rem', opacity: 0.3 }}>person_search</span>
            <p style={{ marginTop: '0.5rem' }}>No se encontraron clientes</p>
          </div>
        ) : (
          filteredClients.map(cliente => (
            <div key={cliente.id} className="cliente-card">
              <h3>{cliente.nombre}</h3>
              <p><span className="material-icons-round" style={{ fontSize: '16px', verticalAlign: 'middle' }}>email</span> {cliente.email}</p>
              <p><span className="material-icons-round" style={{ fontSize: '16px', verticalAlign: 'middle' }}>phone</span> {cliente.telefono}</p>
              <p><span className="material-icons-round" style={{ fontSize: '16px', verticalAlign: 'middle' }}>place</span> {cliente.direccion || 'Sin dirección'}</p>
              <p><span className="material-icons-round" style={{ fontSize: '16px', verticalAlign: 'middle' }}>home_work</span> {cliente.nit}</p>
              <div className="cliente-stats">
                <span><span className="material-icons-round" style={{ fontSize: '16px', verticalAlign: 'middle' }}>shopping_bag</span> Compras: ${parseFloat(cliente.totalCompras || 0).toFixed(2)}</span>
              </div>
              <button
                className="btn-edit-client"
                onClick={() => handleEdit(cliente)}
                style={{
                  marginTop: '12px',
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                <span className="material-icons-round" style={{ fontSize: '16px' }}>edit</span>
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
    <div className="modal-overlay" onClick={(e) => e.stopPropagation()}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Nuevo Cliente</h3>
          <button className="btn-close" onClick={onClose}><span className="material-icons-round">close</span></button>
        </div>

        {/* Información sobre credenciales del cliente */}
        <div className="client-credentials-info" style={{
          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%)',
          border: '1px solid rgba(99, 102, 241, 0.3)',
          borderRadius: '8px',
          padding: '12px 16px',
          margin: '0 0 16px 0',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '10px'
        }}>
          <span className="material-icons-round" style={{ color: 'var(--primary)', fontSize: '20px', marginTop: '2px' }}>info</span>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <strong style={{ color: 'var(--text-primary)' }}>Credenciales del cliente:</strong>
            <br />
            El cliente podrá acceder al sistema usando su <strong>NIT</strong> como usuario y contraseña.
          </div>
        </div>

        <form onSubmit={handleSubmit} className="client-form">
          <div className="form-group">
            <label>NIT <span style={{ color: '#ef4444', fontWeight: 'bold' }}>*</span></label>
            <input
              type="text"
              value={formData.nit}
              onChange={(e) => setFormData({ ...formData, nit: e.target.value })}
              placeholder="Ej: 123456789"
              required
            />
            <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '4px', display: 'block' }}>
              <span className="material-icons-round" style={{ fontSize: '12px', verticalAlign: 'middle', marginRight: '4px' }}>vpn_key</span>
              Este será el usuario y contraseña del cliente
            </small>
          </div>

          <div className="form-group">
            <label>Nombre de Establecimiento <span style={{ color: '#ef4444', fontWeight: 'bold' }}>*</span></label>
            <input
              type="text"
              value={formData.nombre}
              onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
              placeholder="Nombre del establecimiento"
              required
            />
          </div>

          <div className="form-group">
            <label>Administrador <span style={{ color: '#ef4444', fontWeight: 'bold' }}>*</span></label>
            <input
              type="text"
              value={formData.administrador}
              onChange={(e) => setFormData({ ...formData, administrador: e.target.value })}
              placeholder="Nombre del administrador"
              required
            />
          </div>

          <div className="form-group">
            <label>Representante Legal <span style={{ color: '#ef4444', fontWeight: 'bold' }}>*</span></label>
            <input
              type="text"
              value={formData.representanteLegal}
              onChange={(e) => setFormData({ ...formData, representanteLegal: e.target.value })}
              placeholder="Nombre del representante legal"
              required
            />
          </div>

          <div className="form-group">
            <label>Email <span style={{ color: '#ef4444', fontWeight: 'bold' }}>*</span></label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="correo@ejemplo.com"
              required
            />
          </div>

          <div className="form-group">
            <label>Teléfono <span style={{ color: '#ef4444', fontWeight: 'bold' }}>*</span></label>
            <input
              type="tel"
              value={formData.telefono}
              onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
              placeholder="Número de teléfono"
              required
            />
          </div>

          <div className="form-group">
            <label>Dirección <span style={{ color: '#ef4444', fontWeight: 'bold' }}>*</span></label>
            <textarea
              value={formData.direccion}
              onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
              rows="2"
              placeholder="Dirección del cliente"
              required
            />
          </div>

          <div className="form-actions">
            <button type="button" onClick={onClose} className="btn-cancel">
              Cancelar
            </button>
            <button type="submit" disabled={saving || !formData.nit.trim() || !formData.nombre.trim() || !formData.administrador.trim() || !formData.representanteLegal.trim()} className="btn-save">
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
    <div className="modal-overlay" onClick={(e) => e.stopPropagation()}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            <span className="material-icons-round" style={{ fontSize: '20px', verticalAlign: 'middle', marginRight: '8px', color: 'var(--primary)' }}>edit</span>
            Editar Cliente
          </h3>
          <button className="btn-close" onClick={onClose}><span className="material-icons-round">close</span></button>
        </div>

        <form onSubmit={handleSubmit} className="client-form">
          <div className="form-group">
            <label>NIT <span style={{ color: '#ef4444', fontWeight: 'bold' }}>*</span></label>
            <input
              type="text"
              value={formData.nit}
              onChange={(e) => setFormData({ ...formData, nit: e.target.value })}
              placeholder="Ej: 123456789"
              required
            />
          </div>

          <div className="form-group">
            <label>Nombre de Establecimiento <span style={{ color: '#ef4444', fontWeight: 'bold' }}>*</span></label>
            <input
              type="text"
              value={formData.nombre}
              onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
              placeholder="Nombre del establecimiento"
              required
            />
          </div>

          <div className="form-group">
            <label>Administrador <span style={{ color: '#ef4444', fontWeight: 'bold' }}>*</span></label>
            <input
              type="text"
              value={formData.administrador}
              onChange={(e) => setFormData({ ...formData, administrador: e.target.value })}
              placeholder="Nombre del administrador"
              required
            />
          </div>

          <div className="form-group">
            <label>Representante Legal <span style={{ color: '#ef4444', fontWeight: 'bold' }}>*</span></label>
            <input
              type="text"
              value={formData.representanteLegal}
              onChange={(e) => setFormData({ ...formData, representanteLegal: e.target.value })}
              placeholder="Nombre del representante legal"
              required
            />
          </div>

          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="correo@ejemplo.com (Opcional)"
            />
          </div>

          <div className="form-group">
            <label>Teléfono</label>
            <input
              type="tel"
              value={formData.telefono}
              onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
              placeholder="Número de teléfono (Opcional)"
            />
          </div>

          <div className="form-group">
            <label>Dirección</label>
            <textarea
              value={formData.direccion}
              onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
              rows="2"
              placeholder="Dirección del cliente (Opcional)"
            />
          </div>

          <div className="form-actions">
            <button type="button" onClick={onClose} className="btn-cancel">
              Cancelar
            </button>
            <button type="submit" disabled={saving || !formData.nit.trim() || !formData.nombre.trim() || !formData.administrador.trim() || !formData.representanteLegal.trim()} className="btn-save">
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
function MisVentasPanel() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMyOrders();
  }, []);

  const fetchMyOrders = async () => {
    try {
      const response = await apiClient.get('/vendedor/orders/my');
      const pending = response.data.filter(order =>
        ['PENDIENTE', 'CONFIRMADO', 'PENDING_PROMOTION_COMPLETION'].includes(order.estado)
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
            <div key={order.id} className={`venta-card ${order.isSROrder ? 'is-sr' : 'is-normal'} payment-${order.paymentStatus?.toLowerCase() || 'pending'}`}>
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
                  {order.estado === 'PENDING_PROMOTION_COMPLETION' ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span className="material-icons-round" style={{ fontSize: '14px' }}>warning_amber</span>
                      PENDIENTE SURTIDO
                    </span>
                  ) : (order.estado || 'PENDIENTE')}
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
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <div>
                          {item.productName} - {item.cantidad} x ${parseFloat(item.precioUnitario).toFixed(2)}
                        </div>
                        <div className="order-item-badges" style={{ marginTop: '2px', gap: '0.25rem', display: 'flex', flexWrap: 'wrap' }}>
                          {item.outOfStock && (
                            <span className="tag-badge" style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontSize: '0.7rem', padding: '0 0.3rem' }}>Sin Stock</span>
                          )}
                          {item.isPromotionItem && (
                            <span className="tag-badge" style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #93c5fd', fontSize: '0.7rem', padding: '0 0.3rem' }}>Promo</span>
                          )}
                          {item.isFreeItem && (
                            <span className="tag-badge" style={{ background: '#ecfdf5', color: '#059669', border: '1px solid #6ee7b7', fontSize: '0.7rem', padding: '0 0.3rem' }}>Bonificado</span>
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
      const response = await apiClient.get('/vendedor/sale-goals/my');
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
      const response = await apiClient.get('/vendedor/sale-goals/history');
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
