import '../styles/areas/AssortmentCartDetail.css';

/**
 * Detalle de un paquete SURTIDO en el carrito: qué incluye (producto principal x buyQuantity,
 * dentro del precio del paquete) y los productos gratis escogidos ($0).
 */
function AssortmentCartDetail({ promo }) {
    const freeItems = Array.isArray(promo?.freeItems) ? promo.freeItems : [];

    return (
        <div className="assortment-cart-detail">
            <div>Incluye {promo?.buyQuantity} × {promo?.mainProduct?.nombre || 'producto principal'}</div>
            {freeItems.length === 0 ? (
                <div className="assortment-cart-detail-empty">Sin productos gratis escogidos</div>
            ) : (
                <ul className="assortment-cart-detail-list">
                    {freeItems.map(item => (
                        <li key={item.productId}>
                            {item.nombre} × {item.cantidad}{' '}
                            <span className="assortment-cart-detail-free">$0 GRATIS</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

export default AssortmentCartDetail;
