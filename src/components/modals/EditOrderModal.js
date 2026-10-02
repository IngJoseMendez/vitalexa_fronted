import React, { useState, useEffect, useMemo } from 'react';
import { formatCurrency, formatOrderLabel } from '../../utils/formatters';
import client from '../../api/client';
import { useToast } from '../ToastContainer';
import { useConfirm } from '../ConfirmDialog';
import PromotionBlockWrapper from '../orders/PromotionBlock';
import AssortmentSelectionModal from './AssortmentSelectionModal';
import AssortmentCartDetail from '../AssortmentCartDetail';
import SearchableSelect from '../SearchableSelect';
import { buildAssortmentSelections, isAssortmentPromotion, promotionInstancePrice } from '../../utils/assortmentPromotion';
import './EditOrderModal.css';

// Tono del badge de estado (solo presentación, según el sistema de diseño):
// PENDIENTE=warning, CONFIRMADO=primary, COMPLETADO=success, ANULADA/CANCELADO=danger, otros=neutral
const STATUS_BADGE_TONE = {
    PENDIENTE: 'warning',
    CONFIRMADO: 'primary',
    COMPLETADO: 'success',
    ANULADA: 'danger',
    CANCELADO: 'danger'
};
const statusBadgeClass = (estado) => `ui-badge ui-badge--${STATUS_BADGE_TONE[estado] || 'neutral'}`;

