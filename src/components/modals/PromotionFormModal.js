import { useState, useEffect, useId } from 'react';
import promotionService from '../../api/promotionService';
import client from '../../api/client';
import { useToast } from '../ToastContainer';
import { useConfirm } from '../ConfirmDialog';
import { PromotionType } from '../../utils/types';
import { formatCurrency } from '../../utils/formatters';
import SearchableSelect from '../SearchableSelect';
// Promotions.css ANTES que VendorMultiSelect (que trae SpecialProducts.css): mismo orden que en el
// panel de la vendedora. Con el orden contrario mini-css-extract-plugin avisa "Conflicting order"
// y el build con CI=true (Vercel/Netlify) falla.
import '../../styles/Promotions.css';
import VendorMultiSelect from '../VendorMultiSelect';

const newTempId = () => Math.random().toString(36).substr(2, 9);

// Segunda línea de cada producto en los selectores con buscador: distingue nombres parecidos
// y permite buscar también por etiqueta (precio y stock solo donde el texto no los trae ya)
const productDescription = (product, withPriceAndStock) => [
    withPriceAndStock && product.precio != null && product.precio !== '' ? `$${formatCurrency(product.precio)}` : null,
    withPriceAndStock && product.stock != null ? `Stock: ${product.stock}` : null,
    product.tagName || null,
    product.active === false ? 'Inactivo' : null,
].filter(Boolean).join(' · ');

