/**
 * Detalle de un paquete SURTIDO en el carrito: qué incluye (producto principal x buyQuantity,
 * dentro del precio del paquete) y los productos gratis escogidos ($0).
 */
function AssortmentCartDetail({ promo }) {
    const freeItems = Array.isArray(promo?.freeItems) ? promo.freeItems : [];

    return (
        <div className="assortment-cart-detail" style={{ fontSize: '0.75rem', color: '#475569', marginTop: '2px', lineHeight: 1.4 }}>
            <div>Incluye {promo?.buyQuantity} × {promo?.mainProduct?.nombre || 'producto principal'}</div>
            {freeItems.length === 0 ? (
                <div style={{ color: '#94a3b8' }}>Sin productos gratis escogidos</div>
            ) : (
                <ul style={{ margin: '2px 0 0', paddingLeft: '1rem' }}>
                    {freeItems.map(item => (
                        <li key={item.productId}>
                            {item.nombre} × {item.cantidad}{' '}
                            <span style={{ color: '#15803d', fontWeight: 700 }}>$0 GRATIS</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

export default AssortmentCartDetail;
