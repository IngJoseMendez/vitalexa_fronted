import { useState, useEffect } from 'react';
import promotionService from '../../api/promotionService';
import client from '../../api/client';
import { useToast } from '../ToastContainer';
import { PromotionType } from '../../utils/types';

function PromotionFormModal({ promotion, onClose, onSuccess }) {
    const [formData, setFormData] = useState({
        nombre: '',
        descripcion: '',
        type: PromotionType.PACK,
        buyQuantity: 40,
        freeQuantity: 10,
        packPrice: '',
        mainProductId: '',
        freeProductId: null,
        allowStackWithDiscounts: false,
        requiresAssortmentSelection: true,
        validFrom: '',
        validUntil: ''
    });
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loadingProducts, setLoadingProducts] = useState(true);
    const toast = useToast();

    useEffect(() => {
        const fetchProducts = async () => {
            try {
                setLoadingProducts(true);
                const response = await client.get('/admin/products');
                setProducts(response.data.content || response.data || []);
            } catch (error) {
                console.error('Error al cargar productos:', error);
                toast.error('Error al cargar productos');
            } finally {
                setLoadingProducts(false);
            }
        };
        fetchProducts();
    }, [toast]);

    useEffect(() => {
        if (promotion) {
            setFormData({
                nombre: promotion.nombre || '',
                descripcion: promotion.descripcion || '',
                type: promotion.type || PromotionType.PACK,
                buyQuantity: promotion.buyQuantity || 40,
                freeQuantity: promotion.freeQuantity || 10,
                packPrice: promotion.packPrice || '',
                mainProductId: promotion.mainProduct?.id || '',
                freeProductId: promotion.freeProduct?.id || null,
                allowStackWithDiscounts: promotion.allowStackWithDiscounts || false,
                requiresAssortmentSelection: promotion.requiresAssortmentSelection !== false,
                validFrom: promotion.validFrom ? promotion.validFrom.substring(0, 16) : '',
                validUntil: promotion.validUntil ? promotion.validUntil.substring(0, 16) : ''
            });
        }
    }, [promotion]);

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Validations
        if (!formData.nombre.trim()) {
            toast.warning('El nombre es obligatorio');
            return;
        }

        if (formData.buyQuantity <= 0) {
            toast.warning('La cantidad a comprar debe ser mayor a 0');
            return;
        }

        if (formData.freeQuantity <= 0) {
            toast.warning('La cantidad gratis debe ser mayor a 0');
            return;
        }

        if (formData.type === PromotionType.PACK && !formData.packPrice) {
            toast.warning('El precio del pack es obligatorio para promociones tipo PACK');
            return;
        }

        if (!formData.mainProductId) {
            toast.warning('Debe seleccionar un producto principal');
            return;
        }

        if (formData.validFrom && formData.validUntil) {
            const from = new Date(formData.validFrom);
            const until = new Date(formData.validUntil);
            if (until <= from) {
                toast.warning('La fecha de fin debe ser posterior a la fecha de inicio');
                return;
            }
        }

        setLoading(true);

        try {
            const payload = {
                nombre: formData.nombre.trim(),
                descripcion: formData.descripcion.trim() || null,
                type: formData.type,
                buyQuantity: parseInt(formData.buyQuantity),
                freeQuantity: parseInt(formData.freeQuantity),
                packPrice: formData.type === PromotionType.PACK ? parseFloat(formData.packPrice) : null,
                mainProductId: formData.mainProductId,
                freeProductId: formData.freeProductId || null,
                allowStackWithDiscounts: formData.allowStackWithDiscounts,
                requiresAssortmentSelection: formData.requiresAssortmentSelection,
                validFrom: formData.validFrom ? `${formData.validFrom}:00` : null,
                validUntil: formData.validUntil ? `${formData.validUntil}:59` : null
            };

            if (promotion) {
                await promotionService.update(promotion.id, payload);
                toast.success('Promoción actualizada exitosamente');
            } else {
                await promotionService.create(payload);
                toast.success('Promoción creada exitosamente');
            }

            onSuccess();
        } catch (error) {
            console.error('Error al guardar promoción:', error);
            const errorMsg = error.response?.data?.message || error.response?.data || error.message;
            toast.error('Error al guardar promoción: ' + errorMsg);
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content form-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>{promotion ? '✏️ Editar Promoción' : '➕ Nueva Promoción'}</h3>
                    <button className="btn-close" onClick={onClose}>
                        <span className="material-icons-round">close</span>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="promotion-form">
                    {/* Basic Info */}
                    <div className="form-section">
                        <h4>Información Básica</h4>

                        <div className="form-group">
                            <label>Nombre *</label>
                            <input
                                type="text"
                                value={formData.nombre}
                                onChange={(e) => handleChange('nombre', e.target.value)}
                                placeholder="Ej: Pack 40+10 Especial"
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label>Descripción</label>
                            <textarea
                                value={formData.descripcion}
                                onChange={(e) => handleChange('descripcion', e.target.value)}
                                rows="3"
                                placeholder="Descripción detallada de la promoción"
                            />
                        </div>
                    </div>

                    {/* Promotion Type */}
                    <div className="form-section">
                        <h4>Tipo de Promoción</h4>
                        <div className="radio-group">
                            <div
                                className={`radio-option ${formData.type === PromotionType.PACK ? 'selected' : ''}`}
                                onClick={() => handleChange('type', PromotionType.PACK)}
                            >
                                <input
                                    type="radio"
                                    name="type"
                                    value={PromotionType.PACK}
                                    checked={formData.type === PromotionType.PACK}
                                    onChange={() => handleChange('type', PromotionType.PACK)}
                                />
                                <label>
                                    <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📦</div>
                                    <div style={{ fontWeight: 700 }}>Pack</div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                        Precio fijo por cantidad específica
                                    </div>
                                </label>
                            </div>

                            <div
                                className={`radio-option ${formData.type === PromotionType.BUY_GET_FREE ? 'selected' : ''}`}
                                onClick={() => handleChange('type', PromotionType.BUY_GET_FREE)}
                            >
                                <input
                                    type="radio"
                                    name="type"
                                    value={PromotionType.BUY_GET_FREE}
                                    checked={formData.type === PromotionType.BUY_GET_FREE}
                                    onChange={() => handleChange('type', PromotionType.BUY_GET_FREE)}
                                />
                                <label>
                                    <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>🎁</div>
                                    <div style={{ fontWeight: 700 }}>Compra y Recibe</div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                        Compra X y recibe Y gratis
                                    </div>
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* Quantities and Price */}
                    <div className="form-row">
                        <div className="form-group">
                            <label>Cantidad a Comprar *</label>
                            <input
                                type="number"
                                value={formData.buyQuantity}
                                onChange={(e) => handleChange('buyQuantity', e.target.value)}
                                min="1"
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label>Cantidad Gratis/Surtida *</label>
                            <input
                                type="number"
                                value={formData.freeQuantity}
                                onChange={(e) => handleChange('freeQuantity', e.target.value)}
                                min="1"
                                required
                            />
                        </div>
                    </div>

                    {formData.type === PromotionType.PACK && (
                        <div className="form-group">
                            <label>Precio del Pack *</label>
                            <input
                                type="number"
                                step="0.01"
                                value={formData.packPrice}
                                onChange={(e) => handleChange('packPrice', e.target.value)}
                                placeholder="0.00"
                                required
                            />
                        </div>
                    )}

                    {/* Products */}
                    <div className="form-section">
                        <h4>Productos</h4>

                        <div className="form-group">
                            <label>Producto Principal *</label>
                            {loadingProducts ? (
                                <p>Cargando productos...</p>
                            ) : (
                                <select
                                    value={formData.mainProductId}
                                    onChange={(e) => handleChange('mainProductId', e.target.value)}
                                    required
                                >
                                    <option value="">Seleccione un producto</option>
                                    {products.filter(p => p.active).map(product => (
                                        <option key={product.id} value={product.id}>
                                            {product.nombre} - ${parseFloat(product.precio).toFixed(2)} (Stock: {product.stock})
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>

                        <div className="form-group">
                            <label>Producto Gratis Específico (opcional)</label>
                            <select
                                value={formData.freeProductId || ''}
                                onChange={(e) => handleChange('freeProductId', e.target.value || null)}
                            >
                                <option value="">Sin producto específico (admin selecciona surtidos)</option>
                                {products.filter(p => p.active).map(product => (
                                    <option key={product.id} value={product.id}>
                                        {product.nombre} - ${parseFloat(product.precio).toFixed(2)}
                                    </option>
                                ))}
                            </select>
                            <small style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem', display: 'block' }}>
                                Si no selecciona un producto específico, el admin deberá seleccionar los productos surtidos manualmente al aprobar la orden.
                            </small>
                        </div>
                    </div>

                    {/* Options */}
                    <div className="form-section">
                        <h4>Opciones</h4>

                        <div className="form-group">
                            <label className="checkbox-label">
                                <input
                                    type="checkbox"
                                    checked={formData.allowStackWithDiscounts}
                                    onChange={(e) => handleChange('allowStackWithDiscounts', e.target.checked)}
                                />
                                Permitir combinar con descuentos
                            </label>
                        </div>

                        <div className="form-group">
                            <label className="checkbox-label">
                                <input
                                    type="checkbox"
                                    checked={formData.requiresAssortmentSelection}
                                    onChange={(e) => handleChange('requiresAssortmentSelection', e.target.checked)}
                                />
                                Requiere selección de productos surtidos
                            </label>
                            <small style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem', display: 'block' }}>
                                Si está desactivado, se usará el producto gratis específico seleccionado arriba.
                            </small>
                        </div>
                    </div>

                    {/* Validity Period */}
                    <div className="form-section">
                        <h4>Período de Vigencia</h4>

                        <div className="form-row">
                            <div className="form-group">
                                <label>Fecha de Inicio</label>
                                <input
                                    type="datetime-local"
                                    value={formData.validFrom}
                                    onChange={(e) => handleChange('validFrom', e.target.value)}
                                />
                            </div>

                            <div className="form-group">
                                <label>Fecha de Fin</label>
                                <input
                                    type="datetime-local"
                                    value={formData.validUntil}
                                    onChange={(e) => handleChange('validUntil', e.target.value)}
                                />
                            </div>
                        </div>
                        <small style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            Deje en blanco para promoción sin límite de tiempo
                        </small>
                    </div>

                    {/* Form Actions */}
                    <div className="form-actions">
                        <button type="button" onClick={onClose} className="btn-cancel">
                            Cancelar
                        </button>
                        <button type="submit" disabled={loading} className="btn-save">
                            {loading ? 'Guardando...' : (promotion ? 'Actualizar' : 'Crear Promoción')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default PromotionFormModal;
