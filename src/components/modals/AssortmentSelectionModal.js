import { useState, useEffect } from 'react';
import client from '../../api/client';
import promotionService from '../../api/promotionService';
import { useToast } from '../ToastContainer';
import { formatCurrency } from '../../utils/formatters';
import {
    getAssortmentConfigProblem,
    getAssortmentFreeLimit,
    getAssortmentPackPrice,
    selectableFreeProducts,
} from '../../utils/assortmentPromotion';

/**
 * Selección de productos de una promoción Surtido.
 *
 * - isStandalone (Nueva Venta / carrito): el surtido es un PAQUETE a precio fijo. La vendedora
 *   escoge HASTA freeQuantity productos GRATIS ($0) de cualquier producto regular activo (un
 *   producto especial vinculado comparte el stock de su producto base: se escoge el base); el
 *   producto principal x buyQuantity ya va dentro del paquete. Devuelve los escogidos con
 *   onConfirm (no llama API).
 * - Modo antiguo (orderId, pedidos PENDING_PROMOTION_COMPLETION): exactamente freeQuantity y se
 *   guardan con completeAssortment.
 *
 * Opcionales (standalone): closeOnConfirm=false deja que el padre decida si cierra tras
 * confirmar (p.ej. para encadenar varios paquetes); progressLabel muestra "Paquete 2 de 3".
 */
