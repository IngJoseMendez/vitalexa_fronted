import { useState, useEffect } from 'react';
import { formatCurrency } from '../utils/formatters';
import { getPromotionTypeLabel, PromotionType } from '../utils/types';
import { describeAssortment, getAssortmentFreeLimit, isAssortmentPromotion } from '../utils/assortmentPromotion';
import promotionService from '../api/promotionService';
import { useToast } from './ToastContainer';
import '../styles/Promotions.css';

/**
 * Catálogo de promociones para el vendedor.
 *
 * Props:
 *  - onAddToCart: función al agregar una promo al carrito
 *  - initialPromotions: array de promociones ya cargadas (del endpoint /vendedor/init).
 *    - undefined → componente autónomo, hace su propio fetch
 *    - null      → el init padre está cargando, mostrar spinner
 *    - []        → init terminó, sin promociones
 *    - [...]     → init terminó, usar estos datos directamente
 *  - initLoading: boolean, true mientras el padre está cargando el init
 */
function VendedorPromotionsCatalog({ onAddToCart, initialPromotions, initLoading }) {
    const [promotions, setPromotions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const toast = useToast();

    useEffect(() => {
        // Caso 1: el padre controla los datos (initialPromotions no es undefined)
        if (initialPromotions !== undefined) {
            // Mientras el init del padre sigue cargando, mostrar spinner
            if (initLoading) {
                setLoading(true);
                return;
            }
            // Init terminó — usar datos recibidos (null se trata como array vacío)
            setPromotions(initialPromotions || []);
            setLoading(false);
            return;
        }

        // Caso 2: componente autónomo (sin prop initialPromotions) — fetch propio
        const fetchPromotions = async () => {
            try {
                setLoading(true);
                const response = await promotionService.getValid();
                setPromotions(response.data || []);
            } catch (error) {
                console.error('Error al cargar promociones:', error);
                toast.error('Error al cargar promociones disponibles');
            } finally {
                setLoading(false);
            }
        };

        fetchPromotions();
    }, [initialPromotions, initLoading, toast]);

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
                <p className="ui-empty-text">No hay promociones disponibles en este momento</p>
            </div>
        );
    }

    // Filtrar promociones por nombre o producto principal
    const term = searchTerm.trim().toLowerCase();
    const filteredPromotions = term
        ? promotions.filter(p =>
            (p.nombre && p.nombre.toLowerCase().includes(term)) ||
            (p.mainProduct?.nombre && p.mainProduct.nombre.toLowerCase().includes(term))
          )
        : promotions;

    return (
        <div className="promotions-catalog">
            <h3 className="promo-catalog-title">
                <span className="material-icons-round" aria-hidden="true">local_offer</span>
                Promociones Disponibles
            </h3>

            {/* Buscador de Promociones con botón limpiar */}
            <div className="ui-search promo-catalog-search">
                <span className="material-icons-round ui-search-icon" aria-hidden="true">search</span>
                <input
                    type="text"
                    placeholder="Buscar promociones..."
                    aria-label="Buscar promociones"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="ui-input"
                />
                {searchTerm && (
                    <button
                        type="button"
                        className="ui-icon-btn ui-search-clear"
                        onClick={() => setSearchTerm('')}
                        title="Limpiar búsqueda"
                        aria-label="Limpiar búsqueda"
                    >
                        <span className="material-icons-round" aria-hidden="true">close</span>
                    </button>
                )}
            </div>

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
                            {/* Especial asignada a esta vendedora (precio propio, reglas de su promoción base) */}
                            {promotion.isSpecial && (
                                <span className="ui-badge ui-badge--primary">
                                    ESPECIAL
                                </span>
                            )}
                        </div>

                        <div className="promotion-desc-compact">
                            {isAssortmentPromotion(promotion) ? (
                                // Surtido = paquete: el principal va incluido y se escogen los gratis
                                <div className={`promo-catalog-free${getAssortmentFreeLimit(promotion) != null ? '' : ' is-unknown'}`}>
                                    {describeAssortment(promotion)}
                                </div>
                            ) : (
                                <>
                                    <div className="promo-catalog-line">Compra {promotion.buyQuantity} {promotion.mainProduct?.nombre}</div>
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
                            <button
                                type="button"
                                className="ui-btn ui-btn--primary ui-btn--block promo-add-btn"
                                onClick={() => onAddToCart(promotion)}
                            >
                                <span className="material-icons-round" aria-hidden="true">add_shopping_cart</span>
                                Agregar
                            </button>
                        </div>
                    </article>
                ))}
            </div>
            )}
        </div>
    );
}

export default VendedorPromotionsCatalog;
