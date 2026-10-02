import React, { useState, useEffect } from 'react';
import { useToast } from '../ToastContainer';

import productService from '../../api/productService';
import { formatCurrency } from '../../utils/formatters';
import SearchableSelect from '../SearchableSelect';
import './ProductFormModal.css';

/**
 * Crear / editar producto.
 *
 * El stock solo se escribe al CREAR (stock inicial). Al editar ya no se puede escribir un
 * número absoluto: pisaba las ventas hechas mientras el formulario estaba abierto y, con
 * stock negativo (deuda de pedidos), obligaba a "arreglarlo" borrando la deuda. Los cambios
 * de stock van por "Llegada" (suma mercancía) o "Conteo físico" (ajusta a lo contado).
 *
 * @param onAddStock       (producto) => abre "Llegada" (opcional)
 * @param onPhysicalCount  (producto) => abre "Conteo físico" (opcional)
 */
export default function ProductFormModal({ product, tags, onClose, onSuccess, onAddStock, onPhysicalCount }) {
    const isEditing = !!product;
    const toast = useToast();
    const [loading, setLoading] = useState(false);
    const [preview, setPreview] = useState(null);

    const [formData, setFormData] = useState({
        nombre: '',
        descripcion: '',
        precio: '',
        stock: '',
        reorderPoint: 10,
        tagId: '',
        active: true,
        image: null
    });

    useEffect(() => {
        if (product) {
            setFormData({
                nombre: product.nombre,
                descripcion: product.descripcion || '',
                precio: product.precio,
                stock: product.stock,
                reorderPoint: product.reorderPoint !== undefined ? product.reorderPoint : 10,
                tagId: product.tagId || '',
                active: product.active,
                image: null
            });
            if (product.imageUrl) {
                setPreview(product.imageUrl);
            }
        } else {
            // Reset for new product
            setFormData({
                nombre: '',
                descripcion: '',
                precio: '',
                stock: '',
                reorderPoint: 10,
                tagId: '',
                active: true,
                image: null
            });
            setPreview(null);
        }
    }, [product]);

    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setFormData(prev => ({ ...prev, image: file }));
            const objectUrl = URL.createObjectURL(file);
            setPreview(objectUrl);
        }
    };

    const handleRemoveImage = () => {
        setPreview(null);
        setFormData(prev => ({ ...prev, image: null }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (parseFloat(formData.precio) < 0) return toast.warning('El precio debe ser positivo');
        if (!isEditing && parseInt(formData.stock) < 0) return toast.warning('El stock inicial no puede ser negativo');

        setLoading(true);

        try {
            const data = new FormData();

            if (isEditing) {
                let hasChanges = false;

                if (formData.nombre !== product.nombre) {
                    data.append('nombre', formData.nombre);
                    hasChanges = true;
                }
                const originalDesc = product.descripcion || '';
                if (formData.descripcion !== originalDesc) {
                    data.append('descripcion', formData.descripcion);
                    hasChanges = true;
                }
                if (parseFloat(formData.precio) !== parseFloat(product.precio)) {
                    data.append('precio', formData.precio);
                    hasChanges = true;
                }
                // El stock NO se envía al editar (ver comentario del componente)
                const originalRp = product.reorderPoint !== undefined ? product.reorderPoint : 10;
                const newRp = formData.reorderPoint === '' ? 10 : parseInt(formData.reorderPoint);
                if (newRp !== originalRp) {
                    data.append('reorderPoint', newRp);
                    hasChanges = true;
                }
                const originalTag = product.tagId || '';
                if (formData.tagId !== originalTag) {
                    data.append('tagId', formData.tagId);
                    hasChanges = true;
                }
                if (formData.active !== product.active) {
                    data.append('active', formData.active);
                    hasChanges = true;
                }
                if (formData.image) {
                    data.append('image', formData.image);
                    hasChanges = true;
                }

                if (!hasChanges) {
                    toast.info('No hay cambios para guardar');
                    setLoading(false);
                    return;
                }

                const response = await productService.updateProduct(product.id, data);

                // Handle Blob Download
                const url = window.URL.createObjectURL(new Blob([response.data]));
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', 'huella_actualizacion.pdf');
                document.body.appendChild(link);
                link.click();
                link.parentNode.removeChild(link);

                toast.success('Producto actualizado exitosamente. Huella descargada.');

            } else {
                // CREATE
                data.append('nombre', formData.nombre);
                data.append('descripcion', formData.descripcion);
                data.append('precio', formData.precio);
                data.append('stock', formData.stock);
                data.append('reorderPoint', formData.reorderPoint === '' ? 10 : formData.reorderPoint);

                if (formData.tagId) data.append('tagId', formData.tagId);
                if (formData.image) data.append('image', formData.image);
                data.append('active', formData.active);

                const response = await productService.createProduct(data);

                // Handle Blob Download
                const url = window.URL.createObjectURL(new Blob([response.data]));
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', 'huella_creacion.pdf');
                document.body.appendChild(link);
                link.click();
                link.parentNode.removeChild(link);

                toast.success('Producto creado exitosamente. Huella descargada.');
            }
            onSuccess();
        } catch (error) {
            console.error(error);
            toast.error('Error al guardar: ' + (error.response?.data?.message || error.message));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="ui-modal-overlay pfm-overlay" onClick={onClose}>
            <div
                className="ui-modal ui-modal--md pfm-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="pfm-title"
                onClick={e => e.stopPropagation()}
            >
                <div className="ui-modal-header pfm-header">
                    <span className="ui-modal-icon" aria-hidden="true">
                        <span className="material-icons-round">{isEditing ? 'edit' : 'add_circle'}</span>
                    </span>
                    <div className="ui-modal-heading">
                        <h3 id="pfm-title" className="ui-modal-title">
                            {isEditing ? 'Editar Producto' : 'Crear Nuevo Producto'}
                        </h3>
                        <p className="ui-modal-subtitle">Al guardar se descarga la huella en PDF.</p>
                    </div>
                    <button type="button" onClick={onClose} className="ui-icon-btn pfm-close-btn" aria-label="Cerrar">
                        <span className="material-icons-round" aria-hidden="true">close</span>
                    </button>
                </div>

                <div className="ui-modal-body pfm-body">
                    <form id="productForm" onSubmit={handleSubmit} className="pfm-form">

                        {/* Componentes del formulario */}
                        <section className="ui-section">
                            <div className="ui-section-head">
                                <div>
                                    <h4 className="ui-section-title">Información del producto</h4>
                                </div>
                            </div>
                            <div className="ui-grid ui-grid--1">
                                <div className="ui-field">
                                    <label className="ui-label" htmlFor="pfm-nombre">Nombre del Producto <span className="ui-required">*</span></label>
                                    <input
                                        id="pfm-nombre"
                                        type="text"
                                        required
                                        className="ui-input"
                                        value={formData.nombre}
                                        onChange={e => setFormData({ ...formData, nombre: e.target.value })}
                                        placeholder="Ej: Camiseta básica"
                                    />
                                </div>

                                <div className="ui-field">
                                    <label className="ui-label" htmlFor="pfm-descripcion">Descripción <span className="ui-required">*</span></label>
                                    <textarea
                                        id="pfm-descripcion"
                                        required
                                        className="ui-textarea"
                                        rows="3"
                                        value={formData.descripcion}
                                        onChange={e => setFormData({ ...formData, descripcion: e.target.value })}
                                        placeholder="Detalles del producto..."
                                    />
                                </div>
                            </div>
                        </section>

                        <section className="ui-section">
                            <div className="ui-section-head">
                                <div>
                                    <h4 className="ui-section-title">Precio e inventario</h4>
                                </div>
                            </div>
                            <div className="ui-grid ui-grid--3">
                                <div className="ui-field">
                                    <label className="ui-label" htmlFor="pfm-precio">Precio ($) <span className="ui-required">*</span></label>
                                    <div className="ui-input-group">
                                        <span className="ui-input-prefix" aria-hidden="true">$</span>
                                        <input
                                            id="pfm-precio"
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            required
                                            className="ui-input"
                                            value={formData.precio}
                                            onWheel={(e) => e.target.blur()}
                                            onChange={e => setFormData({ ...formData, precio: e.target.value })}
                                        />
                                    </div>
                                    {formData.precio && (
                                        <span className="ui-help pfm-price-preview">
                                            Vista previa: <strong>${formatCurrency(formData.precio)}</strong>
                                        </span>
                                    )}
                                </div>
                                {isEditing ? (
                                    <div className="ui-field">
                                        <span className="ui-label">Stock actual</span>
                                        <div className={`pfm-stock-readonly${Number(product.stock) < 0 ? ' is-negative' : ''}`} data-testid="pfm-stock-actual">
                                            {product.stock ?? 0}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="ui-field">
                                        <label className="ui-label" htmlFor="pfm-stock">Stock inicial <span className="ui-required">*</span></label>
                                        <input
                                            id="pfm-stock"
                                            type="number"
                                            min="0"
                                            required
                                            className="ui-input"
                                            value={formData.stock}
                                            onChange={e => setFormData({ ...formData, stock: e.target.value })}
                                            onWheel={(e) => e.target.blur()}
                                        />
                                    </div>
                                )}
                                <div className="ui-field">
                                    <label className="ui-label" htmlFor="pfm-reorder" title="Alerta de stock bajo">Reorder Point</label>
                                    <input
                                        id="pfm-reorder"
                                        type="number"
                                        min="0"
                                        className="ui-input"
                                        value={formData.reorderPoint}
                                        onChange={e => setFormData({ ...formData, reorderPoint: e.target.value })}
                                        onWheel={(e) => e.target.blur()}
                                        placeholder="Def: 10"
                                    />
                                    <span className="ui-help">Alerta de stock bajo.</span>
                                </div>
                            </div>

                            {isEditing && (
                                <div className="ui-alert ui-alert--info pfm-stock-note" role="note">
                                    <span className="material-icons-round" aria-hidden="true">info</span>
                                    <div>
                                        <p>
                                            El stock no se edita aquí: un número escrito a mano pisaba las ventas en curso.
                                            Para sumar mercancía usa <strong>Llegada</strong>; para dejarlo igual a lo que hay en
                                            bodega usa <strong>Conteo físico</strong> (descuenta solo lo que está en pedidos).
                                        </p>
                                        {(onAddStock || onPhysicalCount) && (
                                            <div className="pfm-stock-actions">
                                                {onAddStock && (
                                                    <button type="button" className="ui-btn ui-btn--secondary ui-btn--sm"
                                                        onClick={() => onAddStock(product)}>
                                                        Registrar llegada
                                                    </button>
                                                )}
                                                {onPhysicalCount && (
                                                    <button type="button" className="ui-btn ui-btn--secondary ui-btn--sm"
                                                        onClick={() => onPhysicalCount(product)}>
                                                        Conteo físico
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </section>

                        <section className="ui-section">
                            <div className="ui-section-head">
                                <div>
                                    <h4 className="ui-section-title">Categoría e imagen</h4>
                                </div>
                            </div>
                            <div className="ui-stack">
                                <div className="ui-field">
                                    <label className="ui-label" htmlFor="pfm-tag">Categoría / Etiqueta</label>
                                    <SearchableSelect
                                        id="pfm-tag"
                                        value={formData.tagId}
                                        onChange={e => setFormData({ ...formData, tagId: e.target.value })}
                                        options={tags.map(tag => ({ value: tag.id, label: tag.name }))}
                                        emptyOption={{ label: '-- Sin etiqueta --' }}
                                        placeholder="-- Sin etiqueta --"
                                        searchPlaceholder="Escribe el nombre de la etiqueta…"
                                        noResultsText="Ninguna etiqueta coincide"
                                    />
                                </div>

                                <div className="pfm-image-upload">
                                    {preview ? (
                                        <div className="pfm-preview-container">
                                            <img src={preview} alt="Preview" className="pfm-preview-img" loading="lazy" decoding="async" />
                                            <button
                                                type="button"
                                                onClick={handleRemoveImage}
                                                className="ui-btn ui-btn--danger-ghost ui-btn--sm pfm-remove-img"
                                            >
                                                <span className="material-icons-round" aria-hidden="true">delete_outline</span>
                                                Quitar imagen
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="pfm-image-placeholder">
                                            <span className="material-icons-round" aria-hidden="true">image</span>
                                            <p>Arrastra una imagen o haz clic para seleccionar</p>
                                        </div>
                                    )}

                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="pfm-file-input"
                                        aria-label="Imagen del producto"
                                        onChange={handleImageChange}
                                        style={{ display: preview ? 'none' : 'block' }}
                                    />
                                </div>
                            </div>
                        </section>

                        <label className="ui-switch pfm-toggle-wrapper" htmlFor="activeToggle">
                            <input
                                type="checkbox"
                                id="activeToggle"
                                className="pfm-toggle-input"
                                checked={formData.active}
                                onChange={e => setFormData({ ...formData, active: e.target.checked })}
                            />
                            <span className="ui-switch-track"><span className="ui-switch-thumb" /></span>
                            <span className="ui-switch-text">
                                <span className="ui-switch-title pfm-toggle-label">Producto Activo</span>
                            </span>
                        </label>
                    </form>
                </div>

                <div className="ui-modal-footer pfm-footer">
                    <button type="button" onClick={onClose} className="ui-btn ui-btn--secondary" disabled={loading}>
                        Cancelar
                    </button>
                    <button type="submit" form="productForm" className="ui-btn ui-btn--primary" disabled={loading}>
                        {loading ? 'Guardando...' : (isEditing ? 'Actualizar Producto' : 'Crear Producto')}
                    </button>
                </div>
            </div>
        </div>
    );
}
