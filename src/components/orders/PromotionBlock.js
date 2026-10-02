import React from 'react';
import { formatCurrency } from '../../utils/formatters';
import '../../styles/areas/PromotionBlock.css';

const PromotionBlock = ({
    promotionInstanceId,
    promotionName,
    promotionGroupIndex,
    items,
    price,
    onDelete,
    isEditable
}) => {
    console.log('Rendering PromotionBlock:', { id: promotionInstanceId, itemsLength: items.length });

    return (
        <div className="promo-block">
            <div className="promo-block-header">
                <h4 className="promo-block-title">
                    <span className="material-icons-round promo-block-icon" aria-hidden="true">campaign</span>
                    {promotionName}
                    {promotionGroupIndex > 0 && (
                        <span className="promo-block-index">#{promotionGroupIndex}</span>
                    )}
                    <span className="promo-block-count">
                        ({items.length} productos)
                    </span>
                </h4>

                <div className="promo-block-actions">
                    <span className="promo-block-price">
                        ${formatCurrency(price)}
                    </span>

                    {isEditable && (
                        <button
                            type="button"
                            onClick={() => onDelete(promotionInstanceId)}
                            className="ui-btn ui-btn--danger-ghost ui-btn--sm"
                        >
                            <span className="material-icons-round" aria-hidden="true">delete</span>
                            Eliminar
                        </button>
                    )}
                </div>
            </div>

            <div className="promo-block-table-wrap">
                <table className="ui-table ui-table--compact promo-block-table">
                    <thead>
                        <tr>
                            <th>Producto</th>
                            <th className="promo-block-qty">Cant.</th>
                            <th className="ui-num">Subtotal</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map(item => (
                            <tr key={item.id}>
                                <td>
                                    <div className="promo-block-item-name">{item.productName}</div>
                                    {item.cantidadPendiente > 0 && (
                                        <div className="promo-block-pending">
                                            <span className="material-icons-round" aria-hidden="true">warning</span>
                                            Pendiente: {item.cantidadPendiente}
                                        </div>
                                    )}
                                </td>
                                <td className="promo-block-qty">
                                    {item.cantidad}
                                </td>
                                <td className="ui-num">
                                    ${formatCurrency(item.subtotal || (item.precioUnitario * item.cantidad))}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default PromotionBlock;