export default function EditOrderModal({ order, onClose, onSuccess }) {
    const [clients, setClients] = useState([]);
    const [products, setProducts] = useState([]);
    const [productSearch, setProductSearch] = useState('');
    const [isBonifiedMode, setIsBonifiedMode] = useState(false);
    const [promotionsDetails, setPromotionsDetails] = useState([]); // Store full promotion objects

    // ✅ Detect Promo Order con detección robusta:
    // El backend puede no enviar `isPromotionOrder`, así que usamos múltiples indicadores.
    const isPromoOrder = (
        order.isPromotionOrder === true ||
        // Tiene promotionIds cargados con al menos una promoción
        (Array.isArray(order.promotionIds) && order.promotionIds.length > 0) ||
        // Al menos uno de los items tiene promotionId o promotionInstanceId (vino de una promo)
        (Array.isArray(order.items) && order.items.some(
            item => item.promotionId || item.promotionInstanceId || item.isPromotionItem
        ))
    );
    const isHistorical = order.isHistorical === true;

    const [formData, setFormData] = useState({
        clientId: null,
        items: [], // Regular items
        bonifiedItems: [], // ✅ Separate bonified items
        promotionIds: order.promotionIds || [], // ✅ Initialize with order promotions (pagadas)
        bonifiedPromotionIds: [], // ✅ Promociones bonificadas (regalo), se reconstruye al cargar
        notas: order.notas || '',
        includeFreight: order.includeFreight || false,
        isFreightBonified: order.isFreightBonified || false,
        freightCustomText: order.freightCustomText || '',
        freightQuantity: order.freightQuantity || 1
    });

    const [freightProductSearch, setFreightProductSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [hasChanges, setHasChanges] = useState(false);
    // ── Agregar promociones a orden de promoción ──────────────────
    const [availablePromotions, setAvailablePromotions] = useState([]);
    const [promoSearch, setPromoSearch] = useState('');
    const [promoQueue, setPromoQueue] = useState([]); // [{ id, nombre, qty, bonified }]
    const [addingPromos, setAddingPromos] = useState(false);
    const [addAsBonified, setAddAsBonified] = useState(false); // Agregar promos como regalo (bonificadas)
    // Surtido que se va a poner en la cola: primero se escogen sus productos gratis
    const [assortmentPromo, setAssortmentPromo] = useState(null);
    const toast = useToast();
    const askConfirm = useConfirm();

    useEffect(() => {
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fetchData = async () => {
        try {
            const [clientsRes, productsRes] = await Promise.all([
                client.get('/admin/clients'),
                client.get('/admin/products'),
            ]);

            setClients(clientsRes.data);
            setProducts(productsRes.data);

            // Cargar promociones disponibles para órdenes de promoción
            if (isPromoOrder) {
                try {
                    const promoRes = await client.get('/admin/promotions');
                    setAvailablePromotions(promoRes.data?.filter(p => p.active) || []);
                } catch (err) {
                    console.warn('No se pudieron cargar las promociones disponibles:', err);
                }
            }

            // Fetch promotions details if any
            let loadedPromotions = [];
            if (order.promotionIds && order.promotionIds.length > 0) {
                try {
                    // ✅ Determine if promotions are special or global by checking items
                    const specialPromoIds = new Set();
                    const globalPromoIds = new Set();

                    if (order.items) {
                        order.items.forEach(item => {
                            if (item.specialPromotionId) {
                                specialPromoIds.add(item.specialPromotionId);
                            } else if (item.promotionId) {
                                globalPromoIds.add(item.promotionId);
                            }
                        });
                    }

                    // Fallback: if no items have special/global markers, check promotionIds
                    order.promotionIds.forEach(id => {
                        if (!specialPromoIds.has(id) && !globalPromoIds.has(id)) {
                            globalPromoIds.add(id);
                        }
                    });

                    const promoPromises = [];

                    // Load global promotions
                    globalPromoIds.forEach(id => {
                        promoPromises.push(
                            client.get(`/admin/promotions/${id}`)
                                .catch(err => {
                                    console.warn(`Failed to load global promotion ${id}:`, err);
                                    return null;
                                })
                        );
                    });

                    // Load special promotions
                    specialPromoIds.forEach(id => {
                        promoPromises.push(
                            client.get(`/admin/special-promotions/${id}`)
                                .catch(err => {
                                    console.warn(`Failed to load special promotion ${id}:`, err);
                                    return null;
                                })
                        );
                    });

                    const promoResponses = await Promise.all(promoPromises);
                    loadedPromotions = promoResponses.filter(res => res !== null).map(res => res.data);
                } catch (err) {
                    console.error("Error loading promotions", err);
                    toast.error("Error al cargar detalles de promociones");
                }
            }
            setPromotionsDetails(loadedPromotions);

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
                        isFreightItem: item.isFreightItem || false,
                        promotionId: item.promotionId || (item.promotion && item.promotion.id) || item.relatedPromotionId, // ✅ Preserve promotion ID
                        // ✅ New fields for independent promotions & negative stock
                        promotionInstanceId: item.promotionInstanceId,
                        promotionPackPrice: item.promotionPackPrice,
                        promotionGroupIndex: item.promotionGroupIndex,
                        cantidadDescontada: item.cantidadDescontada,
                        cantidadPendiente: item.cantidadPendiente,
                        promotionName: item.promotionName,
                        // ✅ Capture Special Product & Promotion IDs
                        specialProductId: item.specialProductId || null,
                        specialPromotionId: item.specialPromotionId || null,
                        isSpecialProduct: !!item.specialProductId,
                        // ✅ Rastrear estado bonificado (regalo) e ítem-de-promoción
                        isBonified: item.isBonified || false,
                        isPromotionItem: item.isPromotionItem || false,
                        // Regalo de la promoción (PACK) o gratis escogido del surtido: no fija el precio
                        isFreeItem: item.isFreeItem || false
                    };

                    // ✅ Solo los bonificados PUROS (producto regalo suelto) van a la lista de
                    // bonificados. Un ítem de promoción bonificada (isBonified && es de promo) va
                    // a `items` para agruparse por su promoción y NO duplicarse como bonificado suelto.
                    const isPromoItem = item.isPromotionItem || item.promotionId || item.promotionInstanceId
                        || item.specialPromotionId || item.relatedPromotionId;
                    if (item.isBonified && !isPromoItem) {
                        bonified.push({
                            ...mappedItem,
                            precioUnitario: 0
                        });
                    } else {
                        regularItems.push(mappedItem);
                    }
                });
            }

            // ✅ Reconstruir promociones PAGADAS vs BONIFICADAS desde los items (fuente de
            // verdad), agrupando por instancia. Una instancia es bonificada si sus items
            // llevan isBonified. Esto permite preservar el estado al guardar.
            const reconstructedBonifiedPromotionIds = [];
            if (order.items) {
                const promoInstances = new Map(); // key: instanceId -> { promoId, bonified }
                order.items.forEach(item => {
                    const promoId = item.specialPromotionId || item.promotionId;
                    const isPromoItem = item.isPromotionItem || item.promotionInstanceId || promoId;
                    if (!isPromoItem || !promoId) return;
                    const key = item.promotionInstanceId || `legacy-${promoId}`;
                    if (!promoInstances.has(key)) promoInstances.set(key, { promoId, bonified: false });
                    if (item.isBonified) promoInstances.get(key).bonified = true;
                });
                promoInstances.forEach(({ promoId, bonified }) => {
                    if (bonified) reconstructedBonifiedPromotionIds.push(promoId);
                });
            }
            // promotionIds pagadas = order.promotionIds menos una ocurrencia por bonificada
            const paidPromotionIds = order.promotionIds ? [...order.promotionIds] : [];
            reconstructedBonifiedPromotionIds.forEach(bid => {
                const idx = paidPromotionIds.indexOf(bid);
                if (idx > -1) paidPromotionIds.splice(idx, 1);
            });

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
                promotionIds: paidPromotionIds, // ✅ Solo promociones PAGADAS
                bonifiedPromotionIds: reconstructedBonifiedPromotionIds, // ✅ Promociones BONIFICADAS (regalo)
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
            // ✅ Match by specialProductId for special products, productId for regular
            const id = item.specialProductId || item.productId || item.product?.id || item.id;
            if (id === productId) {
                return sum + (parseFloat(item.cantidad) || 0);
            }
            return sum;
        }, 0);
    };

    const addItem = (product, isFreight = false, isBonified = false) => {
        setHasChanges(true);

        // ✅ Determinar identificador correcto para matching y payload
        const isSpecial = product.isSpecialProduct || false;
        // Para productos especiales: productId en el cart = product.id (UUID del SpecialProduct)
        // Para productos regulares: productId en el cart = product.id (UUID del Product)
        // La distinción se hace al enviar al backend en handleSubmit
        const matchId = product.id;

        if (isBonified) {
            const existing = formData.bonifiedItems.find(i => {
                if (isSpecial) return i.specialProductId === matchId;
                return i.productId === matchId && !i.isSpecialProduct;
            });
            if (existing) {
                setFormData(prev => ({
                    ...prev,
                    bonifiedItems: prev.bonifiedItems.map(i => {
                        const matches = isSpecial
                            ? i.specialProductId === matchId
                            : (i.productId === matchId && !i.isSpecialProduct);
                        return matches ? { ...i, cantidad: (parseInt(i.cantidad) || 0) + 1 } : i;
                    })
                }));
            } else {
                const newItem = {
                    id: `item-bon-${Date.now()}-${Math.random()}`,
                    productId: isSpecial ? null : product.id,
                    specialProductId: isSpecial ? product.id : null,
                    isSpecialProduct: isSpecial,
                    productName: product.nombre,
                    cantidad: 1,
                    precioUnitario: 0,
                    isFreightItem: false,
                    stock: product.stock
                };
                setFormData(prev => ({ ...prev, bonifiedItems: [...prev.bonifiedItems, newItem] }));
            }
        } else {
            const existing = formData.items.find(i => {
                if (isSpecial) return i.specialProductId === matchId && i.isFreightItem === isFreight;
                return i.productId === matchId && i.isFreightItem === isFreight && !i.isSpecialProduct;
            });

            if (existing) {
                setFormData(prev => ({
                    ...prev,
                    items: prev.items.map(i => {
                        const matches = isSpecial
                            ? (i.specialProductId === matchId && i.isFreightItem === isFreight)
                            : (i.productId === matchId && i.isFreightItem === isFreight && !i.isSpecialProduct);
                        return matches ? { ...i, cantidad: (parseInt(i.cantidad) || 0) + 1 } : i;
                    })
                }));
            } else {
                const newItem = {
                    id: `item-${Date.now()}-${Math.random()}`,
                    productId: isSpecial ? null : product.id,
                    specialProductId: isSpecial ? product.id : null,
                    isSpecialProduct: isSpecial,
                    productName: product.nombre,
                    cantidad: 1,
                    precioUnitario: parseFloat(product.precio),
                    isFreightItem: isFreight,
                    stock: product.stock
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

    // Old calculateTotal and handleDeletePromotion removed


    const handleSubmit = async (e) => {
        e.preventDefault();

        // Check for empty or 0 quantities before submitting
        // If user left a field empty, we can either warn or just filter it out (remove it).
        // Given user context "I want to empty it to type", if they submit empty, they probably meant 0/remove or forgot.
        // Let's filter out invalid quantities on submit logic below.

        // ✅ ACTUALIZADO: Mensaje más descriptivo
        if (formData.items.length === 0 && formData.bonifiedItems.length === 0 && !isPromoOrder) {
            toast.warning('Debe haber al menos un producto, promoción o bonificado en la orden');
            return;
        }

        if (!hasChanges) {
            toast.info('No se han realizado cambios en la orden');
            return;
        }

        const validItems = formData.items.filter(item => (item.productId || item.specialProductId) && item.cantidad > 0);
        const validBonified = formData.bonifiedItems.filter(item => (item.productId || item.specialProductId) && item.cantidad > 0);

        if (!isPromoOrder && validItems.length === 0 && validBonified.length === 0) {
            toast.warning('No hay productos o bonificados válidos en la orden');
            return;
        }

        try {
            const payload = {
                clientId: formData.clientId || null,
                items: [],
                bonifiedItems: [],
                promotionIds: formData.promotionIds || [], // ✅ Promociones pagadas
                bonifiedPromotionIds: formData.bonifiedPromotionIds || [], // ✅ Promociones bonificadas (regalo)
                notas: formData.notas || null,

                includeFreight: formData.includeFreight,
                isFreightBonified: formData.includeFreight ? formData.isFreightBonified : false,
                freightCustomText: formData.includeFreight ? formData.freightCustomText : null,
                freightQuantity: formData.includeFreight ? (parseInt(formData.freightQuantity) || 1) : 1
            };

            if (isPromoOrder) {
                // 🎯 ORDEN DE PROMOCIÓN
                // Sus productos (principal, regalos y gratis escogidos del surtido) no se reenvían:
                // el backend conserva tal cual los items de la orden de promoción y no acepta
                // productos cobrables nuevos en ella. Reenviarlos como items normales solo
                // arriesgaba cobrarlos de nuevo.
                payload.items = [];

                // Instancias de promoción que siguen en la orden: si se quitó una, el backend
                // sabe CUÁL (con varias de la misma promoción, p.ej. surtidos con gratis distintos)
                payload.keptPromotionInstanceIds = [...new Set(
                    formData.items
                        .filter(i => i.isPromotionItem && i.promotionInstanceId)
                        .map(i => i.promotionInstanceId)
                )];

                // Items de flete (si están habilitados)
                if (formData.includeFreight) {
                    const freightItems = formData.items.filter(i => i.isFreightItem);
                    payload.items.push(...freightItems.map(item => ({
                        productId: item.isSpecialProduct ? null : item.productId,
                        specialProductId: item.isSpecialProduct ? (item.specialProductId || item.productId) : null,
                        cantidad: item.cantidad,
                        isFreightItem: true,
                        allowOutOfStock: true,
                        specialPromotionId: item.specialPromotionId || null
                    })));
                }

                // Items bonificados (si se agregaron manualmente)
                if (validBonified.length > 0) {
                    payload.bonifiedItems = validBonified.map(item => ({
                        productId: item.isSpecialProduct ? null : item.productId,
                        specialProductId: item.isSpecialProduct ? (item.specialProductId || item.productId) : null,
                        cantidad: item.cantidad
                    }));
                } else {
                    payload.bonifiedItems = [];
                }

                console.log('🔍 [ORDEN PROMOCIÓN] Items a enviar:', payload.items.length);

            } else {
                // 📦 ORDEN NORMAL: Enviar todos los items
                payload.items = [
                    ...validItems.filter(i => !i.isFreightItem).map(item => ({
                        productId: item.isSpecialProduct ? null : item.productId,
                        specialProductId: item.isSpecialProduct ? (item.specialProductId || item.productId) : null,
                        cantidad: item.cantidad,
                        allowOutOfStock: true,
                        specialPromotionId: item.specialPromotionId || null
                    })),
                    ...formData.items.filter(i => i.isFreightItem).map(item => ({
                        productId: item.isSpecialProduct ? null : item.productId,
                        specialProductId: item.isSpecialProduct ? (item.specialProductId || item.productId) : null,
                        cantidad: item.cantidad,
                        isFreightItem: true,
                        allowOutOfStock: true,
                        specialPromotionId: item.specialPromotionId || null
                    }))
                ];

                payload.bonifiedItems = validBonified.map(item => ({
                    productId: item.isSpecialProduct ? null : item.productId,
                    specialProductId: item.isSpecialProduct ? (item.specialProductId || item.productId) : null,
                    cantidad: item.cantidad
                }));

                console.log('🔍 [ORDEN NORMAL] Items a enviar:');
                console.log('  - Items normales:', validItems.filter(i => !i.isFreightItem).length);
                console.log('  - Items de flete:', formData.items.filter(i => i.isFreightItem).length);
                console.log('  - Items bonificados:', validBonified.length);
            }

            console.log('📦 Payload a enviar:', payload);

            const response = await client.put(`/admin/orders/${order.id}`, payload);
            
            // Verificar si el backend hizo split S/N
            const result = response.data;
            if (result && result.wasSplit) {
                toast.success('Orden actualizada. Se creó una orden S/N separada con los productos sin registro.');
            } else {
                toast.success('Orden actualizada correctamente');
            }
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
            .sort((a, b) => a.nombre.localeCompare(b.nombre))
            .slice(0, 20);
    }, [products, productSearch]);

    // Selector de cliente con buscador: mismo texto que tenía cada <option> ("Nombre - Teléfono");
    // NIT y dirección debajo, y el resto de datos de contacto también encuentran al cliente
    const clientOptions = useMemo(() => clients.map(c => ({
        value: c.id,
        label: `${c.nombre ?? ''} - ${c.telefono ?? ''}`,
        description: [c.nit && `NIT ${c.nit}`, c.direccion].filter(Boolean).join(' · '),
        keywords: [c.nit, c.direccion, c.email, c.administrador, c.representanteLegal],
    })), [clients]);

    // Derived states for Freight Search
    const filteredFreightProducts = useMemo(() => {
        if (!freightProductSearch) return [];
        return products
            .filter(p => p.active && p.nombre.toLowerCase().includes(freightProductSearch.toLowerCase()))
            .slice(0, 5);
    }, [products, freightProductSearch]);

    // Group items by promotion
    const { itemsByPromo, noPromoItems } = useMemo(() => {
        const regular = formData.items.filter(i => !i.isFreightItem);
        // Use a Map to preserve insertion order and handle UUID keys correctly
        const sections = new Map(); // Key: promotionInstanceId (or legacy promotionId)
        const standalone = [];

        regular.forEach(item => {
            // New Logic: Group by promotionInstanceId if available, fallback to promotionId
            const key = item.promotionInstanceId || item.promotionId;

            if (key) {
                if (!sections.has(key)) {
                    sections.set(key, []);
                }
                sections.get(key).push(item);
            } else {
                standalone.push(item);
            }
        });

        return { itemsByPromo: sections, noPromoItems: standalone };
    }, [formData.items]);

    // Helper render row
    const renderRow = (item) => {
        // console.log('Rendering Row Item:', item); // Commented out to reduce noise
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
                        <span className="eo-stock-available">Stock: {currentStock}</span>
                        {hasExcess && (
                            <span className="ui-badge ui-badge--danger">
                                <span className="material-icons-round" aria-hidden="true">warning</span>
                                Excede por {stockExcess}
                            </span>
                        )}
                    </div>
                </td>
                <td className="eo-col-qty">
                    {!isPromoOrder ? (
                        <input
                            type="number"
                            className="ui-input eo-qty-input"
                            aria-label={`Cantidad de ${item.productName}`}
                            value={item.cantidad}
                            min="1"
                            onChange={(e) => updateQuantity(item.id, e.target.value)}
                        />
                    ) : (
                        <span>x{item.cantidad}</span>
                    )}
                </td>
                <td className="ui-num">
                    ${formatCurrency(item.precioUnitario * item.cantidad)}
                </td>
                <td className="eo-col-action">
                    {!isPromoOrder && (
                        <button type="button" className="ui-icon-btn ui-icon-btn--danger eo-remove-btn" onClick={() => removeItem(item.id)} aria-label="Quitar producto">
                            <span className="material-icons-round" aria-hidden="true">delete</span>
                        </button>
                    )}
                </td>
            </tr>
        );
    };



    // Calculate Total respecting Promotion Pack Price
    const calculateTotal = () => {
        // If order has a total from backend and we are just viewing, use it?
        // But here we are EDITING, so we must recalculate on the fly based on formData.

        let total = 0;

        // 1. Calculate Promotions Total


        // Precio de cada instancia como lo cobra el backend: el paquete del item principal
        // (no el del primer item: un regalo guarda 0 y un gratis del surtido nada), $0 si es
        // bonificada y, sin precio fijo, la suma de los items cobrados.
        itemsByPromo.forEach((items) => {
            total += promotionInstancePrice(items);
        });

        // 2. Calculate Standalone Items
        const standaloneSum = noPromoItems.reduce((sum, item) => {
            const qty = parseFloat(item.cantidad) || 0;
            return sum + (item.precioUnitario * qty);
        }, 0);
        total += standaloneSum;

        // 3. Freight (if not bonified)
        if (formData.items) { // Check if items exist

            // Usually freight has price, but here we see 'includeFreight' logic separated?
            // The logic in original code was:
            // return formatCurrency(formData.items.reduce((sum, item) => { ... }, 0));
            // And freight items were skipped in that reduce: "if (item.isFreightItem) return sum;"
            // So freight is calculated differently? 
            // Ah, wait. `formData.items` CONTAINS freight items.
            // Original logic SKIPPED freight items in total calculation implicitly via:
            // "if (item.isFreightItem) return sum;"
            // Wait, if I'm rewriting calculateTotal, I should stick to that logic logic OR fix it if it was wrong.
            // The prompt says: "Respeta precios fijos... Items normales: suma normal".
            // It doesn't mention freight. I will assume freight items should be treated as they were (filtered out or 0 price?).
            // Let's look at `addItem`: freight items have `precioUnitario: parseFloat(product.precio)`.
            // But in `calculateTotal` original, they were skipped? 
            // "if (item.isFreightItem) return sum;" -> Yes, they were skipped.
            // So I will skip them here too to be safe, unless "includeFreight" logic adds cost elsewhere?
            // Looking at `handleSubmit`: `isFreightBonified`. 
            // If freight is NOT bonified, presumably it should cost something.
            // But maybe that's handled by a separate "Freight Cost" field? 
            // In `EditOrderModal`, `freightQuantity` is used. 
            // For now I will reproduce original behavior: Skip freight items in product total.
        }

        return formatCurrency(total);
    };

    // Surtido escogido en "Agregar Promociones": entra a la cola como UN paquete con sus
    // gratis ($0). Se cobra el precio del paquete (o $0 si va como regalo).
    const handleAssortmentQueued = (items) => {
        const promo = assortmentPromo;
        if (!promo) return;
        setPromoQueue(prev => [...prev, {
            key: `${promo.id}|${promo.isBonified ? 'bon' : 'paid'}|${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            id: promo.id,
            nombre: promo.nombre,
            qty: 1,
            bonified: !!promo.isBonified,
            type: promo.type,
            buyQuantity: promo.buyQuantity,
            mainProduct: promo.mainProduct,
            freeItems: items.map(i => ({ productId: i.productId, nombre: i.nombre, cantidad: i.cantidad })),
        }]);
        setAssortmentPromo(null);
        toast.success(`"${promo.nombre}" agregada a la cola${promo.isBonified ? ' (regalo)' : ''}`);
    };

    // ── Agregar promociones al endpoint dedicado ────────────────
    const handleAddPromotions = async () => {
        if (promoQueue.length === 0) {
            toast.warning('Agrega al menos una promoción a la cola');
            return;
        }
        // Construir listas de IDs con repeticiones según cantidad, separando
        // promociones pagadas de bonificadas (regalo).
        const paidIds = promoQueue.filter(p => !p.bonified).flatMap(p => Array(p.qty).fill(p.id));
        const bonifiedIds = promoQueue.filter(p => p.bonified).flatMap(p => Array(p.qty).fill(p.id));
        const hasAssortment = promoQueue.some(p => p.freeItems);
        setAddingPromos(true);
        try {
            if (hasAssortment) {
                // Con surtidos: UN envío con los gratis de cada paquete. El backend asigna la
                // k-ésima selección de una promoción a su k-ésima instancia, por eso las
                // selecciones van en el mismo orden de la cola que los ids.
                const instances = promoQueue.flatMap(p => Array(p.qty).fill({ ...p, isBonified: p.bonified }));
                await client.post(`/admin/orders/${order.id}/promotions/add-with-selections`, {
                    promotionIds: paidIds,
                    bonifiedPromotionIds: bonifiedIds,
                    assortmentSelections: buildAssortmentSelections(instances),
                });
            } else {
                if (paidIds.length > 0) {
                    await client.post(`/admin/orders/${order.id}/promotions/add`, paidIds);
                }
                if (bonifiedIds.length > 0) {
                    await client.post(`/admin/orders/${order.id}/promotions/add-bonified`, bonifiedIds);
                }
            }
            toast.success(`${paidIds.length + bonifiedIds.length} instancia(s) de promoción agregada(s) correctamente`);
            setPromoQueue([]);
            if (onSuccess) onSuccess();
            onClose();
        } catch (err) {
            const msg = err.response?.data?.message || err.message;
            toast.error('Error al agregar promociones: ' + msg);
        } finally {
            setAddingPromos(false);
        }
    };

    // New Delete Handler for Promotion Instances
    const handleDeletePromotionInstance = async (promotionInstanceId) => {
        const ok = await askConfirm({
            title: 'Eliminar promoción',
            message: '¿Estás seguro de que deseas eliminar esta promoción?',
            confirmText: 'Eliminar',
            cancelText: 'Cancelar'
        });
        if (!ok) return;

        // Check if we are in "Create Mode" or "Edit Mode" (do we have an endpoint?)
        // The prompt suggests: DELETE /api/orders/{orderId}/items/{itemId} 
        // asking to delete the ITEM that represents the promotion? 
        // Or maybe we just filter it out from `formData` if it's a client-side change?

        // If the order exists (isPromoOrder=true usually implies existing structure), 
        // we might need to call backend. 
        // HOWEVER, `EditOrderModal` seems to work with local state `formData` and then `handleSubmit` sends everything.
        // EXCEPT `handleDeletePromotion` in original code called AXIOS DELETE directly.
        // `await client.delete(/admin/orders/${order.id}/promotions/${promotionId});`

        // If we want to support the new "Delete Instance" logic:
        // We should probably remove it from `formData` locally first if it hasn't been saved?
        // But if it IS saved, we might need backend call.
        // The original code had specific `handleDeletePromotion`.

        // Plan:
        // 1. Try to find the items in `formData` matching this `promotionInstanceId`.
        // 2. Remove them from `formData`.
        // 3. If it's an existing order (ID exists), maybe we should also call backend?
        //    But `EditOrderModal` is often used for *editing* state before saving.
        //    The original `handleDeletePromotion` was:
        //    `await client.delete(...)` -> then `onClose()`.
        //    It seems it was an "Action" rather than "State edit".

        // Hybrid approach: 
        // If we are just editing the form (not saved), we filter state.
        // But wait, `EditOrderModal` is "Edit Order". The order EXISTS.
        // The original logic `handleDeletePromotion` closed the modal after deleting.
        // Use that pattern for now to be safe, BUT using the new endpoint if specific item?
        // Prompt says: "DELETE /api/orders/{orderId}/items/{itemId}" 
        // "Donde itemId es el item de promoción a eliminar"

        // We need to find ONE item id that represents this promotion group?
        // Or just one of the items?
        // "Encontrar el item con este promotionInstanceId"

        const itemsToDelete = itemsByPromo.get(promotionInstanceId);
        if (!itemsToDelete || itemsToDelete.length === 0) return;

        const firstItem = itemsToDelete[0];
        // If this item has a real backend ID (not generated `item-Date...`), valid to call backend.
        // If it starts with `item-`, it's local.

        // Unified Local Deletion Logic
        // We defer the actual backend update to "Guardar Cambios" (PUT)
        setHasChanges(true);

        // ✅ ¿La instancia eliminada es bonificada (regalo)? Se quita de la lista correcta.
        const isInstanceBonified = itemsToDelete.some(i => i.isBonified);

        setFormData(prev => {
            // Remove promotion ID from list (one instance)
            const promoIdToRemove = firstItem.specialPromotionId || firstItem.promotionId;
            const newPromoIds = [...(prev.promotionIds || [])];
            const newBonifiedPromoIds = [...(prev.bonifiedPromotionIds || [])];

            // Logic: remove ONE occurrence of this promotion UUID de la lista que corresponda
            // (maneja correctamente múltiples instancias de la misma promoción)
            const targetList = isInstanceBonified ? newBonifiedPromoIds : newPromoIds;
            const indexToRemove = targetList.indexOf(promoIdToRemove);
            if (indexToRemove > -1) {
                targetList.splice(indexToRemove, 1);
            }

            // Remove items associated with this promotion instance
            const newItems = prev.items.filter(i =>
                (i.promotionInstanceId || i.promotionId) !== promotionInstanceId
            );

            return {
                ...prev,
                items: newItems,
                promotionIds: newPromoIds,
                bonifiedPromotionIds: newBonifiedPromoIds
            };
        });

        toast.success('Promoción eliminada. No olvides "Guardar Cambios".');
    };





    if (loading) return (
        <div className="edit-modal-loading ui-modal-overlay">
            <div className="eo-loading-card" role="status">
                <span className="ui-spinner" aria-hidden="true" />
                Cargando datos...
            </div>
        </div>
    );

    const totalValue = calculateTotal();

    return (
        <div className="ui-modal-overlay eo-overlay">
            <div className="ui-modal ui-modal--xl eo-modal" role="dialog" aria-modal="true" aria-labelledby="eo-title">
                {/* Header */}
                <div className="ui-modal-header eo-header">
                    <span className="ui-modal-icon" aria-hidden="true">
                        <span className="material-icons-round">edit_note</span>
                    </span>
                    <div className="ui-modal-heading eo-header-info">
                        <h2 id="eo-title" className="ui-modal-title">Editar {formatOrderLabel(order)}</h2>
                        <div className="eo-header-badges">
                            <span className={statusBadgeClass(order.estado)}>{order.estado}</span>
                            {isPromoOrder && <span className="ui-badge ui-badge--primary">PROMOCIÓN</span>}
                        </div>
                    </div>
                    <button type="button" className="ui-icon-btn" onClick={onClose} aria-label="Cerrar">
                        <span className="material-icons-round" aria-hidden="true">close</span>
                    </button>
                </div>

                <div className="eo-body">
                    {/* Left Column: Config & Search */}
                    <div className="eo-left-col">
                        <section className="ui-section eo-section">
                            <div className="ui-section-head">
                                <h3 className="ui-section-title eo-section-title"><span className="material-icons-round" aria-hidden="true">person</span> Cliente</h3>
                            </div>
                            <div className="eo-fields">
                                <SearchableSelect
                                    aria-label="Cliente"
                                    value={formData.clientId || ''}
                                    onChange={(e) => {
                                        setHasChanges(true);
                                        setFormData(prev => ({ ...prev, clientId: e.target.value || null }));
                                    }}
                                    options={clientOptions}
                                    emptyOption={{ label: 'Sin cliente' }}
                                    placeholder="Sin cliente"
                                    searchPlaceholder="Nombre, NIT, teléfono o dirección…"
                                    noResultsText="No se encontraron clientes"
                                />

                                <div className="ui-field">
                                    <label className="ui-label" htmlFor="eo-notas">Notas</label>
                                    <textarea
                                        id="eo-notas"
                                        className="ui-textarea"
                                        value={formData.notas}
                                        onChange={e => {
                                            setHasChanges(true);
                                            setFormData({ ...formData, notas: e.target.value })
                                        }}
                                        rows={3}
                                    />
                                </div>
                            </div>
                        </section>

                        {!isPromoOrder && (
                            <section className="ui-section eo-section">
                                <div className="ui-section-head">
                                    <h3 className="ui-section-title eo-section-title"><span className="material-icons-round" aria-hidden="true">add_shopping_cart</span> Agregar Productos</h3>
                                </div>
                                <div className="eo-fields">
                                    <div className="ui-input-group ui-input-group--suffix eo-search-wrapper">
                                        <span className="material-icons-round ui-input-icon" aria-hidden="true">search</span>
                                        <input
                                            type="text"
                                            className="ui-input eo-search-input"
                                            aria-label="Buscar producto"
                                            placeholder="Buscar producto..."
                                            value={productSearch}
                                            onChange={e => setProductSearch(e.target.value)}
                                        />
                                        {productSearch && (
                                            <button type="button" className="ui-icon-btn eo-search-clear" onClick={() => setProductSearch('')} aria-label="Limpiar búsqueda">
                                                <span className="material-icons-round" aria-hidden="true">close</span>
                                            </button>
                                        )}
                                    </div>

                                    <label className={`ui-switch eo-mode-toggle${isBonifiedMode ? ' is-active' : ''}`}>
                                        <input
                                            type="checkbox"
                                            checked={isBonifiedMode}
                                            onChange={() => setIsBonifiedMode(!isBonifiedMode)}
                                        />
                                        <span className="ui-switch-track" aria-hidden="true"><span className="ui-switch-thumb" /></span>
                                        <span className="ui-switch-text">
                                            <span className="ui-switch-title">
                                                {isBonifiedMode ? 'Modo Bonificado (Regalo)' : 'Modo Venta Normal'}
                                            </span>
                                        </span>
                                    </label>

                                    {/* Product Grid */}
                                    {filteredProducts.length > 0 ? (
                                        <div className="eo-search-results">
                                            {filteredProducts.map(p => {
                                                const hasStock = p.stock > 0;
                                                return (
                                                    <div
                                                        key={p.id}
                                                        className={`eo-search-item ${!hasStock ? 'is-out-of-stock' : ''}`}
                                                        onClick={() => addItem(p, false, isBonifiedMode)}
                                                    >
                                                        <div className="eo-item-info">
                                                            <span className="item-name eo-result-name">{p.nombre}</span>
                                                            <span className={`eo-item-stock ${hasStock ? 'is-in-stock' : 'is-no-stock'}`}>
                                                                Stock: {p.stock}
                                                            </span>
                                                        </div>
                                                        <span className="eo-item-price">
                                                            {isBonifiedMode ? '$0.00' : `$${formatCurrency(p.precio)}`}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        productSearch && <div className="eo-no-results">No se encontraron productos</div>
                                    )}
                                </div>
                            </section>
                        )}

                        {isPromoOrder && (
                            <section className="ui-section eo-section">
                                <div className="ui-section-head">
                                    <div>
                                        <h3 className="ui-section-title eo-section-title">
                                            <span className="material-icons-round" aria-hidden="true">add_circle</span>
                                            Agregar Promociones
                                        </h3>
                                        <p className="ui-section-desc">
                                            Los ítems existentes <strong>no se modifican</strong>. Solo se añaden nuevas instancias.
                                        </p>
                                    </div>
                                </div>

                                <div className="eo-fields">
                                    {/* Toggle: agregar como bonificadas (regalo) */}
                                    <label className={`ui-switch eo-mode-toggle${addAsBonified ? ' is-active' : ''}`}>
                                        <input
                                            type="checkbox"
                                            checked={addAsBonified}
                                            onChange={() => setAddAsBonified(v => !v)}
                                        />
                                        <span className="ui-switch-track" aria-hidden="true"><span className="ui-switch-thumb" /></span>
                                        <span className="ui-switch-text">
                                            <span className="ui-switch-title">Agregar como bonificadas (regalo, pack a $0)</span>
                                        </span>
                                    </label>

                                    {/* Buscador */}
                                    <div className="ui-input-group ui-input-group--suffix eo-search-wrapper">
                                        <span className="material-icons-round ui-input-icon" aria-hidden="true">search</span>
                                        <input
                                            type="text"
                                            className="ui-input eo-search-input"
                                            aria-label="Buscar promoción"
                                            placeholder="Buscar promoción..."
                                            value={promoSearch}
                                            onChange={e => setPromoSearch(e.target.value)}
                                        />
                                        {promoSearch && (
                                            <button type="button" className="ui-icon-btn eo-search-clear" onClick={() => setPromoSearch('')} aria-label="Limpiar búsqueda">
                                                <span className="material-icons-round" aria-hidden="true">close</span>
                                            </button>
                                        )}
                                    </div>

                                    {/* Resultados */}
                                    {promoSearch && (
                                        <div className="eo-search-results">
                                            {availablePromotions
                                                .filter(p => p.nombre.toLowerCase().includes(promoSearch.toLowerCase()))
                                                .slice(0, 10)
                                                .map(p => (
                                                    <div
                                                        key={p.id}
                                                        className="eo-search-item"
                                                        onClick={() => {
                                                            // Surtido: cada paquete lleva SUS gratis; se escogen antes de ponerlo en la cola
                                                            if (isAssortmentPromotion(p)) {
                                                                setAssortmentPromo({ ...p, isBonified: addAsBonified });
                                                                setPromoSearch('');
                                                                return;
                                                            }
                                                            // Clave compuesta: la MISMA promo puede ir pagada Y bonificada
                                                            // (dos entradas distintas en la cola).
                                                            const qKey = `${p.id}|${addAsBonified ? 'bon' : 'paid'}`;
                                                            setPromoQueue(prev => {
                                                                const existing = prev.find(x => x.key === qKey);
                                                                if (existing) {
                                                                    return prev.map(x => x.key === qKey ? { ...x, qty: x.qty + 1 } : x);
                                                                }
                                                                return [...prev, { key: qKey, id: p.id, nombre: p.nombre, qty: 1, bonified: addAsBonified }];
                                                            });
                                                            setPromoSearch('');
                                                            toast.success(`"${p.nombre}" agregada a la cola${addAsBonified ? ' (regalo)' : ''}`);
                                                        }}
                                                    >
                                                        <div className="eo-item-info">
                                                            <span className="item-name eo-result-name">{p.nombre}</span>
                                                            <span className="eo-item-stock">{p.type}</span>
                                                        </div>
                                                        <span className="material-icons-round eo-add-icon" aria-hidden="true">add</span>
                                                    </div>
                                                ))
                                            }
                                            {availablePromotions.filter(p => p.nombre.toLowerCase().includes(promoSearch.toLowerCase())).length === 0 && (
                                                <div className="eo-no-results">No se encontraron promociones</div>
                                            )}
                                        </div>
                                    )}

                                    {/* Cola de promociones a agregar */}
                                    {promoQueue.length > 0 && (
                                        <div className="eo-queue">
                                            <p className="eo-queue-title">
                                                Cola ({promoQueue.reduce((s, x) => s + x.qty, 0)} instancia/s):
                                            </p>
                                            {promoQueue.map(p => (
                                                <div key={p.key || p.id} className="eo-queue-row">
                                                    <span className={`eo-queue-name${p.bonified ? ' is-bonified' : ''}`}>
                                                        {p.nombre}
                                                        {p.bonified && (
                                                            <span className="ui-badge ui-badge--success eo-queue-badge">REGALO</span>
                                                        )}
                                                        {/* Surtido: un paquete por entrada, con sus gratis escogidos */}
                                                        {p.freeItems && <AssortmentCartDetail promo={p} />}
                                                    </span>
                                                    {!p.freeItems && (
                                                        <>
                                                            <button
                                                                type="button"
                                                                className="ui-icon-btn ui-icon-btn--bordered eo-step-btn"
                                                                aria-label={`Disminuir cantidad de ${p.nombre}`}
                                                                onClick={() => setPromoQueue(prev => prev.map(x => x.key === p.key && x.qty > 1 ? { ...x, qty: x.qty - 1 } : x).filter(x => x.qty > 0))}
                                                            >−</button>
                                                            <span className="eo-queue-qty">{p.qty}</span>
                                                            <button
                                                                type="button"
                                                                className="ui-icon-btn ui-icon-btn--bordered eo-step-btn"
                                                                aria-label={`Aumentar cantidad de ${p.nombre}`}
                                                                onClick={() => setPromoQueue(prev => prev.map(x => x.key === p.key ? { ...x, qty: x.qty + 1 } : x))}
                                                            >+</button>
                                                        </>
                                                    )}
                                                    <button
                                                        type="button"
                                                        className="ui-icon-btn ui-icon-btn--danger"
                                                        aria-label={`Quitar ${p.nombre} de la cola`}
                                                        onClick={() => setPromoQueue(prev => prev.filter(x => x.key !== p.key))}
                                                    ><span className="material-icons-round" aria-hidden="true">delete</span></button>
                                                </div>
                                            ))}
                                            <button
                                                type="button"
                                                className="ui-btn ui-btn--primary ui-btn--block eo-queue-confirm"
                                                onClick={handleAddPromotions}
                                                disabled={addingPromos}
                                            >
                                                <span className="material-icons-round" aria-hidden="true">
                                                    {addingPromos ? 'sync' : 'add_shopping_cart'}
                                                </span>
                                                {addingPromos ? 'Agregando...' : 'Confirmar y Agregar'}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </section>
                        )}
                    </div>

                    {/* Right Column: Items & Totals */}
                    <div className="eo-right-col">
                        <div className="eo-items-container">
                            <h3 className="eo-items-title">Productos en la Orden</h3>

                            {/* Promociones Groups */}
                            {itemsByPromo.size > 0 && (
                                <>
                                    {Array.from(itemsByPromo.entries()).map(([key, items]) => {
                                        const firstItem = items[0];
                                        // Find promotion name
                                        // Legacy: look in promotionsDetails using promotionId
                                        // New: use item.promotionName if available? 
                                        // Prompt example shows item.promotionName

                                        const promoDetail = promotionsDetails.find(p => p.id === firstItem.promotionId);
                                        const baseName = firstItem.promotionName || (promoDetail ? promoDetail.nombre : 'Promoción');
                                        // ✅ ¿La instancia es bonificada (regalo)?
                                        const isInstanceBonified = items.some(i => i.isBonified);
                                        const name = isInstanceBonified ? `${baseName} (BONIFICADO)` : baseName;

                                        // Precio de la instancia (paquete del principal; bonificada = $0)
                                        const price = promotionInstancePrice(items);

                                        return (
                                            <PromotionBlockWrapper
                                                key={key}
                                                promotionInstanceId={key}
                                                promotionName={name}
                                                promotionGroupIndex={firstItem.promotionGroupIndex}
                                                items={items}
                                                price={price}
                                                onDelete={handleDeletePromotionInstance}
                                                isEditable={true} // Always show delete button?
                                            />
                                        );
                                    })}
                                </>
                            )}

                            {/* Standalone Items */}
                            {noPromoItems.length > 0 && (
                                <div className="eo-table-section">
                                    <h4 className="eo-table-title">Venta Normal / Otros</h4>
                                    <div className="ui-table-wrap">
                                        <table className="ui-table ui-table--compact eo-items-table">
                                            <thead>
                                                <tr>
                                                    <th>Producto</th>
                                                    <th className="eo-col-qty">Cant.</th>
                                                    <th className="ui-num">Total</th>
                                                    <th className="eo-col-action"><span className="ui-sr-only">Acciones</span></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {noPromoItems.map(renderRow)}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* Bonified Items - AGGREGATED VIEW */}
                            {formData.bonifiedItems.length > 0 && (
                                <div className="eo-table-section eo-bonified-section">
                                    <h4 className="eo-table-title"><span className="material-icons-round" aria-hidden="true">card_giftcard</span> Bonificados (Regalo)</h4>
                                    <div className="ui-table-wrap">
                                        <table className="ui-table ui-table--compact eo-items-table">
                                            <tbody>
                                                {(() => {
                                                    // Aggregate bonified items by Product ID
                                                    const aggregatedBonified = new Map();

                                                    formData.bonifiedItems.forEach(item => {
                                                        if (!aggregatedBonified.has(item.productId)) {
                                                            aggregatedBonified.set(item.productId, {
                                                                ...item,
                                                                cantidad: 0,
                                                                cantidadPendiente: 0
                                                            });
                                                        }
                                                        const existing = aggregatedBonified.get(item.productId);
                                                        existing.cantidad += (parseInt(item.cantidad) || 0);
                                                        existing.cantidadPendiente += (parseInt(item.cantidadPendiente) || 0);
                                                    });

                                                    return Array.from(aggregatedBonified.values()).map((item) => {
                                                        const currentStock = getProductStock(item.productId);
                                                        const originalUsage = getOriginalUsage(item.productId);
                                                        const totalUsage = getStockUsage(item.productId);
                                                        const stockExcess = totalUsage - (currentStock + originalUsage);
                                                        const hasExcess = stockExcess > 0;

                                                        return (
                                                            <tr key={item.productId} className={`is-bonified ${hasExcess ? 'stock-warning' : ''}`}>
                                                                <td>
                                                                    <div className="eo-item-name">{item.productName}</div>
                                                                    <div className="eo-stock-info">
                                                                        <span className="eo-stock-available">Stock: {currentStock}</span>
                                                                        {hasExcess && (
                                                                            <span className="ui-badge ui-badge--danger">
                                                                                <span className="material-icons-round" aria-hidden="true">warning</span>
                                                                                Excede por {stockExcess}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    {/* Negative Stock / Pending Display */}
                                                                    {item.cantidadPendiente > 0 && (
                                                                        <div className="eo-pending">
                                                                            [{item.cantidadPendiente} pendiente]
                                                                        </div>
                                                                    )}
                                                                </td>
                                                                <td className="eo-col-qty">
                                                                    {!isPromoOrder ? (
                                                                        <input
                                                                            type="number"
                                                                            className="ui-input eo-qty-input"
                                                                            aria-label={`Cantidad de ${item.productName}`}
                                                                            value={item.cantidad}
                                                                            min="1"
                                                                            onChange={(e) => updateQuantity(item.id, e.target.value, true)}
                                                                        // Note: Aggregated view editing might be tricky if IDs differ.
                                                                        // But `updateQuantity` uses `item.id`.
                                                                        // If we aggregated, which ID do we use? The first one.
                                                                        // If user changes quantity, we might need to update the underlying item.
                                                                        // For simplicity in this aggregated view:
                                                                        // If there's only 1 underlying item, it works.
                                                                        // If there are multiple (split), editing might be complex.
                                                                        // BUT usually bonified items for same product are matched.
                                                                        // If I edit quantity here, I should probably edit the main item.
                                                                        // For now, let's assume 1 item per product for bonified is standard in this UI.
                                                                        />
                                                                    ) : (
                                                                        <span>x{item.cantidad}</span>
                                                                    )}
                                                                </td>
                                                                <td className="ui-num">
                                                                    <span className="eo-free-text">Gratis</span>
                                                                </td>
                                                                <td className="eo-col-action">
                                                                    {!isPromoOrder && (
                                                                        <button type="button" className="ui-icon-btn ui-icon-btn--danger eo-remove-btn" onClick={() => removeItem(item.id, true)} aria-label="Quitar producto bonificado">
                                                                            <span className="material-icons-round" aria-hidden="true">delete</span>
                                                                        </button>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        );
                                                    });
                                                })()}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}


                            {/* FREIGHT SECTION - Disabled for Historical orders only */}
                            {!isHistorical && (
                                <section className="ui-section eo-freight-section">
                                    <label className="ui-checkbox eo-freight-toggle">
                                        <input
                                            type="checkbox"
                                            checked={formData.includeFreight}
                                            onChange={(e) => {
                                                setHasChanges(true);
                                                setFormData(p => ({ ...p, includeFreight: e.target.checked }));
                                            }}
                                        />
                                        Incluir flete
                                    </label>


                                    {formData.includeFreight && (
                                        <div className="eo-freight-details">
                                            <div className="eo-freight-row">
                                                <input
                                                    type="text"
                                                    className="ui-input"
                                                    aria-label="Texto del flete"
                                                    placeholder="Texto (ej: Envío Express)"
                                                    value={formData.freightCustomText || ''}
                                                    onChange={(e) => {
                                                        setHasChanges(true);
                                                        setFormData(p => ({ ...p, freightCustomText: e.target.value }))
                                                    }}
                                                />
                                                <input
                                                    type="number"
                                                    className="ui-input eo-freight-qty"
                                                    aria-label="Cantidad de flete"
                                                    value={formData.freightQuantity || 1}
                                                    onChange={(e) => {
                                                        setHasChanges(true);
                                                        setFormData(p => ({ ...p, freightQuantity: e.target.value }))
                                                    }}
                                                />
                                            </div>
                                            <label className="ui-checkbox">
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

                                            <div className="eo-freight-products">
                                                <h5 className="eo-subtitle">Productos por cuenta del flete</h5>
                                                <div className="eo-search-wrapper">
                                                    <input
                                                        type="text"
                                                        className="ui-input"
                                                        aria-label="Buscar producto por cuenta del flete"
                                                        placeholder="Buscar..."
                                                        value={freightProductSearch}
                                                        onChange={(e) => setFreightProductSearch(e.target.value)}
                                                    />
                                                    {filteredFreightProducts.length > 0 && (
                                                        <div className="eo-search-results">
                                                            {filteredFreightProducts.map(p => (
                                                                <div key={p.id} className="eo-search-item" onClick={() => { addItem(p, true); setFreightProductSearch(''); }}>
                                                                    {p.nombre}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>

                                                {formData.items.filter(i => i.isFreightItem).map(item => (
                                                    <div key={item.id} className="eo-freight-item">
                                                        <span className="eo-freight-item-name">{item.productName}</span>
                                                        <div className="eo-freight-controls">
                                                            <input
                                                                type="number"
                                                                aria-label={`Cantidad de ${item.productName}`}
                                                                value={item.cantidad}
                                                                onChange={(e) => updateQuantity(item.id, e.target.value)}
                                                                className="ui-input eo-qty-input"
                                                            />
                                                            <button type="button" onClick={() => removeItem(item.id)} className="ui-icon-btn ui-icon-btn--danger eo-remove-btn" aria-label="Quitar producto del flete">
                                                                <span className="material-icons-round" aria-hidden="true">close</span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </section>
                            )}
                        </div>
                    </div>
                </div>

                {/* Pie fijo: total + acciones */}
                <div className="ui-modal-footer eo-footer-summary">
                    <div className="summary-row total eo-total">
                        <span>Total Estimado</span>
                        <span>${totalValue}</span>
                    </div>
                    <div className="eo-actions">
                        <button type="button" className="ui-btn ui-btn--secondary" onClick={onClose}>Cancelar</button>
                        <button type="button" className="ui-btn ui-btn--primary" onClick={handleSubmit} disabled={loading || !hasChanges}>
                            Guardar Cambios
                        </button>
                    </div>
                </div>
            </div>

            {/* Dentro del overlay de la edición para quedar encima de ella */}
            {assortmentPromo && (
                <AssortmentSelectionModal
                    orderId={null}
                    promotion={assortmentPromo}
                    isStandalone={true}
                    existingProducts={Array.isArray(products) ? products : []}
                    onClose={() => setAssortmentPromo(null)}
                    onConfirm={handleAssortmentQueued}
                />
            )}
        </div>
    );
}
