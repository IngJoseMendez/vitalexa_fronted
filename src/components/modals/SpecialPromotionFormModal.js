import React, { useState, useEffect, useCallback } from 'react';
import specialPromotionService from '../../api/specialPromotionService';
import client from '../../api/client';
import { useToast } from '../ToastContainer';
import { PromotionType } from '../../utils/types';
import '../../styles/SpecialProducts.css'; // Reusing special product styles for vendor chips/mode toggle

function SpecialPromotionFormModal({ promotion, onClose, onSuccess }) {
    const isEdit = !!promotion;
    const toast = useToast();

    // Mode: 'standalone' or 'linked'
    const [mode, setMode] = useState(promotion?.parentPromotionId ? 'linked' : 'standalone');

    // Form Data
    const [formData, setFormData] = useState({
        nombre: '',
        descripcion: '',
        type: PromotionType.PACK,
        buyQuantity: 40,
        freeQuantity: 0,
        packPrice: '',
        mainProductId: '',
        giftItems: [], // Array of { productId, quantity, tempId }
        allowStackWithDiscounts: false,
        requiresAssortmentSelection: false,
        validFrom: '',
        validUntil: '',
        active: true
    });

    // Parent Promotion (Linked Mode)
    const [parentPromotionId, setParentPromotionId] = useState(promotion?.parentPromotionId || null);
    const [parentPromotionName, setParentPromotionName] = useState(promotion?.parentPromotionName || '');
    const [parentSearch, setParentSearch] = useState('');
    const [parentResults, setParentResults] = useState([]);
    const [showParentDropdown, setShowParentDropdown] = useState(false);

    // Vendor Selection
    const [vendedores, setVendedores] = useState([]);
    const [selectedVendorIds, setSelectedVendorIds] = useState(promotion?.allowedVendorIds || []);
    const [showVendorDropdown, setShowVendorDropdown] = useState(false);
    const [vendorSearch, setVendorSearch] = useState('');

    // Helpers
    const [products, setProducts] = useState([]);
    // const [loading, setLoading] = useState(false); // Unused, using saving
    const [loadingProducts, setLoadingProducts] = useState(true);
    const [saving, setSaving] = useState(false);

    // Temporary state for adding a new gift item
    const [newGift, setNewGift] = useState({
        productId: '',
        quantity: 1
    });

    // --- Load Dependencies ---

    useEffect(() => {
        const loadDependencies = async () => {
            try {
                setLoadingProducts(true);
                const [prodRes, vendRes] = await Promise.all([
                    client.get('/admin/products'),
                    client.get('/admin/clients/vendedores')
                ]);
                setProducts(prodRes.data.content || prodRes.data || []);
                setVendedores(vendRes.data || []);
            } catch (error) {
                console.error('Error loading dependencies:', error);
                toast.error('Error al cargar datos necesarios');
            } finally {
                setLoadingProducts(false);
            }
        };
        loadDependencies();
    }, [toast]);

    // --- Init Form Data ---

    useEffect(() => {
        if (promotion) {
            let initialGifts = [];
            if (promotion.giftItems && promotion.giftItems.length > 0) {
                initialGifts = promotion.giftItems.map(item => ({
                    productId: item.product ? item.product.id : item.productId,
                    quantity: item.quantity,
                    tempId: Math.random().toString(36).substr(2, 9)
                }));
            }

            setFormData({
                nombre: promotion.nombre || '',
                descripcion: promotion.descripcion || '',
                type: promotion.type,
                buyQuantity: promotion.buyQuantity || 40,
                freeQuantity: promotion.freeQuantity || 0,
                packPrice: promotion.packPrice || '',
                mainProductId: promotion.mainProduct?.id || '',
                giftItems: initialGifts,
                allowStackWithDiscounts: promotion.allowStackWithDiscounts || false,
                requiresAssortmentSelection: promotion.requiresAssortmentSelection || false,
                validFrom: promotion.validFrom ? promotion.validFrom.substring(0, 16) : '',
                validUntil: promotion.validUntil ? promotion.validUntil.substring(0, 16) : '',
                active: promotion.active ?? true
            });
            setParentPromotionId(promotion.parentPromotionId);
            setParentPromotionName(promotion.parentPromotionName);
            setSelectedVendorIds(promotion.allowedVendorIds || []);
        }
    }, [promotion]);

    // --- Parent Promotion Search ---

    const searchParentPromotions = useCallback(async (q) => {
        if (!q || q.length < 2) { setParentResults([]); return; }
        try {
            // Fetch global promotions
            const res = await client.get('/admin/promotions');
            let data = res.data;
            if (!Array.isArray(data)) data = [];

            const lowerQ = q.toLowerCase();
            const filtered = data.filter(p =>
                p.nombre.toLowerCase().includes(lowerQ)
            );
            setParentResults(filtered.slice(0, 8));
        } catch (err) {
            console.error('Error searching parent promotions:', err);
        }
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => searchParentPromotions(parentSearch), 300);
        return () => clearTimeout(timer);
    }, [parentSearch, searchParentPromotions]);

    const handleSelectParent = (parent) => {
        setParentPromotionId(parent.id);
        setParentPromotionName(parent.nombre);
        setShowParentDropdown(false);
        setParentSearch('');

        // Inherit data
        let initialGifts = [];
        if (parent.giftItems && parent.giftItems.length > 0) {
            initialGifts = parent.giftItems.map(item => ({
                productId: item.product ? item.product.id : item.productId,
                quantity: item.quantity,
                tempId: Math.random().toString(36).substr(2, 9)
            }));
        }

        setFormData(prev => ({
            ...prev,
            nombre: parent.nombre + ' (Especial)', // Suggest name
            descripcion: parent.descripcion || '',
            type: parent.type,
            buyQuantity: parent.buyQuantity,
            freeQuantity: parent.freeQuantity,
            packPrice: parent.packPrice,
            mainProductId: parent.mainProduct?.id,
            giftItems: initialGifts,
            allowStackWithDiscounts: parent.allowStackWithDiscounts,
            requiresAssortmentSelection: parent.requiresAssortmentSelection,
            validFrom: parent.validFrom ? parent.validFrom.substring(0, 16) : '',
            validUntil: parent.validUntil ? parent.validUntil.substring(0, 16) : ''
        }));
    };

    const removeParent = () => {
        setParentPromotionId(null);
        setParentPromotionName('');
    };

    // --- Form Logic ---

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleAddGift = () => {
        if (!newGift.productId) return;
        setFormData(prev => ({
            ...prev,
            giftItems: [...prev.giftItems, { ...newGift, tempId: Math.random().toString(36).substr(2, 9) }]
        }));
        setNewGift({ productId: '', quantity: 1 });
    };

    const handleRemoveGift = (tempId) => {
        setFormData(prev => ({
            ...prev,
            giftItems: prev.giftItems.filter(item => item.tempId !== tempId)
        }));
    };

    const toggleVendor = (vendorId) => {
        setSelectedVendorIds(prev =>
            prev.includes(vendorId) ? prev.filter(id => id !== vendorId) : [...prev, vendorId]
        );
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!formData.nombre.trim()) { toast.warning('Nombre obligatorio'); return; }
        if (mode === 'linked' && !parentPromotionId) { toast.warning('Seleccione una promoción padre'); return; }
        if (!formData.mainProductId) { toast.warning('Seleccione un producto principal'); return; }

        setSaving(true);
        try {
            const payload = {
                nombre: formData.nombre.trim(),
                descripcion: formData.descripcion.trim() || null,
                type: formData.type,
                buyQuantity: parseInt(formData.buyQuantity),
                packPrice: formData.packPrice ? parseFloat(formData.packPrice) : null,
                mainProductId: formData.mainProductId,
                allowStackWithDiscounts: formData.allowStackWithDiscounts,
                requiresAssortmentSelection: formData.type === PromotionType.BUY_GET_FREE,
                freeQuantity: formData.type === PromotionType.BUY_GET_FREE ? parseInt(formData.freeQuantity) : 0,
                giftItems: formData.type === PromotionType.PACK ? formData.giftItems.map(item => ({
                    productId: item.productId,
                    quantity: parseInt(item.quantity)
                })) : [],
                validFrom: formData.validFrom ? `${formData.validFrom}:00` : null,
                validUntil: formData.validUntil ? `${formData.validUntil}:59` : null,
                allowedVendorIds: selectedVendorIds,
                active: formData.active
            };

            if (mode === 'linked') {
                payload.parentPromotionId = parentPromotionId;
            }

            if (isEdit) {
                await specialPromotionService.update(promotion.id, payload);
                toast.success('Promoción especial actualizada');
            } else {
                await specialPromotionService.create(payload);
                toast.success('Promoción especial creada');
            }
            onSuccess();
        } catch (err) {
            console.error('Error submitting:', err);
            toast.error('Error al guardar: ' + (err.response?.data?.message || err.message));
        } finally {
            setSaving(false);
        }
    };

    // Close dropdowns on outside click
    useEffect(() => {
        const handler = (e) => {
            if (showVendorDropdown && !e.target.closest('.sp-vendor-wrapper')) setShowVendorDropdown(false);
            if (showParentDropdown && !e.target.closest('.sp-parent-search')) setShowParentDropdown(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showVendorDropdown, showParentDropdown]);

    const filteredVendors = vendedores.filter(v =>
        !vendorSearch || v.username.toLowerCase().includes(vendorSearch.toLowerCase())
    );

    return (
        <div className="sp-modal-overlay" onClick={onClose}>
            <div className="sp-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '800px', width: '95%' }}>
                <div className="sp-modal-header">
                    <h3>
                        <span className="material-icons-round">local_offer</span>
                        {isEdit ? 'Editar Promoción Especial' : 'Nueva Promoción Especial'}
                    </h3>
                    <button className="sp-modal-close" onClick={onClose}>
                        <span className="material-icons-round">close</span>
                    </button>
                </div>

                <form className="sp-modal-body" onSubmit={handleSubmit}>

                    {/* Mode Selection */}
                    {!isEdit && (
                        <div className="sp-mode-toggle">
                            <button type="button" className={`sp-mode-btn ${mode === 'standalone' ? 'active' : ''}`}
                                onClick={() => { setMode('standalone'); removeParent(); }}>
                                <span className="material-icons-round">add_circle</span>
                                Standalone
                            </button>
                            <button type="button" className={`sp-mode-btn ${mode === 'linked' ? 'active' : ''}`}
                                onClick={() => setMode('linked')}>
                                <span className="material-icons-round">link</span>
                                Vinculada
                            </button>
                        </div>
                    )}

                    {/* Edit Mode Badge */}
                    {isEdit && (
                        <div style={{ marginBottom: '1rem' }}>
                            <span className={`sp-type-badge ${promotion.parentPromotionId ? 'linked' : 'standalone'}`} style={{ position: 'static' }}>
                                <span className="material-icons-round" style={{ fontSize: '13px' }}>
                                    {promotion.parentPromotionId ? 'link' : 'add_circle'}
                                </span>
                                {promotion.parentPromotionId ? `Vinculada a: ${promotion.parentPromotionName}` : 'Standalone'}
                            </span>
                        </div>
                    )}

                    {/* Parent Search */}
                    {!isEdit && mode === 'linked' && (
                        <div className="sp-form-group">
                            <label>Promoción Base *</label>
                            {parentPromotionId ? (
                                <div className="sp-parent-selected">
                                    <div className="info">
                                        <div className="name">{parentPromotionName}</div>
                                        <div className="detail">Promoción base seleccionada</div>
                                    </div>
                                    <button type="button" onClick={removeParent}>
                                        <span className="material-icons-round">close</span>
                                    </button>
                                </div>
                            ) : (
                                <div className="sp-parent-search">
                                    <input
                                        type="text"
                                        placeholder="Buscar promoción base..."
                                        value={parentSearch}
                                        onChange={e => { setParentSearch(e.target.value); setShowParentDropdown(true); }}
                                        onFocus={() => setShowParentDropdown(true)}
                                    />
                                    {showParentDropdown && parentResults.length > 0 && (
                                        <div className="sp-parent-dropdown">
                                            {parentResults.map(p => (
                                                <div key={p.id} className="sp-parent-option" onClick={() => handleSelectParent(p)}>
                                                    <div className="info">
                                                        <div className="name">{p.nombre}</div>
                                                        <div className="detail">{p.mainProduct?.nombre} (x{p.buyQuantity})</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Basic Info */}
                    <div className="sp-form-row">
                        <div className="sp-form-group">
                            <label>Nombre *</label>
                            <input type="text" value={formData.nombre} onChange={e => handleChange('nombre', e.target.value)} required />
                        </div>
                    </div>
                    <div className="sp-form-group">
                        <label>Descripción</label>
                        <textarea rows="2" value={formData.descripcion} onChange={e => handleChange('descripcion', e.target.value)} />
                    </div>

                    {/* Vendors */}
                    <div className="sp-form-group" style={{ position: 'relative' }}>
                        <label>Vendedores Asignados</label>
                        <div className="sp-vendor-wrapper">
                            <div className="sp-vendor-select" onClick={() => setShowVendorDropdown(prev => !prev)}>
                                {selectedVendorIds.length === 0 && <span style={{ color: '#9ca3af' }}>Seleccionar vendedores...</span>}
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
                                    <input type="text" placeholder="Filtrar..." value={vendorSearch} onChange={e => setVendorSearch(e.target.value)} onClick={e => e.stopPropagation()} style={{ margin: '0.4rem', width: '95%' }} />
                                    {filteredVendors.map(v => (
                                        <div key={v.id} className={`sp-vendor-dropdown-item ${selectedVendorIds.includes(v.id) ? 'selected' : ''}`} onClick={e => { e.stopPropagation(); toggleVendor(v.id); }}>
                                            {selectedVendorIds.includes(v.id) && <span className="material-icons-round" style={{ marginRight: '5px' }}>check</span>}
                                            {v.username}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Promotion Details (Simplified for brevity, similar to PromotionFormModal) */}
                    <div className="sp-form-section">
                        <h4>Configuración</h4>
                        <div className="sp-form-row">
                            <div className="sp-form-group">
                                <label>Tipo</label>
                                <select value={formData.type} onChange={e => handleChange('type', e.target.value)}>
                                    <option value={PromotionType.PACK}>Fija (Pack)</option>
                                    <option value={PromotionType.BUY_GET_FREE}>Surtido</option>
                                </select>
                            </div>
                            <div className="sp-form-group">
                                <label>Producto Principal</label>
                                {loadingProducts ? (
                                    <div style={{ padding: '10px', color: '#666', fontSize: '0.9rem' }}>Cargando productos...</div>
                                ) : (
                                    <select value={formData.mainProductId} onChange={e => handleChange('mainProductId', e.target.value)} required>
                                        <option value="">Seleccionar...</option>
                                        {products.filter(p => p.active).map(p => (
                                            <option key={p.id} value={p.id}>{p.nombre}</option>
                                        ))}
                                    </select>
                                )}
                            </div>
                            <div className="sp-form-group" style={{ maxWidth: '100px' }}>
                                <label>Cant. Compra</label>
                                <input type="number" value={formData.buyQuantity} onChange={e => handleChange('buyQuantity', e.target.value)} />
                            </div>
                            <div className="sp-form-group" style={{ maxWidth: '120px' }}>
                                <label>Precio (Opcional)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    placeholder="Calculado"
                                    value={formData.packPrice || ''}
                                    onChange={e => handleChange('packPrice', e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Rewards */}
                        {formData.type === PromotionType.PACK ? (
                            <div className="sp-form-group">
                                <label>Regalos (Fijo)</label>
                                <div style={{ background: '#f9fafb', padding: '0.5rem', borderRadius: '6px' }}>
                                    {formData.giftItems.map(item => {
                                        const p = products.find(prod => prod.id === item.productId);
                                        return (
                                            <div key={item.tempId} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                <span>{item.quantity}x {p?.nombre}</span>
                                                <span onClick={() => handleRemoveGift(item.tempId)} style={{ cursor: 'pointer', color: 'red' }}>&times;</span>
                                            </div>
                                        )
                                    })}
                                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                                        <select value={newGift.productId} onChange={e => setNewGift(prev => ({ ...prev, productId: e.target.value }))} style={{ flex: 1 }}>
                                            <option value="">Añadir producto...</option>
                                            {products.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                                        </select>
                                        <input type="number" value={newGift.quantity} onChange={e => setNewGift(prev => ({ ...prev, quantity: e.target.value }))} style={{ width: '60px' }} />
                                        <button type="button" onClick={handleAddGift} className="sp-btn-secondary" style={{ padding: '0 0.5rem' }}>+</button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="sp-form-group">
                                <label>Cantidad a Bonificar (Surtido)</label>
                                <input type="number" value={formData.freeQuantity} onChange={e => handleChange('freeQuantity', e.target.value)} />
                            </div>
                        )}
                    </div>

                    {isEdit && (
                        <div className="sp-form-group">
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <input type="checkbox" checked={formData.active} onChange={e => handleChange('active', e.target.checked)} style={{ accentColor: 'var(--primary)' }} />
                                Promoción Activa
                            </label>
                        </div>
                    )}

                </form>

                <div className="sp-modal-footer">
                    <button type="button" className="sp-btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
                    <button type="button" className="sp-btn-primary" onClick={handleSubmit} disabled={saving}>
                        {saving ? 'Guardando...' : (isEdit ? 'Actualizar' : 'Guardar')}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default SpecialPromotionFormModal;
