import { useState, useEffect } from 'react';
import { formatCurrency } from '../utils/formatters';
import { getPromotionTypeLabel, PromotionType } from '../utils/types';
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
        return <div className="loading-inline">Cargando promociones...</div>;
    }

    if (promotions.length === 0) {
        return (
            <div className="empty-state-promotions">
                <span className="material-icons-round" style={{ fontSize: '2rem', color: 'var(--text-muted)' }}>local_offer</span>
                <p>No hay promociones disponibles en este momento</p>
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
            <h3>
                <span className="material-icons-round" style={{ color: '#e11d48' }}>local_offer</span>
                Promociones Disponibles
            </h3>

            {/* Buscador de Promociones con botón limpiar */}
            <div className="search-container search-container-sm">
                <span className="material-icons-round search-icon">search</span>
                <input
                    type="text"
                    placeholder="Buscar promociones..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="search-input search-input-sm"
                />
                {searchTerm && (
                    <button
                        type="button"
                        className="search-clear-btn"
                        onClick={() => setSearchTerm('')}
                        title="Limpiar búsqueda"
                        aria-label="Limpiar búsqueda"
                    >
                        <span className="material-icons-round">close</span>
                    </button>
                )}
            </div>

            {filteredPromotions.length === 0 ? (
                <div className="empty-state-promotions">
                    <span className="material-icons-round" style={{ fontSize: '2rem', color: 'var(--text-muted)' }}>search_off</span>
                    <p>No se encontraron promociones</p>
                </div>
            ) : (
            <div className="promotions-grid-compact">
                {filteredPromotions.map(promotion => (
                    <div key={promotion.id} className="promotion-card compact">
                        <div className="promotion-header-compact">
                            <h4 className="promotion-title">{promotion.nombre}</h4>
                            <span className={`promotion-badge type-${promotion.type.toLowerCase().replace('_', '-')}`}>
                                {getPromotionTypeLabel(promotion.type)}
                            </span>
                        </div>

                        <div className="promotion-desc-compact">
                            <div style={{ marginBottom: '4px' }}>Compra {promotion.buyQuantity} {promotion.mainProduct?.nombre}</div>
                            <div style={{ color: 'var(--success)', fontWeight: 'bold' }}>
                                Recibe Gratis:
                                {promotion.type === PromotionType.PACK ? (
                                    promotion.giftItems && promotion.giftItems.length > 0 ? (
                                        <ul style={{ margin: '4px 0 0 0', paddingLeft: '1.2rem', fontSize: '0.8rem' }}>
                                            {promotion.giftItems.map((gift, idx) => (
                                                <li key={idx}>
                                                    {gift.quantity}x {gift.product ? gift.product.nombre : 'Producto'}
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}> Sin regalos definidos</span>
                                    )
                                ) : (
                                    <span> {promotion.freeQuantity} Unidades a Elección</span>
                                )}
                            </div>
                        </div>

                        {promotion.mainProduct && (
                            <div className="promotion-product-compact">
                                {promotion.mainProduct.imageUrl && (
                                    <img src={promotion.mainProduct.imageUrl} alt="" className="product-thumb" onError={(e) => e.target.style.display = 'none'} />
                                )}
                                <span>{promotion.mainProduct.nombre}</span>
                            </div>
                        )}

                        <div className="promotion-footer-compact">
                            {promotion.packPrice && (
                                <span className="promotion-price-tag">${formatCurrency(promotion.packPrice)}</span>
                            )}
                            <button
                                className="btn-add-promo"
                                onClick={() => onAddToCart(promotion)}
                            >
                                <span className="material-icons-round">add_shopping_cart</span>
                                Agregar
                            </button>
                        </div>
                    </div>
                ))}
            </div>
            )}
        </div>
    );
}

export default VendedorPromotionsCatalog;
