import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from '../ToastContainer';
import specialProductService from '../../api/specialProductService';
import client from '../../api/client';
import { formatCurrency } from '../../utils/formatters';
import '../../styles/SpecialProducts.css';

const PLACEHOLDER_IMAGE = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23f3f4f6" width="200" height="200"/%3E%3Ctext fill="%239ca3af" font-family="Arial,sans-serif" font-size="16" dy="10" font-weight="bold" x="50%25" y="50%25" text-anchor="middle"%3ESin Imagen%3C/text%3E%3C/svg%3E';

export default function SpecialProductFormModal({ product, tags, onClose, onSuccess }) {
    const isEdit = !!product;
    const toast = useToast();

    // Mode: 'standalone' or 'linked'
    const [mode, setMode] = useState(product?.parentProductId ? 'linked' : 'standalone');

    // Form fields
    const [nombre, setNombre] = useState(product?.nombre || '');
    const [descripcion, setDescripcion] = useState(product?.descripcion || '');
    const [precio, setPrecio] = useState(product?.precio ?? '');
    const [stock, setStock] = useState(product?.stock ?? '');
    const [reorderPoint, setReorderPoint] = useState(product?.reorderPoint ?? 10);
    const [imageUrl, setImageUrl] = useState(product?.imageUrl || '');
    const [imageBase64, setImageBase64] = useState('');
    const [imageFileName, setImageFileName] = useState('');
    const [tagId, setTagId] = useState(product?.tagId || '');
    const [active, setActive] = useState(product?.active ?? true);

    // Parent product
    const [parentProductId, setParentProductId] = useState(product?.parentProductId || null);
    const [parentProductName, setParentProductName] = useState(product?.parentProductName || '');
    const [parentSearch, setParentSearch] = useState('');
    const [parentResults, setParentResults] = useState([]);
    const [showParentDropdown, setShowParentDropdown] = useState(false);

    // Vendor multi-select
    const [vendedores, setVendedores] = useState([]);
    const [selectedVendorIds, setSelectedVendorIds] = useState(product?.allowedVendorIds || []);
    const [showVendorDropdown, setShowVendorDropdown] = useState(false);
    const [vendorSearch, setVendorSearch] = useState('');

    const [saving, setSaving] = useState(false);

    // Fetch vendors list
    useEffect(() => {
        const fetchVendors = async () => {
            try {
                const res = await client.get('/admin/clients/vendedores');
                setVendedores(res.data || []);
            } catch (err) {
                console.error('Error loading vendors:', err);
            }
        };
        fetchVendors();
    }, []);

    // Search parent products
    const searchParentProducts = useCallback(async (q) => {
        if (!q || q.length < 2) { setParentResults([]); return; }
        try {
            // Backend endpoint doesn't support 'q' filtering yet, so we fetch a large batch and filter locally.
            const res = await client.get('/admin/products', { params: { size: 1000 } });
            let data = res.data;
            if (data && !Array.isArray(data) && Array.isArray(data.content)) data = data.content;
            if (!Array.isArray(data)) data = [];

            const lowerQ = q.toLowerCase();
            const filtered = data.filter(p =>
                p.nombre.toLowerCase().includes(lowerQ) ||
                (p.descripcion && p.descripcion.toLowerCase().includes(lowerQ))
            );

            setParentResults(filtered.slice(0, 8));
        } catch (err) {
            console.error('Error searching parents:', err);
        }
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => searchParentProducts(parentSearch), 300);
        return () => clearTimeout(timer);
    }, [parentSearch, searchParentProducts]);

    // Select parent → pre-fill
    const handleSelectParent = async (parentProduct) => {
        setParentProductId(parentProduct.id);
        setParentProductName(parentProduct.nombre);
        setShowParentDropdown(false);
        setParentSearch('');

        try {
            const res = await specialProductService.getParentData(parentProduct.id);
            const d = res.data;
            // Auto-fill all except nombre and precio
            setDescripcion(d.descripcion || '');
            setImageUrl(d.imageUrl || '');
            setTagId(d.tagId || '');
            setReorderPoint(d.reorderPoint ?? 10);
            // stock hidden for linked products
        } catch (err) {
            // Fallback: use data we already have
            setDescripcion(parentProduct.descripcion || '');
            setImageUrl(parentProduct.imageUrl || '');
            setTagId(parentProduct.tagId || '');
        }
    };

    const removeParent = () => {
        setParentProductId(null);
        setParentProductName('');
    };

    // Image file handling
    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            setImageBase64(reader.result.split(',')[1]);
            setImageFileName(file.name);
            setImageUrl(reader.result); // preview
        };
        reader.readAsDataURL(file);
    };

    // Vendor toggle
    const toggleVendor = (vendorId) => {
        setSelectedVendorIds(prev =>
            prev.includes(vendorId) ? prev.filter(id => id !== vendorId) : [...prev, vendorId]
        );
    };

    // Submit
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!nombre.trim()) { toast.warning('El nombre es obligatorio'); return; }
        if (precio === '' || parseFloat(precio) < 0) { toast.warning('El precio es obligatorio'); return; }
        if (mode === 'linked' && !parentProductId) { toast.warning('Selecciona un producto padre'); return; }
        if (mode === 'standalone' && (stock === '' || parseInt(stock) < 0)) { toast.warning('El stock es obligatorio para productos standalone'); return; }

        setSaving(true);
        try {
            const payload = {
                nombre: nombre.trim(),
                descripcion: descripcion.trim(),
                precio: parseFloat(precio),
                reorderPoint: parseInt(reorderPoint) || 10,
                imageUrl: imageBase64 ? undefined : imageUrl,
                imageBase64: imageBase64 || undefined,
                imageFileName: imageFileName || undefined,
                tagId: tagId || null,
                allowedVendorIds: selectedVendorIds,
            };

            if (mode === 'standalone') {
                payload.stock = parseInt(stock);
            }

            if (isEdit) {
                payload.active = active;
                await specialProductService.update(product.id, payload);
                toast.success('Producto especial actualizado');
            } else {
                if (mode === 'linked') {
                    payload.parentProductId = parentProductId;
                }
                await specialProductService.create(payload);
                toast.success('Producto especial creado');
            }

            onSuccess();
        } catch (err) {
            console.error('Error saving special product:', err);
            toast.error('Error: ' + (err.response?.data?.message || err.message));
        } finally {
            setSaving(false);
        }
    };

    // Close vendor dropdown when clicking outside
    useEffect(() => {
        const handler = (e) => {
            if (showVendorDropdown && !e.target.closest('.sp-vendor-wrapper')) {
                setShowVendorDropdown(false);
            }
            if (showParentDropdown && !e.target.closest('.sp-parent-search')) {
                setShowParentDropdown(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showVendorDropdown, showParentDropdown]);

    const filteredVendors = vendedores.filter(v =>
        !vendorSearch || v.username.toLowerCase().includes(vendorSearch.toLowerCase())
    );

    return (
        <div className="sp-modal-overlay" onClick={onClose}>
            <div className="sp-modal" onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="sp-modal-header">
                    <h3>
                        <span className="material-icons-round">star</span>
                        {isEdit ? 'Editar Producto Especial' : 'Nuevo Producto Especial'}
                    </h3>
                    <button className="sp-modal-close" onClick={onClose}>
                        <span className="material-icons-round">close</span>
                    </button>
                </div>

                {/* Body */}
                <form className="sp-modal-body" onSubmit={handleSubmit}>

                    {/* Mode Toggle — only on create */}
                    {!isEdit && (
                        <div className="sp-mode-toggle">
                            <button type="button" className={`sp-mode-btn ${mode === 'standalone' ? 'active' : ''}`}
                                onClick={() => { setMode('standalone'); removeParent(); }}>
                                <span className="material-icons-round">inventory_2</span>
                                Standalone
                            </button>
                            <button type="button" className={`sp-mode-btn ${mode === 'linked' ? 'active' : ''}`}
                                onClick={() => setMode('linked')}>
                                <span className="material-icons-round">account_tree</span>
                                Ramificación
                            </button>
                        </div>
                    )}

                    {/* Edit: show mode as read-only badge */}
                    {isEdit && (
                        <div style={{ marginBottom: '1rem' }}>
                            <span className={`sp-type-badge ${product.parentProductId ? 'linked' : 'standalone'}`} style={{ position: 'static' }}>
                                <span className="material-icons-round" style={{ fontSize: '13px' }}>
                                    {product.parentProductId ? 'account_tree' : 'inventory_2'}
                                </span>
                                {product.parentProductId ? `Vinculado a: ${product.parentProductName}` : 'Standalone'}
                            </span>
                        </div>
                    )}

                    {/* Parent Search (only create + linked mode) */}
                    {!isEdit && mode === 'linked' && (
                        <>
                            {parentProductId ? (
                                <div className="sp-parent-selected">
                                    <img src={imageUrl || PLACEHOLDER_IMAGE} alt="" onError={e => e.target.src = PLACEHOLDER_IMAGE} />
                                    <div className="info">
                                        <div className="name">{parentProductName}</div>
                                        <div className="detail">Producto padre seleccionado</div>
                                    </div>
                                    <button type="button" onClick={removeParent}>
                                        <span className="material-icons-round">close</span>
                                    </button>
                                </div>
                            ) : (
                                <div className="sp-parent-search">
                                    <span className="material-icons-round">search</span>
                                    <input
                                        type="text"
                                        placeholder="Buscar producto padre..."
                                        value={parentSearch}
                                        onChange={e => { setParentSearch(e.target.value); setShowParentDropdown(true); }}
                                        onFocus={() => setShowParentDropdown(true)}
                                    />
                                    {showParentDropdown && parentResults.length > 0 && (
                                        <div className="sp-parent-dropdown">
                                            {parentResults.map(p => (
                                                <div key={p.id} className="sp-parent-option" onClick={() => handleSelectParent(p)}>
                                                    <img src={p.imageUrl || PLACEHOLDER_IMAGE} alt="" onError={e => e.target.src = PLACEHOLDER_IMAGE} />
                                                    <div className="info">
                                                        <div className="name">{p.nombre}</div>
                                                        <div className="detail">${formatCurrency(p.precio)} — Stock: {p.stock}</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}

                    {/* Name */}
                    <div className="sp-form-group">
                        <label>Nombre *</label>
                        <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre del producto especial" required />
                    </div>

                    {/* Description */}
                    <div className="sp-form-group">
                        <label>Descripción</label>
                        <textarea rows="2" value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Descripción..." />
                    </div>

                    {/* Price + Stock row */}
                    <div className="sp-form-row">
                        <div className="sp-form-group">
                            <label>Precio *</label>
                            <input type="number" min="0" step="0.01" value={precio} onChange={e => setPrecio(e.target.value)} placeholder="0.00" required />
                        </div>
                        {/* Stock only for standalone or edit-standalone */}
                        {(mode === 'standalone' || (isEdit && !product.parentProductId)) && (
                            <div className="sp-form-group">
                                <label>Stock *</label>
                                <input type="number" min="0" value={stock} onChange={e => setStock(e.target.value)} placeholder="0" />
                            </div>
                        )}
                        {mode === 'linked' && !isEdit && (
                            <div className="sp-form-group">
                                <label>Stock</label>
                                <input type="number" disabled value="Compartido" style={{ background: '#f3f4f6', color: '#9ca3af' }} />
                                <small style={{ color: '#6b7280', fontSize: '0.75rem' }}>Se comparte con el padre</small>
                            </div>
                        )}
                    </div>

                    {/* Reorder Point + Tag */}
                    <div className="sp-form-row">
                        <div className="sp-form-group">
                            <label>Punto de Reorden</label>
                            <input type="number" min="0" value={reorderPoint} onChange={e => setReorderPoint(e.target.value)} />
                        </div>
                        <div className="sp-form-group">
                            <label>Etiqueta</label>
                            <select value={tagId} onChange={e => setTagId(e.target.value)}>
                                <option value="">Sin etiqueta</option>
                                {(tags || []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Image */}
                    <div className="sp-form-group">
                        <label>Imagen</label>
                        <div className="sp-image-upload">
                            <img className="sp-image-preview" src={imageUrl || PLACEHOLDER_IMAGE} alt="preview" onError={e => e.target.src = PLACEHOLDER_IMAGE} />
                            <div style={{ flex: 1 }}>
                                <input type="file" accept="image/*" onChange={handleImageChange} style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }} />
                                <input type="text" placeholder="...o pegar URL de imagen" value={imageBase64 ? '' : imageUrl}
                                    onChange={e => { setImageUrl(e.target.value); setImageBase64(''); setImageFileName(''); }}
                                    disabled={!!imageBase64}
                                    style={{ fontSize: '0.85rem' }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Edit: Active toggle */}
                    {isEdit && (
                        <div className="sp-form-group">
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} style={{ accentColor: 'var(--primary)' }} />
                                Producto Activo
                            </label>
                        </div>
                    )}

                    {/* Vendor Multi-Select */}
                    <div className="sp-form-group" style={{ position: 'relative' }}>
                        <label>Vendedores Asignados</label>
                        <div className="sp-vendor-wrapper" style={{ position: 'relative' }}>
                            <div className="sp-vendor-select" onClick={() => setShowVendorDropdown(prev => !prev)}>
                                {selectedVendorIds.length === 0 && (
                                    <span style={{ color: '#9ca3af', fontSize: '0.85rem', padding: '0.1rem' }}>Seleccionar vendedores...</span>
                                )}
                                {selectedVendorIds.map(id => {
                                    const v = vendedores.find(v => v.id === id);
                                    return v ? (
                                        <span key={id} className="sp-vendor-tag">
                                            {v.username}
                                            <button type="button" onClick={e => { e.stopPropagation(); toggleVendor(id); }}>
                                                <span className="material-icons-round" style={{ fontSize: '14px' }}>close</span>
                                            </button>
                                        </span>
                                    ) : null;
                                })}
                            </div>

                            {showVendorDropdown && (
                                <div className="sp-vendor-dropdown">
                                    <div style={{ padding: '0.4rem', borderBottom: '1px solid #e5e7eb' }}>
                                        <input
                                            type="text"
                                            placeholder="Filtrar..."
                                            value={vendorSearch}
                                            onChange={e => setVendorSearch(e.target.value)}
                                            onClick={e => e.stopPropagation()}
                                            style={{ width: '100%', padding: '0.3rem 0.5rem', border: '1px solid #e5e7eb', borderRadius: '4px', fontSize: '0.85rem' }}
                                        />
                                    </div>
                                    {filteredVendors.map(v => (
                                        <div key={v.id}
                                            className={`sp-vendor-dropdown-item ${selectedVendorIds.includes(v.id) ? 'selected' : ''}`}
                                            onClick={e => { e.stopPropagation(); toggleVendor(v.id); }}>
                                            {selectedVendorIds.includes(v.id) && <span className="material-icons-round" style={{ fontSize: '14px', marginRight: '0.3rem', color: 'var(--primary)' }}>check</span>}
                                            {v.username}
                                        </div>
                                    ))}
                                    {filteredVendors.length === 0 && (
                                        <div style={{ padding: '0.5rem', textAlign: 'center', color: '#9ca3af', fontSize: '0.85rem' }}>Sin resultados</div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                </form>

                {/* Footer */}
                <div className="sp-modal-footer">
                    <button type="button" className="sp-btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
                    <button type="button" className="sp-btn-primary" onClick={handleSubmit} disabled={saving}>
                        <span className="material-icons-round" style={{ fontSize: '18px' }}>{saving ? 'hourglass_empty' : 'save'}</span>
                        {saving ? 'Guardando...' : (isEdit ? 'Actualizar' : 'Crear Producto')}
                    </button>
                </div>
            </div>
        </div>
    );
}
