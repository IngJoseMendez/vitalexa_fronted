import { useState, useEffect } from 'react';
import { formatCurrency } from '../utils/formatters';
import { getPromotionTypeLabel, PromotionType } from '../utils/types';
import { describeAssortment, getAssortmentFreeLimit, isAssortmentPromotion } from '../utils/assortmentPromotion';
import promotionService from '../api/promotionService';
import specialPromotionService from '../api/specialPromotionService';
import { useToast } from './ToastContainer';
import { isSpecialVisibleToAll, isVisibleToAll } from '../utils/promotionFilters';
import { toCatalogSpecialPromotion } from '../utils/vendorPromotionCatalog';
import '../styles/Promotions.css';

/**
 * Vendedoras que ven la promoción en su panel.
 * - Normal: "Todas" (visibleToAll, o backend anterior sin el campo) o las asignadas.
 * - Especial: "Todas" solo si visibleToAll === true; si no, sus vendedoras asignadas (sin
 *   ninguna, ninguna vendedora la ve).
 */
export function VendorChips({ promotion }) {
    const names = Array.isArray(promotion?.allowedVendorNames) ? promotion.allowedVendorNames : [];
    const showAll = promotion?.isSpecial ? isSpecialVisibleToAll(promotion) : isVisibleToAll(promotion);
    let content;
    if (showAll) {
        content = <span className="ui-badge ui-badge--success">Todas</span>;
    } else if (names.length > 0) {
        content = names.map((name, i) => <span key={`${name}-${i}`} className="ui-badge ui-badge--neutral">{name}</span>);
    } else {
        content = (
            <span className="ui-badge ui-badge--warning">
                {promotion?.isSpecial ? 'Sin vendedoras' : 'Ninguna (solo admin)'}
            </span>
        );
    }
    return (
        <div className="promo-vendors">
            <span className="promo-vendors-label">
                <span className="material-icons-round" aria-hidden="true">visibility</span>
                Vendedoras:
            </span>
            {content}
        </div>
    );
}

