import React, { useState, useEffect, useCallback, useId } from 'react';
import { useToast } from '../ToastContainer';
import specialProductService from '../../api/specialProductService';
import client from '../../api/client';
import { formatCurrency } from '../../utils/formatters';
import { PLACEHOLDER_IMAGE } from '../../utils/placeholderImage';
import SearchableSelect from '../SearchableSelect';
import '../../styles/SpecialProducts.css';


export default function SpecialProductFormModal({ product, tags, onClose, onSuccess }) {
    const isEdit = !!product;
    const toast = useToast();
    // Ids para asociar cada etiqueta con su campo (solo presentación)
    const uid = useId();
    const fieldId = (name) => `${uid}-${name}`;

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
        <div className="ui-modal-overlay" onClick={onClose}>
            <div
                className="ui-modal ui-modal--md sp-form-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby={fieldId('title')}
                onClick={e => e.stopPropagation()}
            >

                {/* Header */}
                <header className="ui-modal-header">
                    <span className="ui-modal-icon" aria-hidden="true">
                        <span className="material-icons-round">star</span>
                    </span>
                    <div className="ui-modal-heading">
                        <h3 id={fieldId('title')} className="ui-modal-title">
                            {isEdit ? 'Editar Producto Especial' : 'Nuevo Producto Especial'}
                        </h3>
                        <p className="ui-modal-subtitle">Precio propio, inventario y vendedores que lo ven.</p>
                    </div>
                    <button type="button" className="ui-icon-btn" onClick={onClose} aria-label="Cerrar">
                        <span className="material-icons-round" aria-hidden="true">close</span>
                    </button>
                </header>

                {/* Body */}
                <form className="ui-modal-body" onSubmit={handleSubmit}>

                    {/* 1. Tipo: standalone o ramificación de un producto */}
                    <section className="ui-section">
                        <div className="ui-section-head">
                            <span className="ui-step" aria-hidden="true">1</span>
                            <div>
                                <h4 className="ui-section-title">Tipo de producto especial</h4>
                                <p className="ui-section-desc">Con inventario propio o compartido con un producto padre.</p>
                            </div>
                        </div>

                        <div className="spf-stack">
                            {/* Mode Toggle — only on create */}
                            {!isEdit && (
                                <div className="ui-choice-grid" role="group" aria-label="Tipo de producto especial">
                                    <button
                                        type="button"
                                        aria-pressed={mode === 'standalone'}
                                        className={`ui-choice ui-choice--compact spf-choice-btn${mode === 'standalone' ? ' is-selected' : ''}`}
                                        onClick={() => { setMode('standalone'); removeParent(); }}
                                    >
                                        <span className="material-icons-round ui-choice-icon" aria-hidden="true">inventory_2</span>
                                        <span className="ui-choice-text">
                                            <span className="ui-choice-title">Standalone</span>
                                            <span className="ui-choice-desc">Producto con su propio stock.</span>
                                        </span>
                                    </button>
                                    <button
                                        type="button"
                                        aria-pressed={mode === 'linked'}
                                        className={`ui-choice ui-choice--compact spf-choice-btn${mode === 'linked' ? ' is-selected' : ''}`}
                                        onClick={() => setMode('linked')}
                                    >
                                        <span className="material-icons-round ui-choice-icon" aria-hidden="true">account_tree</span>
                                        <span className="ui-choice-text">
                                            <span className="ui-choice-title">Ramificación</span>
                                            <span className="ui-choice-desc">Comparte el stock de un producto padre.</span>
                                        </span>
                                    </button>
                                </div>
                            )}

                            {/* Edit: show mode as read-only badge */}
                            {isEdit && (
                                <div className="spf-kind">
                                    <span className="ui-badge ui-badge--neutral spf-kind-badge">
                                        <span className="material-icons-round" aria-hidden="true">
                                            {product.parentProductId ? 'account_tree' : 'inventory_2'}
                                        </span>
                                        {product.parentProductId ? `Vinculado a: ${product.parentProductName}` : 'Standalone'}
                                    </span>
                                </div>
                            )}

                            {/* Parent Search (only create + linked mode) */}
                            {!isEdit && mode === 'linked' && (
                                <div className="ui-field">
                                    <label className="ui-label" htmlFor={fieldId('parentSearch')}>Producto padre <span className="ui-required">*</span></label>
                                    {parentProductId ? (
                                        <div className="sp-parent-selected">
                                            <img src={imageUrl || PLACEHOLDER_IMAGE} alt="" width="40" height="40" decoding="async" onError={e => e.target.src = PLACEHOLDER_IMAGE} />
                                            <div className="info">
                                                <div className="name">{parentProductName}</div>
                                                <div className="detail">Producto padre seleccionado</div>
                                            </div>
                                            <button type="button" className="ui-icon-btn" onClick={removeParent} aria-label="Quitar producto padre">
                                                <span className="material-icons-round" aria-hidden="true">close</span>
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="sp-parent-search">
                                            <div className="ui-input-group">
                                                <span className="material-icons-round ui-input-icon" aria-hidden="true">search</span>
                                                <input
                                                    id={fieldId('parentSearch')}
                                                    className="ui-input"
                                                    type="text"
                                                    autoComplete="off"
                                                    placeholder="Buscar producto padre..."
                                                    value={parentSearch}
                                                    onChange={e => { setParentSearch(e.target.value); setShowParentDropdown(true); }}
                                                    onFocus={() => setShowParentDropdown(true)}
                                                />
                                            </div>
                                            {showParentDropdown && parentResults.length > 0 && (
                                                <div className="sp-parent-dropdown">
                                                    {parentResults.map(p => (
                                                        <div key={p.id} className="sp-parent-option" onClick={() => handleSelectParent(p)}>
                                                            <img src={p.imageUrl || PLACEHOLDER_IMAGE} alt="" width="36" height="36" loading="lazy" decoding="async" onError={e => e.target.src = PLACEHOLDER_IMAGE} />
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
                                </div>
                            )}
                        </div>
                    </section>

                    {/* 2. Nombre y descripción */}
                    <section className="ui-section">
                        <div className="ui-section-head">
                            <span className="ui-step" aria-hidden="true">2</span>
                            <div>
                                <h4 className="ui-section-title">Información básica</h4>
                                <p className="ui-section-desc">Así lo verán los vendedores asignados.</p>
                            </div>
                        </div>
                        <div className="ui-grid ui-grid--1">
                            {/* Name */}
                            <div className="ui-field">
                                <label className="ui-label" htmlFor={fieldId('nombre')}>Nombre <span className="ui-required">*</span></label>
                                <input id={fieldId('nombre')} className="ui-input" type="text" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre del producto especial" required />
                            </div>

                            {/* Description */}
                            <div className="ui-field">
                                <label className="ui-label" htmlFor={fieldId('descripcion')}>Descripción</label>
                                <textarea id={fieldId('descripcion')} className="ui-textarea" rows="2" value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Descripción..." />
                            </div>
                        </div>
                    </section>

                    {/* 3. Precio e inventario */}
                    <section className="ui-section">
                        <div className="ui-section-head">
                            <span className="ui-step" aria-hidden="true">3</span>
                            <div>
                                <h4 className="ui-section-title">Precio e inventario</h4>
                                <p className="ui-section-desc">Precio de venta, stock y etiqueta.</p>
                            </div>
                        </div>
                        <div className="ui-grid">
                            {/* Price + Stock */}
                            <div className="ui-field">
                                <label className="ui-label" htmlFor={fieldId('precio')}>Precio <span className="ui-required">*</span></label>
                                <div className="ui-input-group">
                                    <span className="ui-input-prefix" aria-hidden="true">$</span>
                                    <input id={fieldId('precio')} className="ui-input" type="number" inputMode="decimal" min="0" step="0.01" value={precio} onChange={e => setPrecio(e.target.value)} onWheel={(e) => e.target.blur()} placeholder="0.00" required />
                                </div>
                                {precio && (
                                    <span className="ui-help">
                                        Vista previa: <strong className="sp-price-preview">${formatCurrency(precio)}</strong>
                                    </span>
                                )}
                            </div>
                            {/* Stock only for standalone or edit-standalone */}
                            {(mode === 'standalone' || (isEdit && !product.parentProductId)) && (
                                <div className="ui-field">
                                    <label className="ui-label" htmlFor={fieldId('stock')}>Stock <span className="ui-required">*</span></label>
                                    <input id={fieldId('stock')} className="ui-input" type="number" inputMode="numeric" min="0" value={stock} onChange={e => setStock(e.target.value)} onWheel={(e) => e.target.blur()} placeholder="0" />
                                </div>
                            )}
                            {mode === 'linked' && !isEdit && (
                                <div className="ui-field">
                                    <label className="ui-label" htmlFor={fieldId('stockShared')}>Stock</label>
                                    <input id={fieldId('stockShared')} className="ui-input" type="number" disabled value="Compartido" />
                                    <small className="ui-help">Se comparte con el padre</small>
                                </div>
                            )}

                            {/* Reorder Point + Tag */}
                            <div className="ui-field">
                                <label className="ui-label" htmlFor={fieldId('reorderPoint')}>Punto de Reorden</label>
                                <input id={fieldId('reorderPoint')} className="ui-input" type="number" inputMode="numeric" min="0" value={reorderPoint} onChange={e => setReorderPoint(e.target.value)} onWheel={(e) => e.target.blur()} />
                            </div>
                            <div className="ui-field">
                                <label className="ui-label" htmlFor={fieldId('tag')}>Etiqueta</label>
                                <SearchableSelect
                                    id={fieldId('tag')}
                                    value={tagId}
                                    onChange={e => setTagId(e.target.value)}
                                    options={(tags || []).map(t => ({ value: t.id, label: t.name }))}
                                    emptyOption={{ label: 'Sin etiqueta' }}
                                    placeholder="Sin etiqueta"
                                    searchPlaceholder="Escribe el nombre de la etiqueta…"
                                    noResultsText="Ninguna etiqueta coincide"
                                />
                            </div>
                        </div>
                    </section>

                    {/* 4. Imagen, estado y vendedores */}
                    <section className="ui-section">
                        <div className="ui-section-head">
                            <span className="ui-step" aria-hidden="true">4</span>
                            <div>
                                <h4 className="ui-section-title">Imagen y vendedores</h4>
                                <p className="ui-section-desc">Foto del producto y quién lo puede vender.</p>
                            </div>
                        </div>
                        <div className="ui-grid ui-grid--1">
                            {/* Image */}
                            <div className="ui-field">
                                <label className="ui-label" htmlFor={fieldId('imageFile')}>Imagen</label>
                                <div className="sp-image-upload">
                                    <img className="sp-image-preview" src={imageUrl || PLACEHOLDER_IMAGE} alt="preview" onError={e => e.target.src = PLACEHOLDER_IMAGE} />
                                    <div className="sp-image-fields">
                                        <input id={fieldId('imageFile')} className="sp-file-input" type="file" accept="image/*" onChange={handleImageChange} />
                                        <input type="text" className="ui-input" placeholder="...o pegar URL de imagen" aria-label="URL de la imagen" value={imageBase64 ? '' : imageUrl}
                                            onChange={e => { setImageUrl(e.target.value); setImageBase64(''); setImageFileName(''); }}
                                            disabled={!!imageBase64}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Edit: Active toggle */}
                            {isEdit && (
                                <div className="ui-field">
                                    <label className="ui-switch">
                                        <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
                                        <span className="ui-switch-track" aria-hidden="true"><span className="ui-switch-thumb" /></span>
                                        <span className="ui-switch-text">
                                            <span className="ui-switch-title">Producto Activo</span>
                                        </span>
                                    </label>
                                </div>
                            )}

                            {/* Vendor Multi-Select */}
                            <div className="ui-field">
                                <label className="ui-label">Vendedores Asignados</label>
                                <div className="sp-vendor-wrapper">
                                    <div
                                        className={`sp-vendor-select${showVendorDropdown ? ' is-open' : ''}`}
                                        onClick={() => setShowVendorDropdown(prev => !prev)}
                                    >
                                        {selectedVendorIds.length === 0 && (
                                            <span className="sp-vendor-placeholder">Seleccionar vendedores...</span>
                                        )}
                                        {selectedVendorIds.map(id => {
                                            const v = vendedores.find(v => v.id === id);
                                            return v ? (
                                                <span key={id} className="sp-vendor-tag">
                                                    {v.username}
                                                    <button type="button" aria-label={`Quitar ${v.username}`} onClick={e => { e.stopPropagation(); toggleVendor(id); }}>
                                                        <span className="material-icons-round" aria-hidden="true">close</span>
                                                    </button>
                                                </span>
                                            ) : null;
                                        })}
                                        <span className="material-icons-round sp-vendor-caret" aria-hidden="true">
                                            {showVendorDropdown ? 'expand_less' : 'expand_more'}
                                        </span>
                                    </div>

                                    {showVendorDropdown && (
                                        <div className="sp-vendor-dropdown">
                                            <div className="sp-vendor-filter">
                                                <input
                                                    type="text"
                                                    className="ui-input"
                                                    placeholder="Filtrar..."
                                                    aria-label="Filtrar vendedores"
                                                    value={vendorSearch}
                                                    onChange={e => setVendorSearch(e.target.value)}
                                                    onClick={e => e.stopPropagation()}
                                                />
                                            </div>
                                            {filteredVendors.map(v => (
                                                <div key={v.id}
                                                    className={`sp-vendor-dropdown-item ${selectedVendorIds.includes(v.id) ? 'selected' : ''}`}
                                                    onClick={e => { e.stopPropagation(); toggleVendor(v.id); }}>
                                                    {selectedVendorIds.includes(v.id) && <span className="material-icons-round sp-vendor-check" aria-hidden="true">check</span>}
                                                    {v.username}
                                                </div>
                                            ))}
                                            {filteredVendors.length === 0 && (
                                                <div className="sp-vendor-empty">Sin resultados</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </section>

                </form>

                {/* Footer */}
                <footer className="ui-modal-footer">
                    <button type="button" className="ui-btn ui-btn--secondary" onClick={onClose} disabled={saving}>Cancelar</button>
                    <button type="button" className="ui-btn ui-btn--primary" onClick={handleSubmit} disabled={saving}>
                        {saving
                            ? <span className="ui-spinner" aria-hidden="true" />
                            : <span className="material-icons-round" aria-hidden="true">save</span>}
                        {saving ? 'Guardando...' : (isEdit ? 'Actualizar' : 'Crear Producto')}
                    </button>
                </footer>
            </div>
        </div>
    );
}
