import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import client from '../api/client';
import { useToast } from './ToastContainer';
import { useConfirm } from './ConfirmDialog';
import { tagService } from '../api/tagService';
import { TagBadge, TagFilterBar } from './TagComponents';
import productService from '../api/productService';
import ProductFormModal from './modals/ProductFormModal';
import { formatCurrency } from '../utils/formatters';
import { PLACEHOLDER_IMAGE } from '../utils/placeholderImage';
import StockArrivalModal from './modals/StockArrivalModal';
import PhysicalCountModal from './modals/PhysicalCountModal';
import BulkStockArrivalForm from './BulkStockArrivalForm';
import SearchableSelect from './SearchableSelect';
import usePersistentState, { migrateLegacyViewPref } from '../hooks/usePersistentState';
import '../styles/areas/Inventory.css';

// Icono de cada opción del selector de columnas (antes las 4 mostraban el mismo icono)
const GRID_COLUMN_ICONS = { 1: 'view_agenda', 2: 'grid_view', 3: 'view_module', 4: 'view_comfy' };

// Preferencias de vista que se recuerdan (por usuario, aunque se recargue o se cierre sesión).
// El filtro Todos/Activos/Inactivos, la etiqueta y la búsqueda NO: al volver se ve todo.
const GRID_COLUMN_OPTIONS = [1, 2, 3, 4];
const DEFAULT_GRID_COLUMNS = 3;
const SORT_OPTIONS = ['name_asc', 'name_desc', 'date_desc', 'date_asc']; // = value del <select>

// Antes las columnas se guardaban en 'adminGridCols' (sin usuario; cerrar sesión lo borraba). Se
// pasan una sola vez a la preferencia de quien abre Productos (sin pisar una ya guardada) y se
// borra la clave vieja, igual que 'adminOrdersColumns' en Órdenes: así quien ya las había elegido
// no las pierde con esta versión ni en el siguiente cierre de sesión. Casi siempre es de esa misma
// persona; si antes una sesión venció sin cerrarse (el 401 solo borra token y usuario) puede venir
// de quien usó el equipo antes: son solo las columnas, y cada quien las cambia con el selector.
const migrateLegacyGridColumns = () => migrateLegacyViewPref('adminGridCols', 'admin.products.columns', {
    parse: (raw) => parseInt(raw, 10), // se guardaba como texto ('4'); el estado es número
    allowed: GRID_COLUMN_OPTIONS,
});