function PromotionFormModal({ promotion, onClose, onSuccess }) {
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
        // Visibilidad por vendedora: por defecto la ven todas (igual que las promociones existentes)
        visibleToAll: true,
        allowedVendorIds: []
    });

    // Nombres de las vendedoras ya asignadas (por si alguna ya no viene en /vendedores)
    const [vendorNameHints, setVendorNameHints] = useState({});

    // Temporary state for adding a new gift item
    const [newGift, setNewGift] = useState({
        productId: '',
        quantity: 1
    });

    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loadingProducts, setLoadingProducts] = useState(true);
    const toast = useToast();
    const confirm = useConfirm();
    const uid = useId();
    const fieldId = (name) => `${uid}-${name}`;

    useEffect(() => {
        const fetchProducts = async () => {
            try {
                setLoadingProducts(true);
                const response = await client.get('/admin/products');
                setProducts(response.data.content || response.data || []);
            } catch (error) {
                console.error('Error al cargar productos:', error);
                toast.error('Error al cargar productos');
            } finally {
                setLoadingProducts(false);
            }
        };
        fetchProducts();
    }, [toast]);

    useEffect(() => {
        if (promotion) {
            // No mapping needed as we use legacy types directly now
            // PACK = Fixed, BUY_GET_FREE = Assortment

            let initialGifts = [];
            if (promotion.giftItems && promotion.giftItems.length > 0) {
                initialGifts = promotion.giftItems.map(item => ({
                    productId: item.product ? item.product.id : item.productId,
                    quantity: item.quantity,
                    tempId: newTempId()
                }));
            } else if (promotion.freeProduct && promotion.freeQuantity) {
                // Legacy support
                initialGifts = [{
                    productId: promotion.freeProduct.id,
                    quantity: promotion.freeQuantity,
                    tempId: newTempId()
                }];
            }

            const allowedVendorIds = Array.isArray(promotion.allowedVendorIds) ? promotion.allowedVendorIds : [];
            const allowedVendorNames = Array.isArray(promotion.allowedVendorNames) ? promotion.allowedVendorNames : [];
            const hints = {};
            allowedVendorIds.forEach((id, i) => { if (allowedVendorNames[i]) hints[id] = allowedVendorNames[i]; });
            setVendorNameHints(hints);

            setFormData({
                nombre: promotion.nombre || '',
                descripcion: promotion.descripcion || '',
                type: promotion.type, // Use type directly
                buyQuantity: promotion.buyQuantity || 40,
                freeQuantity: promotion.freeQuantity || 0,
                packPrice: promotion.packPrice || '',
                mainProductId: promotion.mainProduct?.id || '',
                giftItems: initialGifts,
                allowStackWithDiscounts: promotion.allowStackWithDiscounts || false,
                requiresAssortmentSelection: promotion.requiresAssortmentSelection || false,
                validFrom: promotion.validFrom ? promotion.validFrom.substring(0, 16) : '',
                validUntil: promotion.validUntil ? promotion.validUntil.substring(0, 16) : '',
                // Un backend anterior no envía visibleToAll: la promoción la ven todas
                visibleToAll: promotion.visibleToAll !== false,
                allowedVendorIds
            });
        }
    }, [promotion]);

    const handleAddGift = () => {
        if (!newGift.productId) {
            toast.warning('Seleccione un producto para regalar');
            return;
        }
        if (newGift.quantity <= 0) {
            toast.warning('La cantidad debe ser mayor a 0');
            return;
        }

        setFormData(prev => ({
            ...prev,
            giftItems: [...prev.giftItems, { ...newGift, tempId: newTempId() }]
        }));

        // Reset new gift input
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

        // Validations
        if (!formData.nombre.trim()) {
            toast.warning('El nombre es obligatorio');
            return;
        }

        if (formData.buyQuantity <= 0) {
            toast.warning('La cantidad a comprar debe ser mayor a 0');
            return;
        }

        if (!formData.mainProductId) {
            toast.warning('Debe seleccionar un producto principal');
            return;
        }

        if (formData.type === PromotionType.PACK && formData.giftItems.length === 0) {
            toast.warning('Agregue al menos un producto de regalo para la Promoción Fija');
            return;
        }

        if (formData.type === PromotionType.BUY_GET_FREE && (!formData.freeQuantity || formData.freeQuantity <= 0)) {
            toast.warning('Ingrese la cantidad de productos a bonificar (Surtido)');
            return;
        }

        // Surtido = PAQUETE a precio fijo: el principal y los gratis van dentro de ese precio.
        // Sin precio el paquete no tendría valor que cobrar, por eso es obligatorio.
        const packPriceNumber = parseFloat(formData.packPrice);
        if (formData.type === PromotionType.BUY_GET_FREE && !(packPriceNumber > 0)) {
            toast.warning('Ingrese el precio del paquete (Surtido)');
            return;
        }

        if (formData.validFrom && formData.validUntil) {
            const from = new Date(formData.validFrom);
            const until = new Date(formData.validUntil);
            if (until <= from) {
                toast.warning('La fecha de fin debe ser posterior a la fecha de inicio');
                return;
            }
        }

        if (!formData.visibleToAll && formData.allowedVendorIds.length === 0) {
            const ok = await confirm({
                title: '¿Ninguna vendedora la verá?',
                message: 'Elegiste "Solo las seleccionadas" sin ninguna vendedora. Ninguna vendedora la verá ni podrá venderla; solo admin y owner. ¿Guardar así?',
                confirmText: 'Guardar así',
                cancelText: 'Volver'
            });
            if (!ok) return;
        }

        setLoading(true);

        try {
            // Construct payload
            const payload = {
                nombre: formData.nombre.trim(),
                descripcion: formData.descripcion.trim() || null,
                type: formData.type,
                buyQuantity: parseInt(formData.buyQuantity),
                packPrice: formData.packPrice ? parseFloat(formData.packPrice) : null,
                mainProductId: formData.mainProductId,
                allowStackWithDiscounts: formData.allowStackWithDiscounts,

                // Logic specific to type
                requiresAssortmentSelection: formData.type === PromotionType.BUY_GET_FREE,
                freeQuantity: formData.type === PromotionType.BUY_GET_FREE ? parseInt(formData.freeQuantity) : 0,
                giftItems: formData.type === PromotionType.PACK ? formData.giftItems.map(item => ({
                    productId: item.productId,
                    quantity: parseInt(item.quantity)
                })) : [],

                validFrom: formData.validFrom ? `${formData.validFrom}:00` : null,
                validUntil: formData.validUntil ? `${formData.validUntil}:59` : null,

                // Visibilidad: con "Todas" la lista no aplica y se envía vacía para no dejar
                // una selección vieja escondida que reaparezca al restringir otra vez.
                visibleToAll: formData.visibleToAll,
                allowedVendorIds: formData.visibleToAll ? [] : formData.allowedVendorIds
            };

            let response;
            if (promotion) {
                response = await promotionService.update(promotion.id, payload);
                toast.success('Promoción actualizada exitosamente');
            } else {
                response = await promotionService.create(payload);
                toast.success('Promoción creada exitosamente');
            }

            // Un backend anterior ignora la restricción (la promoción la siguen viendo todas):
            // avisar en vez de dejar creer que quedó restringida.
            const saved = response?.data;
            if (!formData.visibleToAll && saved && typeof saved === 'object' && saved.visibleToAll === undefined) {
                toast.warning('El servidor todavía no aplica la restricción por vendedora: por ahora esta promoción la ven todas.');
            }

            onSuccess();
            onClose();
        } catch (error) {
            console.error('Error al guardar promoción:', error);
            const errorMsg = error.response?.data?.message || error.response?.data || error.message;
            toast.error('Error al guardar promoción: ' + errorMsg);
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const isAssortment = formData.type === PromotionType.BUY_GET_FREE;
    // El producto ya elegido se lista aunque esté inactivo, para no vaciar el campo al editar
    const selectableProducts = products.filter(p => p.active || p.id === formData.mainProductId);
    const activeProducts = products.filter(p => p.active);
    const buyQty = parseInt(formData.buyQuantity) || 0;
    const freeQty = parseInt(formData.freeQuantity) || 0;

    return (
        <div className="ui-modal-overlay pmf-overlay">
            <div
                className="ui-modal ui-modal--lg pmf-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby={fieldId('title')}
                onClick={(e) => e.stopPropagation()}
            >
                <header className="ui-modal-header">
                    <span className="ui-modal-icon" aria-hidden="true">
                        <span className="material-icons-round">local_offer</span>
                    </span>
                    <div className="ui-modal-heading">
                        <h3 id={fieldId('title')} className="ui-modal-title">{promotion ? 'Editar promoción' : 'Nueva promoción'}</h3>
                        <p className="ui-modal-subtitle">Define el paquete, quién lo ve y cuándo está vigente.</p>
                    </div>
                    <button type="button" className="ui-icon-btn" onClick={onClose} aria-label="Cerrar">
                        <span className="material-icons-round" aria-hidden="true">close</span>
                    </button>
                </header>

                <form id={fieldId('form')} onSubmit={handleSubmit} className="ui-modal-body pmf-body">
                    {/* 1. Información básica */}
                    <section className="ui-section">
                        <div className="ui-section-head">
                            <span className="ui-step" aria-hidden="true">1</span>
                            <div>
                                <h4 className="ui-section-title">Información básica</h4>
                                <p className="ui-section-desc">Así la verán las vendedoras en su catálogo.</p>
                            </div>
                        </div>
                        <div className="ui-grid">
                            <div className="ui-field ui-span-full">
                                <label className="ui-label" htmlFor={fieldId('nombre')}>Nombre <span className="ui-required">*</span></label>
                                <input
                                    id={fieldId('nombre')}
                                    className="ui-input"
                                    type="text"
                                    value={formData.nombre}
                                    onChange={(e) => handleChange('nombre', e.target.value)}
                                    placeholder="Ej: Pack 40+10 Especial"
                                    required
                                />
                            </div>
                            <div className="ui-field ui-span-full">
                                <label className="ui-label" htmlFor={fieldId('descripcion')}>Descripción <span className="ui-optional">(opcional)</span></label>
                                <textarea
                                    id={fieldId('descripcion')}
                                    className="ui-textarea"
                                    value={formData.descripcion}
                                    onChange={(e) => handleChange('descripcion', e.target.value)}
                                    rows="3"
                                    placeholder="Detalles que la vendedora deba saber"
                                />
                            </div>
                        </div>
                    </section>

                    {/* 2. Tipo */}
                    <section className="ui-section">
                        <div className="ui-section-head">
                            <span className="ui-step" aria-hidden="true">2</span>
                            <div>
                                <h4 className="ui-section-title">Tipo de promoción</h4>
                                <p className="ui-section-desc">Cómo se arma el regalo del paquete.</p>
                            </div>
                        </div>
                        <div className="ui-choice-grid" role="radiogroup" aria-label="Tipo de promoción">
                            <label className={`ui-choice${formData.type === PromotionType.PACK ? ' is-selected' : ''}`}>
                                <input
                                    type="radio"
                                    name={fieldId('type')}
                                    value={PromotionType.PACK}
                                    checked={formData.type === PromotionType.PACK}
                                    onChange={() => handleChange('type', PromotionType.PACK)}
                                />
                                <span className="material-icons-round ui-choice-icon" aria-hidden="true">redeem</span>
                                <span className="ui-choice-text">
                                    <span className="ui-choice-title">Concreta (Fija)</span>
                                    <span className="ui-choice-desc">Regalos definidos de antemano. Ej: compra A y recibe B.</span>
                                </span>
                            </label>
                            <label className={`ui-choice${isAssortment ? ' is-selected' : ''}`}>
                                <input
                                    type="radio"
                                    name={fieldId('type')}
                                    value={PromotionType.BUY_GET_FREE}
                                    checked={isAssortment}
                                    onChange={() => handleChange('type', PromotionType.BUY_GET_FREE)}
                                />
                                <span className="material-icons-round ui-choice-icon" aria-hidden="true">dashboard_customize</span>
                                <span className="ui-choice-text">
                                    <span className="ui-choice-title">Surtido (Variable)</span>
                                    <span className="ui-choice-desc">Paquete a precio fijo: la vendedora escoge los productos gratis al vender.</span>
                                </span>
                            </label>
                        </div>
                    </section>

                    {/* 3. Paquete: producto principal, cantidad y precio */}
                    <section className="ui-section">
                        <div className="ui-section-head">
                            <span className="ui-step" aria-hidden="true">3</span>
                            <div>
                                <h4 className="ui-section-title">Paquete</h4>
                                <p className="ui-section-desc">Producto principal, cuántas unidades incluye y su precio.</p>
                            </div>
                        </div>
                        <div className="ui-grid">
                            <div className="ui-field ui-span-full">
                                <label className="ui-label" htmlFor={fieldId('mainProduct')}>Producto principal <span className="ui-required">*</span></label>
                                {loadingProducts ? (
                                    <div className="pmf-skeleton">
                                        <span className="ui-spinner ui-spinner--sm" aria-hidden="true" />
                                        Cargando productos...
                                    </div>
                                ) : (
                                    <SearchableSelect
                                        id={fieldId('mainProduct')}
                                        value={formData.mainProductId}
                                        onChange={(e) => handleChange('mainProductId', e.target.value)}
                                        options={selectableProducts.map(product => ({
                                            value: product.id,
                                            label: `${product.nombre ?? ''} - $${parseFloat(product.precio).toFixed(2)} (Stock: ${product.stock ?? ''})`,
                                            description: productDescription(product, false),
                                        }))}
                                        placeholder="Seleccione un producto"
                                        searchPlaceholder="Escribe el nombre del producto…"
                                        noResultsText="Ningún producto coincide"
                                        required
                                    />
                                )}
                            </div>
                            <div className="ui-field">
                                <label className="ui-label" htmlFor={fieldId('buyQuantity')}>Cantidad a comprar <span className="ui-required">*</span></label>
                                <input
                                    id={fieldId('buyQuantity')}
                                    className="ui-input"
                                    type="number"
                                    inputMode="numeric"
                                    value={formData.buyQuantity}
                                    onChange={(e) => handleChange('buyQuantity', e.target.value)}
                                    min="1"
                                    required
                                    onWheel={(e) => e.target.blur()}
                                />
                                <small className="ui-help">Unidades del producto principal en el paquete.</small>
                            </div>
                            <div className="ui-field">
                                <label className="ui-label" htmlFor={fieldId('packPrice')}>
                                    Precio del paquete {isAssortment
                                        ? <span className="ui-required">*</span>
                                        : <span className="ui-optional">(opcional)</span>}
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
                                        value={formData.packPrice}
                                        onChange={(e) => handleChange('packPrice', e.target.value)}
                                        placeholder={isAssortment ? '0' : 'Precio regular'}
                                        required={isAssortment}
                                        onWheel={(e) => e.target.blur()}
                                    />
                                </div>
                                <small className="ui-help">
                                    {isAssortment
                                        ? `Precio total del paquete: incluye ${buyQty} del producto principal y hasta ${freeQty} productos gratis a elección`
                                        : 'Déjalo vacío para usar el precio regular.'}
                                    {formData.packPrice !== '' && formData.packPrice !== null && !isNaN(parseFloat(formData.packPrice)) && (
                                        <strong className="pmf-price-preview"> ${formatCurrency(formData.packPrice)}</strong>
                                    )}
                                </small>
                            </div>
                        </div>
                    </section>

                    {/* 4. Regalos (Fija) o productos gratis (Surtido) */}
                    <section className="ui-section">
                        <div className="ui-section-head">
                            <span className="ui-step" aria-hidden="true">4</span>
                            <div>
                                <h4 className="ui-section-title">{isAssortment ? 'Productos gratis a elección' : 'Productos de regalo'}</h4>
                                <p className="ui-section-desc">{isAssortment
                                    ? 'Van a $0 dentro del paquete y descuentan inventario.'
                                    : 'Lo que el cliente recibe gratis con el paquete.'}</p>
                            </div>
                        </div>

                        {!isAssortment ? (
                            <div className="pmf-gifts">
                                {formData.giftItems.length > 0 ? (
                                    <ul className="pmf-gift-list">
                                        {formData.giftItems.map(item => {
                                            const product = products.find(p => p.id === item.productId);
                                            const name = product ? product.nombre : 'Producto desconocido';
                                            return (
                                                <li key={item.tempId} className="pmf-gift-item">
                                                    <span className="ui-badge ui-badge--primary pmf-gift-qty">{item.quantity}x</span>
                                                    <span className="pmf-gift-name">{name}</span>
                                                    <button
                                                        type="button"
                                                        className="ui-icon-btn ui-icon-btn--danger"
                                                        onClick={() => handleRemoveGift(item.tempId)}
                                                        title="Quitar regalo"
                                                        aria-label={`Quitar ${name}`}
                                                    >
                                                        <span className="material-icons-round" aria-hidden="true">delete_outline</span>
                                                    </button>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                ) : (
                                    <p className="pmf-empty-note">Aún no hay regalos. Agrega al menos uno.</p>
                                )}

                                <div className="pmf-add-gift">
                                    <div className="ui-field">
                                        <label className="ui-label" htmlFor={fieldId('giftProduct')}>Añadir producto gratis</label>
                                        <SearchableSelect
                                            id={fieldId('giftProduct')}
                                            value={newGift.productId}
                                            onChange={(e) => setNewGift(prev => ({ ...prev, productId: e.target.value }))}
                                            options={activeProducts.map(product => ({
                                                value: product.id,
                                                label: product.nombre,
                                                description: productDescription(product, true),
                                            }))}
                                            placeholder="Seleccione producto..."
                                            searchPlaceholder="Escribe el nombre del producto…"
                                            noResultsText="Ningún producto coincide"
                                        />
                                    </div>
                                    <div className="ui-field">
                                        <label className="ui-label" htmlFor={fieldId('giftQty')}>Cantidad</label>
                                        <input
                                            id={fieldId('giftQty')}
                                            className="ui-input"
                                            type="number"
                                            inputMode="numeric"
                                            value={newGift.quantity}
                                            onChange={(e) => setNewGift(prev => ({ ...prev, quantity: parseInt(e.target.value) || 0 }))}
                                            min="1"
                                            onWheel={(e) => e.target.blur()}
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleAddGift}
                                        className="ui-btn ui-btn--secondary pmf-add-gift-btn"
                                        disabled={!newGift.productId || newGift.quantity <= 0}
                                    >
                                        <span className="material-icons-round" aria-hidden="true">add</span>
                                        Agregar
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="ui-grid">
                                <div className="ui-field">
                                    <label className="ui-label" htmlFor={fieldId('freeQuantity')}>Cantidad Total a Bonificar <span className="ui-required">*</span></label>
                                    <input
                                        id={fieldId('freeQuantity')}
                                        type="number"
                                        inputMode="numeric"
                                        min="1"
                                        className="ui-input pmf-input-big"
                                        value={formData.freeQuantity}
                                        onChange={(e) => handleChange('freeQuantity', e.target.value)}
                                        placeholder="0"
                                        required
                                        onWheel={(e) => e.target.blur()}
                                    />
                                </div>
                                <div className="ui-alert ui-alert--info pmf-callout">
                                    <span className="material-icons-round" aria-hidden="true">info</span>
                                    <p>
                                        Al vender, la vendedora escoge <strong>hasta {freeQty}</strong> productos de cualquier
                                        tipo del catálogo. No se cobran aparte: el total es el precio del paquete.
                                    </p>
                                </div>
                            </div>
                        )}
                    </section>

                    {/* 5. Visibilidad por vendedora */}
                    <section className="ui-section">
                        <div className="ui-section-head">
                            <span className="ui-step" aria-hidden="true">5</span>
                            <div>
                                <h4 className="ui-section-title">¿Quién ve esta promoción?</h4>
                                <p className="ui-section-desc">Admin y owner siempre la pueden usar.</p>
                            </div>
                        </div>
                        <div className="ui-choice-grid" role="radiogroup" aria-label="¿Quién ve esta promoción?">
                            <label className={`ui-choice ui-choice--compact${formData.visibleToAll ? ' is-selected' : ''}`}>
                                <input
                                    type="radio"
                                    name={fieldId('visibility')}
                                    checked={formData.visibleToAll}
                                    onChange={() => handleChange('visibleToAll', true)}
                                />
                                <span className="material-icons-round ui-choice-icon" aria-hidden="true">groups</span>
                                <span className="ui-choice-text">
                                    <span className="ui-choice-title">Todas las vendedoras</span>
                                    <span className="ui-choice-desc">Cualquier vendedora la ve y la puede vender.</span>
                                </span>
                            </label>
                            <label className={`ui-choice ui-choice--compact${!formData.visibleToAll ? ' is-selected' : ''}`}>
                                <input
                                    type="radio"
                                    name={fieldId('visibility')}
                                    checked={!formData.visibleToAll}
                                    onChange={() => handleChange('visibleToAll', false)}
                                />
                                <span className="material-icons-round ui-choice-icon" aria-hidden="true">person_search</span>
                                <span className="ui-choice-text">
                                    <span className="ui-choice-title">Solo las seleccionadas</span>
                                    <span className="ui-choice-desc">Solo las vendedoras que elijas abajo.</span>
                                </span>
                            </label>
                        </div>
                        {!formData.visibleToAll && (
                            <div className="pmf-vendors">
                                <VendorMultiSelect
                                    selectedIds={formData.allowedVendorIds}
                                    onChange={(ids) => handleChange('allowedVendorIds', ids)}
                                    nameHints={vendorNameHints}
                                    emptyWarning="Ninguna vendedora la verá; solo admin"
                                    sharedUsersHint
                                />
                            </div>
                        )}
                    </section>

                    {/* 6. Vigencia y opciones */}
                    <section className="ui-section">
                        <div className="ui-section-head">
                            <span className="ui-step" aria-hidden="true">6</span>
                            <div>
                                <h4 className="ui-section-title">Vigencia y opciones</h4>
                                <p className="ui-section-desc">Déjalas en blanco para que la promoción no venza.</p>
                            </div>
                        </div>
                        <div className="ui-grid">
                            <div className="ui-field">
                                <label className="ui-label" htmlFor={fieldId('validFrom')}>Fecha de inicio</label>
                                <input
                                    id={fieldId('validFrom')}
                                    className="ui-input"
                                    type="datetime-local"
                                    value={formData.validFrom}
                                    onChange={(e) => handleChange('validFrom', e.target.value)}
                                />
                            </div>
                            <div className="ui-field">
                                <label className="ui-label" htmlFor={fieldId('validUntil')}>Fecha de fin</label>
                                <input
                                    id={fieldId('validUntil')}
                                    className="ui-input"
                                    type="datetime-local"
                                    value={formData.validUntil}
                                    onChange={(e) => handleChange('validUntil', e.target.value)}
                                />
                            </div>
                            <label className="ui-switch ui-span-full">
                                <input
                                    type="checkbox"
                                    checked={formData.allowStackWithDiscounts}
                                    onChange={(e) => handleChange('allowStackWithDiscounts', e.target.checked)}
                                />
                                <span className="ui-switch-track" aria-hidden="true"><span className="ui-switch-thumb" /></span>
                                <span className="ui-switch-text">
                                    <span className="ui-switch-title">Permitir combinar con descuentos</span>
                                    <span className="ui-switch-desc">Marca informativa: se muestra en la tarjeta de la promoción.</span>
                                </span>
                            </label>
                        </div>
                    </section>
                </form>

                <footer className="ui-modal-footer">
                    <button type="button" onClick={onClose} className="ui-btn ui-btn--secondary">
                        Cancelar
                    </button>
                    <button type="submit" form={fieldId('form')} disabled={loading} className="ui-btn ui-btn--primary">
                        {loading
                            ? <span className="ui-spinner" aria-hidden="true" />
                            : <span className="material-icons-round" aria-hidden="true">save</span>}
                        {loading ? 'Guardando...' : (promotion ? 'Guardar cambios' : 'Crear promoción')}
                    </button>
                </footer>
            </div>
        </div>
    );
}

export default PromotionFormModal;
