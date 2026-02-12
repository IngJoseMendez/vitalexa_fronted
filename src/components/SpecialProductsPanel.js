import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from './ToastContainer';
import specialProductService from '../api/specialProductService';
import { tagService } from '../api/tagService';
import { TagBadge } from './TagComponents';
import { formatCurrency } from '../utils/formatters';
import SpecialProductFormModal from './modals/SpecialProductFormModal';
import '../styles/SpecialProducts.css';

const PLACEHOLDER_IMAGE = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23f3f4f6" width="200" height="200"/%3E%3Ctext fill="%239ca3af" font-family="Arial,sans-serif" font-size="16" dy="10" font-weight="bold" x="50%25" y="50%25" text-anchor="middle"%3ESin Imagen%3C/text%3E%3C/svg%3E';

export default function SpecialProductsPanel({ refreshTrigger }) {
    const [products, setProducts] = useState([]);
    const [tags, setTags] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [page, setPage] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [gridColumns, setGridColumns] = useState(() => parseInt(localStorage.getItem('spGridCols')) || 3);

    // Modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);

    const toast = useToast();

    const fetchTags = async () => {
        try {
            const res = await tagService.getAll();
            setTags(res.data || []);
        } catch (err) {
            console.error('Error fetching tags:', err);
        }
    };

    const fetchProducts = useCallback(async () => {
        setLoading(true);
        try {
            let res;
            if (searchTerm.trim()) {
                res = await specialProductService.search(searchTerm, page, 20);
            } else {
                res = await specialProductService.getAll(page, 20);
            }
            const data = res.data;
            if (data && data.content) {
                setProducts(data.content);
                setTotalPages(data.totalPages || 0);
            } else if (Array.isArray(data)) {
                setProducts(data);
                setTotalPages(1);
            } else {
                setProducts([]);
                setTotalPages(0);
            }
        } catch (err) {
            console.error('Error loading special products:', err);
            toast.error('Error al cargar productos especiales');
        } finally {
            setLoading(false);
        }
    }, [searchTerm, page, toast]);

    useEffect(() => {
        fetchTags();
    }, []);

    useEffect(() => {
        fetchProducts();
    }, [fetchProducts, refreshTrigger]);

    // Debounce search
    useEffect(() => {
        setPage(0);
    }, [searchTerm]);

    const handleToggleStatus = async (product) => {
        try {
            const newStatus = !product.active;
            await specialProductService.toggleStatus(product.id, newStatus);
            setProducts(prev => prev.map(p => p.id === product.id ? { ...p, active: newStatus } : p));
            toast.success(`Producto ${newStatus ? 'activado' : 'desactivado'}`);
        } catch (err) {
            toast.error('Error al cambiar estado');
            fetchProducts();
        }
    };

    const handleDelete = async (product) => {
        if (!window.confirm(`¿Eliminar "${product.nombre}"? Esta acción es un soft-delete.`)) return;
        try {
            await specialProductService.remove(product.id);
            toast.success('Producto eliminado');
            fetchProducts();
        } catch (err) {
            toast.error('Error al eliminar: ' + (err.response?.data?.message || err.message));
        }
    };

    const openCreate = () => { setEditingProduct(null); setIsModalOpen(true); };
    const openEdit = (product) => { setEditingProduct(product); setIsModalOpen(true); };

    // Filter locally by status
    let displayProducts = [...products];
    if (statusFilter === 'active') displayProducts = displayProducts.filter(p => p.active);
    if (statusFilter === 'inactive') displayProducts = displayProducts.filter(p => !p.active);

    return (
        <div className="special-products-panel">

            {/* Header */}
            <div className="sp-header">
                <div>
                    <h2>
                        <span className="material-icons-round">star</span>
                        Productos Especiales
                    </h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.2rem' }}>
                        Crea y administra productos especiales para tus vendedores
                    </p>
                </div>
                <div className="sp-header-actions">
                    <div className="sp-search-box">
                        <span className="material-icons-round">search</span>
                        <input
                            type="text"
                            placeholder="Buscar producto especial..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button className="sp-btn-create" onClick={openCreate}>
                        <span className="material-icons-round">add</span>
                        Nuevo Especial
                    </button>
                </div>
            </div>

            {/* Status Filter Pills */}
            <div className="sp-filters">
                {[
                    { id: 'all', label: 'Todos' },
                    { id: 'active', label: 'Activos' },
                    { id: 'inactive', label: 'Inactivos' }
                ].map(opt => (
                    <button key={opt.id}
                        className={`sp-filter-pill ${statusFilter === opt.id ? 'active' : ''}`}
                        onClick={() => setStatusFilter(opt.id)}>
                        {opt.label}
                    </button>
                ))}

                {/* Column grid toggle */}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.25rem' }}>
                    {[2, 3, 4].map(c => (
                        <button key={c}
                            onClick={() => { setGridColumns(c); localStorage.setItem('spGridCols', c); }}
                            style={{
                                padding: '0.4rem', background: gridColumns === c ? '#e5e7eb' : 'transparent',
                                border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex'
                            }}
                            title={`${c} columnas`}>
                            <span className="material-icons-round" style={{ fontSize: '18px', color: gridColumns === c ? 'black' : '#9ca3af' }}>grid_view</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Grid */}
            {loading ? (
                <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <div className="loading">Cargando productos especiales...</div>
                </div>
            ) : displayProducts.length === 0 ? (
                <div className="sp-empty">
                    <span className="material-icons-round">search_off</span>
                    <p>No se encontraron productos especiales.</p>
                </div>
            ) : (
                <div className="sp-grid" style={{ gridTemplateColumns: `repeat(${gridColumns}, 1fr)` }}>
                    {displayProducts.map(product => {
                        const isLinked = !!product.parentProductId;
                        const isLowStock = product.stock < (product.reorderPoint || 10);
                        return (
                            <div key={product.id} className="sp-card">
                                {/* Type badge */}
                                <span className={`sp-type-badge ${isLinked ? 'linked' : 'standalone'}`}>
                                    <span className="material-icons-round" style={{ fontSize: '12px' }}>
                                        {isLinked ? 'account_tree' : 'inventory_2'}
                                    </span>
                                    {isLinked ? 'Vinculado' : 'Standalone'}
                                </span>

                                {/* Image */}
                                <div className="sp-card-img">
                                    <img src={product.imageUrl || PLACEHOLDER_IMAGE} alt={product.nombre}
                                        onError={e => e.target.src = PLACEHOLDER_IMAGE} />
                                    {!product.active && (
                                        <div className="inactive-overlay"><span>INACTIVO</span></div>
                                    )}
                                </div>

                                {/* Body */}
                                <div className="sp-card-body">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.25rem' }}>
                                        <h3>{product.nombre}</h3>
                                        <label className="switch" title={product.active ? "Desactivar" : "Activar"} onClick={e => e.stopPropagation()}>
                                            <input type="checkbox" checked={product.active} onChange={() => handleToggleStatus(product)} />
                                            <span className="slider round"></span>
                                        </label>
                                    </div>

                                    {isLinked && product.parentProductName && (
                                        <div className="sp-card-parent">
                                            <span className="material-icons-round">subdirectory_arrow_right</span>
                                            {product.parentProductName}
                                        </div>
                                    )}

                                    {product.tagName && (
                                        <div style={{ marginBottom: '0.4rem' }}>
                                            <TagBadge tagName={product.tagName} />
                                        </div>
                                    )}

                                    {/* Vendor chips */}
                                    {product.allowedVendorNames && product.allowedVendorNames.length > 0 && (
                                        <div className="sp-card-vendors">
                                            {product.allowedVendorNames.map((name, i) => (
                                                <span key={i} className="sp-vendor-chip">{name}</span>
                                            ))}
                                        </div>
                                    )}

                                    {/* Stats */}
                                    <div className="sp-card-stats">
                                        <div>
                                            <span className="sp-stat-label">Precio</span>
                                            <span className="sp-stat-value">${formatCurrency(product.precio)}</span>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <span className="sp-stat-label">Stock</span>
                                            <span className={`sp-stat-value stock ${isLowStock ? 'low-stock' : ''}`}>
                                                {product.stock}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="sp-card-actions">
                                    <button onClick={() => openEdit(product)}>
                                        <span className="material-icons-round" style={{ fontSize: '16px' }}>edit</span> Editar
                                    </button>
                                    <button className="btn-delete" onClick={() => handleDelete(product)} title="Eliminar">
                                        <span className="material-icons-round" style={{ fontSize: '18px' }}>delete</span>
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="sp-pagination">
                    <button disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                        <span className="material-icons-round" style={{ fontSize: '18px' }}>chevron_left</span>
                    </button>
                    <span>Página {page + 1} de {totalPages}</span>
                    <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                        <span className="material-icons-round" style={{ fontSize: '18px' }}>chevron_right</span>
                    </button>
                </div>
            )}

            {/* Toggle Switch CSS (shared) */}
            <style>{`
        .switch { position: relative; display: inline-block; width: 34px; height: 18px; }
        .switch input { opacity: 0; width: 0; height: 0; }
        .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; transition: .4s; }
        .slider:before { position: absolute; content: ""; height: 14px; width: 14px; left: 2px; bottom: 2px; background-color: white; transition: .4s; }
        input:checked + .slider { background-color: var(--primary); }
        input:checked + .slider:before { transform: translateX(16px); }
        .slider.round { border-radius: 34px; }
        .slider.round:before { border-radius: 50%; }
      `}</style>

            {/* Modal */}
            {isModalOpen && (
                <SpecialProductFormModal
                    product={editingProduct}
                    tags={tags}
                    onClose={() => setIsModalOpen(false)}
                    onSuccess={() => { fetchProducts(); setIsModalOpen(false); }}
                />
            )}
        </div>
    );
}
