import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from './ToastContainer';
import { useConfirm } from './ConfirmDialog';
import specialProductService from '../api/specialProductService';
import { tagService } from '../api/tagService';
import { TagBadge } from './TagComponents';
import { formatCurrency } from '../utils/formatters';
import { PLACEHOLDER_IMAGE } from '../utils/placeholderImage';
import SpecialProductFormModal from './modals/SpecialProductFormModal';
import usePersistentState, { migrateLegacyViewPref } from '../hooks/usePersistentState';
import '../styles/SpecialProducts.css';

// Columnas de la cuadrícula: preferencia de vista que se recuerda (por usuario, aunque se recargue
// o se cierre sesión). La búsqueda y el filtro Todos/Activos/Inactivos NO: al volver se ve todo.
const GRID_COLUMN_OPTIONS = [2, 3, 4];
const DEFAULT_GRID_COLUMNS = 3;

// Antes se guardaban en 'spGridCols' (sin usuario; cerrar sesión lo borraba). Se pasan una sola
// vez a la preferencia de quien abre Especiales (sin pisar una ya guardada) y se borra la clave
// vieja, igual que en Productos y Órdenes: así quien ya las había elegido no las pierde con esta
// versión ni en el siguiente cierre de sesión.
const migrateLegacyGridColumns = () => migrateLegacyViewPref('spGridCols', 'admin.specialProducts.columns', {
    parse: (raw) => parseInt(raw, 10), // se guardaba como texto ('4'); el estado es número
    allowed: GRID_COLUMN_OPTIONS,
});

