import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CartProvider, useCart } from '../context/CartContext';
import { clientService } from '../api/client';
import { tagService } from '../api/tagService';
import { TagFilterBar } from '../components/TagComponents';
import {
    ClientProductCard,
    CartView,
    OrdersView,
    ShoppingListsView,
    ClientProfile
} from '../components/ClientComponents';
import usePersistentState from '../hooks/usePersistentState';
import '../styles/ClientDashboard.css';

// Opciones del selector de columnas del catálogo; lo guardado fuera de ellas vuelve al defecto
const GRID_COLUMN_OPTIONS = [1, 2, 3];

// Wrapper to provide CartContext
const ClientDashboard = () => {
    return (
        <CartProvider>
            <ClientDashboardContent />
        </CartProvider>
    );
};

const ClientDashboardContent = () => {
    const { cartCount, cart } = useCart();
    const [activeTab, setActiveTab] = useState('catalog');
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    // Columnas del catálogo: se recuerdan al recargar (por usuario). "Solo en stock", la búsqueda
    // y la etiqueta no.
    const [gridColumns, setGridColumns] = usePersistentState('cliente.catalog.columns', 2, {
        allowed: GRID_COLUMN_OPTIONS,
        sync: true,
    });
    // ✅ Refresh Trigger
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // Search state
    const [search, setSearch] = useState('');
    const [inStockOnly, setInStockOnly] = useState(false);
    const [page, setPage] = useState(0);
    const [totalPages, setTotalPages] = useState(0);

    const [tags, setTags] = useState([]);
    const [activeTagId, setActiveTagId] = useState(null);

    // Load tags
    useEffect(() => {
        const fetchTags = async () => {
            try {
                const res = await tagService.getAll();
                setTags(res.data);
            } catch (err) {
                console.error("Error loading tags");
            }
        };
        fetchTags();
    }, []);

    // Recarga silenciosa del catálogo: cada petición lleva un número y solo la última aplica su
    // respuesta (el efecto inmediato y el de 400 ms piden lo mismo; una respuesta vieja no pisa a
    // la nueva). Si los parámetros son los de la última petición ("Actualizar", la segunda de las
    // dos peticiones o volver a la pestaña) la grilla se actualiza en su lugar, sin esqueleto: no
    // se pierde la cantidad elegida en cada tarjeta ni el scroll.
    const catalogReqRef = useRef(0);
    const catalogParamsRef = useRef(null);

    // Load products
    const fetchProducts = useCallback(async () => {
        const reqId = ++catalogReqRef.current;
        const paramsKey = JSON.stringify([page, search, inStockOnly, activeTagId]);
        const silent = catalogParamsRef.current === paramsKey;
        catalogParamsRef.current = paramsKey;
        if (!silent) setLoading(true);
        try {
            const response = await clientService.getProductsPage(page, 24, search, inStockOnly ? true : null, activeTagId);
            if (reqId !== catalogReqRef.current) return; // llegó una petición más nueva
            setProducts(response.data.content || []);
            setTotalPages(response.data.totalPages || 0);
        } catch (error) {
            // Si falla, el catálogo que ya se ve se conserva
            console.error('Error fetching products:', error);
        } finally {
            if (reqId === catalogReqRef.current) setLoading(false);
        }
    }, [page, search, inStockOnly, activeTagId]); // Removed refreshTrigger from dependency

    // Trigger fetch on refreshTrigger
    useEffect(() => {
        if (activeTab === 'catalog') {
            fetchProducts();
        }
    }, [refreshTrigger, fetchProducts, activeTab]);

    useEffect(() => {
        if (activeTab === 'catalog') {
            const debounce = setTimeout(fetchProducts, 400);
            return () => clearTimeout(debounce);
        }
    }, [activeTab, fetchProducts]);

    // Reset page on filter change
    useEffect(() => {
        setPage(0);
    }, [search, inStockOnly, activeTagId]);



    // Shopping List Add State
    const [productToAdd, setProductToAdd] = useState(null);

    const handleAddToList = async (product) => {
        setProductToAdd(product);
        setActiveTab('lists');
    };

    return (
        <div className="client-dashboard">
            {/* HEADER */}
            <header className="client-header">
                <div className="client-welcome">
                    <span className="ui-icon-tile client-brand-tile" aria-hidden="true">
                        <span className="material-icons-round">storefront</span>
                    </span>
                    <h1>Vitalexa B2B</h1>
                </div>

                <nav className="client-nav ui-tabs" aria-label="Secciones del portal">
                    <button
                        type="button"
                        className={`nav-item ui-tab${activeTab === 'catalog' ? ' active is-active' : ''}`}
                        aria-current={activeTab === 'catalog' ? 'page' : undefined}
                        onClick={() => setActiveTab('catalog')}
                    >
                        <span className="material-icons-round" aria-hidden="true">storefront</span>
                        Catálogo
                    </button>
                    <button
                        type="button"
                        className={`nav-item ui-tab${activeTab === 'orders' ? ' active is-active' : ''}`}
                        aria-current={activeTab === 'orders' ? 'page' : undefined}
                        onClick={() => setActiveTab('orders')}
                    >
                        <span className="material-icons-round" aria-hidden="true">receipt_long</span>
                        Mis Pedidos
                    </button>
                    <button
                        type="button"
                        className={`nav-item ui-tab${activeTab === 'lists' ? ' active is-active' : ''}`}
                        aria-current={activeTab === 'lists' ? 'page' : undefined}
                        onClick={() => setActiveTab('lists')}
                    >
                        <span className="material-icons-round" aria-hidden="true">checklist</span>
                        Listas
                    </button>
                    <button
                        type="button"
                        className={`nav-item ui-tab${activeTab === 'profile' ? ' active is-active' : ''}`}
                        aria-current={activeTab === 'profile' ? 'page' : undefined}
                        onClick={() => setActiveTab('profile')}
                    >
                        <span className="material-icons-round" aria-hidden="true">person</span>
                        Perfil
                    </button>
                </nav>

                <div className="header-actions">
                    {/* ✅ Refresh Button */}
                    <button
                        type="button"
                        className="btn-refresh-dashboard ui-icon-btn ui-icon-btn--bordered ui-icon-btn--lg"
                        onClick={() => setRefreshTrigger(Date.now())}
                        title="Actualizar datos"
                        aria-label="Actualizar datos"
                    >
                        <span className="material-icons-round" aria-hidden="true">sync</span>
                    </button>

                    <button
                        type="button"
                        className={`cart-btn-header ui-btn ui-btn--secondary${activeTab === 'cart' ? ' is-active' : ''}`}
                        aria-current={activeTab === 'cart' ? 'page' : undefined}
                        onClick={() => setActiveTab('cart')}
                    >
                        <span className="material-icons-round" aria-hidden="true">shopping_cart</span>
                        Carrito
                        {cartCount > 0 && <span key={cartCount} className="cart-badge">{cartCount}</span>}
                    </button>
                </div>
            </header>

            {/* CONTENT */}
            <main className="client-content">

                {activeTab === 'catalog' && (
                    <>
                        <div className="catalog-toolbar">
                            <div className="catalog-toolbar-main">
                                <div className="catalog-search ui-search">
                                    <span className="material-icons-round ui-search-icon" aria-hidden="true">search</span>
                                    <input
                                        type="text"
                                        className="search-input ui-input"
                                        placeholder="Buscar productos..."
                                        aria-label="Buscar productos"
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                    />
                                </div>
                                <label className="stock-toggle ui-checkbox">
                                    <input
                                        type="checkbox"
                                        checked={inStockOnly}
                                        onChange={(e) => setInStockOnly(e.target.checked)}
                                    />
                                    Solo en stock
                                </label>
                            </div>
                            <div className="grid-columns-selector ui-tabs" role="group" aria-label="Columnas del catálogo">
                                {GRID_COLUMN_OPTIONS.map(cols => (
                                    <button
                                        key={cols}
                                        type="button"
                                        className={`grid-btn ui-tab${gridColumns === cols ? ' active is-active' : ''}`}
                                        onClick={() => setGridColumns(cols)}
                                        title={`${cols} columnas`}
                                        aria-pressed={gridColumns === cols}
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
                            <div className="client-loading client-skeleton-grid" role="status" aria-busy="true">
                                <span className="ui-sr-only">Cargando catálogo...</span>
                                {[0, 1, 2, 3].map(i => (
                                    <div key={i} className="client-skeleton-card" aria-hidden="true">
                                        <span className="ui-skeleton ui-skeleton--block client-skeleton-media" />
                                        <span className="ui-skeleton ui-skeleton--title" />
                                        <span className="ui-skeleton ui-skeleton--text" />
                                        <span className="ui-skeleton ui-skeleton--text client-skeleton-short" />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div
                                className={`products-grid ui-stagger cols-${gridColumns}`}
                                style={{
                                    // Columnas elegidas por el cliente; minmax(0, 1fr) evita scroll horizontal
                                    gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))`
                                }}
                            >
                                {(() => {
                                    const filteredProducts = (products || []).filter(p =>
                                        !activeTagId || p.tagId === activeTagId
                                    );

                                    if (filteredProducts.length === 0) {
                                        return (
                                            <div className="client-grid-empty ui-empty">
                                                <span className="material-icons-round ui-empty-icon" aria-hidden="true">search_off</span>
                                                <p className="ui-empty-title">No se encontraron productos.</p>
                                            </div>
                                        );
                                    }

                                    return filteredProducts.map(p => (
                                        <ClientProductCard
                                            key={p.id}
                                            product={p}
                                            onAddToList={handleAddToList}
                                            cart={cart}
                                        />
                                    ));
                                })()}
                            </div>
                        )}

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <nav className="client-pagination" aria-label="Paginación del catálogo">
                                <button
                                    type="button"
                                    className="btn-action ui-btn ui-btn--secondary"
                                    disabled={page === 0}
                                    onClick={() => setPage(p => p - 1)}
                                >
                                    <span className="material-icons-round" aria-hidden="true">chevron_left</span>
                                    Anterior
                                </button>
                                <span className="client-pagination-info">Página {page + 1} de {totalPages}</span>
                                <button
                                    type="button"
                                    className="btn-action ui-btn ui-btn--secondary"
                                    disabled={page >= totalPages - 1}
                                    onClick={() => setPage(p => p + 1)}
                                >
                                    Siguiente
                                    <span className="material-icons-round" aria-hidden="true">chevron_right</span>
                                </button>
                            </nav>
                        )}
                    </>
                )}

                {/* Actualización silenciosa: "Actualizar" (refreshTrigger) hace que cada vista vuelva
                    a pedir sus datos y los reemplace en su lugar. Antes key={refreshTrigger} las
                    montaba de cero: se borraban las notas del pedido, la lista expandida y la
                    edición del perfil en curso. El carrito no pide nada al servidor. */}
                {activeTab === 'cart' && (
                    <div className="ui-rise-in">
                        <h2 className="client-section-title">
                            <span className="ui-icon-tile" aria-hidden="true"><span className="material-icons-round">shopping_cart</span></span>
                            Mi Carrito
                        </h2>
                        <CartView onOrderPlaced={() => setActiveTab('orders')} />
                    </div>
                )}

                {activeTab === 'orders' && (
                    <div className="ui-rise-in">
                        <h2 className="client-section-title">
                            <span className="ui-icon-tile ui-icon-tile--success" aria-hidden="true"><span className="material-icons-round">receipt_long</span></span>
                            Mis Pedidos
                        </h2>
                        <OrdersView refreshTrigger={refreshTrigger} />
                    </div>
                )}

                {activeTab === 'lists' && (
                    <div className="ui-rise-in">
                        <h2 className="client-section-title">
                            <span className="ui-icon-tile ui-icon-tile--teal" aria-hidden="true"><span className="material-icons-round">checklist</span></span>
                            Listas de Compras
                        </h2>
                        <ShoppingListsView
                            onConvertToOrder={() => setActiveTab('orders')}
                            productToAdd={productToAdd}
                            onProductAdded={() => setProductToAdd(null)}
                            refreshTrigger={refreshTrigger}
                        />
                    </div>
                )}

                {activeTab === 'profile' && (
                    <div className="ui-rise-in">
                        <ClientProfile refreshTrigger={refreshTrigger} />
                    </div>
                )}

            </main>
        </div>
    );
};

export default ClientDashboard;
