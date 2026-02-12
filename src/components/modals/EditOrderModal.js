import React, { useState, useEffect, useMemo } from 'react';
import { formatCurrency } from '../../utils/formatters';
import client from '../../api/client';
import { useToast } from '../ToastContainer';
import './EditOrderModal.css';

export default function EditOrderModal({ order, onClose, onSuccess }) {
    const [clients, setClients] = useState([]);
    const [products, setProducts] = useState([]);
    const [productSearch, setProductSearch] = useState('');
    const [isBonifiedMode, setIsBonifiedMode] = useState(false);

    // ✅ Detect Promo Order (using backend field)
    const isPromoOrder = order.isPromotionOrder === true;
    const isHistorical = order.isHistorical === true;

    const [formData, setFormData] = useState({
        clientId: null,
        items: [], // Regular items
        bonifiedItems: [], // ✅ Separate bonified items
        notas: order.notas || '',
        includeFreight: order.includeFreight || false,
        isFreightBonified: order.isFreightBonified || false,
        freightCustomText: order.freightCustomText || '',
        freightQuantity: order.freightQuantity || 1
    });

    const [freightProductSearch, setFreightProductSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [hasChanges, setHasChanges] = useState(false);
    const toast = useToast();

    useEffect(() => {
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fetchData = async () => {
        try {
            const [clientsRes, productsRes] = await Promise.all([
                client.get('/admin/clients'),
                client.get('/admin/products') // Changed to /admin/products to match EditOrderWindow logic
            ]);

            setClients(clientsRes.data);
            setProducts(productsRes.data);

            // Item mapping logic from EditOrderWindow
            const regularItems = [];
            const bonified = [];

            if (order.items) {
                order.items.forEach((item, index) => {
                    const mappedItem = {
                        id: `item-${Date.now()}-${index}`,
                        productId: item.productId || item.product?.id || item.id,
                        productName: item.productName || item.product?.nombre || 'Producto desconocido',
                        cantidad: item.cantidad,
                        precioUnitario: parseFloat(item.precioUnitario || item.precio || 0),
                        isFreightItem: item.isFreightItem || false
                    };

                    if (item.isBonified) {
                        bonified.push({
                            ...mappedItem,
                            precioUnitario: 0
                        });
                    } else {
                        regularItems.push(mappedItem);
                    }
                });
            }

            let currentClientId = null;
            if (order.cliente && order.cliente !== 'Sin cliente') {
                const foundClient = clientsRes.data.find(c =>
                    c.nombre.toLowerCase() === order.cliente.toLowerCase()
                );
                if (foundClient) {
                    currentClientId = foundClient.id;
                }
            }

            setFormData({
                clientId: currentClientId,
                items: regularItems,
                bonifiedItems: bonified,
                notas: order.notas || '',
                includeFreight: order.includeFreight || false,
                isFreightBonified: order.isFreightBonified || false,
                freightCustomText: order.freightCustomText || '',
                freightQuantity: order.freightQuantity || 1
            });

        } catch (error) {
            console.error('Error al cargar datos:', error);
            toast.error('Error al cargar datos');
        } finally {
            setLoading(false);
        }
    };

    // Helper function to get product stock info
    const getProductStock = (productId) => {
        const product = products.find(p => p.id === productId);
        return product ? product.stock : 0;
    };

    // Calculate how much stock is being used by a product across all items
    const getStockUsage = (productId) => {
        const regularQty = formData.items
            .filter(i => i.productId === productId && !i.isFreightItem)
            .reduce((sum, i) => sum + (parseInt(i.cantidad) || 0), 0);

        const bonifiedQty = formData.bonifiedItems
            .filter(i => i.productId === productId)
            .reduce((sum, i) => sum + (parseInt(i.cantidad) || 0), 0);

        const freightQty = formData.items
            .filter(i => i.productId === productId && i.isFreightItem)
            .reduce((sum, i) => sum + (parseInt(i.cantidad) || 0), 0);

        return regularQty + bonifiedQty + freightQty;
    };

    // Calculate original usage from the order (before edits) to credit it back to stock
    const getOriginalUsage = (productId) => {
        if (!order.items) return 0;
        return order.items.reduce((sum, item) => {
            const id = item.productId || item.product?.id || item.id;
            if (id === productId) {
                return sum + (parseFloat(item.cantidad) || 0);
            }
            return sum;
        }, 0);
    };

    const addItem = (product, isFreight = false, isBonified = false) => {
        setHasChanges(true);

        if (isBonified) {
            const existing = formData.bonifiedItems.find(i => i.productId === product.id);
            if (existing) {
                setFormData(prev => ({
                    ...prev,
                    bonifiedItems: prev.bonifiedItems.map(i => i.productId === product.id ? { ...i, cantidad: i.cantidad + 1 } : i)
                }));
            } else {
                const newItem = {
                    id: `item-bon-${Date.now()}-${Math.random()}`,
                    productId: product.id,
                    productName: product.nombre,
                    cantidad: 1,
                    precioUnitario: 0,
                    isFreightItem: false,
                    stock: product.stock  // ✅ Store stock info
                };
                setFormData(prev => ({ ...prev, bonifiedItems: [...prev.bonifiedItems, newItem] }));
            }
        } else {
            const existing = formData.items.find(i => i.productId === product.id && i.isFreightItem === isFreight);

            if (existing) {
                setFormData(prev => ({
                    ...prev,
                    items: prev.items.map(i =>
                        (i.productId === product.id && i.isFreightItem === isFreight)
                            ? { ...i, cantidad: i.cantidad + 1 }
                            : i
                    )
                }));
            } else {
                const newItem = {
                    id: `item-${Date.now()}-${Math.random()}`,
                    productId: product.id,
                    productName: product.nombre,
                    cantidad: 1,
                    precioUnitario: parseFloat(product.precio),
                    isFreightItem: isFreight,
                    stock: product.stock  // ✅ Store stock info
                };

                setFormData(prev => ({
                    ...prev,
                    items: [...prev.items, newItem]
                }));
            }
        }
        toast.success(`Producto ${isBonified ? 'bonificado' : ''} agregado`);
    };

    const removeItem = (itemId, isBonifiedList = false) => {
        setHasChanges(true);
        if (isBonifiedList) {
            setFormData(prev => ({
                ...prev,
                bonifiedItems: prev.bonifiedItems.filter(i => i.id !== itemId)
            }));
        } else {
            setFormData(prev => ({
                ...prev,
                items: prev.items.filter(i => i.id !== itemId)
            }));
        }
    };

    const updateQuantity = (itemId, nuevaCantidad, isBonifiedList = false) => {
        setHasChanges(true);
        // Allow empty string or raw input
        const cantidad = nuevaCantidad;

        if (isBonifiedList) {
            setFormData(prev => ({
                ...prev,
                bonifiedItems: prev.bonifiedItems.map(i => i.id === itemId ? { ...i, cantidad: cantidad } : i)
            }));
        } else {
            setFormData(prev => ({
                ...prev,
                items: prev.items.map(i =>
                    i.id === itemId ? { ...i, cantidad: cantidad } : i
                )
            }));
        }
    };

    const calculateTotal = () => {
        // ✅ Para órdenes promocionales o cuando tenemos el total de la orden,
        // usar el total real en vez de calcular la suma de productos
        if (order.total !== undefined && order.total !== null) {
            return formatCurrency(order.total);
        }

        // Fallback: calcular suma de items (para órdenes nuevas/sin total)
        return formatCurrency(formData.items.reduce((sum, item) => {
            if (item.isFreightItem) return sum;
            const qty = parseFloat(item.cantidad) || 0;
            return sum + (item.precioUnitario * qty);
        }, 0));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Check for empty or 0 quantities before submitting
        // If user left a field empty, we can either warn or just filter it out (remove it).
        // Given user context "I want to empty it to type", if they submit empty, they probably meant 0/remove or forgot.
        // Let's filter out invalid quantities on submit logic below.

        if (formData.items.length === 0 && formData.bonifiedItems.length === 0 && !isPromoOrder) {
            toast.warning('Debe haber al menos un producto en la orden');
            return;
        }

        if (!hasChanges) {
            toast.info('No se han realizado cambios en la orden');
            return;
        }

        const validItems = formData.items.filter(item => item.productId && item.cantidad > 0);
        const validBonified = formData.bonifiedItems.filter(item => item.productId && item.cantidad > 0);

        if (!isPromoOrder && validItems.length === 0 && validBonified.length === 0) {
            toast.warning('No hay productos válidos en la orden');
            return;
        }

        try {
            const payload = {
                clientId: formData.clientId || null,
                items: [],
                bonifiedItems: [],
                promotionIds: order.promotionIds || [],
                notas: formData.notas || null,
                allowOutOfStock: true,
                includeFreight: formData.includeFreight,
                isFreightBonified: formData.includeFreight ? formData.isFreightBonified : false,
                freightCustomText: formData.includeFreight ? formData.freightCustomText : null,
                freightQuantity: formData.includeFreight ? (parseInt(formData.freightQuantity) || 1) : 1
            };

            if (isPromoOrder) {
                // 🎯 ORDEN DE PROMOCIÓN: Solo enviar flete y bonificados
                // Los items normales de la promoción son preservados automáticamente por el backend

                // Items de flete (si están habilitados)
                if (formData.includeFreight) {
                    const freightItems = formData.items.filter(i => i.isFreightItem);
                    payload.items = freightItems.map(item => ({
                        productId: item.productId,
                        cantidad: item.cantidad,
                        isFreightItem: true
                    }));
                } else {
                    payload.items = [];
                }

                // Items bonificados (si se agregaron manualmente)
                if (validBonified.length > 0) {
                    payload.bonifiedItems = validBonified.map(item => ({
                        productId: item.productId,
                        cantidad: item.cantidad
                    }));
                } else {
                    payload.bonifiedItems = [];
                }

                console.log('🔍 [ORDEN PROMOCIÓN] Items a enviar:');
                console.log('  - Items de flete:', payload.items.length);
                console.log('  - Items bonificados:', payload.bonifiedItems.length);
                console.log('  - Items normales de promo: 0 (preservados por backend)');

            } else {
                // 📦 ORDEN NORMAL: Enviar todos los items
                payload.items = [
                    ...validItems.filter(i => !i.isFreightItem).map(item => ({
                        productId: item.productId,
                        cantidad: item.cantidad
                    })),
                    ...formData.items.filter(i => i.isFreightItem).map(item => ({
                        productId: item.productId,
                        cantidad: item.cantidad,
                        isFreightItem: true
                    }))
                ];

                payload.bonifiedItems = validBonified.map(item => ({
                    productId: item.productId,
                    cantidad: item.cantidad
                }));

                console.log('🔍 [ORDEN NORMAL] Items a enviar:');
                console.log('  - Items normales:', validItems.filter(i => !i.isFreightItem).length);
                console.log('  - Items de flete:', formData.items.filter(i => i.isFreightItem).length);
                console.log('  - Items bonificados:', validBonified.length);
            }

            console.log('📦 Payload a enviar:', payload);

            await client.put(`/admin/orders/${order.id}`, payload);
            toast.success('Orden actualizada correctamente');
            if (onSuccess) onSuccess();
            onClose();
        } catch (error) {
            console.error('Error al actualizar orden:', error);
            toast.error('Error al actualizar orden: ' + (error.response?.data?.message || error.message));
        }
    };

    const filteredProducts = useMemo(() => {
        if (!productSearch) return [];
        return products
            .filter(p => p.active && p.nombre.toLowerCase().includes(productSearch.toLowerCase()))
            .slice(0, 10);
    }, [products, productSearch]);

    // Derived states for Freight Search
    const filteredFreightProducts = useMemo(() => {
        if (!freightProductSearch) return [];
        return products
            .filter(p => p.active && p.nombre.toLowerCase().includes(freightProductSearch.toLowerCase()))
            .slice(0, 5);
    }, [products, freightProductSearch]);

    if (loading) return <div className="edit-modal-loading">Cargando datos...</div>;

    const totalValue = calculateTotal();

    return (
        <div className="eo-overlay">
            <div className="eo-modal">
                {/* Header */}
                <div className="eo-header">
                    <div className="eo-header-info">
                        <h2>Editar Orden #{order.invoiceNumber || order.id?.substring(0, 8)}</h2>
                        <span className={`status-badge ${order.estado}`}>{order.estado}</span>
                        {isPromoOrder && <span className="status-badge" style={{ background: '#ecfdf5', color: '#047857' }}>PROMOCIÓN</span>}
                    </div>
                    <button className="eo-close-btn" onClick={onClose}>
                        <span className="material-icons-round">close</span>
                    </button>
                </div>

                <div className="eo-body">
                    {/* Left Column: Config & Search */}
                    <div className="eo-left-col">
                        <section className="eo-section">
                            <h3><span className="material-icons-round">person</span> Cliente</h3>
                            <select
                                className="eo-input"
                                value={formData.clientId || ''}
                                onChange={(e) => {
                                    setHasChanges(true);
                                    setFormData(prev => ({ ...prev, clientId: e.target.value || null }));
                                }}
                            >
                                <option value="">Sin cliente</option>
                                {clients.map(c => (
                                    <option key={c.id} value={c.id}>
                                        {c.nombre} - {c.telefono}
                                    </option>
                                ))}
                            </select>

                            <div className="eo-field" style={{ marginTop: '1rem' }}>
                                <label>Notas</label>
                                <textarea
                                    className="eo-textarea"
                                    value={formData.notas}
                                    onChange={e => {
                                        setHasChanges(true);
                                        setFormData({ ...formData, notas: e.target.value })
                                    }}
                                    rows={3}
                                />
                            </div>
                        </section>

                        {!isPromoOrder && (
                            <section className="eo-section">
                                <h3><span className="material-icons-round">add_shopping_cart</span> Agregar Productos</h3>
                                <div className="eo-search-wrapper">
                                    <span className="material-icons-round search-icon">search</span>
                                    <input
                                        type="text"
                                        className="eo-search-input"
                                        placeholder="Buscar producto..."
                                        value={productSearch}
                                        onChange={e => setProductSearch(e.target.value)}
                                    />
                                    {productSearch && (
                                        <button className="eo-search-clear" onClick={() => setProductSearch('')}>
                                            <span className="material-icons-round">close</span>
                                        </button>
                                    )}
                                </div>

                                <div className="eo-mode-toggle">
                                    <label className={`toggle-label ${isBonifiedMode ? 'active' : ''}`}>
                                        <input
                                            type="checkbox"
                                            checked={isBonifiedMode}
                                            onChange={() => setIsBonifiedMode(!isBonifiedMode)}
                                            style={{ display: 'none' }}
                                        />
                                        <span className="toggle-switch"></span>
                                        <span className="toggle-text">
                                            {isBonifiedMode ? 'Modo Bonificado (Regalo)' : 'Modo Venta Normal'}
                                        </span>
                                    </label>
                                </div>

                                {/* Product Grid */}
                                {filteredProducts.length > 0 ? (
                                    <div className="eo-search-results">
                                        {filteredProducts.map(p => {
                                            const hasStock = p.stock > 0;
                                            return (
                                                <div
                                                    key={p.id}
                                                    className={`eo-search-item ${!hasStock ? 'out-of-stock' : ''}`}
                                                    onClick={() => addItem(p, false, isBonifiedMode)}
                                                >
                                                    <div className="item-info">
                                                        <span className="item-name">{p.nombre}</span>
                                                        <span className={`item-stock ${hasStock ? 'instock' : 'nostock'}`}>
                                                            Stock: {p.stock}
                                                        </span>
                                                    </div>
                                                    <span className="item-price">
                                                        {isBonifiedMode ? '$0.00' : `$${formatCurrency(p.precio)}`}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    productSearch && <div className="no-results">No se encontraron productos</div>
                                )}
                            </section>
                        )}

                        {isPromoOrder && (
                            <div className="alert-info">
                                <p><strong>Nota:</strong> Los productos de promoción no se pueden agregar/quitar individualmente. Solo se gestionan fletes y notas.</p>
                            </div>
                        )}
                    </div>

                    {/* Right Column: Items & Totals */}
                    <div className="eo-right-col">
                        <div className="eo-items-container">
                            <h3>Productos en la Orden</h3>

                            {/* Regular Items */}
                            {formData.items.filter(i => !i.isFreightItem).length > 0 && (
                                <div className="eo-table-section">
                                    <h4>Venta Normal</h4>
                                    <table className="eo-items-table">
                                        <thead>
                                            <tr>
                                                <th>Producto</th>
                                                <th style={{ width: '80px' }}>Cant.</th>
                                                <th style={{ textAlign: 'right' }}>Total</th>
                                                <th style={{ width: '40px' }}></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {formData.items.filter(i => !i.isFreightItem).map((item) => {
                                                const currentStock = getProductStock(item.productId);
                                                const originalUsage = getOriginalUsage(item.productId);
                                                const totalUsage = getStockUsage(item.productId);
                                                const stockExcess = totalUsage - (currentStock + originalUsage);
                                                const hasExcess = stockExcess > 0;

                                                return (
                                                    <tr key={item.id} className={hasExcess ? 'stock-warning' : ''}>
                                                        <td>
                                                            <div className="eo-item-name">{item.productName}</div>
                                                            <div className="eo-stock-info">
                                                                <span className="stock-available">Stock: {currentStock}</span>
                                                                {hasExcess && (
                                                                    <span className="stock-excess">
                                                                        <span className="material-icons-round" style={{ fontSize: '14px' }}>warning</span>
                                                                        Excede por {stockExcess}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td>
                                                            {!isPromoOrder ? (
                                                                <input
                                                                    type="number"
                                                                    className="eo-qty-input"
                                                                    value={item.cantidad}
                                                                    min="1"
                                                                    onChange={(e) => updateQuantity(item.id, e.target.value)}
                                                                />
                                                            ) : (
                                                                <span>x{item.cantidad}</span>
                                                            )}
                                                        </td>
                                                        <td style={{ textAlign: 'right' }}>
                                                            ${formatCurrency(item.precioUnitario * item.cantidad)}
                                                        </td>
                                                        <td>
                                                            {!isPromoOrder && (
                                                                <button className="eo-remove-btn" onClick={() => removeItem(item.id)}>
                                                                    <span className="material-icons-round">delete</span>
                                                                </button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* Bonified Items */}
                            {formData.bonifiedItems.length > 0 && (
                                <div className="eo-table-section bonified-section">
                                    <h4 className="bonified-header"><span className="material-icons-round">card_giftcard</span> Bonificados (Regalo)</h4>
                                    <table className="eo-items-table">
                                        <tbody>
                                            {formData.bonifiedItems.map((item) => {
                                                const currentStock = getProductStock(item.productId);
                                                const originalUsage = getOriginalUsage(item.productId);
                                                const totalUsage = getStockUsage(item.productId);
                                                const stockExcess = totalUsage - (currentStock + originalUsage);
                                                const hasExcess = stockExcess > 0;

                                                return (
                                                    <tr key={item.id} className={`is-bonified ${hasExcess ? 'stock-warning' : ''}`}>
                                                        <td>
                                                            <div className="eo-item-name">{item.productName}</div>
                                                            <div className="eo-stock-info">
                                                                <span className="stock-available">Stock: {currentStock}</span>
                                                                {hasExcess && (
                                                                    <span className="stock-excess">
                                                                        <span className="material-icons-round" style={{ fontSize: '14px' }}>warning</span>
                                                                        Excede por {stockExcess}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td style={{ width: '80px' }}>
                                                            {!isPromoOrder ? (
                                                                <input
                                                                    type="number"
                                                                    className="eo-qty-input"
                                                                    value={item.cantidad}
                                                                    min="1"
                                                                    onChange={(e) => updateQuantity(item.id, e.target.value, true)}
                                                                />
                                                            ) : (
                                                                <span>x{item.cantidad}</span>
                                                            )}
                                                        </td>
                                                        <td style={{ textAlign: 'right' }}>
                                                            <span className="free-text">Gratis</span>
                                                        </td>
                                                        <td style={{ width: '40px' }}>
                                                            {!isPromoOrder && (
                                                                <button className="eo-remove-btn" onClick={() => removeItem(item.id, true)}>
                                                                    <span className="material-icons-round">delete</span>
                                                                </button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}


                            {/* FREIGHT SECTION - Disabled for Promo Orders & Historical */}
                            {!isPromoOrder && !isHistorical && (
                                <div className="eo-freight-section">
                                    <label className="freight-toggle">
                                        <input
                                            type="checkbox"
                                            checked={formData.includeFreight}
                                            onChange={(e) => {
                                                setHasChanges(true);
                                                setFormData(p => ({ ...p, includeFreight: e.target.checked }));
                                            }}
                                        />
                                    </label>

                                    {formData.includeFreight && (
                                        <div className="freight-details">
                                            <div className="freight-row">
                                                <input
                                                    type="text"
                                                    className="eo-input"
                                                    placeholder="Texto (ej: Envío Express)"
                                                    value={formData.freightCustomText || ''}
                                                    onChange={(e) => {
                                                        setHasChanges(true);
                                                        setFormData(p => ({ ...p, freightCustomText: e.target.value }))
                                                    }}
                                                />
                                                <input
                                                    type="number"
                                                    className="eo-input"
                                                    style={{ width: '80px' }}
                                                    value={formData.freightQuantity || 1}
                                                    onChange={(e) => {
                                                        setHasChanges(true);
                                                        setFormData(p => ({ ...p, freightQuantity: e.target.value }))
                                                    }}
                                                />
                                            </div>
                                            <label className="checkbox-label">
                                                <input
                                                    type="checkbox"
                                                    checked={formData.isFreightBonified}
                                                    onChange={(e) => {
                                                        setHasChanges(true);
                                                        setFormData(p => ({ ...p, isFreightBonified: e.target.checked }))
                                                    }}
                                                />
                                                Bonificar Flete ($0)
                                            </label>

                                            <div className="freight-products">
                                                <h5>Productos por cuenta del flete</h5>
                                                <div className="eo-search-wrapper short">
                                                    <input
                                                        type="text"
                                                        className="eo-search-input small"
                                                        placeholder="Buscar..."
                                                        value={freightProductSearch}
                                                        onChange={(e) => setFreightProductSearch(e.target.value)}
                                                    />
                                                    {filteredFreightProducts.length > 0 && (
                                                        <div className="eo-search-results small">
                                                            {filteredFreightProducts.map(p => (
                                                                <div key={p.id} className="eo-search-item" onClick={() => { addItem(p, true); setFreightProductSearch(''); }}>
                                                                    {p.nombre}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>

                                                {formData.items.filter(i => i.isFreightItem).map(item => (
                                                    <div key={item.id} className="freight-item-row">
                                                        <span>{item.productName}</span>
                                                        <div className="controls">
                                                            <input
                                                                type="number"
                                                                value={item.cantidad}
                                                                onChange={(e) => updateQuantity(item.id, e.target.value)}
                                                                className="eo-qty-input small"
                                                            />
                                                            <button onClick={() => removeItem(item.id)} className="eo-remove-btn">&times;</button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="eo-footer-summary">
                            <div className="summary-row total">
                                <span>Total Estimado</span>
                                <span>${totalValue}</span>
                            </div>
                            <div className="eo-actions">
                                <button className="eo-btn secondary" onClick={onClose}>Cancelar</button>
                                <button className="eo-btn primary" onClick={handleSubmit} disabled={loading || !hasChanges}>
                                    Guardar Cambios
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
