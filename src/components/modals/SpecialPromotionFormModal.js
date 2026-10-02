import React, { useState, useEffect, useCallback, useId } from 'react';
import specialPromotionService from '../../api/specialPromotionService';
import client from '../../api/client';
import { useToast } from '../ToastContainer';
import { PromotionType, getPromotionTypeLabel } from '../../utils/types';
import { formatCurrency } from '../../utils/formatters';
import { getParentBlockReason, normalizeSearchText } from '../../utils/promotionFilters';
import VendorMultiSelect from '../VendorMultiSelect';
import SearchableSelect from '../SearchableSelect';
import '../../styles/SpecialProducts.css'; // Reusing special product styles for vendor chips/mode toggle
import '../../styles/Promotions.css';

const newTempId = () => Math.random().toString(36).substr(2, 9);

// Segunda línea de cada producto en los selectores con buscador: precio, stock y etiqueta
// distinguen nombres parecidos (también se puede buscar por la etiqueta)
const productDescription = (product) => [
    product.precio != null && product.precio !== '' ? `$${formatCurrency(product.precio)}` : null,
    product.stock != null ? `Stock: ${product.stock}` : null,
    product.tagName || null,
    product.active === false ? 'Inactivo' : null,
].filter(Boolean).join(' · ');

const toProductOption = (product) => ({
    value: product.id,
    label: product.nombre,
    description: productDescription(product),
});

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
    // Ids para asociar cada etiqueta con su campo (solo presentación)
    const uid = useId();
    const fieldId = (name) => `${uid}-${name}`;

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
        <section className="ui-section spf-section">
            <div className="ui-section-head">
                <span className="ui-step" aria-hidden="true">4</span>
                <div>
                    <h4 className="ui-section-title spf-section-title">Configuración de la venta (promoción base)</h4>
                </div>
            </div>
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
                        <p className="ui-alert ui-alert--danger spf-block">
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
        </section>
    );

    const renderStandaloneConfig = () => (
        <section className="ui-section spf-section">
            <div className="ui-section-head">
                <span className="ui-step" aria-hidden="true">4</span>
                <div>
                    <h4 className="ui-section-title spf-section-title">Configuración</h4>
                    <p className="ui-section-desc">Tipo, producto principal y regalos de esta especial.</p>
                </div>
            </div>
            <div className="ui-grid">
                <div className="ui-field">
                    <label className="ui-label" htmlFor={fieldId('type')}>Tipo</label>
                    <select id={fieldId('type')} className="ui-select" value={formData.type} onChange={e => handleChange('type', e.target.value)}>
                        <option value={PromotionType.PACK}>Fija (Pack)</option>
                        <option value={PromotionType.BUY_GET_FREE}>Surtido</option>
                    </select>
                </div>
                <div className="ui-field">
                    <label className="ui-label" htmlFor={fieldId('mainProduct')}>Producto Principal</label>
                    {loadingProducts ? (
                        <div className="pmf-skeleton">
                            <span className="ui-spinner ui-spinner--sm" aria-hidden="true" />
                            Cargando productos...
                        </div>
                    ) : (
                        <SearchableSelect
                            id={fieldId('mainProduct')}
                            value={formData.mainProductId}
                            onChange={e => handleChange('mainProductId', e.target.value)}
                            options={products.filter(p => p.active || p.id === formData.mainProductId).map(toProductOption)}
                            placeholder="Seleccionar..."
                            searchPlaceholder="Escribe el nombre del producto…"
                            noResultsText="Ningún producto coincide"
                            required
                        />
                    )}
                </div>
                <div className="ui-field">
                    <label className="ui-label" htmlFor={fieldId('buyQuantity')}>Cant. Compra</label>
                    <input id={fieldId('buyQuantity')} className="ui-input" type="number" inputMode="numeric" value={formData.buyQuantity} onChange={e => handleChange('buyQuantity', e.target.value)} onWheel={(e) => e.target.blur()} />
                </div>
                {formData.type !== PromotionType.PACK && (
                    <div className="ui-field">
                        <label className="ui-label" htmlFor={fieldId('freeQuantity')}>Cantidad a Bonificar (Surtido)</label>
                        <input id={fieldId('freeQuantity')} className="ui-input" type="number" inputMode="numeric" value={formData.freeQuantity} onChange={e => handleChange('freeQuantity', e.target.value)} onWheel={(e) => e.target.blur()} />
                    </div>
                )}
            </div>

            {/* Rewards */}
            {formData.type === PromotionType.PACK && (
                <div className="ui-field spf-gifts">
                    <label className="ui-label" htmlFor={fieldId('giftProduct')}>Regalos (Fijo)</label>
                    <div className="pmf-gifts">
                        <ul className="pmf-gift-list">
                            {formData.giftItems.map(item => (
                                <li key={item.tempId} className="pmf-gift-item">
                                    <span className="ui-badge ui-badge--primary pmf-gift-qty">{item.quantity}x</span>
                                    <span className="pmf-gift-name">{productName(item.productId)}</span>
                                    <button type="button" className="ui-icon-btn ui-icon-btn--danger" onClick={() => handleRemoveGift(item.tempId)} title="Quitar regalo" aria-label="Quitar regalo">
                                        <span className="material-icons-round" aria-hidden="true">delete_outline</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                        <div className="pmf-add-gift">
                            <SearchableSelect
                                id={fieldId('giftProduct')}
                                value={newGift.productId}
                                onChange={e => setNewGift(prev => ({ ...prev, productId: e.target.value }))}
                                options={products.filter(p => p.active).map(toProductOption)}
                                placeholder="Añadir producto..."
                                searchPlaceholder="Escribe el nombre del producto…"
                                noResultsText="Ningún producto coincide"
                            />
                            <input className="ui-input" type="number" inputMode="numeric" aria-label="Cantidad del regalo" value={newGift.quantity} onChange={e => setNewGift(prev => ({ ...prev, quantity: e.target.value }))} />
                            <button type="button" onClick={handleAddGift} className="ui-btn ui-btn--secondary pmf-add-gift-btn">
                                <span className="material-icons-round" aria-hidden="true">add</span>
                                Agregar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );

    const packPriceHelp = isLinked
        ? (parentType === PromotionType.BUY_GET_FREE
            ? `Precio total del paquete: incluye ${parentBuyQuantity} del producto principal y ${parentPromotion?.freeQuantity != null ? `hasta ${parentPromotion.freeQuantity}` : 'los'} productos gratis a elección.`
            : 'Es lo que se cobra por el paquete de esta especial.')
        : null;

    return (
        <div className="ui-modal-overlay" onClick={onClose}>
            <div
                className="ui-modal ui-modal--lg spf-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby={fieldId('title')}
                onClick={e => e.stopPropagation()}
            >
                <header className="ui-modal-header">
                    <span className="ui-modal-icon" aria-hidden="true">
                        <span className="material-icons-round">local_offer</span>
                    </span>
                    <div className="ui-modal-heading">
                        <h3 id={fieldId('title')} className="ui-modal-title">
                            {isEdit ? 'Editar Promoción Especial' : 'Nueva Promoción Especial'}
                        </h3>
                        <p className="ui-modal-subtitle">Precio propio y vendedoras que la pueden vender.</p>
                    </div>
                    <button type="button" className="ui-icon-btn" onClick={onClose} aria-label="Cerrar">
                        <span className="material-icons-round" aria-hidden="true">close</span>
                    </button>
                </header>

                <form className="ui-modal-body" onSubmit={handleSubmit}>

                    {/* 1. Tipo: vinculada a una promoción base o standalone */}
                    <section className="ui-section">
                        <div className="ui-section-head">
                            <span className="ui-step" aria-hidden="true">1</span>
                            <div>
                                <h4 className="ui-section-title">Tipo de promoción especial</h4>
                                <p className="ui-section-desc">De dónde salen el tipo, los productos y los regalos.</p>
                            </div>
                        </div>

                        <div className="spf-stack">
                            {/* Mode Selection */}
                            {!isEdit && (
                                <div className="ui-choice-grid" role="group" aria-label="Tipo de promoción especial">
                                    <button
                                        type="button"
                                        aria-pressed={mode === 'linked'}
                                        className={`ui-choice ui-choice--compact spf-choice-btn${mode === 'linked' ? ' is-selected' : ''}`}
                                        onClick={() => setMode('linked')}
                                    >
                                        <span className="material-icons-round ui-choice-icon" aria-hidden="true">link</span>
                                        <span className="ui-choice-text">
                                            <span className="ui-choice-title">Vinculada</span>
                                            <span className="ui-choice-desc">Toma tipo, productos y regalos de una promoción base.</span>
                                        </span>
                                    </button>
                                    <button
                                        type="button"
                                        aria-pressed={mode === 'standalone'}
                                        className={`ui-choice ui-choice--compact spf-choice-btn${mode === 'standalone' ? ' is-selected' : ''}`}
                                        onClick={() => { setMode('standalone'); removeParent(); }}
                                    >
                                        <span className="material-icons-round ui-choice-icon" aria-hidden="true">add_circle</span>
                                        <span className="ui-choice-text">
                                            <span className="ui-choice-title">Standalone</span>
                                            <span className="ui-choice-desc">Configuración propia; no se puede vender.</span>
                                        </span>
                                    </button>
                                </div>
                            )}

                            {/* Edit Mode Badge */}
                            {isEdit && (
                                <div className="spf-kind">
                                    <span className="ui-badge ui-badge--neutral spf-kind-badge">
                                        <span className="material-icons-round" aria-hidden="true">
                                            {promotion.parentPromotionId ? 'link' : 'add_circle'}
                                        </span>
                                        {promotion.parentPromotionId ? `Vinculada a: ${promotion.parentPromotionName}` : 'Standalone'}
                                    </span>
                                </div>
                            )}

                            {/* Las standalone no se pueden vender: OrderServiceImpl rechaza la venta */}
                            {!isLinked && (
                                <div className="ui-alert ui-alert--warning" role="alert">
                                    <span className="material-icons-round" aria-hidden="true">warning_amber</span>
                                    <p>
                                        Las promociones especiales <strong>Standalone no se pueden vender</strong>: al crear la venta
                                        el sistema la rechaza. Usa <strong>Vinculada</strong> para que las vendedoras asignadas puedan venderla.
                                    </p>
                                </div>
                            )}

                            {/* Parent Search */}
                            {!isEdit && isLinked && (
                                <div className="ui-field">
                                    <label className="ui-label" htmlFor={fieldId('parentSearch')}>Promoción Base <span className="ui-required">*</span></label>
                                    {parentPromotionId ? (
                                        <div className="sp-parent-selected">
                                            <span className="sp-parent-selected-icon" aria-hidden="true">
                                                <span className="material-icons-round">link</span>
                                            </span>
                                            <div className="info">
                                                <div className="name">{parentPromotionName}</div>
                                                <div className="detail">Promoción base seleccionada</div>
                                            </div>
                                            <button type="button" className="ui-icon-btn" onClick={removeParent} aria-label="Quitar promoción base">
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
                                                    placeholder="Buscar promoción base..."
                                                    value={parentSearch}
                                                    onChange={e => { setParentSearch(e.target.value); setShowParentDropdown(true); }}
                                                    onFocus={() => setShowParentDropdown(true)}
                                                />
                                            </div>
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
                        </div>
                    </section>

                    {/* 2. Basic Info */}
                    <section className="ui-section">
                        <div className="ui-section-head">
                            <span className="ui-step" aria-hidden="true">2</span>
                            <div>
                                <h4 className="ui-section-title">Información básica</h4>
                                <p className="ui-section-desc">Nombre y precio con los que la verán las vendedoras.</p>
                            </div>
                        </div>
                        <div className="ui-grid">
                            <div className="ui-field ui-span-full">
                                <label className="ui-label" htmlFor={fieldId('nombre')}>Nombre <span className="ui-required">*</span></label>
                                <input id={fieldId('nombre')} className="ui-input" type="text" value={formData.nombre} onChange={e => handleChange('nombre', e.target.value)} required />
                            </div>
                            <div className="ui-field ui-span-full">
                                <label className="ui-label" htmlFor={fieldId('descripcion')}>Descripción</label>
                                <textarea id={fieldId('descripcion')} className="ui-textarea" rows="2" value={formData.descripcion} onChange={e => handleChange('descripcion', e.target.value)} />
                            </div>
                            <div className="ui-field">
                                <label className="ui-label" htmlFor={fieldId('packPrice')}>
                                    Precio del paquete {isLinked ? '' : <span className="ui-optional">(Opcional)</span>}
                                </label>
                                <div className="ui-input-group">
                                    <span className="ui-input-prefix" aria-hidden="true">$</span>
                                    <input
                                        id={fieldId('packPrice')}
                                        className="ui-input"
                                        type="number"
                                        inputMode="decimal"
                                        step="0.01"
                                        min="0"
                                        placeholder={isLinked ? 'Precio de la base' : 'Calculado'}
                                        value={formData.packPrice ?? ''}
                                        onChange={e => handleChange('packPrice', e.target.value)}
                                        onWheel={(e) => e.target.blur()}
                                    />
                                </div>
                                {(packPriceHelp || (formData.packPrice !== '' && formData.packPrice !== null)) && (
                                    <small className="ui-help">
                                        {packPriceHelp}
                                        {formData.packPrice !== '' && formData.packPrice !== null && !isNaN(parseFloat(formData.packPrice)) && (
                                            <strong className="pmf-price-preview"> ${formatCurrency(formData.packPrice)}</strong>
                                        )}
                                    </small>
                                )}
                            </div>
                            {isEdit && (
                                <div className="ui-field">
                                    <label className="ui-label">Estado</label>
                                    <label className="ui-switch">
                                        <input type="checkbox" checked={formData.active} onChange={e => handleChange('active', e.target.checked)} />
                                        <span className="ui-switch-track" aria-hidden="true"><span className="ui-switch-thumb" /></span>
                                        <span className="ui-switch-text">
                                            <span className="ui-switch-title">Promoción Activa</span>
                                        </span>
                                    </label>
                                </div>
                            )}
                        </div>
                    </section>

                    {/* 3. ¿Quién la ve? Misma opción que las promociones normales */}
                    <section className="ui-section spf-visibility">
                        <div className="ui-section-head">
                            <span className="ui-step" aria-hidden="true">3</span>
                            <div>
                                <h4 className="ui-section-title spf-section-title">¿Quién ve esta promoción especial?</h4>
                                <p className="ui-section-desc spf-visibility-note">Admin y owner siempre la pueden usar.</p>
                            </div>
                        </div>
                        <div className="ui-choice-grid" role="radiogroup" aria-label="¿Quién ve esta promoción especial?">
                            <label className={`ui-choice ui-choice--compact${visibleToAll ? ' is-selected' : ''}`}>
                                <input
                                    type="radio"
                                    name={visibilityName}
                                    checked={visibleToAll}
                                    onChange={() => setVisibleToAll(true)}
                                />
                                <span className="material-icons-round ui-choice-icon" aria-hidden="true">groups</span>
                                <span className="ui-choice-text">
                                    <span className="ui-choice-title">Todas las vendedoras</span>
                                    <span className="ui-choice-desc">Cualquier vendedora la ve y la puede vender, también las nuevas.</span>
                                </span>
                            </label>
                            <label className={`ui-choice ui-choice--compact${!visibleToAll ? ' is-selected' : ''}`}>
                                <input
                                    type="radio"
                                    name={visibilityName}
                                    checked={!visibleToAll}
                                    onChange={() => setVisibleToAll(false)}
                                />
                                <span className="material-icons-round ui-choice-icon" aria-hidden="true">person_search</span>
                                <span className="ui-choice-text">
                                    <span className="ui-choice-title">Solo las seleccionadas</span>
                                    <span className="ui-choice-desc">Solo las vendedoras que elijas abajo.</span>
                                </span>
                            </label>
                        </div>
                        {!visibleToAll && (
                            <div className="pmf-vendors">
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
                    </section>

                    {/* 4. Configuración: de la base (solo lectura) o propia (standalone) */}
                    {isLinked ? renderLinkedSummary() : renderStandaloneConfig()}

                </form>

                <footer className="ui-modal-footer">
                    <button type="button" className="ui-btn ui-btn--secondary" onClick={onClose} disabled={saving}>Cancelar</button>
                    <button type="button" className="ui-btn ui-btn--primary" onClick={handleSubmit} disabled={saving}>
                        {saving
                            ? <span className="ui-spinner" aria-hidden="true" />
                            : <span className="material-icons-round" aria-hidden="true">save</span>}
                        {saving ? 'Guardando...' : (isEdit ? 'Actualizar' : 'Guardar')}
                    </button>
                </footer>
            </div>
        </div>
    );
}

export default SpecialPromotionFormModal;
