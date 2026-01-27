import { useState, useEffect } from 'react';
import { getPromotionTypeLabel, PromotionType } from '../utils/types';
import promotionService from '../api/promotionService';
import { useToast } from './ToastContainer';
import '../styles/Promotions.css';

function VendedorPromotionsCatalog({ onAddToCart }) {
    const [promotions, setPromotions] = useState([]);
    const [loading, setLoading] = useState(true);
    const toast = useToast();

    useEffect(() => {
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
    }, [toast]);

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

    return (
        <div className="promotions-catalog">
            <h3>
                <span className="material-icons-round" style={{ color: '#e11d48' }}>local_offer</span>
                Promociones Disponibles
            </h3>

            <div className="promotions-grid-compact">
                {promotions.map(promotion => (
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
                                <span className="promotion-price-tag">${parseFloat(promotion.packPrice).toFixed(2)}</span>
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
        </div>
    );
}

export default VendedorPromotionsCatalog;