function AdminPromotionsCatalog({ onAddToCart, searchTerm = '' }) {
    const [promotions, setPromotions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [quantities, setQuantities] = useState({});
    const toast = useToast();

    const getQty = (promoId) => quantities[promoId] ?? 1;

    const handleQtyChange = (promoId, value) => {
        if (value === '') {
            setQuantities(prev => ({ ...prev, [promoId]: '' }));
            return;
        }
        const num = parseInt(value);
        if (!isNaN(num) && num >= 1) {
            setQuantities(prev => ({ ...prev, [promoId]: num }));
        }
    };

    const handleAdd = (promotion) => {
        const qty = parseInt(getQty(promotion.id)) || 1;
        onAddToCart(promotion, qty);
        // Resetear cantidad a 1 después de agregar
        setQuantities(prev => ({ ...prev, [promotion.id]: 1 }));
    };

    useEffect(() => {
        const fetchPromotions = async () => {
            try {
                setLoading(true);
                // Fetch standard and special promotions in parallel
                const [standardRes, specialRes] = await Promise.all([
                    promotionService.getValidAdmin(),
                    specialPromotionService.getVendorPromotions(0, 100) // Fetch up to 100 special promos
                ]);

                const standardPromos = standardRes.data || [];

                // Helper to extract content from paginated or list response
                let specialPromos = [];
                const spData = specialRes.data;
                if (Array.isArray(spData)) {
                    specialPromos = spData;
                } else if (spData && spData.content) {
                    specialPromos = spData.content;
                }

                // Igual que en el catálogo de la vendedora: la especial toma tipo, cantidad,
                // producto principal, regalos y gratis del surtido (freeQuantity) de su promoción
                // base (parentPromotion), y conserva su id, nombre, precio, vendedoras e isSpecial.
                // Sin esto el surtido de una especial no tenía mainProduct ni freeQuantity y el
                // modal de gratis bloqueaba "Agregar paquete" (mal configurada).
                const markedSpecialPromos = specialPromos.map(toCatalogSpecialPromotion).filter(Boolean);

                setPromotions([...standardPromos, ...markedSpecialPromos]);
            } catch (error) {
                console.error('Error al cargar promociones:', error);
                toast.error('Error al cargar promociones disponibles');
            } finally {
                setLoading(false);
            }
        };

        fetchPromotions();
    }, [toast]);

    if (loading) {
        return (
            <div className="ui-loading">
                <span className="ui-spinner" aria-hidden="true" />
                Cargando promociones...
            </div>
        );
    }

    if (promotions.length === 0) {
        return (
            <div className="ui-empty promo-catalog-empty">
                <span className="material-icons-round ui-empty-icon" aria-hidden="true">local_offer</span>
                <p className="ui-empty-text">No hay promociones disponibles activas</p>
            </div>
        );
    }

    // Filtrar por el término de búsqueda compartido con el catálogo de productos
    const term = (searchTerm || '').toLowerCase().trim();
    const filteredPromotions = term
        ? promotions.filter(p =>
            (p.nombre || '').toLowerCase().includes(term) ||
            (p.mainProduct?.nombre || '').toLowerCase().includes(term)
          )
        : promotions;

    return (
        <div className="promotions-catalog">
            <h3 className="promo-catalog-title">
                <span className="material-icons-round" aria-hidden="true">local_offer</span>
                Promociones Disponibles
            </h3>

            {filteredPromotions.length === 0 ? (
                <div className="ui-empty promo-catalog-empty">
                    <span className="material-icons-round ui-empty-icon" aria-hidden="true">search_off</span>
                    <p className="ui-empty-text">No se encontraron promociones</p>
                </div>
            ) : (
            <div className="promotions-grid-compact">
                {filteredPromotions.map(promotion => (
                    <article key={promotion.id} className="ui-card promotion-card promo-catalog-card">
                        <div className="promotion-header-compact">
                            <h4 className="promotion-title">{promotion.nombre}</h4>
                            <span className="ui-badge ui-badge--neutral">
                                {getPromotionTypeLabel(promotion.type)}
                            </span>
                            {promotion.isSpecial && (
                                <span className="ui-badge ui-badge--primary">
                                    ESPECIAL
                                </span>
                            )}
                        </div>

                        {/* A qué vendedoras les aparece (admin/owner pueden venderla igual a nombre de cualquiera) */}
                        <VendorChips promotion={promotion} />

                        <div className="promotion-desc-compact">
                            {isAssortmentPromotion(promotion) ? (
                                // Surtido = paquete: el principal va incluido y se escogen los gratis
                                <div className={`promo-catalog-free${getAssortmentFreeLimit(promotion) != null ? '' : ' is-unknown'}`}>
                                    {describeAssortment(promotion)}
                                </div>
                            ) : (
                                <>
                                    <div className="promo-catalog-line">
                                        Compra {promotion.buyQuantity} {promotion.mainProduct?.nombre}
                                    </div>
                                    <div className="promo-catalog-free">
                                        Recibe Gratis:
                                        {promotion.type === PromotionType.PACK ? (
                                            promotion.giftItems && promotion.giftItems.length > 0 ? (
                                                <ul className="promo-catalog-gifts">
                                                    {promotion.giftItems.map((gift, idx) => (
                                                        <li key={idx}>
                                                            {gift.quantity}x {gift.product ? gift.product.nombre : 'Producto'}
                                                        </li>
                                                    ))}
                                                </ul>
                                            ) : (
                                                <span className="promo-catalog-none"> Sin regalos definidos</span>
                                            )
                                        ) : (
                                            <span> {promotion.freeQuantity} Unidades a Elección</span>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>

                        {promotion.mainProduct && (
                            <div className="promotion-product-compact">
                                {promotion.mainProduct.imageUrl && (
                                    <img src={promotion.mainProduct.imageUrl} alt="" className="product-thumb" width="32" height="32" loading="lazy" decoding="async" onError={(e) => e.target.style.display = 'none'} />
                                )}
                                <span>{promotion.mainProduct.nombre}</span>
                            </div>
                        )}

                        <div className="promotion-footer-compact">
                            {promotion.packPrice && (
                                <span className="promotion-price-tag">${formatCurrency(promotion.packPrice)}</span>
                            )}
                            <div className="promo-add-row">
                                <input
                                    type="number"
                                    inputMode="numeric"
                                    min="1"
                                    className="ui-input promo-qty-input"
                                    value={getQty(promotion.id)}
                                    onChange={(e) => handleQtyChange(promotion.id, e.target.value)}
                                    onFocus={(e) => e.target.select()}
                                    onWheel={(e) => e.target.blur()}
                                    onClick={(e) => e.stopPropagation()}
                                    title="Cantidad de promociones a agregar"
                                    aria-label="Cantidad de promociones a agregar"
                                />
                                <button
                                    type="button"
                                    className="ui-btn ui-btn--primary promo-add-btn"
                                    onClick={() => handleAdd(promotion)}
                                    onMouseOver={(e) => e.currentTarget.style.background = 'var(--color-primary-hover)'}
                                    onMouseOut={(e) => e.currentTarget.style.background = ''}
                                    title={`Agregar ${getQty(promotion.id) || 1} vez(ces)`}
                                >
                                    <span className="material-icons-round" aria-hidden="true">add_shopping_cart</span>
                                    Agregar {parseInt(getQty(promotion.id)) > 1 ? `(×${getQty(promotion.id)})` : ''}
                                </button>
                            </div>
                        </div>
                    </article>
                ))}
            </div>
            )}
        </div>
    );
}

export default AdminPromotionsCatalog;
