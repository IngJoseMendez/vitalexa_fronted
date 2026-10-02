import React, { useState, useEffect, useCallback, useId } from 'react';
import specialPromotionService from '../../api/specialPromotionService';
import client from '../../api/client';
import { useToast } from '../ToastContainer';
import { PromotionType, getPromotionTypeLabel } from '../../utils/types';
import { formatCurrency } from '../../utils/formatters';
import { getParentBlockReason, normalizeSearchText } from '../../utils/promotionFilters';
import VendorMultiSelect from '../VendorMultiSelect';
import '../../styles/SpecialProducts.css'; // Reusing special product styles for vendor chips/mode toggle
import '../../styles/Promotions.css';

const newTempId = () => Math.random().toString(36).substr(2, 9);

const formatDateTime = (value) => {
    if (!value) return null;
    const date = new Date(value);
    if (isNaN(date.getTime())) return null;
    return date.toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' });
};

function SpecialPromotionFormModal({ promotion, onClose, onSuccess }) {
    const isEdit = !!promotion;
    const toast = useToast();

    // Mode: 'standalone' or 'linked'. Al crear se parte de "Vinculada": las standalone no se pueden vender.
    const [mode, setMode] = useState(isEdit && !promotion?.parentPromotionId ? 'standalone' : 'linked');

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
    // Promoción base completa: la venta usa SU tipo, cantidad, producto principal, regalos y vigencia
    const [parentPromotion, setParentPromotion] = useState(null);
    const [parentLoadError, setParentLoadError] = useState(false);
    const [parentSearch, setParentSearch] = useState('');
    const [parentResults, setParentResults] = useState([]);
    const [showParentDropdown, setShowParentDropdown] = useState(false);

    // ¿Quién la ve? Nueva: "Todas las vendedoras" por defecto. Al editar se respeta lo guardado;
    // sin el campo (backend anterior o especial previa a V46) es "Solo las seleccionadas", que es
    // como funcionaron siempre las especiales.
    const [visibleToAll, setVisibleToAll] = useState(isEdit ? promotion?.visibleToAll === true : true);
    const visibilityName = useId();

    // Vendor Selection (la lista de vendedoras la carga VendorMultiSelect)
    const [selectedVendorIds, setSelectedVendorIds] = useState(promotion?.allowedVendorIds || []);
    const [vendorNameHints, setVendorNameHints] = useState({});

    // Helpers
    const [products, setProducts] = useState([]);
    const [loadingProducts, setLoadingProducts] = useState(true);
    const [saving, setSaving] = useState(false);

    // Temporary state for adding a new gift item
    const [newGift, setNewGift] = useState({
        productId: '',
        quantity: 1
    });

    const isLinked = mode === 'linked';

    // --- Load Dependencies ---

    useEffect(() => {
        const loadDependencies = async () => {
            try {
                setLoadingProducts(true);
                const prodRes = await client.get('/admin/products');
                setProducts(prodRes.data.content || prodRes.data || []);
            } catch (error) {
                console.error('Error loading dependencies:', error);
                toast.error('Error al cargar datos necesarios');
            } finally {
                setLoadingProducts(false);
            }
        };
        loadDependencies();
    }, [toast]);

    // Al editar una vinculada, cargar su promoción base para mostrar lo que realmente se vende
    useEffect(() => {
        if (!promotion?.parentPromotionId) return undefined;
        let cancelled = false;
        client.get(`/admin/promotions/${promotion.parentPromotionId}`)
            .then(res => { if (!cancelled) setParentPromotion(res.data || null); })
            .catch(err => {
                console.error('Error loading parent promotion:', err);
                if (!cancelled) setParentLoadError(true);
            });
        return () => { cancelled = true; };
    }, [promotion]);

    // --- Init Form Data ---

    useEffect(() => {
        if (promotion) {
            let initialGifts = [];
            if (promotion.giftItems && promotion.giftItems.length > 0) {
                initialGifts = promotion.giftItems.map(item => ({
                    productId: item.product ? item.product.id : item.productId,
                    quantity: item.quantity,
                    tempId: newTempId()
                }));
            }

            setFormData({
                nombre: promotion.nombre || '',
                descripcion: promotion.descripcion || '',
                type: promotion.type,
                buyQuantity: promotion.buyQuantity || 40,
                freeQuantity: promotion.freeQuantity || 0,
                packPrice: promotion.packPrice ?? '',
                // La respuesta trae mainProductId (no mainProduct): antes el campo quedaba vacío
                // y la validación bloqueaba guardar.
                mainProductId: promotion.mainProductId || promotion.mainProduct?.id || '',
                giftItems: initialGifts,
                allowStackWithDiscounts: promotion.allowStackWithDiscounts || false,
                requiresAssortmentSelection: promotion.requiresAssortmentSelection || false,
                validFrom: promotion.validFrom ? promotion.validFrom.substring(0, 16) : '',
                validUntil: promotion.validUntil ? promotion.validUntil.substring(0, 16) : '',
                active: promotion.active ?? true
            });
            setParentPromotionId(promotion.parentPromotionId);
            setParentPromotionName(promotion.parentPromotionName);
            const ids = promotion.allowedVendorIds || [];
            const names = promotion.allowedVendorNames || [];
            const hints = {};
            ids.forEach((id, i) => { if (names[i]) hints[id] = names[i]; });
            setSelectedVendorIds(ids);
            setVendorNameHints(hints);
            setVisibleToAll(promotion.visibleToAll === true);
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

            const term = normalizeSearchText(q);
            const filtered = data.filter(p => normalizeSearchText(p.nombre).includes(term));
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
        setParentPromotion(parent);
        setParentLoadError(false);
        setShowParentDropdown(false);
        setParentSearch('');

        // Inherit data
        let initialGifts = [];
        if (parent.giftItems && parent.giftItems.length > 0) {
            initialGifts = parent.giftItems.map(item => ({
                productId: item.product ? item.product.id : item.productId,
                quantity: item.quantity,
                tempId: newTempId()
            }));
        }

        setFormData(prev => ({
            ...prev,
            nombre: parent.nombre + ' (Especial)', // Suggest name
            descripcion: parent.descripcion || '',
            type: parent.type,
            buyQuantity: parent.buyQuantity,
            freeQuantity: parent.freeQuantity,
            packPrice: parent.packPrice ?? '',
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
        setParentPromotion(null);
    };

    // --- Form Logic ---

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleAddGift = () => {
        if (!newGift.productId) return;
        setFormData(prev => ({
            ...prev,
            giftItems: [...prev.giftItems, { ...newGift, tempId: newTempId() }]
        }));
        setNewGift({ productId: '', quantity: 1 });
    };

    const handleRemoveGift = (tempId) => {
        setFormData(prev => ({
            ...prev,
            giftItems: prev.giftItems.filter(item => item.tempId !== tempId)
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!formData.nombre.trim()) { toast.warning('Nombre obligatorio'); return; }
        if (isLinked && !parentPromotionId) { toast.warning('Seleccione una promoción padre'); return; }
        // En vinculada el producto principal sale del padre; solo la standalone lo exige
        if (!isLinked && !formData.mainProductId) { toast.warning('Seleccione un producto principal'); return; }
        if (formData.packPrice !== '' && formData.packPrice !== null
            && (isNaN(parseFloat(formData.packPrice)) || parseFloat(formData.packPrice) < 0)) {
            toast.warning('El precio no puede ser negativo');
            return;
        }

        setSaving(true);
        try {
            const payload = {
                nombre: formData.nombre.trim(),
                descripcion: formData.descripcion.trim() || null,
                packPrice: formData.packPrice !== '' && formData.packPrice !== null ? parseFloat(formData.packPrice) : null,
                validFrom: formData.validFrom ? `${formData.validFrom}:00` : null,
                validUntil: formData.validUntil ? `${formData.validUntil}:59` : null,
                // Visibilidad: con "Todas" la lista no aplica y se envía vacía para no dejar una
                // selección vieja escondida que reaparezca al restringir otra vez.
                visibleToAll,
                allowedVendorIds: visibleToAll ? [] : selectedVendorIds,
                active: formData.active
            };

            if (isLinked) {
                // La venta usa tipo, cantidad, producto principal y regalos del PADRE: no se envían
                // (null = al crear se heredan del padre y al editar no se tocan).
                payload.type = null;
                payload.buyQuantity = null;
                payload.mainProductId = null;
                if (!isEdit) payload.parentPromotionId = parentPromotionId;
            } else {
                Object.assign(payload, {
                    type: formData.type,
                    buyQuantity: parseInt(formData.buyQuantity),
                    mainProductId: formData.mainProductId,
                    allowStackWithDiscounts: formData.allowStackWithDiscounts,
                    requiresAssortmentSelection: formData.type === PromotionType.BUY_GET_FREE,
                    freeQuantity: formData.type === PromotionType.BUY_GET_FREE ? parseInt(formData.freeQuantity) : 0,
                    giftItems: formData.type === PromotionType.PACK ? formData.giftItems.map(item => ({
                        productId: item.productId,
                        quantity: parseInt(item.quantity)
                    })) : []
                });
            }

            let response;
            if (isEdit) {
                response = await specialPromotionService.update(promotion.id, payload);
                toast.success('Promoción especial actualizada');
            } else {
                response = await specialPromotionService.create(payload);
                toast.success('Promoción especial creada');
            }
            // Un backend anterior ignora "Todas las vendedoras" (y con la lista vacía nadie la
            // vería): avisar en vez de dejar creer que la ve todo el equipo.
            const saved = response?.data;
            if (visibleToAll && saved && typeof saved === 'object' && saved.visibleToAll === undefined) {
                toast.warning('El servidor todavía no aplica "Todas las vendedoras": por ahora solo la ven las vendedoras asignadas.');
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
            if (showParentDropdown && !e.target.closest('.sp-parent-search')) setShowParentDropdown(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showParentDropdown]);

    // --- Resumen de solo lectura (modo vinculado) ---
    const productName = (id) => products.find(p => p.id === id)?.nombre;
    const parentType = parentPromotion?.type || formData.type;
    const parentBuyQuantity = parentPromotion?.buyQuantity ?? formData.buyQuantity;
    const parentMainProductName = parentPromotion?.mainProduct?.nombre
        || promotion?.mainProductName
        || productName(formData.mainProductId)
        || '—';
    const parentGifts = parentPromotion?.giftItems || [];
    const parentReason = getParentBlockReason(parentPromotion);
    const parentFrom = formatDateTime(parentPromotion?.validFrom);
    const parentUntil = formatDateTime(parentPromotion?.validUntil);

    const renderLinkedSummary = () => (
        <div className="sp-form-section spf-section">
            <h4 className="spf-section-title">Configuración de la venta (promoción base)</h4>
            {!parentPromotionId ? (
                <p className="spf-note">Selecciona la promoción base para ver qué se vende.</p>
            ) : (
                <>
                    {parentLoadError && !parentPromotion && (
                        <p className="spf-note">No se pudo cargar la promoción base; se muestran los datos guardados en la especial.</p>
                    )}
                    <dl className="spf-readonly">
                        <div><dt>Tipo</dt><dd>{getPromotionTypeLabel(parentType)}</dd></div>
                        <div><dt>Producto principal</dt><dd>{parentMainProductName}</dd></div>
                        <div><dt>Cantidad</dt><dd>{parentBuyQuantity}</dd></div>
                        <div>
                            <dt>{parentType === PromotionType.BUY_GET_FREE ? 'Gratis a elección' : 'Regalos'}</dt>
                            <dd>
                                {parentType === PromotionType.BUY_GET_FREE
                                    ? (parentPromotion?.freeQuantity != null ? `Hasta ${parentPromotion.freeQuantity}` : 'Los que defina la base')
                                    : parentGifts.length > 0
                                        ? parentGifts.map(g => `${g.quantity}x ${g.product?.nombre || 'Producto'}`).join(', ')
                                        : 'Los que defina la base'}
                            </dd>
                        </div>
                        {parentPromotion && (
                            <div>
                                <dt>Vigencia</dt>
                                <dd>
                                    {parentFrom || parentUntil
                                        ? `${parentFrom ? `Desde ${parentFrom}` : 'Sin inicio'} · ${parentUntil ? `hasta ${parentUntil}` : 'sin fin'}`
                                        : 'Sin límite'}
                                </dd>
                            </div>
                        )}
                    </dl>
                    {parentReason && (
                        <p className="promo-sp-warning spf-block">
                            <span className="material-icons-round" aria-hidden="true">block</span>
                            {parentReason}
                        </p>
                    )}
                    <p className="spf-note">
                        Tipo, cantidad, producto principal, regalos y vigencia salen de la promoción base y no se
                        editan aquí. Para cambiarlos, edita la promoción base.
                    </p>
                </>
            )}
        </div>
    );

    const renderStandaloneConfig = () => (
        <div className="sp-form-section spf-section">
            <h4 className="spf-section-title">Configuración</h4>
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
                            {products.filter(p => p.active || p.id === formData.mainProductId).map(p => (
                                <option key={p.id} value={p.id}>{p.nombre}</option>
                            ))}
                        </select>
                    )}
                </div>
            </div>
            <div className="sp-form-row">
                <div className="sp-form-group">
                    <label>Cant. Compra</label>
                    <input type="number" value={formData.buyQuantity} onChange={e => handleChange('buyQuantity', e.target.value)} onWheel={(e) => e.target.blur()} />
                </div>
                {formData.type !== PromotionType.PACK && (
                    <div className="sp-form-group">
                        <label>Cantidad a Bonificar (Surtido)</label>
                        <input type="number" value={formData.freeQuantity} onChange={e => handleChange('freeQuantity', e.target.value)} onWheel={(e) => e.target.blur()} />
                    </div>
                )}
            </div>

            {/* Rewards */}
            {formData.type === PromotionType.PACK && (
                <div className="sp-form-group">
                    <label>Regalos (Fijo)</label>
                    <div style={{ background: '#f9fafb', padding: '0.5rem', borderRadius: '6px' }}>
                        {formData.giftItems.map(item => (
                            <div key={item.tempId} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                <span>{item.quantity}x {productName(item.productId)}</span>
                                <button type="button" className="spf-link-danger" onClick={() => handleRemoveGift(item.tempId)} aria-label="Quitar regalo">&times;</button>
                            </div>
                        ))}
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                            <select value={newGift.productId} onChange={e => setNewGift(prev => ({ ...prev, productId: e.target.value }))} style={{ flex: 1 }}>
                                <option value="">Añadir producto...</option>
                                {products.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                            </select>
                            <input type="number" value={newGift.quantity} onChange={e => setNewGift(prev => ({ ...prev, quantity: e.target.value }))} style={{ width: '70px' }} />
                            <button type="button" onClick={handleAddGift} className="sp-btn-secondary" style={{ padding: '0 0.75rem' }}>+</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    const packPriceHelp = isLinked
        ? (parentType === PromotionType.BUY_GET_FREE
            ? `Precio total del paquete: incluye ${parentBuyQuantity} del producto principal y ${parentPromotion?.freeQuantity != null ? `hasta ${parentPromotion.freeQuantity}` : 'los'} productos gratis a elección.`
            : 'Es lo que se cobra por el paquete de esta especial.')
        : null;

    return (
        <div className="sp-modal-overlay" onClick={onClose}>
            <div className="sp-modal spf-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '760px', width: '95%' }}>
                <div className="sp-modal-header">
                    <h3>
                        <span className="material-icons-round">local_offer</span>
                        {isEdit ? 'Editar Promoción Especial' : 'Nueva Promoción Especial'}
                    </h3>
                    <button type="button" className="sp-modal-close" onClick={onClose} aria-label="Cerrar">
                        <span className="material-icons-round">close</span>
                    </button>
                </div>

                <form className="sp-modal-body" onSubmit={handleSubmit}>

                    {/* Mode Selection */}
                    {!isEdit && (
                        <div className="sp-mode-toggle">
                            <button type="button" className={`sp-mode-btn ${mode === 'linked' ? 'active' : ''}`}
                                onClick={() => setMode('linked')}>
                                <span className="material-icons-round">link</span>
                                Vinculada
                            </button>
                            <button type="button" className={`sp-mode-btn ${mode === 'standalone' ? 'active' : ''}`}
                                onClick={() => { setMode('standalone'); removeParent(); }}>
                                <span className="material-icons-round">add_circle</span>
                                Standalone
                            </button>
                        </div>
                    )}

                    {/* Edit Mode Badge */}
                    {isEdit && (
                        <div style={{ marginBottom: '1rem' }}>
                            <span className={`sp-type-badge ${promotion.parentPromotionId ? 'linked' : 'standalone'}`} style={{ position: 'static', display: 'inline-flex' }}>
                                <span className="material-icons-round" style={{ fontSize: '13px' }}>
                                    {promotion.parentPromotionId ? 'link' : 'add_circle'}
                                </span>
                                {promotion.parentPromotionId ? `Vinculada a: ${promotion.parentPromotionName}` : 'Standalone'}
                            </span>
                        </div>
                    )}

                    {/* Las standalone no se pueden vender: OrderServiceImpl rechaza la venta */}
                    {!isLinked && (
                        <div className="spf-alert" role="alert">
                            <span className="material-icons-round" aria-hidden="true">warning_amber</span>
                            <p>
                                Las promociones especiales <strong>Standalone no se pueden vender</strong>: al crear la venta
                                el sistema la rechaza. Usa <strong>Vinculada</strong> para que las vendedoras asignadas puedan venderla.
                            </p>
                        </div>
                    )}

                    {/* Parent Search */}
                    {!isEdit && isLinked && (
                        <div className="sp-form-group">
                            <label>Promoción Base *</label>
                            {parentPromotionId ? (
                                <div className="sp-parent-selected">
                                    <div className="info">
                                        <div className="name">{parentPromotionName}</div>
                                        <div className="detail">Promoción base seleccionada</div>
                                    </div>
                                    <button type="button" onClick={removeParent} aria-label="Quitar promoción base">
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
                                                        <div className="detail">
                                                            {p.mainProduct?.nombre} (x{p.buyQuantity})
                                                            {getParentBlockReason(p) ? ` · ${getParentBlockReason(p)}` : ''}
                                                        </div>
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
                    <div className="sp-form-group">
                        <label>Nombre *</label>
                        <input type="text" value={formData.nombre} onChange={e => handleChange('nombre', e.target.value)} required />
                    </div>
                    <div className="sp-form-group">
                        <label>Descripción</label>
                        <textarea rows="2" value={formData.descripcion} onChange={e => handleChange('descripcion', e.target.value)} />
                    </div>

                    <div className="sp-form-row">
                        <div className="sp-form-group">
                            <label>Precio del paquete {isLinked ? '' : '(Opcional)'}</label>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder={isLinked ? 'Precio de la base' : 'Calculado'}
                                value={formData.packPrice ?? ''}
                                onChange={e => handleChange('packPrice', e.target.value)}
                                onWheel={(e) => e.target.blur()}
                            />
                            {(packPriceHelp || (formData.packPrice !== '' && formData.packPrice !== null)) && (
                                <small className="spf-help">
                                    {packPriceHelp}
                                    {formData.packPrice !== '' && formData.packPrice !== null && !isNaN(parseFloat(formData.packPrice)) && (
                                        <strong> ${formatCurrency(formData.packPrice)}</strong>
                                    )}
                                </small>
                            )}
                        </div>
                        {isEdit && (
                            <div className="sp-form-group">
                                <label>Estado</label>
                                <label className="spf-checkbox">
                                    <input type="checkbox" checked={formData.active} onChange={e => handleChange('active', e.target.checked)} style={{ accentColor: 'var(--primary)' }} />
                                    Promoción Activa
                                </label>
                            </div>
                        )}
                    </div>

                    {/* ¿Quién la ve? Misma opción que las promociones normales */}
                    <div className="spf-section spf-visibility">
                        <h4 className="spf-section-title">¿Quién ve esta promoción especial?</h4>
                        <div className="pmf-choice-grid" role="radiogroup" aria-label="¿Quién ve esta promoción especial?">
                            <label className={`pmf-choice compact ${visibleToAll ? 'is-selected' : ''}`}>
                                <input
                                    type="radio"
                                    name={visibilityName}
                                    checked={visibleToAll}
                                    onChange={() => setVisibleToAll(true)}
                                />
                                <span className="material-icons-round pmf-choice-icon" aria-hidden="true">groups</span>
                                <span className="pmf-choice-text">
                                    <span className="pmf-choice-title">Todas las vendedoras</span>
                                    <span className="pmf-choice-desc">Cualquier vendedora la ve y la puede vender, también las nuevas.</span>
                                </span>
                            </label>
                            <label className={`pmf-choice compact ${!visibleToAll ? 'is-selected' : ''}`}>
                                <input
                                    type="radio"
                                    name={visibilityName}
                                    checked={!visibleToAll}
                                    onChange={() => setVisibleToAll(false)}
                                />
                                <span className="material-icons-round pmf-choice-icon" aria-hidden="true">person_search</span>
                                <span className="pmf-choice-text">
                                    <span className="pmf-choice-title">Solo las seleccionadas</span>
                                    <span className="pmf-choice-desc">Solo las vendedoras que elijas abajo.</span>
                                </span>
                            </label>
                        </div>
                        {!visibleToAll && (
                            <div className="sp-form-group pmf-vendors">
                                <VendorMultiSelect
                                    label="Vendedoras asignadas"
                                    selectedIds={selectedVendorIds}
                                    onChange={setSelectedVendorIds}
                                    nameHints={vendorNameHints}
                                    emptyWarning="Ninguna vendedora la verá; solo admin"
                                    sharedUsersHint
                                />
                            </div>
                        )}
                        <p className="spf-note spf-visibility-note">Admin y owner siempre la pueden usar.</p>
                    </div>

                    {/* Configuración: de la base (solo lectura) o propia (standalone) */}
                    {isLinked ? renderLinkedSummary() : renderStandaloneConfig()}

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