export default function ProductsPanel({ refreshTrigger }) {
    const [products, setProducts] = useState([]);
    const [tags, setTags] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTagId, setActiveTagId] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    useState(migrateLegacyGridColumns); // una sola vez y ANTES del hook de columnas, que ya la lee
    const [gridColumns, setGridColumns] = usePersistentState('admin.products.columns', DEFAULT_GRID_COLUMNS, {
        allowed: GRID_COLUMN_OPTIONS,
        sync: true,
    });

    // New Filters/Sort
    const [statusFilter, setStatusFilter] = useState('all'); // all, active, inactive
    const [sortOption, setSortOption] = usePersistentState('admin.products.sort', 'name_asc', {
        allowed: SORT_OPTIONS,
        sync: true,
    }); // name_asc, name_desc, date_desc, date_asc

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);
    const [stockModalOpen, setStockModalOpen] = useState(false);
    const [selectedProductForStock, setSelectedProductForStock] = useState(null);
    const [countProduct, setCountProduct] = useState(null);

    // Bulk Mode State
    // 'none', 'create', 'update'
    const [bulkMode, setBulkMode] = useState('none');

    // Descarga del inventario en curso (solo presentación: spinner y "Exportando..." en el
    // botón pulsado; los demás quedan deshabilitados mientras tanto). Patrón exportingKey:
    // el boolean dice SI se exporta y la clave QUÉ botón lo inició ('excel' | 'pdf').
    const [exporting, setExporting] = useState(false);
    const [exportingKey, setExportingKey] = useState(null);
    useEffect(() => { if (!exporting) setExportingKey(null); }, [exporting]);
    const exportBusy = (key) => exporting && exportingKey === key;

    // For Bulk Update
    // const [bulkUpdateProducts, setBulkUpdateProducts] = useState([]);

    const toast = useToast();
    const askConfirm = useConfirm();

    const fetchTags = async () => {
        try {
            const res = await tagService.getAll();
            setTags(res.data || []);
        } catch (error) {
            console.error('Error fetching tags:', error);
        }
    };

    // Recarga silenciosa: cada petición lleva un número y solo la última aplica su respuesta (los
    // dos efectos de abajo piden a la vez al cambiar etiqueta/búsqueda; un resultado viejo no pisa
    // al nuevo). Si la etiqueta y la búsqueda son las de la última petición (INVENTORY_UPDATE,
    // "Actualizar", guardar en un modal, eliminar...) la grilla se reemplaza en su lugar: sin
    // esqueleto, sin salto de scroll y sin volver a animar las tarjetas.
    const productsReqRef = useRef(0);
    const lastProductsParamsRef = useRef(null);

    const fetchProducts = useCallback(async () => {
        const reqId = ++productsReqRef.current;
        const paramsKey = JSON.stringify([activeTagId, searchTerm]);
        const silent = lastProductsParamsRef.current === paramsKey;
        lastProductsParamsRef.current = paramsKey;
        try {
            if (!silent) setLoading(true);
            let url = '/admin/products';
            // Request a large size to ensure we get all products for bulk operations and client-side search
            let params = { size: 2000 };

            if (activeTagId) {
                if (searchTerm) {
                    // Caso B: Buscador dentro de un tag
                    url = `/admin/products/tag/${activeTagId}/search`;
                    params.q = searchTerm;
                } else {
                    // Caso A: Filtrar por Etiqueta
                    url = `/admin/products/tag/${activeTagId}`;
                }
            } else {
                // Caso A: Total (si hay search global lo manejamos local o asumimos endpoint global no especificado)
                // El prompt no especifica endpoint search global, solo "dentro de un tag".
                // Para UX consistente, si no hay tag, filtráremos localmente la lista completa.
            }

            const res = await client.get(url, { params });
            if (reqId !== productsReqRef.current) return; // llegó una petición más nueva
            // SAFE ARRAY EXTRACTION: Handle PageImpl, List, or null
            let data = res.data;
            if (data && !Array.isArray(data) && Array.isArray(data.content)) {
                data = data.content;
            }
            if (!Array.isArray(data)) {
                console.warn('API did not return an array or page:', data);
                data = [];
            }

            // Global search fallback (client side)
            if (!activeTagId && searchTerm) {
                data = data.filter(p =>
                    p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    (p.descripcion && p.descripcion.toLowerCase().includes(searchTerm.toLowerCase()))
                );
            }

            setProducts(data);
        } catch (error) {
            if (reqId !== productsReqRef.current) return;
            // Si falla, los productos que ya se ven se conservan (el aviso es el mismo de antes)
            console.error('Error loading products:', error);
            toast.error('Error al cargar productos');
        } finally {
            if (reqId === productsReqRef.current) setLoading(false);
        }
    }, [activeTagId, searchTerm, toast]);

    // Initial Load
    useEffect(() => {
        fetchTags();
        fetchProducts();
    }, [fetchProducts, refreshTrigger]);

    // Reload when filters change (ignoring search debounce for simplicity, but could add it)
    useEffect(() => {
        fetchProducts();
    }, [fetchProducts]);


    // --- Actions ---

    const handleDelete = async (id) => {
        const ok = await askConfirm({ title: 'Eliminar producto', message: 'Confirmar eliminación? Esta acción ' + (true ? 'inhabilitará' : 'borrará') + ' el producto.', confirmText: 'Eliminar', cancelText: 'Cancelar' });
        if (!ok) return;
        try {
            const response = await productService.deleteProduct(id);
            // Handle Blob Download
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `huella_eliminacion_${id}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.parentNode.removeChild(link);

            toast.success('Producto eliminado correctamente. Huella descargada.');
            fetchProducts();
        } catch (error) {
            console.error('Delete error:', error);
            toast.error('Error al eliminar producto');
        }
    };

    const handleToggleStatus = async (product) => {
        try {
            const newStatus = !product.active;
            await client.patch(`/admin/products/${product.id}/estado?activo=${newStatus}`);

            // Optimistic update
            setProducts(prev => prev.map(p => p.id === product.id ? { ...p, active: newStatus } : p));

            toast.success(`Producto ${newStatus ? 'Activado' : 'Desactivado'}`);
        } catch (error) {
            toast.error('Error al cambiar estado');
            fetchProducts(); // Revert on failure
        }
    };

    const handleDownloadExcel = async () => {
        setExporting(true);
        try {
            toast.info('Generando Excel...');
            const response = await productService.exportInventoryExcel();
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'inventario_productos.xlsx');
            document.body.appendChild(link);
            link.click();
            link.parentNode.removeChild(link);
            toast.success('Excel descargado correctamente');
        } catch (error) {
            console.error('Download Excel error:', error);
            toast.error('Error al descargar Excel');
        } finally {
            setExporting(false);
        }
    };

    const handleDownloadPDF = async () => {
        setExporting(true);
        try {
            toast.info('Generando PDF...');
            const response = await productService.exportInventoryPDF();
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'inventario_productos.pdf');
            document.body.appendChild(link);
            link.click();
            link.parentNode.removeChild(link);
            toast.success('PDF descargado correctamente');
        } catch (error) {
            console.error('Download PDF error:', error);
            toast.error('Error al descargar PDF');
        } finally {
            setExporting(false);
        }
    };

    const openCreateModal = () => {
        setEditingProduct(null);
        setIsModalOpen(true);
    };

    const openEditModal = (product) => {
        setEditingProduct(product);
        setIsModalOpen(true);
    };

    const openStockModal = (product) => {
        setSelectedProductForStock(product);
        setStockModalOpen(true);
    };

    // Filtro + orden memoizados (evita re-filtrar/re-ordenar en cada render/tecla).
    // Mismo resultado que antes; solo se recalcula si cambian products/statusFilter/sortOption.
    const displayProducts = useMemo(() => {
        let dp = [...products];
        if (statusFilter === 'active') dp = dp.filter(p => p.active);
        if (statusFilter === 'inactive') dp = dp.filter(p => !p.active);
        dp.sort((a, b) => {
            if (sortOption === 'name_asc') return a.nombre.localeCompare(b.nombre);
            if (sortOption === 'name_desc') return b.nombre.localeCompare(a.nombre);
            const dateA = new Date(a.createdAt || 0).getTime();
            const dateB = new Date(b.createdAt || 0).getTime();
            if (sortOption === 'date_desc') return dateB - dateA;
            if (sortOption === 'date_asc') return dateA - dateB;
            return 0;
        });
        return dp;
    }, [products, statusFilter, sortOption]);

    return (
        <div className="inv-page inv-products">

            {/* HEADER */}
            <header className="ui-page-header">
                <div className="ui-page-heading">
                    <h2 className="ui-page-title">
                        <span className="material-icons-round" aria-hidden="true">inventory_2</span>
                        Gestión de Productos
                    </h2>
                    <p className="inv-counts">
                        <span className="inv-count inv-count--primary">Total: <b>{products.length}</b></span>
                        <span className="inv-count inv-count--success">Activos: <b>{products.filter(p => p.active).length}</b></span>
                        <span className="inv-count inv-count--neutral">Inactivos: <b>{products.filter(p => !p.active).length}</b></span>
                    </p>
                </div>

                <div className="ui-page-actions inv-header-actions">
                    <div className="ui-search inv-header-search">
                        <span className="material-icons-round ui-search-icon" aria-hidden="true">search</span>
                        <input
                            type="text"
                            className="ui-input"
                            aria-label="Buscar productos"
                            placeholder={activeTagId ? "Buscar en etiqueta..." : "Buscar global..."}
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>

                    {bulkMode !== 'none' ? (
                        <button
                            type="button"
                            className="ui-btn ui-btn--secondary"
                            onClick={() => setBulkMode('none')}
                        >
                            <span className="material-icons-round inv-icon--primary" aria-hidden="true">arrow_back</span>
                            Volver a Lista
                        </button>
                    ) : (
                        <>
                            <button
                                type="button"
                                className="ui-btn ui-btn--secondary"
                                onClick={() => {
                                    setActiveTagId(null);
                                    setSearchTerm('');
                                    setBulkMode('update');
                                }}
                            >
                                <span className="material-icons-round inv-icon--primary" aria-hidden="true">edit_note</span>
                                Edición Masiva
                            </button>
                            <button
                                type="button"
                                className="ui-btn ui-btn--secondary"
                                onClick={() => setBulkMode('create')}
                            >
                                <span className="material-icons-round inv-icon--primary" aria-hidden="true">playlist_add</span>
                                Carga Masiva
                            </button>
                            <button
                                type="button"
                                className="ui-btn ui-btn--primary"
                                onClick={openCreateModal}
                            >
                                <span className="material-icons-round" aria-hidden="true">add</span>
                                Nuevo Producto
                            </button>

                            {/* Dropdown for Inventory Download.
                                Mientras se descarga, este botón (siempre visible: el menú se cierra
                                solo al perder el foco) muestra el spinner y "Exportando...". */}
                            <div className="inv-dropdown">
                                <button
                                    type="button"
                                    className={`ui-btn ui-btn--secondary inv-dropdown-trigger${exporting ? ' is-loading' : ''}${exporting && exportingKey ? ` inv-dropdown-trigger--${exportingKey}` : ''}`}
                                    aria-haspopup="true"
                                    aria-busy={exporting || undefined}
                                    disabled={exporting}
                                    onClick={(e) => {
                                        const menu = e.currentTarget.nextElementSibling;
                                        menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
                                    }}
                                    onBlur={(e) => {
                                        // Delay to allow click on items
                                        const menu = e.currentTarget.nextElementSibling;
                                        setTimeout(() => { menu.style.display = 'none'; }, 200);
                                    }}
                                >
                                    {exporting
                                        ? <span className="ui-spinner" aria-hidden="true" />
                                        : <span className="material-icons-round inv-icon--primary" aria-hidden="true">download</span>}
                                    {/* La etiqueta normal queda invisible en la misma celda mientras
                                        carga: el botón no cambia de ancho */}
                                    <span className="ui-btn-label">
                                        {exporting && <span className="ui-btn-label-sizer" aria-hidden="true">Descargar Inventario</span>}
                                        <span>{exporting ? 'Exportando...' : 'Descargar Inventario'}</span>
                                    </span>
                                    <span className="material-icons-round inv-dropdown-caret" aria-hidden="true">arrow_drop_down</span>
                                </button>
                                <div className="inv-dropdown-menu">
                                    {/* Formato con identidad de color: Excel verde, PDF rojo */}
                                    <button
                                        type="button"
                                        className={`ui-btn ui-btn--excel inv-dropdown-item${exportBusy('excel') ? ' is-loading' : ''}`}
                                        aria-busy={exportBusy('excel') || undefined}
                                        disabled={exporting}
                                        onClickCapture={() => setExportingKey('excel')}
                                        onClick={handleDownloadExcel}
                                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-success-soft-hover)'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = ''}
                                    >
                                        {exportBusy('excel')
                                            ? <span className="ui-spinner" aria-hidden="true" />
                                            : <span className="material-icons-round" aria-hidden="true">table_view</span>}
                                        {exportBusy('excel') ? 'Exportando...' : 'Excel (.xlsx)'}
                                    </button>
                                    <button
                                        type="button"
                                        className={`ui-btn ui-btn--pdf inv-dropdown-item${exportBusy('pdf') ? ' is-loading' : ''}`}
                                        aria-busy={exportBusy('pdf') || undefined}
                                        disabled={exporting}
                                        onClickCapture={() => setExportingKey('pdf')}
                                        onClick={handleDownloadPDF}
                                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-danger-soft-hover)'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = ''}
                                    >
                                        {exportBusy('pdf')
                                            ? <span className="ui-spinner" aria-hidden="true" />
                                            : <span className="material-icons-round" aria-hidden="true">picture_as_pdf</span>}
                                        {exportBusy('pdf') ? 'Exportando...' : 'PDF (.pdf)'}
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                    {bulkMode === 'none' && (
                        <button
                            type="button"
                            className="ui-btn ui-btn--secondary"
                            onClick={() => {
                                setActiveTagId(null);
                                setSearchTerm('');
                                setBulkMode('stock');
                            }}
                        >
                            <span className="material-icons-round inv-icon--success" aria-hidden="true">inventory</span>
                            Carga Masiva Stock
                        </button>
                    )}
                </div>
            </header>

            {/* FILTER BAR - Hide in Bulk Mode */}
            {bulkMode === 'none' && (
                <div className="inv-filter-block">
                    <h4 className="inv-filter-label">Filtrar por Categoría:</h4>
                    <TagFilterBar
                        tags={tags}
                        activeTagId={activeTagId}
                        onSelectTag={setActiveTagId}
                        onClear={() => { setActiveTagId(null); setSearchTerm(''); }}
                    />
                </div>
            )}

            {/* CONTROLS: Status Filter & Sorting - Hide in Bulk Mode */}
            {bulkMode === 'none' && (
                <div className="inv-controls">
                    <div className="ui-tabs" role="group" aria-label="Estado de los productos">
                        {[
                            { id: 'all', label: 'Todos' },
                            { id: 'active', label: 'Activos' },
                            { id: 'inactive', label: 'Inactivos' }
                        ].map(opt => (
                            <button
                                key={opt.id}
                                type="button"
                                className={`ui-tab${statusFilter === opt.id ? ' is-active' : ''}`}
                                aria-pressed={statusFilter === opt.id}
                                onClick={() => setStatusFilter(opt.id)}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>

                    <div className="inv-controls-end">
                        <select
                            className="ui-select inv-sort"
                            aria-label="Ordenar productos"
                            value={sortOption}
                            onChange={e => setSortOption(e.target.value)}
                        >
                            <option value="name_asc">Nombre (A-Z)</option>
                            <option value="name_desc">Nombre (Z-A)</option>
                            <option value="date_desc">Más Nuevos</option>
                            <option value="date_asc">Más Antiguos</option>
                        </select>

                        {/* Column Toggle */}
                        <div className="inv-cols" role="group" aria-label="Columnas de la grilla">
                            {GRID_COLUMN_OPTIONS.map(c => (
                                <button
                                    key={c}
                                    type="button"
                                    className={`ui-icon-btn${gridColumns === c ? ' is-active' : ''}`}
                                    aria-pressed={gridColumns === c}
                                    onClick={() => setGridColumns(c)}
                                    title={`${c} Columna(s)`}
                                >
                                    <span className="material-icons-round" aria-hidden="true">{GRID_COLUMN_ICONS[c]}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}


            {/* PRODUCTS GRID OR BULK FORMS */}
            {bulkMode === 'create' ? (
                <BulkProductForm
                    tags={tags}
                    onSuccess={() => {
                        setBulkMode('none');
                        fetchProducts();
                    }}
                    onCancel={() => setBulkMode('none')}
                />
            ) : bulkMode === 'update' ? (
                <BulkUpdateForm
                    products={products}
                    tags={tags}
                    onSuccess={() => {
                        setBulkMode('none');
                        fetchProducts();
                    }}
                    onCancel={() => setBulkMode('none')}
                />
            ) : bulkMode === 'stock' ? (
                <BulkStockArrivalForm
                    products={products}
                    onSuccess={() => {
                        setBulkMode('none');
                        fetchProducts();
                    }}
                    onClose={() => setBulkMode('none')}
                />
            ) :
                (() => {
                    // displayProducts ya viene filtrado y ordenado (memoizado arriba)
                    // Carga: tarjetas de esqueleto con la forma de la grilla (el texto queda
                    // para lectores de pantalla)
                    if (loading) return (
                        <div className={`inv-grid inv-grid--cols-${gridColumns}`} role="status" aria-busy="true">
                            <span className="ui-sr-only">Cargando productos...</span>
                            {[0, 1, 2, 3, 4, 5].map(i => (
                                <div key={i} className="inv-product-card inv-product-card--skeleton" aria-hidden="true">
                                    <span className="ui-skeleton inv-skeleton-media" />
                                    <div className="inv-product-body">
                                        <span className="ui-skeleton ui-skeleton--title" />
                                        <span className="ui-skeleton ui-skeleton--text" />
                                        <span className="ui-skeleton ui-skeleton--text inv-skeleton-short" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    );

                    if (displayProducts.length === 0) return (
                        <div className="ui-empty">
                            <span className="material-icons-round ui-empty-icon" aria-hidden="true">search_off</span>
                            <p className="ui-empty-title">No se encontraron productos.</p>
                        </div>
                    );

                    return (
                        <div className={`inv-grid inv-grid--cols-${gridColumns} ui-stagger`}>
                            {displayProducts.map(product => {
                                // ... Render ...
                                const isLowStock = product.stock < (product.reorderPoint || 10);
                                return (
                                    <article key={product.id} className={`inv-product-card${isLowStock ? ' is-low' : ''}`}>
                                        {isLowStock && product.active && (
                                            <span className="ui-badge ui-badge--warning inv-product-flag inv-product-flag--start">
                                                <span className="material-icons-round" aria-hidden="true">warning</span>
                                                Stock Bajo
                                            </span>
                                        )}

                                        {product.linkedSpecialCount > 0 && (
                                            <span className="ui-badge ui-badge--primary inv-product-flag inv-product-flag--end">
                                                <span className="material-icons-round" aria-hidden="true">star</span>
                                                {product.linkedSpecialCount} especial{product.linkedSpecialCount > 1 ? 'es' : ''}
                                            </span>
                                        )}

                                        <div className={`inv-product-media${!product.active ? ' is-inactive' : ''}`}>
                                            <img
                                                src={product.imageUrl || PLACEHOLDER_IMAGE}
                                                alt={product.nombre}
                                                loading="lazy"
                                                decoding="async"
                                                onError={e => e.target.src = PLACEHOLDER_IMAGE}
                                            />
                                            {!product.active && (
                                                <div className="inv-product-inactive">
                                                    <span className="ui-badge ui-badge--neutral">INACTIVO</span>
                                                </div>
                                            )}
                                        </div>

                                        <div className="inv-product-body">
                                            <div className="inv-product-head">
                                                <h3 className="inv-product-name">{product.nombre}</h3>
                                                <label className="ui-switch ui-switch--plain inv-switch" title={product.active ? "Desactivar" : "Activar"} onClick={e => e.stopPropagation()}>
                                                    <input
                                                        type="checkbox"
                                                        aria-label={product.active ? 'Desactivar' : 'Activar'}
                                                        checked={product.active}
                                                        onChange={() => handleToggleStatus(product)}
                                                    />
                                                    <span className="ui-switch-track"><span className="ui-switch-thumb" /></span>
                                                </label>
                                            </div>

                                            <div className="inv-product-tag">
                                                {product.tagName && <TagBadge tagName={product.tagName} />}
                                            </div>

                                            <p className="inv-product-desc">
                                                {product.descripcion || 'Sin descripción'}
                                            </p>

                                            <div className="inv-product-figures">
                                                <div>
                                                    <span className="inv-figure-label">
                                                        <span className="material-icons-round inv-icon--success" aria-hidden="true">sell</span>
                                                        Precio Unitario
                                                    </span>
                                                    <span className="inv-figure-value inv-figure-value--price">${formatCurrency(product.precio)}</span>
                                                </div>
                                                <div className="inv-figure--end">
                                                    <span className="inv-figure-label">
                                                        <span className={`material-icons-round ${product.stock < 0 ? 'inv-icon--danger' : (isLowStock ? 'inv-icon--warning' : 'inv-icon--primary')}`} aria-hidden="true">inventory_2</span>
                                                        Stock Actual
                                                    </span>
                                                    <span className={`inv-figure-value${product.stock < 0 ? ' is-negative' : (isLowStock ? ' is-low' : '')}`}>
                                                        {product.stock}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="inv-product-actions">
                                            <button type="button" className="ui-btn ui-btn--secondary ui-btn--sm" onClick={() => openStockModal(product)} title="Sumar Stock (Llegada)">
                                                <span className="material-icons-round inv-icon--success" aria-hidden="true">add_box</span> Llegada
                                            </button>
                                            <button type="button" className="ui-btn ui-btn--secondary ui-btn--sm" onClick={() => openEditModal(product)}>
                                                <span className="material-icons-round inv-icon--primary" aria-hidden="true">edit</span> Editar
                                            </button>
                                            <button type="button" className="ui-icon-btn ui-icon-btn--bordered ui-icon-btn--danger" onClick={() => handleDelete(product.id)} title="Eliminar" aria-label="Eliminar">
                                                <span className="material-icons-round" aria-hidden="true">delete</span>
                                            </button>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    );
                })()
            }

            {/* MODAL */}
            {
                isModalOpen && (
                    <ProductFormModal
                        product={editingProduct}
                        tags={tags}
                        onClose={() => setIsModalOpen(false)}
                        onSuccess={() => { fetchProducts(); setIsModalOpen(false); }}
                        // El stock ya no se edita en el formulario: se cambia por Llegada o Conteo físico
                        onAddStock={(p) => { setIsModalOpen(false); openStockModal(p); }}
                        onPhysicalCount={(p) => { setIsModalOpen(false); setCountProduct(p); }}
                    />
                )
            }

            {/* STOCK MODAL */}
            {
                stockModalOpen && (
                    <StockArrivalModal
                        product={selectedProductForStock}
                        onClose={() => setStockModalOpen(false)}
                        onSuccess={() => { fetchProducts(); }}
                    />
                )
            }

            {/* CONTEO FÍSICO */}
            {
                countProduct && (
                    <PhysicalCountModal
                        product={countProduct}
                        onClose={() => setCountProduct(null)}
                        onSuccess={() => { fetchProducts(); }}
                    />
                )
            }

            {/* BULK STOCK MODAL REMOVED */}
        </div>
    );
}


// --- FORM MODAL COMPONENT MOVED TO ./modals/ProductFormModal.js ---

// ============================================
// BULK PRODUCT FORM
// ============================================
// ============================================
// BULK UPDATE FORM
// ============================================
function BulkUpdateForm({ products, tags, onSuccess, onCancel }) {
    const toast = useToast();
    const askConfirm = useConfirm();
    const [searchTerm, setSearchTerm] = useState('');
    // Initialize editable rows with products. We only track changes.
    // However, to make it editable effectively, we map products to rows.
    // We'll filter products locally here for display.
    const [editedRows, setEditedRows] = useState({}); // Map of id -> { field: value }
    const [loading, setLoading] = useState(false);
    // Opciones del selector de etiqueta (una lista para todas las filas)
    const tagOptions = useMemo(() => (tags || []).map(t => ({ value: t.id, label: t.name })), [tags]);

    // Filter products for display
    const displayedProducts = products.filter(p =>
        p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.id && p.id.toString().includes(searchTerm))
    );

    const handleCellChange = (id, field, value) => {
        setEditedRows(prev => ({
            ...prev,
            [id]: {
                ...(prev[id] || {}),
                [field]: value
            }
        }));
    };

    // Helper to get Base64 from file
    const fileToBase64 = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result.split(',')[1]); // remove prefix
            reader.onerror = error => reject(error);
        });
    };

    const handleImageChange = async (id, e) => {
        const file = e.target.files[0];
        if (file) {
            try {
                const base64 = await fileToBase64(file);
                setEditedRows(prev => ({
                    ...prev,
                    [id]: {
                        ...(prev[id] || {}),
                        imageBase64: base64,
                        imageFileName: file.name
                    }
                }));
            } catch (err) {
                console.error(err);
                toast.error("Error al procesar imagen");
            }
        }
    };

    const handleSubmit = async () => {
        const productIds = Object.keys(editedRows);
        if (productIds.length === 0) {
            toast.info("No hay cambios para guardar.");
            return;
        }

        const payload = productIds.map(id => {
            const changes = editedRows[id];
            return {
                id: id,
                ...changes
            };
        });

        const ok = await askConfirm({ title: 'Guardar cambios', message: `Guardar cambios para ${productIds.length} productos?`, confirmText: 'Guardar', cancelText: 'Cancelar' });
        if (!ok) return;

        setLoading(true);
        try {
            const response = await productService.updateProductsBulk(payload);

            // Handle Blob
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'huella_actualizacion_masiva.pdf');
            document.body.appendChild(link);
            link.click();
            link.parentNode.removeChild(link);

            toast.success("Actualización masiva completada.");
            onSuccess();
        } catch (error) {
            console.error("Bulk update error", error);
            toast.error("Error al actualizar productos: " + (error.response ? "Verifique los datos" : error.message));
        } finally {
            setLoading(false);
        }
    };

    return (
        <section className="inv-bulk">
            <div className="inv-bulk-head">
                <h3 className="inv-bulk-title">
                    <span className="material-icons-round" aria-hidden="true">edit_note</span>
                    Edición Masiva
                </h3>

                <div className="inv-bulk-tools">
                    <input
                        type="text"
                        className="ui-input inv-bulk-filter"
                        aria-label="Filtrar productos"
                        placeholder="Filtrar productos..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                    <button type="button" onClick={onCancel} className="ui-btn ui-btn--secondary" disabled={loading}>
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        className={`ui-btn ui-btn--primary${loading ? ' is-loading' : ''}`}
                        aria-busy={loading || undefined}
                        disabled={loading}
                    >
                        {loading && <span className="ui-spinner" aria-hidden="true" />}
                        {loading ? 'Guardando...' : `Guardar Cambios (${Object.keys(editedRows).length})`}
                    </button>
                </div>
            </div>

            <div className="ui-table-wrap">
                <table className="ui-table inv-table-wide">
                    <thead>
                        <tr>
                            <th>Producto</th>
                            <th className="inv-w-md">Precio</th>
                            <th className="inv-w-sm ui-num">Stock</th>
                            <th className="inv-w-sm">Reorder</th>
                            <th className="inv-w-lg">Estado</th>
                            <th className="inv-w-xl">Etiqueta</th>
                            <th className="inv-w-xl">Imagen (Actualizar)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {displayedProducts.map(p => {
                            const changes = editedRows[p.id] || {};
                            // Use changed value or original
                            const finalPrice = changes.precio !== undefined ? changes.precio : p.precio;

                            return (
                                <tr key={p.id} className={editedRows[p.id] ? 'is-edited' : undefined}>
                                    <td>
                                        <div className="inv-cell-name">{p.nombre}</div>
                                        <div className="inv-id">ID: {p.id.substring(0, 8)}...</div>
                                    </td>
                                    <td>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            className={`ui-input inv-cell-input${changes.precio ? ' is-changed' : ''}`}
                                            aria-label={`Precio de ${p.nombre}`}
                                            value={finalPrice}
                                            onChange={e => handleCellChange(p.id, 'precio', e.target.value)}
                                            onWheel={(e) => e.target.blur()}
                                        />
                                    </td>
                                    <td className="ui-num"
                                        title="El stock se cambia con Llegada o Conteo físico (no aquí)">
                                        <span className={`inv-stock-value${p.stock < 0 ? ' is-negative' : ''}`}>
                                            {p.stock}
                                        </span>
                                    </td>
                                    <td>
                                        <input
                                            type="number"
                                            min="0"
                                            className={`ui-input inv-cell-input${changes.reorderPoint ? ' is-changed' : ''}`}
                                            aria-label={`Punto de reorden de ${p.nombre}`}
                                            value={changes.reorderPoint !== undefined ? changes.reorderPoint : (p.reorderPoint || 10)}
                                            onChange={e => handleCellChange(p.id, 'reorderPoint', e.target.value)}
                                            onWheel={(e) => e.target.blur()}
                                        />
                                    </td>
                                    <td>
                                        <select
                                            className={`ui-select inv-cell-input${changes.active !== undefined ? ' is-changed' : ''}`}
                                            aria-label={`Estado de ${p.nombre}`}
                                            value={changes.active !== undefined ? changes.active : p.active}
                                            onChange={e => handleCellChange(p.id, 'active', e.target.value === 'true')}
                                        >
                                            <option value="true">Activo</option>
                                            <option value="false">Inactivo</option>
                                        </select>
                                    </td>
                                    <td>
                                        <SearchableSelect
                                            className="inv-cell-combobox"
                                            inputClassName={`inv-cell-input${changes.tagId !== undefined ? ' is-changed' : ''}`}
                                            aria-label={`Etiqueta de ${p.nombre}`}
                                            value={changes.tagId !== undefined ? changes.tagId : (p.tagId || '')}
                                            onChange={e => handleCellChange(p.id, 'tagId', e.target.value)}
                                            options={tagOptions}
                                            emptyOption={{ label: '--' }}
                                            placeholder="--"
                                            searchPlaceholder="Buscar etiqueta…"
                                            noResultsText="Ninguna etiqueta coincide"
                                        />
                                    </td>
                                    <td>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            className="inv-file-input"
                                            aria-label={`Imagen de ${p.nombre}`}
                                            onChange={e => handleImageChange(p.id, e)}
                                        />
                                        {changes.imageBase64 && <span className="inv-file-ready">Imagen lista</span>}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

// ============================================
// BULK PRODUCT FORM (CREATE)
// ============================================
function BulkProductForm({ tags, onSuccess, onCancel }) {
    const toast = useToast();
    const [rows, setRows] = useState([
        { id: 1, nombre: '', descripcion: '', precio: '', stock: '', reorderPoint: 10, tagId: '', imageUrl: '', imageFile: null }
    ]);
    const [loading, setLoading] = useState(false);
    // Opciones del selector de etiqueta (una lista para todas las filas)
    const tagOptions = useMemo(() => (tags || []).map(t => ({ value: t.id, label: t.name })), [tags]);

    // ... (rest of logic similar, just need to update submit to handle base64)

    const handleRowChange = (id, field, value) => {
        setRows(prev => prev.map(row => row.id === id ? { ...row, [field]: value } : row));
    };

    const handleImageFileChange = async (id, e) => {
        const file = e.target.files[0];
        if (file) {
            setRows(prev => prev.map(row => row.id === id ? { ...row, imageFile: file } : row));
        }
    };

    const addRow = () => {
        const newId = rows.length > 0 ? Math.max(...rows.map(r => r.id)) + 1 : 1;
        setRows([...rows, { id: newId, nombre: '', descripcion: '', precio: '', stock: '', reorderPoint: 10, tagId: '', imageUrl: '', imageFile: null }]);
    };

    const removeRow = (id) => {
        if (rows.length <= 1) return;
        setRows(prev => prev.filter(r => r.id !== id));
    };

    const fileToBase64 = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = error => reject(error);
        });
    };

    const handleSubmit = async () => {
        const validRows = rows.filter(r => r.nombre.trim() !== '');
        if (validRows.length === 0) {
            toast.warning('Ingrese al menos un producto con nombre.');
            return;
        }

        for (const row of validRows) {
            if (!row.precio || parseFloat(row.precio) < 0) return toast.warning(`Precio inválido para ${row.nombre}`);
            if (!row.stock || parseInt(row.stock) < 0) return toast.warning(`Stock inválido para ${row.nombre}`);
        }

        setLoading(true);
        try {
            // Prepare payload with Base64 images if present
            const payload = await Promise.all(validRows.map(async r => {
                let base64 = null;
                let fileName = null;
                if (r.imageFile) {
                    base64 = await fileToBase64(r.imageFile);
                    fileName = r.imageFile.name;
                }

                return {
                    nombre: r.nombre,
                    descripcion: r.descripcion,
                    precio: parseFloat(r.precio),
                    stock: parseInt(r.stock),
                    reorderPoint: parseInt(r.reorderPoint || 10),
                    // imageUrl: r.imageUrl || null, // API likely prefers base64 over URL now, or both? 
                    // Prompt says: "NEW: To upload images in bulk, convert the file to a Base64 String and send it in the imageBase64 field."
                    // It doesn't strictly say it removed imageUrl support, but let's stick to base64 if file provided.
                    // If no file but URL string, maybe still send? Let's check DTO from prompt.
                    // "CreateProductRequest"
                    tagId: r.tagId || null,
                    imageBase64: base64,
                    imageFileName: fileName
                };
            }));

            const response = await productService.createProductsBulk(payload);

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'huella_creacion_masiva.pdf');
            document.body.appendChild(link);
            link.click();
            link.parentNode.removeChild(link);

            toast.success(`Se agregaron ${validRows.length} productos correctamente. Huella contable descargada.`);
            onSuccess();
        } catch (error) {
            console.error('Bulk create error:', error);
            toast.error('Error al cargar productos masivamente.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <section className="inv-bulk">
            <div className="inv-bulk-head">
                <h3 className="inv-bulk-title inv-bulk-title--success">
                    <span className="material-icons-round" aria-hidden="true">playlist_add</span>
                    Carga Masiva de Productos
                </h3>
                <div className="inv-bulk-tools">
                    <button type="button" onClick={onCancel} className="ui-btn ui-btn--secondary" disabled={loading}>
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        className={`ui-btn ui-btn--primary${loading ? ' is-loading' : ''}`}
                        aria-busy={loading || undefined}
                        disabled={loading}
                    >
                        {loading ? 'Procesando...' : 'Cargar Productos'}
                        {loading
                            ? <span className="ui-spinner" aria-hidden="true" />
                            : <span className="material-icons-round" aria-hidden="true">save_alt</span>}
                    </button>
                </div>
            </div>

            <div className="ui-table-wrap">
                <table className="ui-table inv-table-wide">
                    <thead>
                        <tr>
                            <th className="inv-w-20p">Nombre *</th>
                            <th className="inv-w-20p">Descripción</th>
                            <th className="inv-w-10p">Precio *</th>
                            <th className="inv-w-8p">Stock *</th>
                            <th className="inv-w-8p">Reorder</th>
                            <th className="inv-w-15p">Etiqueta</th>
                            <th className="inv-w-15p">Imagen</th>
                            <th className="inv-w-xs"><span className="ui-sr-only">Acciones</span></th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, index) => (
                            <tr key={row.id}>
                                <td>
                                    <input
                                        type="text"
                                        className="ui-input inv-cell-input"
                                        aria-label={`Nombre (fila ${index + 1})`}
                                        placeholder="Nombre..."
                                        value={row.nombre}
                                        onChange={e => handleRowChange(row.id, 'nombre', e.target.value)}
                                    />
                                </td>
                                <td>
                                    <input
                                        type="text"
                                        className="ui-input inv-cell-input"
                                        aria-label={`Descripción (fila ${index + 1})`}
                                        placeholder="Descripción"
                                        value={row.descripcion}
                                        onChange={e => handleRowChange(row.id, 'descripcion', e.target.value)}
                                    />
                                </td>
                                <td>
                                    <input
                                        type="number"
                                        className="ui-input inv-cell-input"
                                        aria-label={`Precio (fila ${index + 1})`}
                                        placeholder="0.00"
                                        min="0"
                                        value={row.precio}
                                        onWheel={(e) => e.target.blur()}
                                        onChange={e => handleRowChange(row.id, 'precio', e.target.value)}
                                    />
                                </td>
                                <td>
                                    <input
                                        type="number"
                                        className="ui-input inv-cell-input"
                                        aria-label={`Stock (fila ${index + 1})`}
                                        placeholder="0"
                                        min="0"
                                        value={row.stock}
                                        onWheel={(e) => e.target.blur()}
                                        onChange={e => handleRowChange(row.id, 'stock', e.target.value)}
                                    />
                                </td>
                                <td>
                                    <input
                                        type="number"
                                        className="ui-input inv-cell-input"
                                        aria-label={`Punto de reorden (fila ${index + 1})`}
                                        placeholder="10"
                                        value={row.reorderPoint}
                                        onWheel={(e) => e.target.blur()}
                                        onChange={e => handleRowChange(row.id, 'reorderPoint', e.target.value)}
                                    />
                                </td>
                                <td>
                                    <SearchableSelect
                                        className="inv-cell-combobox"
                                        inputClassName="inv-cell-input"
                                        aria-label={`Etiqueta (fila ${index + 1})`}
                                        value={row.tagId}
                                        onChange={e => handleRowChange(row.id, 'tagId', e.target.value)}
                                        options={tagOptions}
                                        emptyOption={{ label: '--' }}
                                        placeholder="--"
                                        searchPlaceholder="Buscar etiqueta…"
                                        noResultsText="Ninguna etiqueta coincide"
                                    />
                                </td>
                                <td>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="inv-file-input inv-file-input--sm"
                                        aria-label={`Imagen (fila ${index + 1})`}
                                        onChange={e => handleImageFileChange(row.id, e)}
                                    />
                                </td>
                                <td className="inv-cell-center">
                                    {rows.length > 1 && (
                                        <button
                                            type="button"
                                            className="ui-icon-btn ui-icon-btn--danger"
                                            onClick={() => removeRow(row.id)}
                                            title="Eliminar fila"
                                            aria-label="Eliminar fila"
                                        >
                                            <span className="material-icons-round" aria-hidden="true">delete</span>
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="inv-bulk-foot">
                <button
                    type="button"
                    className="ui-btn ui-btn--secondary"
                    onClick={addRow}
                >
                    <span className="material-icons-round inv-icon--primary" aria-hidden="true">add</span>
                    Agregar Fila
                </button>
                <p className="inv-bulk-hint">
                    Llene los datos. Las filas sin nombre serán ignoradas.
                </p>
            </div>
        </section>
    );
}

// ============================================
