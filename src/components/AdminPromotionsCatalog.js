import { useState, useEffect } from 'react';
import { formatCurrency } from '../utils/formatters';
import { getPromotionTypeLabel, PromotionType } from '../utils/types';
import promotionService from '../api/promotionService';
import specialPromotionService from '../api/specialPromotionService';
import { useToast } from './ToastContainer';
import '../styles/Promotions.css';

function AdminPromotionsCatalog({ onAddToCart }) {
    const [promotions, setPromotions] = useState([]);
    const [loading, setLoading] = useState(true);
    const toast = useToast();

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

                // Add 'isSpecial' flag to special promotions for UI distinction
                const markedSpecialPromos = specialPromos.map(p => ({ ...p, isSpecial: true }));

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
        return <div className="loading-inline">Cargando promociones...</div>;
    }

    if (promotions.length === 0) {
        return (
            <div className="empty-state-promotions">
                <span className="material-icons-round" style={{ fontSize: '2rem', color: 'var(--text-muted)' }}>local_offer</span>
                <p>No hay promociones disponibles activas</p>
            </div>
        );
    }

    return (
        <div className="promotions-catalog" style={{ background: '#f0f9ff', borderColor: '#bae6fd' }}>
            <h3>
                <span className="material-icons-round" style={{ color: '#0ea5e9' }}>local_offer</span>
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
                            {promotion.isSpecial && (
                                <span className="promotion-badge" style={{ background: '#7c3aed', color: 'white', marginLeft: '5px' }}>
                                    ESPECIAL
                                </span>
                            )}
                        </div>

                        <div className="promotion-desc-compact">
                            <div style={{ marginBottom: '4px' }}>
                                Compra {promotion.buyQuantity} {promotion.mainProduct?.nombre}
                            </div>
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
                                style={{ background: '#0ea5e9' }}
                                onClick={() => onAddToCart(promotion)}
                                onMouseOver={(e) => e.currentTarget.style.background = '#0284c7'}
                                onMouseOut={(e) => e.currentTarget.style.background = '#0ea5e9'}
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

export default AdminPromotionsCatalog;
