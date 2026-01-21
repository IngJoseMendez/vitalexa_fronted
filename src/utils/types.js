import PropTypes from 'prop-types';

// Promotion Types
export const PromotionType = {
    PACK: 'PACK',
    BUY_GET_FREE: 'BUY_GET_FREE'
};

// Order Status Types
export const OrdenStatus = {
    PENDIENTE: 'PENDIENTE',
    PENDING_PROMOTION_COMPLETION: 'PENDING_PROMOTION_COMPLETION',
    CONFIRMADO: 'CONFIRMADO',
    COMPLETADO: 'COMPLETADO',
    CANCELADO: 'CANCELADO'
};

// PropTypes definitions
export const ProductShape = PropTypes.shape({
    id: PropTypes.string.isRequired,
    nombre: PropTypes.string.isRequired,
    descripcion: PropTypes.string,
    precio: PropTypes.number.isRequired,
    stock: PropTypes.number.isRequired,
    imageUrl: PropTypes.string,
    active: PropTypes.bool
});

export const PromotionShape = PropTypes.shape({
    id: PropTypes.string.isRequired,
    nombre: PropTypes.string.isRequired,
    descripcion: PropTypes.string,
    type: PropTypes.oneOf(['PACK', 'BUY_GET_FREE']).isRequired,
    buyQuantity: PropTypes.number.isRequired,
    freeQuantity: PropTypes.number.isRequired,
    packPrice: PropTypes.number,
    mainProduct: ProductShape.isRequired,
    freeProduct: ProductShape,
    allowStackWithDiscounts: PropTypes.bool,
    requiresAssortmentSelection: PropTypes.bool,
    active: PropTypes.bool.isRequired,
    validFrom: PropTypes.string,
    validUntil: PropTypes.string,
    createdAt: PropTypes.string,
    isValid: PropTypes.bool
});

export const OrderItemShape = PropTypes.shape({
    id: PropTypes.string,
    productId: PropTypes.string.isRequired,
    productName: PropTypes.string.isRequired,
    cantidad: PropTypes.number.isRequired,
    precioUnitario: PropTypes.number,
    outOfStock: PropTypes.bool,
    estimatedArrivalDate: PropTypes.string,
    estimatedArrivalNote: PropTypes.string,
    promotion: PromotionShape,
    isPromotionItem: PropTypes.bool,
    isFreeItem: PropTypes.bool
});

// Helper functions
export const getStatusBadgeClass = (status) => {
    const statusMap = {
        [OrdenStatus.PENDIENTE]: 'status-pendiente',
        [OrdenStatus.PENDING_PROMOTION_COMPLETION]: 'status-pending-promo',
        [OrdenStatus.CONFIRMADO]: 'status-confirmado',
        [OrdenStatus.COMPLETADO]: 'status-completado',
        [OrdenStatus.CANCELADO]: 'status-cancelado'
    };
    return statusMap[status] || 'status-default';
};

export const getStatusLabel = (status) => {
    const labelMap = {
        [OrdenStatus.PENDIENTE]: 'Pendiente',
        [OrdenStatus.PENDING_PROMOTION_COMPLETION]: 'Pendiente Surtidos',
        [OrdenStatus.CONFIRMADO]: 'Confirmado',
        [OrdenStatus.COMPLETADO]: 'Completado',
        [OrdenStatus.CANCELADO]: 'Cancelado'
    };
    return labelMap[status] || status;
};

export const getPromotionTypeLabel = (type) => {
    const labelMap = {
        [PromotionType.PACK]: 'Pack',
        [PromotionType.BUY_GET_FREE]: 'Compra y Recibe'
    };
    return labelMap[type] || type;
};

export const isPromotionValid = (promotion) => {
    if (!promotion) return false;

    const now = new Date();
    const validFrom = promotion.validFrom ? new Date(promotion.validFrom) : null;
    const validUntil = promotion.validUntil ? new Date(promotion.validUntil) : null;

    if (validFrom && now < validFrom) return false;
    if (validUntil && now > validUntil) return false;

    return promotion.active;
};