export default function SpecialProductsPanel({ refreshTrigger }) {
    const [products, setProducts] = useState([]);
    const [tags, setTags] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [page, setPage] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    useState(migrateLegacyGridColumns); // una sola vez y ANTES del hook de columnas, que ya la lee
    const [gridColumns, setGridColumns] = usePersistentState('admin.specialProducts.columns', DEFAULT_GRID_COLUMNS, {
        allowed: GRID_COLUMN_OPTIONS,
        sync: true,
    });

    // Modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);

    const toast = useToast();
    const askConfirm = useConfirm();

    const fetchTags = async () => {
        try {
            const res = await tagService.getAll();
            setTags(res.data || []);
        } catch (err) {
            console.error('Error fetching tags:', err);
        }
    };

    // Recarga silenciosa: cada petición lleva un número y solo la última aplica su respuesta (al
    // cambiar de página o búsqueda mientras llega una recarga, la respuesta vieja no pisa a la
    // nueva). Si la búsqueda y la página son las de la grilla que se ve (INVENTORY_UPDATE,
    // "Actualizar", guardar en el modal, eliminar...) la grilla se reemplaza en su lugar: sin
    // "Cargando", sin salto de scroll y sin volver a animar las tarjetas. "Cargando" queda para
    // la carga inicial y para lo que pide el admin (otra página u otra búsqueda).
    const productsReqRef = useRef(0);
    const shownParamsRef = useRef(null); // [búsqueda, página] de los productos que se ven

    const fetchProducts = useCallback(async () => {
        const reqId = ++productsReqRef.current;
        const paramsKey = JSON.stringify([searchTerm, page]);
        if (shownParamsRef.current !== paramsKey) setLoading(true);
        try {
            let res;
            if (searchTerm.trim()) {
                res = await specialProductService.search(searchTerm, page, 20);
            } else {
                res = await specialProductService.getAll(page, 20);
            }
            if (reqId !== productsReqRef.current) return; // llegó una petición más nueva
            shownParamsRef.current = paramsKey;
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
            if (reqId !== productsReqRef.current) return;
            // Si falla, los productos que ya se ven se conservan (el aviso es el mismo de antes)
            console.error('Error loading special products:', err);
            toast.error('Error al cargar productos especiales');
        } finally {
            if (reqId === productsReqRef.current) setLoading(false);
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
        const ok = await askConfirm({
            title: 'Eliminar producto',
            message: `¿Eliminar "${product.nombre}"? Esta acción es un soft-delete.`,
            confirmText: 'Eliminar',
            cancelText: 'Cancelar'
        });
        if (!ok) return;
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
            <header className="ui-page-header">
                <div className="ui-page-heading">
                    <h2 className="ui-page-title">
                        <span className="material-icons-round" aria-hidden="true">star</span>
                        Productos Especiales
                    </h2>
                    <p className="ui-page-desc">
                        Crea y administra productos especiales para tus vendedores
                    </p>
                </div>
                <div className="ui-page-actions sp-header-actions">
                    <div className="ui-search sp-search-box">
                        <span className="material-icons-round ui-search-icon" aria-hidden="true">search</span>
                        <input
                            type="text"
                            className="ui-input"
                            placeholder="Buscar producto especial..."
                            aria-label="Buscar producto especial"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button type="button" className="ui-btn ui-btn--primary" onClick={openCreate}>
                        <span className="material-icons-round" aria-hidden="true">add</span>
                        Nuevo Especial
                    </button>
                </div>
            </header>

            {/* Status Filter Pills */}
            <div className="ui-toolbar sp-toolbar">
                <div className="ui-tabs" role="tablist" aria-label="Estado de los productos especiales">
                    {[
                        { id: 'all', label: 'Todos' },
                        { id: 'active', label: 'Activos' },
                        { id: 'inactive', label: 'Inactivos' }
                    ].map(opt => (
                        <button key={opt.id}
                            type="button"
                            role="tab"
                            aria-selected={statusFilter === opt.id}
                            className={`ui-tab${statusFilter === opt.id ? ' is-active' : ''}`}
                            onClick={() => setStatusFilter(opt.id)}>
                            {opt.label}
                        </button>
                    ))}
                </div>

                {/* Column grid toggle */}
                <div className="sp-grid-cols" role="group" aria-label="Columnas de la cuadrícula">
                    {GRID_COLUMN_OPTIONS.map(c => (
                        <button key={c}
                            type="button"
                            className={`ui-btn ui-btn--ghost ui-btn--sm sp-grid-btn${gridColumns === c ? ' is-active' : ''}`}
                            aria-pressed={gridColumns === c}
                            onClick={() => setGridColumns(c)}
                            title={`${c} columnas`}>
                            <span className="material-icons-round" aria-hidden="true">grid_view</span>
                            {c}
                        </button>
                    ))}
                </div>
            </div>

            {/* Grid ("Cargando" solo en la carga inicial o con otra página/búsqueda) */}
            {loading ? (
                <div className="ui-loading">
                    <span className="ui-spinner" aria-hidden="true" />
                    Cargando productos especiales...
                </div>
            ) : displayProducts.length === 0 ? (
                <div className="ui-empty">
                    <span className="material-icons-round ui-empty-icon" aria-hidden="true">search_off</span>
                    <p className="ui-empty-text">No se encontraron productos especiales.</p>
                </div>
            ) : (
                <div className="sp-products-grid" style={{ '--sp-cols': gridColumns }}>
                    {displayProducts.map(product => {
                        const isLinked = !!product.parentProductId;
                        const isLowStock = product.stock < (product.reorderPoint || 10);
                        return (
                            <article key={product.id} className="ui-card ui-card--flush sp-card sp-product-card">
                                {/* Type badge */}
                                <span className="ui-badge ui-badge--neutral sp-type-badge">
                                    <span className="material-icons-round" aria-hidden="true">
                                        {isLinked ? 'account_tree' : 'inventory_2'}
                                    </span>
                                    {isLinked ? 'Vinculado' : 'Standalone'}
                                </span>

                                {/* Image */}
                                <div className="sp-card-img">
                                    <img src={product.imageUrl || PLACEHOLDER_IMAGE} alt={product.nombre} loading="lazy" decoding="async"
                                        onError={e => e.target.src = PLACEHOLDER_IMAGE} />
                                    {!product.active && (
                                        <div className="inactive-overlay"><span className="ui-badge ui-badge--neutral">INACTIVO</span></div>
                                    )}
                                </div>

                                {/* Body */}
                                <div className="sp-card-body">
                                    <div className="sp-card-title-row">
                                        <h3 className="ui-card-title">{product.nombre}</h3>
                                        <label className="ui-switch ui-switch--plain sp-switch" title={product.active ? "Desactivar" : "Activar"} onClick={e => e.stopPropagation()}>
                                            <input
                                                type="checkbox"
                                                checked={product.active}
                                                onChange={() => handleToggleStatus(product)}
                                                aria-label={`${product.active ? 'Desactivar' : 'Activar'} ${product.nombre}`}
                                            />
                                            <span className="ui-switch-track" aria-hidden="true"><span className="ui-switch-thumb" /></span>
                                        </label>
                                    </div>

                                    {isLinked && product.parentProductName && (
                                        <div className="sp-card-parent">
                                            <span className="material-icons-round" aria-hidden="true">subdirectory_arrow_right</span>
                                            {product.parentProductName}
                                        </div>
                                    )}

                                    {product.tagName && (
                                        <div className="sp-card-tag">
                                            <TagBadge tagName={product.tagName} />
                                        </div>
                                    )}

                                    {/* Vendor chips */}
                                    {product.allowedVendorNames && product.allowedVendorNames.length > 0 && (
                                        <div className="sp-card-vendors">
                                            {product.allowedVendorNames.map((name, i) => (
                                                <span key={i} className="ui-badge ui-badge--neutral">{name}</span>
                                            ))}
                                        </div>
                                    )}

                                    {/* Stats */}
                                    <div className="sp-card-stats">
                                        <div>
                                            <span className="sp-stat-label">Precio</span>
                                            <span className="sp-stat-value">${formatCurrency(product.precio)}</span>
                                        </div>
                                        <div className="sp-stat-end">
                                            <span className="sp-stat-label">Stock</span>
                                            <span className={`sp-stat-value stock ${isLowStock ? 'low-stock' : ''}`}>
                                                {product.stock}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="ui-card-footer sp-card-actions">
                                    <button type="button" className="ui-btn ui-btn--secondary ui-btn--sm" onClick={() => openEdit(product)}>
                                        <span className="material-icons-round" aria-hidden="true">edit</span> Editar
                                    </button>
                                    <button type="button" className="ui-icon-btn ui-icon-btn--bordered ui-icon-btn--danger" onClick={() => handleDelete(product)} title="Eliminar" aria-label={`Eliminar ${product.nombre}`}>
                                        <span className="material-icons-round" aria-hidden="true">delete</span>
                                    </button>
                                </div>
                            </article>
                        );
                    })}
                </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <nav className="sp-pagination" aria-label="Paginación">
                    <button type="button" className="ui-icon-btn ui-icon-btn--bordered" disabled={page === 0} onClick={() => setPage(p => p - 1)} aria-label="Página anterior">
                        <span className="material-icons-round" aria-hidden="true">chevron_left</span>
                    </button>
                    <span className="sp-pagination-label">Página {page + 1} de {totalPages}</span>
                    <button type="button" className="ui-icon-btn ui-icon-btn--bordered" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} aria-label="Página siguiente">
                        <span className="material-icons-round" aria-hidden="true">chevron_right</span>
                    </button>
                </nav>
            )}

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
