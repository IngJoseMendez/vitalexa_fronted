import React from 'react';
import { formatCurrency } from '../../utils/formatters';

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
        <div style={{
            marginBottom: '1.5rem',
            border: '1px solid #d1fae5',
            borderRadius: '8px',
            background: 'white' // Ensure background is white
        }}>
            <div style={{
                background: '#ecfdf5',
                padding: '0.75rem 1rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid #d1fae5',
                borderTopLeftRadius: '8px', // Replicate radius since overflow is gone
                borderTopRightRadius: '8px'
            }}>
                <h4 style={{
                    margin: 0,
                    color: '#065f46',
                    fontSize: '0.95rem',
                    display: 'flex',
                    alignItems: 'center'
                }}>
                    <span className="material-icons-round" style={{ marginRight: '6px', fontSize: '18px' }}>campaign</span>
                    {promotionName}
                    {promotionGroupIndex > 0 && (
                        <span style={{ marginLeft: '4px', fontWeight: 'bold' }}>#{promotionGroupIndex}</span>
                    )}
                    <span style={{ marginLeft: '10px', fontSize: '0.8rem', color: '#6b7280' }}>
                        ({items.length} productos)
                    </span>
                </h4>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontWeight: 'bold', color: '#059669' }}>
                        ${formatCurrency(price)}
                    </span>

                    {isEditable && (
                        <button
                            type="button"
                            onClick={() => onDelete(promotionInstanceId)}
                            style={{
                                background: '#fee2e2',
                                border: '1px solid #fecaca',
                                color: '#b91c1c',
                                borderRadius: '4px',
                                padding: '4px 8px',
                                fontSize: '0.8rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                            }}
                        >
                            <span className="material-icons-round" style={{ fontSize: '14px' }}>delete</span>
                            Eliminar
                        </button>
                    )}
                </div>
            </div>

            {/* Remove inline width 100% if css handles it, but keeps explicit just in case. Remove collapse to allow spacing. */}
            <table className="eo-items-table">
                <thead>
                    <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '0.8rem', color: '#6b7280' }}>Producto</th>
                        <th style={{ padding: '8px 12px', width: '80px', textAlign: 'center', fontSize: '0.8rem', color: '#6b7280' }}>Cant.</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: '0.8rem', color: '#6b7280' }}>Subtotal</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map(item => (
                        <tr key={item.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '8px 12px' }}>
                                <div className="eo-item-name" style={{ fontWeight: 500 }}>{item.productName}</div>
                                {item.cantidadPendiente > 0 && (
                                    <div style={{ fontSize: '0.75rem', color: '#dc2626', display: 'flex', alignItems: 'center', marginTop: '2px' }}>
                                        <span className="material-icons-round" style={{ fontSize: '12px', marginRight: '2px' }}>warning</span>
                                        Pendiente: {item.cantidadPendiente}
                                    </div>
                                )}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                {item.cantidad}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                                ${formatCurrency(item.subtotal || (item.precioUnitario * item.cantidad))}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default PromotionBlock;
