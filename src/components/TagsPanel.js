import React, { useState, useEffect } from 'react';
import { tagService } from '../api/tagService';
import { useToast } from './ToastContainer';
import { useConfirm } from './ConfirmDialog';

export default function TagsPanel() {
    const [tags, setTags] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingTag, setEditingTag] = useState(null);
    const [formData, setFormData] = useState({ name: '' });
    const toast = useToast();
    const confirm = useConfirm();

    useEffect(() => {
        fetchTags();
    }, []);

    const fetchTags = async () => {
        try {
            setLoading(true);
            const res = await tagService.getAll();
            setTags(res.data);
        } catch (error) {
            toast.error('Error al cargar etiquetas');
        } finally {
            setLoading(false);
        }
    };

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
        <div className="tags-panel animate-fade-in">
            <div className="panel-header">
                <h2>
                    <span className="material-icons-round" style={{ fontSize: '32px', color: 'var(--primary)', verticalAlign: 'middle' }}>local_offer</span>
                    Gestión de Etiquetas
                </h2>
                <button className="btn-add" onClick={() => { setEditingTag(null); setFormData({ name: '' }); setShowModal(true); }}>
                    + Nueva Etiqueta
                </button>
            </div>

            {loading ? (
                <div className="loading">Cargando etiquetas...</div>
            ) : (
                <div className="tags-table-container">
                    <table className="modern-table">
                        <thead>
                            <tr>
                                <th>Nombre</th>
                                <th>Tipo</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tags.map((tag) => (
                                <tr key={tag.id} className={tag.type === 'SYSTEM' ? 'row-system' : ''}>
                                    <td>
                                        <div className="tag-name-cell">
                                            <span className={`tag-dot ${tag.type === 'SYSTEM' ? 'sr' : ''}`}></span>
                                            {tag.name}
                                        </div>
                                    </td>
                                    <td>
                                        <span className={`tag-type-badge ${tag.type ? tag.type.toLowerCase() : 'user'}`}>
                                            {tag.type === 'SYSTEM' ? 'Sistema (S/R)' : 'Usuario'}
                                        </span>
                                    </td>
                                    <td>
                                        <div className="table-actions">
                                            <button
                                                className="btn-icon-action edit"
                                                onClick={() => handleEdit(tag)}
                                                disabled={tag.type === 'SYSTEM'}
                                                title={tag.type === 'SYSTEM' ? 'No editable' : 'Editar'}
                                            >
                                                <span className="material-icons-round">edit</span>
                                            </button>
                                            <button
                                                className="btn-icon-action delete"
                                                onClick={() => handleDelete(tag)}
                                                disabled={tag.type === 'SYSTEM'}
                                                title={tag.type === 'SYSTEM' ? 'No eliminable' : 'Eliminar'}
                                            >
                                                <span className="material-icons-round">delete</span>
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
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal-content animate-scale-in" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>{editingTag ? 'Editar Etiqueta' : 'Nueva Etiqueta'}</h3>
                            <button className="btn-close" onClick={() => setShowModal(false)}>
                                <span className="material-icons-round">close</span>
                            </button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="form-group">
                                <label>Nombre de la etiqueta</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ name: e.target.value })}
                                    placeholder="Ej: Ofertas, Importado, etc."
                                    required
                                    autoFocus
                                />
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn-cancel" onClick={() => setShowModal(false)}>Cancelar</button>
                                <button type="submit" className="btn-save">Guardar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
