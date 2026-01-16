import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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
import '../styles/ClientDashboard.css';

// Wrapper to provide CartContext
const ClientDashboard = () => {
    return (
        <CartProvider>
            <ClientDashboardContent />
        </CartProvider>
    );
};

const ClientDashboardContent = () => {
    const { cartCount } = useCart();
    const [activeTab, setActiveTab] = useState('catalog');
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);

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

    // Load products
    const fetchProducts = useCallback(async () => {
        setLoading(true);
        try {
            const response = await clientService.getProductsPage(page, 24, search, inStockOnly ? true : null, activeTagId);
            setProducts(response.data.content || []);
            setTotalPages(response.data.totalPages || 0);
        } catch (error) {
            console.error('Error fetching products:', error);
        } finally {
            setLoading(false);
        }
    }, [page, search, inStockOnly, activeTagId]);

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
                    <h1>Vitalexa B2B</h1>
                </div>

                <nav className="client-nav">
                    <button
                        className={`nav-item ${activeTab === 'catalog' ? 'active' : ''}`}
                        onClick={() => setActiveTab('catalog')}
                    >
                        Catálogo
                    </button>
                    <button
                        className={`nav-item ${activeTab === 'orders' ? 'active' : ''}`}
                        onClick={() => setActiveTab('orders')}
                    >
                        Mis Pedidos
                    </button>
                    <button
                        className={`nav-item ${activeTab === 'lists' ? 'active' : ''}`}
                        onClick={() => setActiveTab('lists')}
                    >
                        Listas
                    </button>
                    <button
                        className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`}
                        onClick={() => setActiveTab('profile')}
                    >
                        Perfil
                    </button>
                </nav>

                <div className="header-actions">
                    <button
                        className="cart-btn-header"
                        onClick={() => setActiveTab('cart')}
                    >
                        <span className="material-icons-round">shopping_cart</span>
                        Carrito
                        {cartCount > 0 && <span className="cart-badge">{cartCount}</span>}
                    </button>
                </div>
            </header>

            {/* CONTENT */}
            <main className="client-content">

                {activeTab === 'catalog' && (
                    <>
                        <div className="catalog-toolbar">
                            <input
                                type="text"
                                className="search-input"
                                placeholder="Buscar productos..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                            <label className="stock-toggle">
                                <input
                                    type="checkbox"
                                    checked={inStockOnly}
                                    onChange={(e) => setInStockOnly(e.target.checked)}
                                />
                                Solo en stock
                            </label>
                        </div>

                        <TagFilterBar
                            tags={tags}
                            activeTagId={activeTagId}
                            onSelectTag={setActiveTagId}
                            onClear={() => setActiveTagId(null)}
                        />

                        {loading ? (
                            <div style={{ textAlign: 'center', padding: '4rem' }}>Cargando catálogo...</div>
                        ) : (
                            <div className="products-grid">
                                {(() => {
                                    const filteredProducts = (products || []).filter(p =>
                                        !activeTagId || p.tagId === activeTagId
                                    );

                                    if (filteredProducts.length === 0) {
                                        return <p>No se encontraron productos.</p>;
                                    }

                                    return filteredProducts.map(p => (
                                        <ClientProductCard
                                            key={p.id}
                                            product={p}
                                            onAddToList={handleAddToList}
                                        />
                                    ));
                                })()}
                            </div>
                        )}

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '2rem' }}>
                                <button
                                    className="btn-action"
                                    disabled={page === 0}
                                    onClick={() => setPage(p => p - 1)}
                                >
                                    Anterior
                                </button>
                                <span style={{ alignSelf: 'center' }}>Página {page + 1} de {totalPages}</span>
                                <button
                                    className="btn-action"
                                    disabled={page >= totalPages - 1}
                                    onClick={() => setPage(p => p + 1)}
                                >
                                    Siguiente
                                </button>
                            </div>
                        )}
                    </>
                )}

                {activeTab === 'cart' && (
                    <div className="animate-fade-in">
                        <h2 style={{ marginBottom: '1.5rem' }}>Mi Carrito</h2>
                        <CartView onOrderPlaced={() => setActiveTab('orders')} />
                    </div>
                )}

                {activeTab === 'orders' && (
                    <div className="animate-fade-in">
                        <h2 style={{ marginBottom: '1.5rem' }}>Mis Pedidos</h2>
                        <OrdersView />
                    </div>
                )}

                {activeTab === 'lists' && (
                    <div className="animate-fade-in">
                        <h2 style={{ marginBottom: '1.5rem' }}>Listas de Compras</h2>
                        <ShoppingListsView
                            onConvertToOrder={() => setActiveTab('orders')}
                            productToAdd={productToAdd}
                            onProductAdded={() => setProductToAdd(null)}
                        />
                    </div>
                )}

                {activeTab === 'profile' && (
                    <div className="animate-fade-in">
                        <ClientProfile />
                    </div>
                )}

            </main>
        </div>
    );
};

export default ClientDashboard;
