import React, { useState, useEffect, useCallback } from 'react';
import client from '../api/client';
import { useToast } from './ToastContainer';
import { tagService } from '../api/tagService';
import { TagBadge, TagFilterBar } from './TagComponents';

// Placeholder for missing images
const PLACEHOLDER_IMAGE = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23f3f4f6" width="200" height="200"/%3E%3Ctext fill="%239ca3af" font-family="Arial, sans-serif" font-size="16" dy="10" font-weight="bold" x="50%25" y="50%25" text-anchor="middle"%3ESin Imagen%3C/text%3E%3C/svg%3E';

export default function ProductsPanel() {
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

    const toast = useToast();

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
            let params = {};

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
    }, [fetchProducts]);

    // Reload when filters change (ignoring search debounce for simplicity, but could add it)
    useEffect(() => {
        fetchProducts();
    }, [fetchProducts]);


    // --- Actions ---

    const handleDelete = async (id) => {
        if (!window.confirm('¿Confirmar eliminación? Esta acción ' + (true ? 'inhabilitará' : 'borrará') + ' el producto.')) return;
        try {
            await client.delete(`/admin/products/${id}`); // Soft delete by default
            toast.success('Producto eliminado correctamente');
            fetchProducts();
        } catch (error) {
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

    const openCreateModal = () => {
        setEditingProduct(null);
        setIsModalOpen(true);
    };

    const openEditModal = (product) => {
        setEditingProduct(product);
        setIsModalOpen(true);
    };

    return (
        <div style={{ padding: '1.5rem', height: '100%', display: 'flex', flexDirection: 'column' }}>

            {/* HEADER */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                        <span className="material-icons-round" style={{ color: 'var(--primary)' }}>inventory_2</span>
                        Gestión de Productos
                    </h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.2rem' }}>
                        Administración de inventario y catálogo
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
                </div>
            </div>

            {/* FILTER BAR */}
            <div style={{ marginBottom: '1.5rem' }}>
                <h4 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Filtrar por Categoría:</h4>
                <TagFilterBar
                    tags={tags}
                    activeTagId={activeTagId}
                    onSelectTag={setActiveTagId}
                    onClear={() => { setActiveTagId(null); setSearchTerm(''); }}
                />
            </div>



            {/* CONTROLS: Status Filter & Sorting */}
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


            {/* PRODUCTS GRID */}
            {
                (() => {
                    // Apply Filters & Sort
                    let displayProducts = [...products];

                    // 1. Status Filter
                    if (statusFilter === 'active') displayProducts = displayProducts.filter(p => p.active);
                    if (statusFilter === 'inactive') displayProducts = displayProducts.filter(p => !p.active);

                    // 2. Sorting
                    displayProducts.sort((a, b) => {
                        if (sortOption === 'name_asc') return a.nombre.localeCompare(b.nombre);
                        if (sortOption === 'name_desc') return b.nombre.localeCompare(a.nombre);
                        // Assuming created_at or updated_at exists, or fallback to id? 
                        // Most entities have createdAt. If not, fallback to 0.
                        const dateA = new Date(a.createdAt || 0).getTime();
                        const dateB = new Date(b.createdAt || 0).getTime();
                        if (sortOption === 'date_desc') return dateB - dateA;
                        if (sortOption === 'date_asc') return dateA - dateB;
                        return 0;
                    });

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
                                                    <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--primary)' }}>${parseFloat(product.precio).toFixed(2)}</span>
                                                </div>
                                                <div style={{ textAlign: 'right' }}>
                                                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Stock Actual</span>
                                                    <span style={{ fontSize: '1rem', fontWeight: 600, color: isLowStock ? '#ef4444' : 'var(--text-primary)' }}>{product.stock}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div style={{ padding: '0.75rem', background: '#f8fafc', display: 'flex', gap: '0.5rem' }}>
                                            <button onClick={() => openEditModal(product)} style={{ flex: 1, padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', background: 'white', display: 'flex', justifyContent: 'center', gap: '0.5rem', alignItems: 'center' }}>
                                                <span className="material-icons-round" style={{ fontSize: '16px' }}>edit</span> Editar
                                            </button>
                                            <button onClick={() => handleDelete(product.id)} style={{ width: '40px', padding: '0.5rem', border: '1px solid #fee2e2', borderRadius: '6px', cursor: 'pointer', background: '#fef2f2', color: '#ef4444', display: 'flex', justifyContent: 'center' }} title="Eliminar">
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


// --- FORM MODAL COMPONENT ---

function ProductFormModal({ product, tags, onClose, onSuccess }) {
    const isEditing = !!product;
    const toast = useToast();
    const [loading, setLoading] = useState(false);
    const [preview, setPreview] = useState(null);

    const [formData, setFormData] = useState({
        nombre: '',
        descripcion: '',
        precio: '',
        stock: '',
        reorderPoint: 10,
        tagId: '',
        active: true,
        image: null
    });

    useEffect(() => {
        if (product) {
            setFormData({
                nombre: product.nombre,
                descripcion: product.descripcion || '',
                precio: product.precio,
                stock: product.stock,
                reorderPoint: product.reorderPoint !== undefined ? product.reorderPoint : 10,
                tagId: product.tagId || '', // Check if backend returns 'tagId' or object
                active: product.active,
                image: null
            });
            if (product.imageUrl) {
                setPreview(product.imageUrl); // URL preview
            }
        }
    }, [product]);

    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setFormData(prev => ({ ...prev, image: file }));
            // Create local preview
            const objectUrl = URL.createObjectURL(file);
            setPreview(objectUrl);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Validations
        if (parseFloat(formData.precio) < 0) return toast.warning('El precio debe ser positivo');
        if (parseInt(formData.stock) < 0) return toast.warning('El stock debe ser positivo');

        setLoading(true);

        try {
            const data = new FormData();
            const config = { headers: { 'Content-Type': 'multipart/form-data' } };

            if (isEditing) {
                // UPDATE: Send only changed fields (Delta Update)
                let hasChanges = false;

                if (formData.nombre !== product.nombre) {
                    data.append('nombre', formData.nombre);
                    hasChanges = true;
                }
                const originalDesc = product.descripcion || '';
                if (formData.descripcion !== originalDesc) {
                    data.append('descripcion', formData.descripcion);
                    hasChanges = true;
                }
                // Compare values
                if (parseFloat(formData.precio) !== parseFloat(product.precio)) {
                    data.append('precio', formData.precio);
                    hasChanges = true;
                }
                if (parseInt(formData.stock) !== parseInt(product.stock)) {
                    data.append('stock', formData.stock);
                    hasChanges = true;
                }
                const originalRp = product.reorderPoint !== undefined ? product.reorderPoint : 10;
                const newRp = formData.reorderPoint === '' ? 10 : parseInt(formData.reorderPoint);
                if (newRp !== originalRp) {
                    data.append('reorderPoint', newRp);
                    hasChanges = true;
                }

                // Tag
                const originalTag = product.tagId || '';
                if (formData.tagId !== originalTag) {
                    data.append('tagId', formData.tagId);
                    hasChanges = true;
                }

                // Active status
                if (formData.active !== product.active) {
                    data.append('active', formData.active);
                    hasChanges = true;
                }

                // Image
                if (formData.image) {
                    data.append('image', formData.image);
                    hasChanges = true;
                }

                if (!hasChanges) {
                    toast.info('No hay cambios para guardar');
                    setLoading(false);
                    return;
                }

                console.log('Enviando Update (Delta):', Array.from(data.entries()));
                await client.post(`/admin/products/${product.id}/update`, data, config);
                toast.success('Producto actualizado exitosamente');

            } else {
                // CREATE: Send all required
                data.append('nombre', formData.nombre);
                data.append('descripcion', formData.descripcion);
                data.append('precio', formData.precio);
                data.append('stock', formData.stock);
                data.append('reorderPoint', formData.reorderPoint === '' ? 10 : formData.reorderPoint);

                if (formData.tagId) data.append('tagId', formData.tagId);
                if (formData.image) data.append('image', formData.image);

                // Active usually default true
                // data.append('active', true);

                console.log('Enviando Create:', Array.from(data.entries()));
                await client.post('/admin/products', data, config);
                toast.success('Producto creado exitosamente');
            }
            onSuccess();
        } catch (error) {
            console.error(error);
            toast.error('Error al guardar: ' + (error.response?.data?.message || error.message));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: '600px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>{isEditing ? 'Editar Producto' : 'Crear Nuevo Producto'}</h3>
                    <button onClick={onClose} className="close-btn">&times;</button>
                </div>

                <form onSubmit={handleSubmit} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                    {/* Basic Info */}
                    <div className="form-group">
                        <label>Nombre del Producto *</label>
                        <input
                            type="text"
                            required
                            className="form-input"
                            value={formData.nombre}
                            onChange={e => setFormData({ ...formData, nombre: e.target.value })}
                            placeholder="Ej: Camiseta básica"
                        />
                    </div>

                    <div className="form-group">
                        <label>Descripción *</label>
                        <textarea
                            required
                            className="form-input"
                            rows="3"
                            value={formData.descripcion}
                            onChange={e => setFormData({ ...formData, descripcion: e.target.value })}
                            placeholder="Detalles del producto..."
                        />
                    </div>

                    {/* Numeric Row */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                        <div className="form-group">
                            <label>Precio ($) *</label>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                required
                                className="form-input"
                                value={formData.precio}
                                onWheel={(e) => e.target.blur()}
                                onChange={e => setFormData({ ...formData, precio: e.target.value })}
                            />
                        </div>
                        <div className="form-group">
                            <label>Stock *</label>
                            <input
                                type="number"
                                min="0"
                                required
                                className="form-input"
                                value={formData.stock}
                                onWheel={(e) => e.target.blur()}
                                onChange={e => setFormData({ ...formData, stock: e.target.value })}
                            />
                        </div>
                        <div className="form-group">
                            <label title="Nivel de alerta para stock bajo">Reorder Point</label>
                            <input
                                type="number"
                                min="0"
                                className="form-input"
                                value={formData.reorderPoint}
                                onWheel={(e) => e.target.blur()}
                                onChange={e => setFormData({ ...formData, reorderPoint: e.target.value })}
                                placeholder="Def: 10"
                            />
                        </div>
                    </div>

                    {/* Categorization */}
                    <div className="form-group">
                        <label>Categoría / Etiqueta</label>
                        <select
                            className="form-input"
                            value={formData.tagId}
                            onChange={e => setFormData({ ...formData, tagId: e.target.value })}
                        >
                            <option value="">-- Sin etiqueta --</option>
                            {tags.map(tag => (
                                <option key={tag.id} value={tag.id}>{tag.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Image Upload */}
                    <div className="form-group">
                        <label>Imagen del Producto</label>
                        <div style={{ border: '2px dashed #e5e7eb', borderRadius: '8px', padding: '1rem', textAlign: 'center' }}>
                            {preview ? (
                                <div style={{ marginBottom: '1rem' }}>
                                    <img src={preview} alt="Preview" style={{ maxHeight: '150px', borderRadius: '4px' }} />
                                    <br />
                                    <button
                                        type="button"
                                        onClick={() => { setPreview(null); setFormData({ ...formData, image: null }) }}
                                        style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}
                                    >
                                        Quitar imagen
                                    </button>
                                </div>
                            ) : (
                                <p style={{ color: '#9ca3af', fontSize: '0.9rem', marginBottom: '1rem' }}>No se ha seleccionado imagen</p>
                            )}

                            <input
                                type="file"
                                accept="image/*"
                                onChange={handleImageChange}
                                style={{ display: 'block', margin: '0 auto' }}
                            />
                        </div>
                    </div>

                    {/* Active Checkbox (Edit only maybe? Or Create too) */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input
                            type="checkbox"
                            id="field-active"
                            checked={formData.active}
                            onChange={e => setFormData({ ...formData, active: e.target.checked })}
                            style={{ width: '18px', height: '18px' }}
                        />
                        <label htmlFor="field-active" style={{ cursor: 'pointer', fontWeight: 600 }}>Producto Activo</label>
                    </div>


                    {/* Actions */}
                    <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                        <button type="button" onClick={onClose} className="btn-secondary" disabled={loading}>Cancelar</button>
                        <button type="submit" className="btn-primary" disabled={loading}>
                            {loading ? 'Guardando...' : (isEditing ? 'Actualizar Producto' : 'Crear Producto')}
                        </button>
                    </div>

                </form>
            </div>
        </div>
    );
}
