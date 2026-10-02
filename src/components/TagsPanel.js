import React, { useState, useEffect, useCallback } from 'react';
import { tagService } from '../api/tagService';
import { useToast } from './ToastContainer';
import { useConfirm } from './ConfirmDialog';
import '../styles/areas/Inventory.css';

export default function TagsPanel() {
    const [tags, setTags] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingTag, setEditingTag] = useState(null);
    const [formData, setFormData] = useState({ name: '' });
    const toast = useToast();
    const confirm = useConfirm();

    const fetchTags = useCallback(async () => {
        try {
            setLoading(true);
            const res = await tagService.getAll();
            setTags(res.data);
        } catch (error) {
            toast.error('Error al cargar etiquetas');
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        fetchTags();
    }, [fetchTags]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.name.trim()) return;

        try {
            if (editingTag) {
                await tagService.update(editingTag.id, formData);
                toast.success('Etiqueta actualizada');
            } else {
                await tagService.create(formData);
                toast.success('Etiqueta creada');
            }
            setShowModal(false);
            setEditingTag(null);
            setFormData({ name: '' });
            fetchTags();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Error al guardar etiqueta');
        }
    };

    const handleEdit = (tag) => {
        if (tag.type === 'SYSTEM') {
            toast.warning('No se pueden editar etiquetas del sistema');
            return;
        }
        setEditingTag(tag);
        setFormData({ name: tag.name });
        setShowModal(true);
    };

    const handleDelete = async (tag) => {
        if (tag.type === 'SYSTEM') {
            toast.warning('No se pueden eliminar etiquetas del sistema');
            return;
        }

        const confirmed = await confirm({
            title: '¿Eliminar etiqueta?',
            message: `¿Estás seguro de eliminar "${tag.name}"? Los productos con esta etiqueta quedarán sin asignar.`
        });

        if (confirmed) {
            try {
                await tagService.delete(tag.id);
                toast.success('Etiqueta eliminada');
                fetchTags();
            } catch (error) {
                toast.error('Error al eliminar etiqueta');
            }
        }
    };

    return (
        <div className="tags-panel animate-fade-in inv-page inv-tags">
            <header className="ui-page-header">
                <div className="ui-page-heading">
                    <h2 className="ui-page-title">
                        <span className="material-icons-round" aria-hidden="true">local_offer</span>
                        Gestión de Etiquetas
                    </h2>
                </div>
                <div className="ui-page-actions">
                    <button type="button" className="ui-btn ui-btn--primary" onClick={() => { setEditingTag(null); setFormData({ name: '' }); setShowModal(true); }}>
                        + Nueva Etiqueta
                    </button>
                </div>
            </header>

            {loading ? (
                <div className="ui-loading" role="status">
                    <span className="ui-spinner" aria-hidden="true" />
                    Cargando etiquetas...
                </div>
            ) : (
                <div className="ui-table-wrap">
                    <table className="ui-table">
                        <thead>
                            <tr>
                                <th>Nombre</th>
                                <th>Tipo</th>
                                <th className="inv-col-actions">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tags.map((tag) => (
                                <tr key={tag.id} className={tag.type === 'SYSTEM' ? 'is-system' : ''}>
                                    <td>
                                        <div className="inv-tag-name">
                                            <span className={`inv-tag-dot${tag.type === 'SYSTEM' ? ' is-system' : ''}`} aria-hidden="true"></span>
                                            {tag.name}
                                        </div>
                                    </td>
                                    <td>
                                        <span className={`ui-badge ${tag.type === 'SYSTEM' ? 'ui-badge--danger' : 'ui-badge--neutral'}`}>
                                            {tag.type === 'SYSTEM' ? 'Sistema (S/R)' : 'Usuario'}
                                        </span>
                                    </td>
                                    <td>
                                        <div className="inv-row-actions">
                                            <button
                                                type="button"
                                                className="ui-icon-btn"
                                                onClick={() => handleEdit(tag)}
                                                disabled={tag.type === 'SYSTEM'}
                                                title={tag.type === 'SYSTEM' ? 'No editable' : 'Editar'}
                                                aria-label={tag.type === 'SYSTEM' ? 'No editable' : 'Editar'}
                                            >
                                                <span className="material-icons-round" aria-hidden="true">edit</span>
                                            </button>
                                            <button
                                                type="button"
                                                className="ui-icon-btn ui-icon-btn--danger"
                                                onClick={() => handleDelete(tag)}
                                                disabled={tag.type === 'SYSTEM'}
                                                title={tag.type === 'SYSTEM' ? 'No eliminable' : 'Eliminar'}
                                                aria-label={tag.type === 'SYSTEM' ? 'No eliminable' : 'Eliminar'}
                                            >
                                                <span className="material-icons-round" aria-hidden="true">delete</span>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {showModal && (
                <div className="ui-modal-overlay">
                    <div className="ui-modal ui-modal--sm" role="dialog" aria-modal="true" aria-labelledby="tag-modal-title" onClick={(e) => e.stopPropagation()}>
                        <div className="ui-modal-header">
                            <span className="ui-modal-icon" aria-hidden="true">
                                <span className="material-icons-round">{editingTag ? 'edit' : 'local_offer'}</span>
                            </span>
                            <div className="ui-modal-heading">
                                <h3 id="tag-modal-title" className="ui-modal-title">{editingTag ? 'Editar Etiqueta' : 'Nueva Etiqueta'}</h3>
                            </div>
                            <button type="button" className="ui-icon-btn" onClick={() => setShowModal(false)} aria-label="Cerrar">
                                <span className="material-icons-round" aria-hidden="true">close</span>
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="inv-modal-form">
                            <div className="ui-modal-body ui-modal-body--plain">
                                <div className="ui-field">
                                    <label className="ui-label" htmlFor="tag-name-input">Nombre de la etiqueta</label>
                                    <input
                                        id="tag-name-input"
                                        type="text"
                                        className="ui-input"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ name: e.target.value })}
                                        placeholder="Ej: Ofertas, Importado, etc."
                                        required
                                        autoFocus
                                    />
                                </div>
                            </div>
                            <div className="ui-modal-footer">
                                <button type="button" className="ui-btn ui-btn--secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                                <button type="submit" className="ui-btn ui-btn--primary">Guardar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
