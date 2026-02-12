import React, { useState, useEffect } from 'react';
import { useToast } from '../ToastContainer';

import productService from '../../api/productService';
import { formatCurrency } from '../../utils/formatters';
import './ProductFormModal.css';

export default function ProductFormModal({ product, tags, onClose, onSuccess }) {
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
        if (parseInt(formData.stock) < 0) return toast.warning('El stock debe ser positivo');

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
                if (parseInt(formData.stock) !== parseInt(product.stock)) {
                    data.append('stock', formData.stock);
                    hasChanges = true;
                }
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
        <div className="pfm-overlay" onClick={onClose}>
            <div className="pfm-modal" onClick={e => e.stopPropagation()}>
                <div className="pfm-header">
                    <h3>
                        <span className="material-icons-round" style={{ color: 'var(--pfm-primary)' }}>
                            {isEditing ? 'edit' : 'add_circle'}
                        </span>
                        {isEditing ? 'Editar Producto' : 'Crear Nuevo Producto'}
                    </h3>
                    <button onClick={onClose} className="pfm-close-btn">&times;</button>
                </div>

                <div className="pfm-body">
                    <form id="productForm" onSubmit={handleSubmit} className="pfm-form">

                        {/* Componentes del formulario */}
                        <div className="pfm-group">
                            <label className="pfm-label">Nombre del Producto *</label>
                            <input
                                type="text"
                                required
                                className="pfm-input"
                                value={formData.nombre}
                                onChange={e => setFormData({ ...formData, nombre: e.target.value })}
                                placeholder="Ej: Camiseta básica"
                            />
                        </div>

                        <div className="pfm-group">
                            <label className="pfm-label">Descripción *</label>
                            <textarea
                                required
                                className="pfm-textarea"
                                rows="3"
                                value={formData.descripcion}
                                onChange={e => setFormData({ ...formData, descripcion: e.target.value })}
                                placeholder="Detalles del producto..."
                            />
                        </div>

                        <div className="pfm-grid-3">
                            <div className="pfm-group">
                                <label className="pfm-label">Precio ($) *</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    required
                                    className="pfm-input"
                                    value={formData.precio}
                                    onWheel={(e) => e.target.blur()}
                                    onChange={e => setFormData({ ...formData, precio: e.target.value })}
                                />
                                {formData.precio && (
                                    <div style={{ fontSize: '0.8rem', color: 'var(--pfm-text-sec)', marginTop: '4px' }}>
                                        Vista previa: <strong>${formatCurrency(formData.precio)}</strong>
                                    </div>
                                )}
                            </div>
                            <div className="pfm-group">
                                <label className="pfm-label">Stock *</label>
                                <input
                                    type="number"
                                    min="0"
                                    required
                                    className="pfm-input"
                                    value={formData.stock}
                                    onChange={e => setFormData({ ...formData, stock: e.target.value })}
                                    onWheel={(e) => e.target.blur()}
                                />
                            </div>
                            <div className="pfm-group">
                                <label className="pfm-label" title="Alerta de stock bajo">Reorder Point</label>
                                <input
                                    type="number"
                                    min="0"
                                    className="pfm-input"
                                    value={formData.reorderPoint}
                                    onChange={e => setFormData({ ...formData, reorderPoint: e.target.value })}
                                    onWheel={(e) => e.target.blur()}
                                    placeholder="Def: 10"
                                />
                            </div>
                        </div>

                        <div className="pfm-group">
                            <label className="pfm-label">Categoría / Etiqueta</label>
                            <select
                                className="pfm-select"
                                value={formData.tagId}
                                onChange={e => setFormData({ ...formData, tagId: e.target.value })}
                            >
                                <option value="">-- Sin etiqueta --</option>
                                {tags.map(tag => (
                                    <option key={tag.id} value={tag.id}>{tag.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="pfm-image-upload">
                            {preview ? (
                                <div className="pfm-preview-container">
                                    <img src={preview} alt="Preview" className="pfm-preview-img" />
                                    <br />
                                    <button
                                        type="button"
                                        onClick={handleRemoveImage}
                                        className="pfm-remove-img"
                                    >
                                        Quitar imagen
                                    </button>
                                </div>
                            ) : (
                                <div style={{ marginBottom: '1rem', color: 'var(--pfm-text-sec)' }}>
                                    <span className="material-icons-round" style={{ fontSize: '48px', color: '#cbd5e1' }}>image</span>
                                    <p>Arrastra una imagen o haz clic para seleccionar</p>
                                </div>
                            )}

                            <input
                                type="file"
                                accept="image/*"
                                onChange={handleImageChange}
                                style={{ display: preview ? 'none' : 'block', margin: '0 auto' }}
                            />
                        </div>

                        <div className="pfm-toggle-wrapper">
                            <label className="pfm-toggle-label" htmlFor="activeToggle">
                                Producto Activo
                            </label>
                            <input
                                type="checkbox"
                                id="activeToggle"
                                className="pfm-toggle-input"
                                checked={formData.active}
                                onChange={e => setFormData({ ...formData, active: e.target.checked })}
                            />
                        </div>
                    </form>
                </div>

                <div className="pfm-footer">
                    <button type="button" onClick={onClose} className="pfm-btn pfm-btn-secondary" disabled={loading}>
                        Cancelar
                    </button>
                    <button type="submit" form="productForm" className="pfm-btn pfm-btn-primary" disabled={loading}>
                        {loading ? 'Guardando...' : (isEditing ? 'Actualizar Producto' : 'Crear Producto')}
                    </button>
                </div>
            </div>
        </div>
    );
}