function AssortmentSelectionModal({ orderId, promotion, onClose, onSuccess, onConfirm, isStandalone = false, existingProducts = [], closeOnConfirm = true, progressLabel = null }) {
    const [selectedProducts, setSelectedProducts] = useState([]);
    const [products, setProducts] = useState(existingProducts);
    const [searchTerm, setSearchTerm] = useState('');
    const [showResults, setShowResults] = useState(false);
    const [loading, setLoading] = useState(false);
    const [loadingProducts, setLoadingProducts] = useState(true);
    const toast = useToast();

    // En el carrito solo se ofrecen productos regulares activos (el backend no acepta
    // productos especiales como gratis)
    const filterProducts = (list) => (isStandalone ? selectableFreeProducts(list) : list.filter(p => p.active));

    useEffect(() => {
        if (existingProducts && existingProducts.length > 0) {
            setProducts(filterProducts(existingProducts));
            setLoadingProducts(false);
            return;
        }

        const fetchProducts = async () => {
            try {
                setLoadingProducts(true);
                const response = await client.get('/admin/products');
                const allProducts = response.data.content || response.data || [];
                setProducts(filterProducts(allProducts));
            } catch (error) {
                console.error('Error al cargar productos:', error);
                toast.error('Error al cargar productos');
            } finally {
                setLoadingProducts(false);
            }
        };

        fetchProducts();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [toast, existingProducts, isStandalone]);

    const filteredProducts = products.filter(p =>
        (p.nombre || '').toLowerCase().includes(searchTerm.toLowerCase()) &&
        !selectedProducts.some(sp => sp.id === p.id)
    );

    const totalSelected = selectedProducts.reduce((sum, p) => sum + p.cantidad, 0);

    // Paquete (standalone): HASTA freeLimit gratis, puede ser 0. Modo antiguo: exactamente freeQuantity.
    const freeLimit = getAssortmentFreeLimit(promotion);
    const configProblem = isStandalone ? getAssortmentConfigProblem(promotion, { bonified: !!promotion.isBonified }) : null;
    const targetQuantity = isStandalone ? (freeLimit || 0) : promotion.freeQuantity;
    const remaining = targetQuantity - totalSelected;
    const isValid = isStandalone
        ? !configProblem && totalSelected <= targetQuantity
        : totalSelected === targetQuantity;
    const packPrice = getAssortmentPackPrice(promotion);

    const handleAddProduct = (product) => {
        if (remaining <= 0) {
            toast.warning(isStandalone ? `Ya escogiste los ${targetQuantity} gratis del paquete` : 'Ya has alcanzado la cantidad requerida');
            return;
        }

        setSelectedProducts(prev => [...prev, {
            id: product.id,
            nombre: product.nombre,
            stock: product.stock,
            cantidad: 1
        }]);
        setSearchTerm('');
        setShowResults(false);
    };

    const handleUpdateQuantity = (productId, newCantidad) => {
        let cantidad = parseInt(newCantidad);

        if (isNaN(cantidad) || cantidad < 1) {
            handleRemoveProduct(productId);
            return;
        }

        if (isStandalone) {
            // No pasar del máximo del paquete (lo que ya tiene este producto + lo que falta)
            const current = selectedProducts.find(p => p.id === productId)?.cantidad || 0;
            cantidad = Math.min(cantidad, current + Math.max(remaining, 0));
        }

        setSelectedProducts(prev => prev.map(p =>
            p.id === productId ? { ...p, cantidad } : p
        ));
    };

    const handleRemoveProduct = (productId) => {
        setSelectedProducts(prev => prev.filter(p => p.id !== productId));
    };

    const handleComplete = async () => {
        if (!isValid) {
            toast.warning(isStandalone
                ? (configProblem ? `Esta promoción ${configProblem}. Pide al administrador que la revise.` : `Máximo ${targetQuantity} productos gratis`)
                : `Debe seleccionar exactamente ${targetQuantity} productos`);
            return;
        }

        // STANDALONE MODE: devuelve los gratis escogidos al carrito (no llama API)
        if (isStandalone && onConfirm) {
            const payload = selectedProducts.map(p => ({
                productId: p.id,
                nombre: p.nombre, // para mostrarlo en el carrito
                cantidad: p.cantidad
            }));
            onConfirm(payload);
            if (closeOnConfirm) onClose();
            return;
        }

        setLoading(true);

        try {
            const payload = selectedProducts.map(p => ({
                productId: p.id,
                cantidad: p.cantidad
            }));

            await promotionService.completeAssortment(orderId, promotion.id, payload);
            toast.success('Promoción completada exitosamente');
            if (onSuccess) onSuccess();
            onClose();
        } catch (error) {
            console.error('Error al completar promoción:', error);
            const errorMsg = error.response?.data?.message || error.response?.data || error.message;
            toast.error('Error al completar promoción: ' + errorMsg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content assortment-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>
                        <span className="material-icons-round" style={{ verticalAlign: 'middle', marginRight: '0.5rem' }}>
                            inventory
                        </span>
                        {isStandalone ? 'Escoger productos gratis' : 'Seleccionar Productos Surtidos'}
                    </h3>
                    <button className="btn-close" onClick={onClose} aria-label="Cerrar">
                        <span className="material-icons-round">close</span>
                    </button>
                </div>

                <div style={{ padding: '2rem' }}>
                    {/* Promotion Info Header */}
                    <div className="assortment-header">
                        <h3>{promotion.nombre}</h3>
                        {progressLabel && (
                            <div style={{ marginTop: '0.25rem', fontWeight: 700, color: '#0369a1' }}>{progressLabel}</div>
                        )}
                        {promotion.descripcion && (
                            <p style={{ color: 'var(--text-secondary)', margin: '0.5rem 0 0 0' }}>
                                {promotion.descripcion}
                            </p>
                        )}

                        {isStandalone && (
                            <div style={{ margin: '0.75rem 0 0', fontSize: '0.9rem', lineHeight: 1.5 }}>
                                <div>
                                    <strong>Incluye:</strong> {promotion.buyQuantity} × {promotion.mainProduct?.nombre || 'producto principal'}
                                    {freeLimit != null && <> + hasta <strong>{freeLimit}</strong> gratis a elección</>}
                                </div>
                                <div>
                                    <strong>Precio del paquete:</strong>{' '}
                                    {promotion.isBonified
                                        ? 'GRATIS (bonificada)'
                                        : (packPrice != null ? `$${formatCurrency(packPrice)}` : 'sin precio')}
                                </div>
                            </div>
                        )}

                        {configProblem ? (
                            <div className="assortment-requirement invalid" role="alert">
                                Esta promoción {configProblem}. Pide al administrador que la revise antes de venderla.
                            </div>
                        ) : (
                            <div className={`assortment-requirement ${isValid ? 'valid' : 'invalid'}`}>
                                <div>
                                    <strong>{isStandalone ? 'Gratis a elección:' : 'Cantidad Requerida:'}</strong>{' '}
                                    {isStandalone ? `hasta ${targetQuantity}` : `${targetQuantity} unidades`}
                                </div>
                                <div>
                                    <strong>Seleccionadas:</strong> {totalSelected} unidades
                                    {remaining > 0 && (
                                        <span style={{ color: '#f59e0b', marginLeft: '0.5rem' }}>
                                            {isStandalone ? `(puedes escoger ${remaining} más)` : `(Faltan ${remaining})`}
                                        </span>
                                    )}
                                    {remaining < 0 && (
                                        <span style={{ color: '#ef4444', marginLeft: '0.5rem' }}>
                                            (Excede en {Math.abs(remaining)})
                                        </span>
                                    )}
                                    {!isStandalone && isValid && (
                                        <span style={{ color: '#10b981', marginLeft: '0.5rem' }}>
                                            <span className="material-icons-round" style={{ fontSize: '16px', verticalAlign: 'middle' }}>
                                                check_circle
                                            </span> Completo
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Product Search */}
                    {!configProblem && (
                        <div className="product-search">
                            <label htmlFor="assortment-product-search" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
                                Buscar Producto
                            </label>
                            <div style={{ position: 'relative' }}>
                                <span className="material-icons-round" style={{
                                    position: 'absolute',
                                    left: '1rem',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    color: 'var(--text-muted)',
                                    fontSize: '20px'
                                }}>
                                    search
                                </span>
                                <input
                                    id="assortment-product-search"
                                    type="text"
                                    placeholder="Buscar por nombre..."
                                    value={searchTerm}
                                    onChange={(e) => {
                                        setSearchTerm(e.target.value);
                                        setShowResults(e.target.value.length > 0);
                                    }}
                                    onFocus={() => searchTerm && setShowResults(true)}
                                    disabled={loadingProducts || remaining <= 0}
                                />
                            </div>

                            {showResults && filteredProducts.length > 0 && (
                                <div className="product-search-results">
                                    {filteredProducts.slice(0, 10).map(product => (
                                        <div
                                            key={product.id}
                                            className="product-search-item"
                                            onClick={() => handleAddProduct(product)}
                                        >
                                            <div>
                                                <div style={{ fontWeight: 600 }}>{product.nombre}</div>
                                                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                                    Stock: {product.stock}
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleAddProduct(product);
                                                }}
                                                style={{
                                                    padding: '0.4rem 0.8rem',
                                                    background: 'var(--primary)',
                                                    color: 'white',
                                                    border: 'none',
                                                    borderRadius: '4px',
                                                    cursor: 'pointer',
                                                    fontSize: '0.85rem'
                                                }}
                                            >
                                                Agregar
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Selected Products Table */}
                    {selectedProducts.length > 0 && (
                        <div>
                            <h4 style={{ marginBottom: '1rem' }}>{isStandalone ? 'Productos gratis escogidos' : 'Productos Seleccionados'}</h4>
                            <table className="selected-products-table">
                                <thead>
                                    <tr>
                                        <th>Producto</th>
                                        <th>Stock Disponible</th>
                                        <th style={{ textAlign: 'center' }}>Cantidad</th>
                                        <th style={{ textAlign: 'center' }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {selectedProducts.map(product => (
                                        <tr key={product.id}>
                                            <td style={{ fontWeight: 600 }}>
                                                {product.nombre}
                                                {isStandalone && <span style={{ marginLeft: '6px', color: '#15803d', fontSize: '0.8rem' }}>$0</span>}
                                            </td>
                                            <td>
                                                <span className={`product-stock-badge ${product.stock < 10 ? 'low' : ''}`}>
                                                    {product.stock}
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                <input
                                                    type="number"
                                                    aria-label={`Cantidad de ${product.nombre}`}
                                                    value={product.cantidad}
                                                    onChange={(e) => handleUpdateQuantity(product.id, e.target.value)}
                                                    min="1"
                                                    max={isStandalone
                                                        ? product.cantidad + Math.max(remaining, 0)
                                                        : Math.min(product.stock, promotion.freeQuantity)}
                                                    onWheel={(e) => e.target.blur()}
                                                />
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveProduct(product.id)}
                                                    style={{
                                                        background: 'transparent',
                                                        border: 'none',
                                                        color: '#ef4444',
                                                        cursor: 'pointer',
                                                        padding: '0.25rem'
                                                    }}
                                                    title="Eliminar producto"
                                                >
                                                    <span className="material-icons-round">delete_outline</span>
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="form-actions" style={{ marginTop: '2rem' }}>
                        <button type="button" onClick={onClose} className="btn-cancel">
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={handleComplete}
                            className="btn-save"
                            disabled={!isValid || loading}
                            style={{
                                opacity: isValid ? 1 : 0.5,
                                cursor: isValid && !loading ? 'pointer' : 'not-allowed'
                            }}
                        >
                            {loading ? 'Completando...' : (isStandalone ? 'Agregar paquete' : 'Completar Promoción')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default AssortmentSelectionModal;
