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
import '../../styles/areas/AssortmentSelectionModal.css';

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
        <div className="ui-modal-overlay asm-overlay">
            <div
                className="ui-modal ui-modal--md asm-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="asm-title"
            >
                {/* .modal-content: envoltura sin caja propia (display: contents) que conserva el
                    stopPropagation y el gancho que usan los tests; el estilo lo da .ui-modal */}
                <div className="modal-content asm-content" onClick={(e) => e.stopPropagation()}>
                    <div className="ui-modal-header">
                        <span className="ui-modal-icon" aria-hidden="true">
                            <span className="material-icons-round">inventory</span>
                        </span>
                        <div className="ui-modal-heading">
                            <h3 id="asm-title" className="ui-modal-title">
                                {isStandalone ? 'Escoger productos gratis' : 'Seleccionar Productos Surtidos'}
                            </h3>
                        </div>
                        <button type="button" className="ui-icon-btn" onClick={onClose} aria-label="Cerrar">
                            <span className="material-icons-round" aria-hidden="true">close</span>
                        </button>
                    </div>

                    <div className="ui-modal-body asm-body">
                        {/* Promotion Info Header */}
                        <section className="ui-section asm-info">
                            <h3 className="asm-promo-name">{promotion.nombre}</h3>
                            {progressLabel && (
                                <span className="ui-badge ui-badge--primary asm-progress">{progressLabel}</span>
                            )}
                            {promotion.descripcion && (
                                <p className="asm-desc">
                                    {promotion.descripcion}
                                </p>
                            )}

                            {isStandalone && (
                                <div className="asm-pack">
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
                                <div className="ui-alert ui-alert--danger asm-alert" role="alert">
                                    Esta promoción {configProblem}. Pide al administrador que la revise antes de venderla.
                                </div>
                            ) : (
                                <div className={`asm-requirement ${isValid ? 'is-valid' : 'is-invalid'}`}>
                                    <div>
                                        <strong>{isStandalone ? 'Gratis a elección:' : 'Cantidad Requerida:'}</strong>{' '}
                                        {isStandalone ? `hasta ${targetQuantity}` : `${targetQuantity} unidades`}
                                    </div>
                                    <div>
                                        <strong>Seleccionadas:</strong> {totalSelected} unidades
                                        {remaining > 0 && (
                                            <span className="asm-note">
                                                {isStandalone ? `(puedes escoger ${remaining} más)` : `(Faltan ${remaining})`}
                                            </span>
                                        )}
                                        {remaining < 0 && (
                                            <span className="asm-note asm-note--danger">
                                                (Excede en {Math.abs(remaining)})
                                            </span>
                                        )}
                                        {!isStandalone && isValid && (
                                            <span className="asm-note asm-note--success">
                                                <span className="material-icons-round" aria-hidden="true">
                                                    check_circle
                                                </span> Completo
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}
                        </section>

                        <section className="ui-section asm-picker">
                            {/* Product Search */}
                            {!configProblem && (
                                <div className="ui-field asm-search">
                                    <label htmlFor="assortment-product-search" className="ui-label">
                                        Buscar Producto
                                    </label>
                                    <div className="ui-input-group">
                                        <span className="material-icons-round ui-input-icon" aria-hidden="true">
                                            search
                                        </span>
                                        <input
                                            id="assortment-product-search"
                                            type="text"
                                            className="ui-input"
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
                                        <div className="asm-results">
                                            {filteredProducts.slice(0, 10).map(product => (
                                                <div
                                                    key={product.id}
                                                    className="product-search-item asm-result"
                                                    onClick={() => handleAddProduct(product)}
                                                >
                                                    <div className="asm-result-info">
                                                        <div className="asm-result-name">{product.nombre}</div>
                                                        <div className="asm-result-stock">
                                                            Stock: {product.stock}
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        className="ui-btn ui-btn--secondary ui-btn--sm"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleAddProduct(product);
                                                        }}
                                                    >
                                                        <span className="material-icons-round" aria-hidden="true">add</span>
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
                                <div className="asm-selected">
                                    <h4 className="asm-selected-title">{isStandalone ? 'Productos gratis escogidos' : 'Productos Seleccionados'}</h4>
                                    <div className="ui-table-wrap">
                                        <table className="ui-table ui-table--compact asm-table">
                                            <thead>
                                                <tr>
                                                    <th>Producto</th>
                                                    <th className="ui-num">Stock Disponible</th>
                                                    <th className="asm-center">Cantidad</th>
                                                    <th className="asm-center">Acciones</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {selectedProducts.map(product => (
                                                    <tr key={product.id}>
                                                        <td className="asm-product">
                                                            {product.nombre}
                                                            {isStandalone && <span className="ui-badge ui-badge--success asm-free">$0</span>}
                                                        </td>
                                                        <td className="ui-num">
                                                            <span className={`ui-badge ${product.stock < 10 ? 'ui-badge--warning' : 'ui-badge--neutral'}`}>
                                                                {product.stock}
                                                            </span>
                                                        </td>
                                                        <td className="asm-center">
                                                            <input
                                                                type="number"
                                                                className="ui-input asm-qty"
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
                                                        <td className="asm-center">
                                                            <button
                                                                type="button"
                                                                className="ui-icon-btn ui-icon-btn--danger"
                                                                onClick={() => handleRemoveProduct(product.id)}
                                                                title="Eliminar producto"
                                                            >
                                                                <span className="material-icons-round" aria-hidden="true">delete_outline</span>
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </section>
                    </div>

                    {/* Actions */}
                    <div className="ui-modal-footer">
                        <button type="button" onClick={onClose} className="ui-btn ui-btn--secondary">
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={handleComplete}
                            className="ui-btn ui-btn--primary"
                            disabled={!isValid || loading}
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
