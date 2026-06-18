import React, { useState, useEffect, useCallback, useMemo } from 'react';
import client from '../api/client';
import { useToast } from './ToastContainer';
import { useConfirm } from './ConfirmDialog';
import { tagService } from '../api/tagService';
import { TagBadge, TagFilterBar } from './TagComponents';
import productService from '../api/productService';
import ProductFormModal from './modals/ProductFormModal';
import { formatCurrency } from '../utils/formatters';
import StockArrivalModal from './modals/StockArrivalModal';
import BulkStockArrivalForm from './BulkStockArrivalForm';

// Placeholder for missing images
const PLACEHOLDER_IMAGE = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23f3f4f6" width="200" height="200"/%3E%3Ctext fill="%239ca3af" font-family="Arial, sans-serif" font-size="16" dy="10" font-weight="bold" x="50%25" y="50%25" text-anchor="middle"%3ESin Imagen%3C/text%3E%3C/svg%3E';

export default function ProductsPanel({ refreshTrigger }) {
    const [products, setProducts] = useState([]);
    const [tags, setTags] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTagId, setActiveTagId] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [gridColumns, setGridColumns] = useState(() => parseInt(localStorage.getItem('adminGridCols')) || 3);

    // New Filters/Sort
    const [statusFilter, setStatusFilter] = useState('all'); // all, active, inactive
    const [sortOption, setSortOption] = useState('name_asc'); // name_asc, name_desc, date_desc, date_asc

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);
    const [stockModalOpen, setStockModalOpen] = useState(false);
    const [selectedProductForStock, setSelectedProductForStock] = useState(null);

    // Bulk Mode State
    // 'none', 'create', 'update'
    const [bulkMode, setBulkMode] = useState('none');

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

    const fetchProducts = useCallback(async () => {
        try {
            setLoading(true);
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
            console.error('Error loading products:', error);
            toast.error('Error al cargar productos');
        } finally {
            setLoading(false);
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
        }
    };

    const handleDownloadPDF = async () => {
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
        <div style={{ padding: '1.5rem', height: '100%', display: 'flex', flexDirection: 'column' }}>

            {/* HEADER */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                        <span className="material-icons-round" style={{ color: 'var(--primary)' }}>inventory_2</span>
                        Gestión de Productos
                    </h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.2rem', display: 'flex', gap: '1rem' }}>
                        <span>Total: <b>{products.length}</b></span>
                        <span style={{ color: '#16a34a' }}>Activos: <b>{products.filter(p => p.active).length}</b></span>
                        <span style={{ color: '#dc2626' }}>Inactivos: <b>{products.filter(p => !p.active).length}</b></span>
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <div style={{ position: 'relative' }}>
                        <span className="material-icons-round" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', fontSize: '18px' }}>search</span>
                        <input
                            type="text"
                            placeholder={activeTagId ? "Buscar en etiqueta..." : "Buscar global..."}
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            style={{
                                padding: '0.6rem 1rem 0.6rem 2.2rem',
                                borderRadius: '8px',
                                border: '1px solid var(--border)',
                                width: '250px'
                            }}
                        />
                    </div>

                    {bulkMode !== 'none' ? (
                        <button
                            onClick={() => setBulkMode('none')}
                            style={{
                                background: 'white',
                                color: 'var(--text-secondary)',
                                border: '1px solid var(--border)',
                                padding: '0.6rem 1.2rem',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                fontWeight: 600
                            }}
                        >
                            <span className="material-icons-round">arrow_back</span>
                            Volver a Lista
                        </button>
                    ) : (
                        <>
                            <button
                                onClick={() => {
                                    setActiveTagId(null);
                                    setSearchTerm('');
                                    setBulkMode('update');
                                }}
                                style={{
                                    background: 'white',
                                    color: 'var(--primary)',
                                    border: '1px solid var(--primary)',
                                    padding: '0.6rem 1.2rem',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    fontWeight: 600
                                }}
                            >
                                <span className="material-icons-round">edit_note</span>
                                Edición Masiva
                            </button>
                            <button
                                onClick={() => setBulkMode('create')}
                                style={{
                                    background: 'white',
                                    color: 'var(--text-primary)',
                                    border: '1px solid var(--border)',
                                    padding: '0.6rem 1.2rem',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    fontWeight: 600
                                }}
                            >
                                <span className="material-icons-round">playlist_add</span>
                                Carga Masiva
                            </button>
                            <button
                                onClick={openCreateModal}
                                style={{
                                    background: 'var(--primary)',
                                    color: 'white',
                                    border: 'none',
                                    padding: '0.6rem 1.2rem',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    fontWeight: 600,
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                                }}
                            >
                                <span className="material-icons-round">add</span>
                                Nuevo Producto
                            </button>

                            {/* Dropdown for Inventory Download */}
                            <div className="dropdown" style={{ position: 'relative', display: 'inline-block' }}>
                                <button
                                    style={{
                                        background: 'white',
                                        color: 'var(--text-secondary)',
                                        border: '1px solid var(--border)',
                                        padding: '0.6rem 1.2rem',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        fontWeight: 600
                                    }}
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
                                    <span className="material-icons-round">download</span>
                                    Descargar Inventario
                                    <span className="material-icons-round" style={{ fontSize: '18px' }}>arrow_drop_down</span>
                                </button>
                                <div style={{
                                    display: 'none',
                                    position: 'absolute',
                                    right: 0,
                                    top: '100%',
                                    marginTop: '5px',
                                    background: 'white',
                                    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                                    borderRadius: '8px',
                                    zIndex: 10,
                                    minWidth: '160px',
                                    overflow: 'hidden',
                                    border: '1px solid var(--border)'
                                }}>
                                    <button
                                        onClick={handleDownloadExcel}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '8px',
                                            padding: '10px 16px', width: '100%', border: 'none', background: 'white',
                                            textAlign: 'left', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text-primary)'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                                    >
                                        <span className="material-icons-round" style={{ color: '#10b981' }}>table_view</span> Excel (.xlsx)
                                    </button>
                                    <button
                                        onClick={handleDownloadPDF}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '8px',
                                            padding: '10px 16px', width: '100%', border: 'none', background: 'white',
                                            textAlign: 'left', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text-primary)',
                                            borderTop: '1px solid var(--border)'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                                    >
                                        <span className="material-icons-round" style={{ color: '#ef4444' }}>picture_as_pdf</span> PDF (.pdf)
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                    {bulkMode === 'none' && (
                        <button
                            onClick={() => {
                                setActiveTagId(null);
                                setSearchTerm('');
                                setBulkMode('stock');
                            }}
                            style={{
                                background: '#3b82f6',
                                color: 'white',
                                border: 'none',
                                padding: '0.6rem 1.2rem',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                fontWeight: 600,
                                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                            }}
                        >
                            <span className="material-icons-round">inventory</span>
                            Carga Masiva Stock
                        </button>
                    )}
                </div>
            </div>

            {/* FILTER BAR - Hide in Bulk Mode */}
            {bulkMode === 'none' && (
                <div style={{ marginBottom: '1.5rem' }}>
                    <h4 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Filtrar por Categoría:</h4>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {[
                            { id: 'all', label: 'Todos' },
                            { id: 'active', label: 'Activos' },
                            { id: 'inactive', label: 'Inactivos' }
                        ].map(opt => (
                            <button
                                key={opt.id}
                                onClick={() => setStatusFilter(opt.id)}
                                style={{
                                    padding: '0.4rem 1rem',
                                    borderRadius: '20px',
                                    border: statusFilter === opt.id ? '2px solid var(--primary)' : '1px solid var(--border)',
                                    background: statusFilter === opt.id ? '#f0fdf4' : 'white',
                                    color: statusFilter === opt.id ? 'var(--primary)' : 'var(--text-secondary)',
                                    fontWeight: statusFilter === opt.id ? 600 : 400,
                                    cursor: 'pointer',
                                    fontSize: '0.85rem'
                                }}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>

                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <select
                            value={sortOption}
                            onChange={e => setSortOption(e.target.value)}
                            style={{
                                padding: '0.4rem 0.8rem',
                                borderRadius: '6px',
                                border: '1px solid var(--border)',
                                color: 'var(--text-secondary)',
                                fontSize: '0.9rem'
                            }}
                        >
                            <option value="name_asc">Nombre (A-Z)</option>
                            <option value="name_desc">Nombre (Z-A)</option>
                            <option value="date_desc">Más Nuevos</option>
                            <option value="date_asc">Más Antiguos</option>
                        </select>

                        {/* Column Toggle */}
                        <div style={{ display: 'flex' }}>
                            {[1, 2, 3, 4].map(c => (
                                <button
                                    key={c}
                                    onClick={() => { setGridColumns(c); localStorage.setItem('adminGridCols', c); }}
                                    style={{
                                        padding: '0.4rem',
                                        background: gridColumns === c ? '#e5e7eb' : 'transparent',
                                        border: 'none',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        marginLeft: '0.25rem'
                                    }}
                                    title={`${c} Columna(s)`}
                                >
                                    <span className="material-icons-round" style={{ fontSize: '18px', color: gridColumns === c ? 'black' : '#9ca3af' }}>grid_view</span>
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
                    if (loading) return (
                        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                            <div className="loading">Cargando productos...</div>
                        </div>
                    );

                    if (displayProducts.length === 0) return (
                        <div style={{ flex: 1, textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                            <span className="material-icons-round" style={{ fontSize: '48px', marginBottom: '1rem' }}>search_off</span>
                            <p>No se encontraron productos.</p>
                        </div>
                    );

                    return (
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: `repeat(${gridColumns}, 1fr)`,
                            gap: '1.5rem',
                            overflowY: 'auto',
                            paddingBottom: '2rem'
                        }}>
                            {displayProducts.map(product => {
                                // ... Render ...
                                const isLowStock = product.stock < (product.reorderPoint || 10);
                                return (
                                    <div key={product.id} className="product-card" style={{
                                        background: 'white',
                                        borderRadius: '12px',
                                        border: `1px solid ${isLowStock ? '#fca5a5' : '#e5e7eb'}`,
                                        overflow: 'hidden',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        position: 'relative'
                                    }}>
                                        {/* Copied rest of card from original map func logic above for context, but usually better to extract Card */}
                                        {/* Re-implementing Card Body to ensure safe rendering inside this IIFE */}

                                        {isLowStock && product.active && (
                                            <div style={{
                                                position: 'absolute', top: '10px', left: '10px', background: '#ef4444', color: 'white',
                                                fontSize: '0.7rem', padding: '0.2rem 0.6rem', borderRadius: '12px', fontWeight: 'bold', zIndex: 2,
                                                display: 'flex', alignItems: 'center', gap: '4px'
                                            }}>
                                                <span className="material-icons-round" style={{ fontSize: '12px' }}>warning</span>
                                                Stock Bajo
                                            </div>
                                        )}

                                        {product.linkedSpecialCount > 0 && (
                                            <div style={{
                                                position: 'absolute', top: '10px', right: '10px',
                                                background: 'linear-gradient(135deg, #6366f1, #818cf8)', color: 'white',
                                                fontSize: '0.7rem', padding: '0.2rem 0.6rem', borderRadius: '12px',
                                                fontWeight: 700, zIndex: 2, display: 'flex', alignItems: 'center', gap: '4px'
                                            }}>
                                                <span className="material-icons-round" style={{ fontSize: '12px' }}>star</span>
                                                {product.linkedSpecialCount} especial{product.linkedSpecialCount > 1 ? 'es' : ''}
                                            </div>
                                        )}

                                        <div style={{ height: '180px', overflow: 'hidden', background: '#f9fafb', position: 'relative' }}>
                                            <img
                                                src={product.imageUrl || PLACEHOLDER_IMAGE}
                                                alt={product.nombre}
                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                onError={e => e.target.src = PLACEHOLDER_IMAGE}
                                            />
                                            {!product.active && (
                                                <div style={{
                                                    position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.7)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)'
                                                }}>
                                                    <span style={{ background: '#9ca3af', color: 'white', padding: '0.3rem 0.8rem', borderRadius: '4px', fontWeight: 'bold' }}>INACTIVO</span>
                                                </div>
                                            )}
                                        </div>

                                        <div style={{ padding: '1rem', flex: 1, display: 'flex', flexDirection: 'column' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                                                <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, lineHeight: 1.3 }}>{product.nombre}</h3>
                                                <label className="switch" title={product.active ? "Desactivar" : "Activar"} onClick={e => e.stopPropagation()}>
                                                    <input
                                                        type="checkbox"
                                                        checked={product.active}
                                                        onChange={() => handleToggleStatus(product)}
                                                    />
                                                    <span className="slider round"></span>
                                                </label>
                                            </div>

                                            <div style={{ marginBottom: '0.5rem' }}>
                                                {product.tagName && <TagBadge tagName={product.tagName} />}
                                            </div>

                                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: 'auto', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                                {product.descripcion || 'Sin descripción'}
                                            </p>

                                            <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f3f4f6', paddingTop: '0.75rem' }}>
                                                <div>
                                                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Precio Unitario</span>
                                                    <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--primary)' }}>${formatCurrency(product.precio)}</span>
                                                </div>
                                                <div style={{ textAlign: 'right' }}>
                                                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Stock Actual</span>
                                                    <span style={{ fontSize: '1rem', fontWeight: 600, color: product.stock < 0 ? '#ef4444' : (isLowStock ? '#f59e0b' : 'var(--text-primary)') }}>
                                                        {product.stock}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div style={{ padding: '0.75rem', background: '#f8fafc', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                            <button onClick={() => openStockModal(product)} style={{
                                                flex: 1,
                                                padding: '0.5rem',
                                                border: '1px solid #d1d5db',
                                                borderRadius: '6px',
                                                cursor: 'pointer',
                                                background: 'white',
                                                display: 'flex',
                                                justifyContent: 'center',
                                                gap: '0.3rem',
                                                alignItems: 'center',
                                                fontSize: '0.8rem',
                                                color: '#059669',
                                                borderColor: '#a7f3d0',
                                                backgroundColor: '#ecfdf5'
                                            }} title="Sumar Stock (Llegada)">
                                                <span className="material-icons-round" style={{ fontSize: '16px' }}>add_box</span> Llegada
                                            </button>
                                            <button onClick={() => openEditModal(product)} style={{ flex: 1, padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', background: 'white', display: 'flex', justifyContent: 'center', gap: '0.5rem', alignItems: 'center', fontSize: '0.8rem' }}>
                                                <span className="material-icons-round" style={{ fontSize: '16px' }}>edit</span> Editar
                                            </button>
                                            <button onClick={() => handleDelete(product.id)} style={{ width: '36px', padding: '0.5rem', border: '1px solid #fee2e2', borderRadius: '6px', cursor: 'pointer', background: '#fef2f2', color: '#ef4444', display: 'flex', justifyContent: 'center' }} title="Eliminar">
                                                <span className="material-icons-round" style={{ fontSize: '18px' }}>delete</span>
                                            </button>
                                        </div>
                                    </div>
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

            {/* BULK STOCK MODAL REMOVED */}

            {/* Inline Styles for Toggle Switch if not globally present */}
            <style>{`
        .switch { position: relative; display: inline-block; width: 34px; height: 18px; }
        .switch input { opacity: 0; width: 0; height: 0; }
        .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; -webkit-transition: .4s; transition: .4s; }
        .slider:before { position: absolute; content: ""; height: 14px; width: 14px; left: 2px; bottom: 2px; background-color: white; -webkit-transition: .4s; transition: .4s; }
        input:checked + .slider { background-color: var(--primary); }
        input:focus + .slider { box-shadow: 0 0 1px var(--primary); }
        input:checked + .slider:before { -webkit-transform: translateX(16px); -ms-transform: translateX(16px); transform: translateX(16px); }
        .slider.round { border-radius: 34px; }
        .slider.round:before { border-radius: 50%; }
      `}</style>
        </div >
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
        <div style={{ background: 'white', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className="material-icons-round" style={{ color: 'var(--primary)' }}>edit_note</span>
                    Edición Masiva
                </h3>

                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <input
                        type="text"
                        placeholder="Filtrar productos..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db' }}
                    />
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={onCancel} className="btn-secondary" disabled={loading}>
                            Cancelar
                        </button>
                        <button
                            onClick={handleSubmit}
                            className="btn-primary"
                            disabled={loading}
                        >
                            {loading ? 'Guardando...' : `Guardar Cambios (${Object.keys(editedRows).length})`}
                        </button>
                    </div>
                </div>
            </div>

            <div style={{ overflow: 'auto', flex: 1, border: '1px solid #e5e7eb', borderRadius: '8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1000px' }}>
                    <thead style={{ position: 'sticky', top: 0, background: '#f9fafb', zIndex: 1, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                        <tr>
                            <th style={{ padding: '0.8rem', textAlign: 'left' }}>Producto</th>
                            <th style={{ padding: '0.8rem', width: '120px' }}>Precio</th>
                            <th style={{ padding: '0.8rem', width: '100px' }}>Stock</th>
                            <th style={{ padding: '0.8rem', width: '100px' }}>Reorder</th>
                            <th style={{ padding: '0.8rem', width: '150px' }}>Estado</th>
                            <th style={{ padding: '0.8rem', width: '200px' }}>Etiqueta</th>
                            <th style={{ padding: '0.8rem', width: '200px' }}>Imagen (Actualizar)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {displayedProducts.map(p => {
                            const changes = editedRows[p.id] || {};
                            // Use changed value or original
                            const finalPrice = changes.precio !== undefined ? changes.precio : p.precio;
                            const finalStock = changes.stock !== undefined ? changes.stock : p.stock;

                            return (
                                <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6', background: editedRows[p.id] ? '#fefffa' : 'white' }}>
                                    <td style={{ padding: '0.5rem' }}>
                                        <div style={{ fontWeight: 500 }}>{p.nombre}</div>
                                        <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>ID: {p.id.substring(0, 8)}...</div>
                                    </td>
                                    <td style={{ padding: '0.5rem' }}>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            className="form-input"
                                            value={finalPrice}
                                            onChange={e => handleCellChange(p.id, 'precio', e.target.value)}
                                            onWheel={(e) => e.target.blur()}
                                            style={{ borderColor: changes.precio ? '#f59e0b' : '' }}
                                        />
                                    </td>
                                    <td style={{ padding: '0.5rem' }}>
                                        <input
                                            type="number"
                                            min="0"
                                            className="form-input"
                                            value={finalStock}
                                            onChange={e => handleCellChange(p.id, 'stock', e.target.value)}
                                            onWheel={(e) => e.target.blur()}
                                            style={{ borderColor: changes.stock ? '#f59e0b' : '' }}
                                        />
                                    </td>
                                    <td style={{ padding: '0.5rem' }}>
                                        <input
                                            type="number"
                                            min="0"
                                            className="form-input"
                                            value={changes.reorderPoint !== undefined ? changes.reorderPoint : (p.reorderPoint || 10)}
                                            onChange={e => handleCellChange(p.id, 'reorderPoint', e.target.value)}
                                            onWheel={(e) => e.target.blur()}
                                            style={{ borderColor: changes.reorderPoint ? '#f59e0b' : '' }}
                                        />
                                    </td>
                                    <td style={{ padding: '0.5rem' }}>
                                        <select
                                            className="form-input"
                                            value={changes.active !== undefined ? changes.active : p.active}
                                            onChange={e => handleCellChange(p.id, 'active', e.target.value === 'true')}
                                            style={{ borderColor: changes.active !== undefined ? '#f59e0b' : '' }}
                                        >
                                            <option value="true">Activo</option>
                                            <option value="false">Inactivo</option>
                                        </select>
                                    </td>
                                    <td style={{ padding: '0.5rem' }}>
                                        <select
                                            className="form-input"
                                            value={changes.tagId !== undefined ? changes.tagId : (p.tagId || '')}
                                            onChange={e => handleCellChange(p.id, 'tagId', e.target.value)}
                                            style={{ borderColor: changes.tagId !== undefined ? '#f59e0b' : '' }}
                                        >
                                            <option value="">--</option>
                                            {tags.map(t => (
                                                <option key={t.id} value={t.id}>{t.name}</option>
                                            ))}
                                        </select>
                                    </td>
                                    <td style={{ padding: '0.5rem' }}>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={e => handleImageChange(p.id, e)}
                                            style={{ fontSize: '0.8rem', maxWidth: '180px' }}
                                        />
                                        {changes.imageBase64 && <span style={{ fontSize: '0.7rem', color: 'green', display: 'block' }}>Imagen lista</span>}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
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
        <div style={{ background: 'white', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className="material-icons-round" style={{ color: 'var(--primary)' }}>playlist_add</span>
                    Carga Masiva de Productos
                </h3>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={onCancel} className="btn-secondary" disabled={loading}>
                        Cancelar
                    </button>
                    <button
                        onClick={handleSubmit}
                        className="btn-primary"
                        disabled={loading}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                        {loading ? 'Procesando...' : 'Cargar Productos'}
                        <span className="material-icons-round" style={{ fontSize: '18px' }}>save_alt</span>
                    </button>
                </div>
            </div>

            <div style={{ overflowX: 'auto', flex: 1 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1000px' }}>
                    <thead>
                        <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                            <th style={{ padding: '0.8rem', width: '20%' }}>Nombre *</th>
                            <th style={{ padding: '0.8rem', width: '20%' }}>Descripción</th>
                            <th style={{ padding: '0.8rem', width: '10%' }}>Precio *</th>
                            <th style={{ padding: '0.8rem', width: '8%' }}>Stock *</th>
                            <th style={{ padding: '0.8rem', width: '8%' }}>Reorder</th>
                            <th style={{ padding: '0.8rem', width: '15%' }}>Etiqueta</th>
                            <th style={{ padding: '0.8rem', width: '15%' }}>Imagen</th>
                            <th style={{ padding: '0.8rem', width: '50px' }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, index) => (
                            <tr key={row.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                <td style={{ padding: '0.5rem' }}>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="Nombre..."
                                        value={row.nombre}
                                        onChange={e => handleRowChange(row.id, 'nombre', e.target.value)}
                                    />
                                </td>
                                <td style={{ padding: '0.5rem' }}>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="Descripción"
                                        value={row.descripcion}
                                        onChange={e => handleRowChange(row.id, 'descripcion', e.target.value)}
                                    />
                                </td>
                                <td style={{ padding: '0.5rem' }}>
                                    <input
                                        type="number"
                                        className="form-input"
                                        placeholder="0.00"
                                        min="0"
                                        value={row.precio}
                                        onWheel={(e) => e.target.blur()}
                                        onChange={e => handleRowChange(row.id, 'precio', e.target.value)}
                                    />
                                </td>
                                <td style={{ padding: '0.5rem' }}>
                                    <input
                                        type="number"
                                        className="form-input"
                                        placeholder="0"
                                        min="0"
                                        value={row.stock}
                                        onWheel={(e) => e.target.blur()}
                                        onChange={e => handleRowChange(row.id, 'stock', e.target.value)}
                                    />
                                </td>
                                <td style={{ padding: '0.5rem' }}>
                                    <input
                                        type="number"
                                        className="form-input"
                                        placeholder="10"
                                        value={row.reorderPoint}
                                        onWheel={(e) => e.target.blur()}
                                        onChange={e => handleRowChange(row.id, 'reorderPoint', e.target.value)}
                                    />
                                </td>
                                <td style={{ padding: '0.5rem' }}>
                                    <select
                                        className="form-input"
                                        value={row.tagId}
                                        onChange={e => handleRowChange(row.id, 'tagId', e.target.value)}
                                    >
                                        <option value="">--</option>
                                        {tags.map(t => (
                                            <option key={t.id} value={t.id}>{t.name}</option>
                                        ))}
                                    </select>
                                </td>
                                <td style={{ padding: '0.5rem' }}>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={e => handleImageFileChange(row.id, e)}
                                        style={{ fontSize: '0.8rem', maxWidth: '150px' }}
                                    />
                                </td>
                                <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                                    {rows.length > 1 && (
                                        <button
                                            onClick={() => removeRow(row.id)}
                                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                                            title="Eliminar fila"
                                        >
                                            <span className="material-icons-round">delete</span>
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <div style={{ padding: '1rem', textAlign: 'center' }}>
                    <button
                        onClick={addRow}
                        style={{
                            background: '#f3f4f6',
                            border: '1px dashed #d1d5db',
                            padding: '0.5rem 2rem',
                            borderRadius: '6px',
                            color: 'var(--text-secondary)',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                        }}
                    >
                        <span className="material-icons-round">add</span>
                        Agregar Fila
                    </button>
                    <p style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '0.5rem' }}>
                        Llene los datos. Las filas sin nombre serán ignoradas.
                    </p>
                </div>
            </div>
        </div>
    );
}

// ============================================
