import { useState, useEffect } from 'react';
import client from '../../api/client';
import promotionService from '../../api/promotionService';
import { useToast } from '../ToastContainer';

function AssortmentSelectionModal({ orderId, promotion, onClose, onSuccess }) {
    const [selectedProducts, setSelectedProducts] = useState([]);
    const [products, setProducts] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [showResults, setShowResults] = useState(false);
    const [loading, setLoading] = useState(false);
    const [loadingProducts, setLoadingProducts] = useState(true);
    const toast = useToast();

    useEffect(() => {
        const fetchProducts = async () => {
            try {
                setLoadingProducts(true);
                const response = await client.get('/admin/products');
                const allProducts = response.data.content || response.data || [];
                setProducts(allProducts.filter(p => p.active));
            } catch (error) {
                console.error('Error al cargar productos:', error);
                toast.error('Error al cargar productos');
            } finally {
                setLoadingProducts(false);
            }
        };

        fetchProducts();
    }, [toast]);

    const filteredProducts = products.filter(p =>
        p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !selectedProducts.some(sp => sp.id === p.id)
    );

    const totalSelected = selectedProducts.reduce((sum, p) => sum + p.cantidad, 0);
    const isValid = totalSelected === promotion.freeQuantity;
    const remaining = promotion.freeQuantity - totalSelected;

    const handleAddProduct = (product) => {
        const maxToAdd = remaining;
        if (maxToAdd <= 0) {
            toast.warning('Ya has alcanzado la cantidad requerida');
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
        const cantidad = parseInt(newCantidad);

        if (isNaN(cantidad) || cantidad < 1) {
            handleRemoveProduct(productId);
            return;
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
            toast.warning(`Debe seleccionar exactamente ${promotion.freeQuantity} productos`);
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
            onSuccess();
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
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content assortment-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>
                        <span className="material-icons-round" style={{ verticalAlign: 'middle', marginRight: '0.5rem' }}>
                            inventory
                        </span>
                        Seleccionar Productos Surtidos
                    </h3>
                    <button className="btn-close" onClick={onClose}>
                        <span className="material-icons-round">close</span>
                    </button>
                </div>

                <div style={{ padding: '2rem' }}>
                    {/* Promotion Info Header */}
                    <div className="assortment-header">
                        <h3>{promotion.nombre}</h3>
                        <p style={{ color: 'var(--text-secondary)', margin: '0.5rem 0 0 0' }}>
                            {promotion.descripcion}
                        </p>

                        <div className={`assortment-requirement ${isValid ? 'valid' : 'invalid'}`}>
                            <div>
                                <strong>Cantidad Requerida:</strong> {promotion.freeQuantity} unidades
                            </div>
                            <div>
                                <strong>Seleccionadas:</strong> {totalSelected} unidades
                                {remaining > 0 && (
                                    <span style={{ color: '#f59e0b', marginLeft: '0.5rem' }}>
                                        (Faltan {remaining})
                                    </span>
                                )}
                                {remaining < 0 && (
                                    <span style={{ color: '#ef4444', marginLeft: '0.5rem' }}>
                                        (Excede en {Math.abs(remaining)})
                                    </span>
                                )}
                                {isValid && (
                                    <span style={{ color: '#10b981', marginLeft: '0.5rem' }}>
                                        <span className="material-icons-round" style={{ fontSize: '16px', verticalAlign: 'middle' }}>
                                            check_circle
                                        </span> Completo
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Product Search */}
                    <div className="product-search">
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
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

                    {/* Selected Products Table */}
                    {selectedProducts.length > 0 && (
                        <div>
                            <h4 style={{ marginBottom: '1rem' }}>Productos Seleccionados</h4>
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
                                            <td style={{ fontWeight: 600 }}>{product.nombre}</td>
                                            <td>
                                                <span className={`product-stock-badge ${product.stock < 10 ? 'low' : ''}`}>
                                                    {product.stock}
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                <input
                                                    type="number"
                                                    value={product.cantidad}
                                                    onChange={(e) => handleUpdateQuantity(product.id, e.target.value)}
                                                    min="1"
                                                    max={Math.min(product.stock, promotion.freeQuantity)}
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
                            {loading ? 'Completando...' : 'Completar Promoción'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default AssortmentSelectionModal;
