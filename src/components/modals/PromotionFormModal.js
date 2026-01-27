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
        freeQuantity: 0,
        packPrice: '',
        mainProductId: '',
        giftItems: [], // Array of { productId, quantity, tempId }
        allowStackWithDiscounts: false,
        requiresAssortmentSelection: false,
        validFrom: '',
        validUntil: ''
    });

    // Temporary state for adding a new gift item
    const [newGift, setNewGift] = useState({
        productId: '',
        quantity: 1
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
            // No mapping needed as we use legacy types directly now
            // PACK = Fixed, BUY_GET_FREE = Assortment

            let initialGifts = [];
            if (promotion.giftItems && promotion.giftItems.length > 0) {
                initialGifts = promotion.giftItems.map(item => ({
                    productId: item.product ? item.product.id : item.productId,
                    quantity: item.quantity,
                    tempId: Math.random().toString(36).substr(2, 9)
                }));
            } else if (promotion.freeProduct && promotion.freeQuantity) {
                // Legacy support
                initialGifts = [{
                    productId: promotion.freeProduct.id,
                    quantity: promotion.freeQuantity,
                    tempId: Math.random().toString(36).substr(2, 9)
                }];
            }

            setFormData({
                nombre: promotion.nombre || '',
                descripcion: promotion.descripcion || '',
                type: promotion.type, // Use type directly
                buyQuantity: promotion.buyQuantity || 40,
                freeQuantity: promotion.freeQuantity || 0,
                packPrice: promotion.packPrice || '',
                mainProductId: promotion.mainProduct?.id || '',
                giftItems: initialGifts,
                allowStackWithDiscounts: promotion.allowStackWithDiscounts || false,
                requiresAssortmentSelection: promotion.requiresAssortmentSelection || false,
                validFrom: promotion.validFrom ? promotion.validFrom.substring(0, 16) : '',
                validUntil: promotion.validUntil ? promotion.validUntil.substring(0, 16) : ''
            });
        }
    }, [promotion]);

    const handleAddGift = () => {
        if (!newGift.productId) {
            toast.warning('Seleccione un producto para regalar');
            return;
        }
        if (newGift.quantity <= 0) {
            toast.warning('La cantidad debe ser mayor a 0');
            return;
        }

        setFormData(prev => ({
            ...prev,
            giftItems: [...prev.giftItems, { ...newGift, tempId: Math.random().toString(36).substr(2, 9) }]
        }));

        // Reset new gift input
        setNewGift({ productId: '', quantity: 1 });
    };

    const handleRemoveGift = (tempId) => {
        setFormData(prev => ({
            ...prev,
            giftItems: prev.giftItems.filter(item => item.tempId !== tempId)
        }));
    };

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

        if (formData.type === PromotionType.PACK && !formData.packPrice) {
            // Price validation logic if needed
        }

        if (!formData.mainProductId) {
            toast.warning('Debe seleccionar un producto principal');
            return;
        }

        if (formData.type === PromotionType.PACK && formData.giftItems.length === 0) {
            toast.warning('Agregue al menos un producto de regalo para la Promoción Fija');
            return;
        }

        if (formData.type === PromotionType.BUY_GET_FREE && (!formData.freeQuantity || formData.freeQuantity <= 0)) {
            toast.warning('Ingrese la cantidad de productos a bonificar (Surtido)');
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
            // Construct payload
            const payload = {
                nombre: formData.nombre.trim(),
                descripcion: formData.descripcion.trim() || null,
                type: formData.type,
                buyQuantity: parseInt(formData.buyQuantity),
                packPrice: formData.packPrice ? parseFloat(formData.packPrice) : null,
                mainProductId: formData.mainProductId,
                allowStackWithDiscounts: formData.allowStackWithDiscounts,

                // Logic specific to type
                requiresAssortmentSelection: formData.type === PromotionType.BUY_GET_FREE,
                freeQuantity: formData.type === PromotionType.BUY_GET_FREE ? parseInt(formData.freeQuantity) : 0,
                giftItems: formData.type === PromotionType.PACK ? formData.giftItems.map(item => ({
                    productId: item.productId,
                    quantity: parseInt(item.quantity)
                })) : [],

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
            onClose();
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
                                    <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>🎁</div>
                                    <div style={{ fontWeight: 700 }}>Concreta (Fija)</div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                        Regalos predefinidos (Ej: Compra A recibe B)
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
                                    <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>🔄</div>
                                    <div style={{ fontWeight: 700 }}>Surtido (Variable)</div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                        Cantidad libre a elegir después (Ej: Compra A recibe 5 items a elección)
                                    </div>
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* Main Product and Price */}
                    <div className="form-section">
                        <h4>Producto Principal</h4>
                        <div className="form-row">
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
                                <label>Cantidad a Comprar *</label>
                                <input
                                    type="number"
                                    value={formData.buyQuantity}
                                    onChange={(e) => handleChange('buyQuantity', e.target.value)}
                                    min="1"
                                    required
                                />
                            </div>
                        </div>

                        {(formData.type === PromotionType.PACK || formData.type === PromotionType.BUY_GET_FREE) && (
                            <div className="form-group" style={{ marginTop: '1rem' }}>
                                <label>Precio Promocional (Opcional)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={formData.packPrice}
                                    onChange={(e) => handleChange('packPrice', e.target.value)}
                                    placeholder="Dejar vacío para usar precio regular"
                                />
                            </div>
                        )}
                    </div>

                    {/* Rewards Section */}
                    <div className="form-section highlight-section">
                        <h3>{formData.type === PromotionType.PACK ? 'Productos de Regalo' : 'Beneficio Surtido'}</h3>

                        {formData.type === PromotionType.PACK ? (
                            <div className="gift-items-builder">
                                {formData.giftItems.length > 0 && (
                                    <div className="gift-items-list" style={{ marginBottom: '1.5rem', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                                        {formData.giftItems.map((item, index) => {
                                            const product = products.find(p => p.id === item.productId);
                                            return (
                                                <div key={item.tempId} style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    padding: '0.75rem',
                                                    background: index % 2 === 0 ? 'white' : '#f8fafc',
                                                    borderBottom: '1px solid var(--border)'
                                                }}>
                                                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                                        <span style={{ fontWeight: 'bold', color: 'var(--primary)' }}>{item.quantity}x</span>
                                                        <span>{product ? product.nombre : 'Producto desconocido'}</span>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveGift(item.tempId)}
                                                        style={{
                                                            background: 'none',
                                                            border: 'none',
                                                            color: 'var(--danger)',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center'
                                                        }}
                                                        title="Eliminar"
                                                    >
                                                        <span className="material-icons-round">delete</span>
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Add new gift form */}
                                <div className="add-gift-row" style={{
                                    display: 'grid',
                                    gridTemplateColumns: '2fr 1fr auto',
                                    gap: '1rem',
                                    alignItems: 'end',
                                    background: '#eff6ff',
                                    padding: '1rem',
                                    borderRadius: '8px'
                                }}>
                                    <div className="form-group" style={{ marginBottom: 0 }}>
                                        <label style={{ fontSize: '0.85rem' }}>Añadir Producto Gratis</label>
                                        <select
                                            value={newGift.productId}
                                            onChange={(e) => setNewGift(prev => ({ ...prev, productId: e.target.value }))}
                                            style={{ background: 'white' }}
                                        >
                                            <option value="">Seleccione producto...</option>
                                            {products.filter(p => p.active && p.id !== formData.mainProductId).map(product => (
                                                <option key={product.id} value={product.id}>
                                                    {product.nombre}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="form-group" style={{ marginBottom: 0 }}>
                                        <label style={{ fontSize: '0.85rem' }}>Cantidad</label>
                                        <input
                                            type="number"
                                            value={newGift.quantity}
                                            onChange={(e) => setNewGift(prev => ({ ...prev, quantity: parseInt(e.target.value) || 0 }))}
                                            min="1"
                                            style={{ background: 'white' }}
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleAddGift}
                                        className="btn-primary-gradient"
                                        style={{
                                            padding: '0.6rem 0.6rem',
                                            borderRadius: '6px',
                                            height: '42px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}
                                        disabled={!newGift.productId || newGift.quantity <= 0}
                                    >
                                        <span className="material-icons-round">add</span>
                                    </button>
                                </div>
                                <small style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem', display: 'block' }}>
                                    Agregue uno o más productos a la lista de regalos.
                                </small>
                            </div>
                        ) : (
                            // Assortment View
                            <div className="assortment-config" style={{ padding: '1.5rem', background: '#f0f9ff', borderRadius: '8px', border: '1px dashed var(--primary)' }}>
                                <div className="form-group">
                                    <label style={{ color: 'var(--primary-dark)', fontWeight: 'bold' }}>Cantidad Total a Bonificar *</label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <input
                                            type="number"
                                            min="1"
                                            value={formData.freeQuantity}
                                            onChange={(e) => handleChange('freeQuantity', e.target.value)}
                                            style={{
                                                fontSize: '1.5rem',
                                                fontWeight: 'bold',
                                                width: '120px',
                                                textAlign: 'center',
                                                padding: '0.5rem',
                                                borderColor: 'var(--primary)'
                                            }}
                                            placeholder="0"
                                            required
                                        />
                                        <span style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>Unidades a elección del vendedor</span>
                                    </div>
                                    <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                                        Esta promoción permitirá al vendedor elegir hasta <strong>{formData.freeQuantity || 0}</strong> productos de cualquier tipo del catálogo al momento de cerrar la venta.
                                    </p>
                                </div>
                            </div>
                        )}
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
                    </div>

                    {/* Validity Period */}
                    <div className="form-section">
                        <h4>Período de Vigencia</h4>

                        <div className="form-row validity-row">
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
