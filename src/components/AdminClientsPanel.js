import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { formatCurrency } from '../utils/formatters';
import apiClient from '../api/client';
import { useToast } from './ToastContainer';
import SearchableSelect from './SearchableSelect';
import { EXPORT_FORMATS } from './ExportButton';
import { avatarTone, avatarInitials } from '../utils/avatarTone';
import '../styles/areas/AdminClientsPanel.css';

// Contenido de un botón de exportación con el mismo marcado que ExportButton: icono del formato
// (o spinner mientras exporta) y etiqueta; mientras carga, la etiqueta normal queda invisible
// debajo del texto de carga para que el botón no se encoja. El <button> sigue en este archivo
// con su mismo onClick/disabled de siempre.
function ExportButtonContent({ kind, busy, label, loadingLabel = 'Exportando...' }) {
    return (
        <>
            {busy
                ? <span className="ui-spinner" aria-hidden="true" />
                : <span className="material-icons-round" aria-hidden="true">{EXPORT_FORMATS[kind].icon}</span>}
            <span className="ui-btn-label">
                {busy && <span className="ui-btn-label-sizer" aria-hidden="true">{label}</span>}
                <span>{busy ? loadingLabel : label}</span>
            </span>
        </>
    );
}

// Esqueletos con la forma de las tarjetas de cliente (solo mientras carga)
const SKELETON_CARDS = [0, 1, 2, 3, 4, 5];

/**
 * AdminClientsPanel - Panel for Admin/Owner to manage clients
 * Allows creating clients assigned to specific vendors
 */
function AdminClientsPanel({ refreshTrigger }) {
    const [clients, setClients] = useState([]);
    const [vendedores, setVendedores] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingClient, setEditingClient] = useState(null);
    const [showEditModal, setShowEditModal] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedVendedor, setSelectedVendedor] = useState(''); // Filter by vendor
    const [sortOrder, setSortOrder] = useState('asc'); // 'asc' or 'desc'
    const [exporting, setExporting] = useState(false);
    // Qué botón inició la exportación ('seller' | 'route' | 'all'): solo ese muestra la carga;
    // "exporting" sigue siendo la única guarda y el disabled de todos
    const [exportingKey, setExportingKey] = useState(null);
    const [exportKeyword, setExportKeyword] = useState('');
    const [selectedExportVendor, setSelectedExportVendor] = useState('');
    const toast = useToast();

    const fetchData = useCallback(async () => {
        try {
            setLoading(true); // Show loading state on refresh
            const [clientsRes, vendedoresRes] = await Promise.all([
                apiClient.get('/admin/clients'),
                apiClient.get('/admin/clients/vendedores')
            ]);
            setClients(clientsRes.data);
            setVendedores(vendedoresRes.data);
        } catch (error) {
            console.error('Error al cargar datos:', error);
            toast.error('Error al cargar datos: ' + (error.response?.data?.message || error.message));
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        fetchData();
    }, [fetchData, refreshTrigger]);

    useEffect(() => {
        if (!exporting) setExportingKey(null);
    }, [exporting]);

    const exportBusy = (key) => exporting && exportingKey === key;

    // Helper to extract filename from Content-Disposition header
    const getFilenameFromContentDisposition = (contentDisposition) => {
        if (!contentDisposition) return null;
        const utf8Match = contentDisposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
        if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1].replace(/"/g, ''));
        const simpleMatch = contentDisposition.match(/filename\s*=\s*"?([^";]+)"?/i);
        if (simpleMatch?.[1]) return simpleMatch[1];
        return null;
    };

    // Export clients by seller
    const handleExportBySeller = async () => {
        if (!selectedExportVendor) {
            toast.warning('Seleccione un vendedor para exportar');
            return;
        }
        if (exporting) return;

        try {
            setExporting(true);
            const response = await apiClient.get(`/admin/clients/export/excel/seller/${selectedExportVendor}`, {
                responseType: 'blob'
            });

            const contentDisposition = response.headers?.['content-disposition'];
            const serverFilename = getFilenameFromContentDisposition(contentDisposition);
            const filename = serverFilename || `clientes_vendedora_${new Date().toISOString().split('T')[0]}.xlsx`;

            const blob = new Blob([response.data], {
                type: response.headers?.['content-type'] || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);

            toast.success('Excel descargado exitosamente');
            setSelectedExportVendor('');
        } catch (error) {
            console.error('Error al exportar por vendedor:', error);
            toast.error('Error al exportar clientes: ' + (error.response?.data?.message || error.message));
        } finally {
            setExporting(false);
        }
    };

    // Export clients by route (keyword in address)
    const handleExportByRoute = async () => {
        if (!exportKeyword.trim()) {
            toast.warning('Ingrese una palabra clave para buscar en la dirección');
            return;
        }
        if (exporting) return;

        try {
            setExporting(true);
            const response = await apiClient.get('/admin/clients/export/excel/route', {
                params: { keyword: exportKeyword.trim() },
                responseType: 'blob'
            });

            const contentDisposition = response.headers?.['content-disposition'];
            const serverFilename = getFilenameFromContentDisposition(contentDisposition);
            const filename = serverFilename || `clientes_ruta_${exportKeyword.trim()}_${new Date().toISOString().split('T')[0]}.xlsx`;

            const blob = new Blob([response.data], {
                type: response.headers?.['content-type'] || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);

            toast.success('Excel descargado exitosamente');
            setExportKeyword('');
        } catch (error) {
            console.error('Error al exportar por ruta:', error);
            toast.error('Error al exportar clientes: ' + (error.response?.data?.message || error.message));
        } finally {
            setExporting(false);
        }
    };

    // Filter clients by search term AND vendor
    const filteredClients = useMemo(() => clients.filter(c => {
        // Vendor filter
        if (selectedVendedor && c.vendedorAsignadoNombre !== selectedVendedor) {
            return false;
        }

        // Multi-field text search filter
        // Searches across ALL client fields: name, NIT, email, phone, address, municipality, administrator, legal rep, and vendor
        const term = searchTerm.toLowerCase();
        if (term) {
            return (
                (c.nombre || '').toLowerCase().includes(term) ||
                (c.nit || '').toLowerCase().includes(term) ||
                (c.email || '').toLowerCase().includes(term) ||
                (c.telefono || '').toLowerCase().includes(term) ||
                (c.direccion || '').toLowerCase().includes(term) ||
                (c.administrador || '').toLowerCase().includes(term) ||
                (c.representanteLegal || '').toLowerCase().includes(term) ||
                (c.vendedorAsignadoNombre || '').toLowerCase().includes(term)
            );
        }
        return true;
    }).sort((a, b) => {
        // Alphabetical sort by name
        const nameA = a.nombre || '';
        const nameB = b.nombre || '';
        return sortOrder === 'asc'
            ? nameA.localeCompare(nameB)
            : nameB.localeCompare(nameA);
    }), [clients, selectedVendedor, searchTerm, sortOrder]);

    // Opciones de los selectores con buscador (mismos value/texto que tenían las <option>):
    // exportar usa el id de la vendedora; el filtro de la lista, su username
    const vendedorIdOptions = useMemo(
        () => vendedores.map(v => ({ value: v.id, label: v.username })),
        [vendedores]
    );
    const vendedorUsernameOptions = useMemo(
        () => vendedores.map(v => ({ value: v.username, label: v.username })),
        [vendedores]
    );

    if (loading) {
        // aria-busy: el contenedor solo aparece con fade y, al llegar los datos, el panel entra
        // con la subida (design-system 9.1). Los esqueletos tienen la forma de las tarjetas.
        return (
            <div className="acp acp-loading-view" aria-busy="true">
                <div className="ui-loading acp-loading" role="status">
                    <span className="ui-spinner" aria-hidden="true"></span>
                    Cargando clientes...
                </div>
                <div className="acp-grid" aria-hidden="true">
                    {SKELETON_CARDS.map(i => (
                        <div key={i} className="acp-card acp-card--skeleton">
                            <div className="acp-card-head">
                                <span className="ui-skeleton ui-skeleton--circle acp-skeleton-avatar" />
                                <div className="ui-skeleton-stack acp-card-heading">
                                    <span className="ui-skeleton ui-skeleton--title acp-skeleton-title" />
                                    <span className="ui-skeleton ui-skeleton--text acp-skeleton-chip" />
                                </div>
                            </div>
                            <div className="ui-skeleton-stack acp-skeleton-rows">
                                <span className="ui-skeleton ui-skeleton--text" />
                                <span className="ui-skeleton ui-skeleton--text acp-skeleton-short" />
                                <span className="ui-skeleton ui-skeleton--text" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="admin-clients-panel acp">
            <header className="ui-page-header acp-header">
                <div className="ui-page-heading">
                    <h2 className="ui-page-title">
                        <span className="material-icons-round" aria-hidden="true">people</span>
                        {' '}Gestión de Clientes
                    </h2>
                </div>
                <div className="ui-page-actions">
                    <button type="button" className="ui-btn ui-btn--primary" onClick={() => setShowModal(true)}>
                        <span className="material-icons-round" aria-hidden="true">add</span>
                        {' '}Nuevo Cliente
                    </button>
                </div>
            </header>

            {/* Excel Export Section */}
            <section className="ui-section acp-export">
                <div className="ui-section-head">
                    <span className="ui-icon-tile ui-icon-tile--success" aria-hidden="true">
                        <span className="material-icons-round">download</span>
                    </span>
                    <div>
                        <h3 className="ui-section-title">Exportar Clientes a Excel</h3>
                    </div>
                </div>

                <div className="ui-grid acp-export-grid">
                    {/* Export by Seller */}
                    <div className="ui-field">
                        <label className="ui-label" htmlFor="acp-export-vendor">
                            Por Vendedora
                        </label>
                        <div className="acp-inline">
                            <SearchableSelect
                                id="acp-export-vendor"
                                value={selectedExportVendor}
                                onChange={(e) => setSelectedExportVendor(e.target.value)}
                                disabled={exporting}
                                placeholder="Seleccionar vendedora"
                                options={vendedorIdOptions}
                            />
                            <button
                                type="button"
                                className={`ui-btn ui-btn--excel${exportBusy('seller') ? ' is-loading' : ''}`}
                                aria-busy={exportBusy('seller') || undefined}
                                onClickCapture={() => setExportingKey('seller')}
                                onClick={handleExportBySeller}
                                disabled={!selectedExportVendor || exporting}
                            >
                                <ExportButtonContent kind="excel" busy={exportBusy('seller')} label="Exportar" loadingLabel="Exportando..." />
                            </button>
                        </div>
                    </div>

                    {/* Export by Route */}
                    <div className="ui-field">
                        <label className="ui-label" htmlFor="acp-export-route">
                            Por Ruta/Dirección
                        </label>
                        <div className="acp-inline">
                            <input
                                id="acp-export-route"
                                className="ui-input"
                                type="text"
                                placeholder="Ej: Zona 1, Centro..."
                                value={exportKeyword}
                                onChange={(e) => setExportKeyword(e.target.value)}
                                disabled={exporting}
                                onKeyPress={(e) => {
                                    if (e.key === 'Enter' && exportKeyword.trim() && !exporting) {
                                        // Enter también exporta por ruta: marca ese botón como el que carga
                                        setExportingKey('route');
                                        handleExportByRoute();
                                    }
                                }}
                            />
                            <button
                                type="button"
                                className={`ui-btn ui-btn--excel${exportBusy('route') ? ' is-loading' : ''}`}
                                aria-busy={exportBusy('route') || undefined}
                                onClickCapture={() => setExportingKey('route')}
                                onClick={handleExportByRoute}
                                disabled={!exportKeyword.trim() || exporting}
                            >
                                <ExportButtonContent kind="excel" busy={exportBusy('route')} label="Exportar" loadingLabel="Exportando..." />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Export All Clients */}
                <div className="acp-export-all">
                    <button
                        type="button"
                        className={`ui-btn ui-btn--excel ui-btn--lg ui-btn--block acp-export-all-btn${exportBusy('all') ? ' is-loading' : ''}`}
                        aria-busy={exportBusy('all') || undefined}
                        onClickCapture={() => setExportingKey('all')}
                        onClick={async () => {
                            if (exporting) return;
                            try {
                                setExporting(true);
                                const response = await apiClient.get('/admin/clients/export/excel/all', {
                                    responseType: 'blob'
                                });

                                const contentDisposition = response.headers?.['content-disposition'];
                                const serverFilename = getFilenameFromContentDisposition(contentDisposition);
                                const filename = serverFilename || `todos_los_clientes_${new Date().toISOString().split('T')[0]}.xlsx`;

                                const blob = new Blob([response.data], {
                                    type: response.headers?.['content-type'] || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                                });
                                const url = window.URL.createObjectURL(blob);
                                const link = document.createElement('a');
                                link.href = url;
                                link.setAttribute('download', filename);
                                document.body.appendChild(link);
                                link.click();
                                link.remove();
                                window.URL.revokeObjectURL(url);

                                toast.success('Excel con todos los clientes descargado exitosamente');
                            } catch (error) {
                                console.error('Error al exportar todos los clientes:', error);
                                toast.error('Error al exportar clientes: ' + (error.response?.data?.message || error.message));
                            } finally {
                                setExporting(false);
                            }
                        }}
                        disabled={exporting}
                    >
                        <ExportButtonContent kind="excel" busy={exportBusy('all')} label="Exportar TODOS los Clientes" loadingLabel="Exportando..." />
                    </button>
                </div>
            </section>

            {/* Filters Row */}
            <div className="ui-toolbar acp-toolbar">
                {/* Search Bar */}
                <div className="ui-search acp-search">
                    <span className="material-icons-round ui-search-icon" aria-hidden="true">search</span>
                    <input
                        type="text"
                        className="ui-input"
                        aria-label="Buscar clientes"
                        placeholder="Buscar por nombre, NIT, email, teléfono, dirección, municipio..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                {/* Vendor Filter Dropdown */}
                <div className="acp-vendor-filter">
                    <SearchableSelect
                        className="acp-vendor-select"
                        aria-label="Filtrar por vendedor"
                        value={selectedVendedor}
                        onChange={(e) => setSelectedVendedor(e.target.value)}
                        emptyOption={{ label: 'Todos los vendedores' }}
                        options={vendedorUsernameOptions}
                    />
                    {selectedVendedor && (
                        <button
                            type="button"
                            className="ui-icon-btn"
                            onClick={() => setSelectedVendedor('')}
                            title="Limpiar filtro"
                            aria-label="Limpiar filtro"
                        >
                            <span className="material-icons-round" aria-hidden="true">close</span>
                        </button>
                    )}
                </div>

                {/* Results count */}
                <span className="ui-badge ui-badge--primary acp-count">
                    {filteredClients.length} cliente{filteredClients.length !== 1 ? 's' : ''}
                </span>

                <span className="ui-toolbar-spacer" />

                {/* Sort Button */}
                <button
                    type="button"
                    className="ui-btn ui-btn--secondary acp-sort"
                    onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                    title={sortOrder === 'asc' ? 'Orden Ascendente' : 'Orden Descendente'}
                >
                    <span className="material-icons-round" aria-hidden="true">sort_by_alpha</span>
                    {sortOrder === 'asc' ? 'A-Z' : 'Z-A'}
                </button>
            </div>


            {/* Clients Grid */}
            {/* ui-stagger: solo las primeras 8 tarjetas entran escalonadas */}
            <div className="acp-grid ui-stagger">
                {filteredClients.length === 0 ? (
                    <div className="ui-empty acp-empty">
                        <span className="material-icons-round ui-empty-icon" aria-hidden="true">person_search</span>
                        <p className="ui-empty-title">No se encontraron clientes</p>
                    </div>
                ) : (
                    filteredClients.map(cliente => (
                        <article key={cliente.id} className="acp-card">
                            <div className="acp-card-head">
                                {/* Avatar de iniciales: mismo tono para el mismo cliente en toda la app */}
                                <span className={`ui-avatar ui-avatar--${avatarTone(cliente.nombre)}`} aria-hidden="true">
                                    {avatarInitials(cliente.nombre)}
                                </span>
                                <div className="acp-card-heading">
                                    <h3 className="acp-card-title">{cliente.nombre}</h3>
                                    <span className={`ui-badge ${cliente.vendedorAsignadoNombre ? 'ui-badge--primary' : 'ui-badge--neutral'} acp-vendor-badge`}>
                                        <span className="material-icons-round" aria-hidden="true">badge</span>
                                        Vendedor: {cliente.vendedorAsignadoNombre || 'N/A'}
                                    </span>
                                </div>
                            </div>

                            {/* Contacto: correo azul, teléfono verde, dirección ámbar, NIT teal; vacíos en texto tenue */}
                            <ul className="ui-info-list acp-card-meta">
                                <li className={`ui-info-row${cliente.email ? '' : ' is-empty'}`}>
                                    <span className="ui-icon-tile ui-icon-tile--sm ui-icon-tile--primary" aria-hidden="true">
                                        <span className="material-icons-round">email</span>
                                    </span>
                                    <span>{cliente.email || 'Sin correo'}</span>
                                </li>
                                <li className={`ui-info-row${cliente.telefono ? '' : ' is-empty'}`}>
                                    <span className="ui-icon-tile ui-icon-tile--sm ui-icon-tile--success" aria-hidden="true">
                                        <span className="material-icons-round">phone</span>
                                    </span>
                                    <span>{cliente.telefono || 'Sin teléfono'}</span>
                                </li>
                                <li className={`ui-info-row${cliente.direccion ? '' : ' is-empty'}`}>
                                    <span className="ui-icon-tile ui-icon-tile--sm ui-icon-tile--warning" aria-hidden="true">
                                        <span className="material-icons-round">place</span>
                                    </span>
                                    <span>{cliente.direccion || 'Sin dirección'}</span>
                                </li>
                                <li className={`ui-info-row${cliente.nit ? '' : ' is-empty'}`}>
                                    <span className="ui-icon-tile ui-icon-tile--sm ui-icon-tile--teal" aria-hidden="true">
                                        <span className="material-icons-round">home_work</span>
                                    </span>
                                    <span>{cliente.nit ? <>NIT: {cliente.nit}</> : 'Sin NIT'}</span>
                                </li>
                                {cliente.administrador && (
                                    <li className="ui-info-row">
                                        <span className="ui-icon-tile ui-icon-tile--sm ui-icon-tile--sky" aria-hidden="true">
                                            <span className="material-icons-round">person</span>
                                        </span>
                                        <span>Admin: {cliente.administrador}</span>
                                    </li>
                                )}
                                {cliente.representanteLegal && (
                                    <li className="ui-info-row">
                                        <span className="ui-icon-tile ui-icon-tile--sm ui-icon-tile--sky" aria-hidden="true">
                                            <span className="material-icons-round">gavel</span>
                                        </span>
                                        <span>Rep. Legal: {cliente.representanteLegal}</span>
                                    </li>
                                )}
                            </ul>

                            <div className="acp-card-footer">
                                <span className="acp-card-total">
                                    <span className="material-icons-round" aria-hidden="true">shopping_bag</span>
                                    Compras:{' '}
                                    <span className={(cliente.totalCompras || 0) > 0 ? 'ui-amount--success' : 'acp-card-total-zero'}>
                                        ${formatCurrency(cliente.totalCompras || 0)}
                                    </span>
                                </span>
                                <button
                                    type="button"
                                    className="ui-btn ui-btn--secondary ui-btn--sm"
                                    onClick={() => {
                                        setEditingClient(cliente);
                                        setShowEditModal(true);
                                    }}
                                    title="Editar cliente"
                                >
                                    <span className="material-icons-round" aria-hidden="true">edit</span>
                                    Editar
                                </button>
                            </div>
                        </article>
                    ))
                )}
            </div>

            {/* Create Client Modal */}
            {showModal && (
                <AdminClientFormModal
                    vendedores={vendedores}
                    onClose={() => setShowModal(false)}
                    onSuccess={() => {
                        setShowModal(false);
                        fetchData();
                    }}
                />
            )}

            {/* Edit Client Modal */}
            {showEditModal && editingClient && (
                <AdminClientEditModal
                    clientToEdit={editingClient}
                    vendedores={vendedores}
                    onClose={() => {
                        setShowEditModal(false);
                        setEditingClient(null);
                    }}
                    onSuccess={() => {
                        setShowEditModal(false);
                        setEditingClient(null);
                        fetchData();
                    }}
                />
            )}
        </div>
    );
}

/**
 * AdminClientFormModal - Modal for creating a new client assigned to a vendor
 */
function AdminClientFormModal({ vendedores, onClose, onSuccess }) {
    const [formData, setFormData] = useState({
        nit: '',
        nombre: '',
        administrador: '',
        representanteLegal: '',
        email: '',
        telefono: '',
        direccion: '',
        vendedorId: ''
    });
    const [saving, setSaving] = useState(false);
    const toast = useToast();

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!formData.vendedorId) {
            toast.warning('Debe seleccionar un vendedor para asignar el cliente');
            return;
        }

        setSaving(true);

        try {
            await apiClient.post('/admin/clients', formData);
            toast.success(`¡Cliente creado y asignado exitosamente! Credenciales: Usuario y contraseña = ${formData.nit}`);
            onSuccess();
        } catch (error) {
            console.error('Error al crear cliente:', error);

            let errorMessage = 'Error al crear cliente';
            const serverData = error.response?.data;

            if (serverData) {
                const messageStr = typeof serverData === 'string' ? serverData : serverData.message;

                if (messageStr) {
                    // Attempt to extract the specific business exception message
                    // Handles "BusinessExeption" (typo in backend) and "BusinessException"
                    // Regex looks for the exception name followed by a colon and catches the rest of the message
                    const match = messageStr.match(/BusinessExce?ption:\s*(.+?)(?:$|;|with root cause)/);

                    if (match && match[1]) {
                        errorMessage = match[1].trim();
                    } else {
                        // If no specific exception format found but we have a message, use it
                        // but limit length just in case it's a huge stack trace
                        if (messageStr.length < 200) {
                            errorMessage = messageStr;
                        } else {
                            errorMessage = 'Error del servidor: verifique los datos ingresados';
                        }
                    }
                }
            } else if (error.message) {
                errorMessage = error.message;
            }

            // Show the error toast
            toast.error(errorMessage);
        } finally {
            setSaving(false);
        }
    };

    const isFormValid = formData.nit.trim() && formData.nombre.trim() &&
        formData.direccion.trim() && formData.vendedorId;

    return (
        <div className="ui-modal-overlay acp-overlay">
            <div
                className="ui-modal ui-modal--md acp-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="acp-new-title"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="ui-modal-header">
                    <span className="ui-modal-icon" aria-hidden="true">
                        <span className="material-icons-round">person_add</span>
                    </span>
                    <div className="ui-modal-heading">
                        <h3 id="acp-new-title" className="ui-modal-title">
                            Crear Cliente
                        </h3>
                    </div>
                    <button type="button" className="ui-icon-btn" onClick={onClose} aria-label="Cerrar">
                        <span className="material-icons-round" aria-hidden="true">close</span>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="acp-form">
                    <div className="ui-modal-body">
                        {/* Vendor Selection Info Box */}
                        <div className="ui-alert ui-alert--info">
                            <span className="material-icons-round" aria-hidden="true">info</span>
                            <div>
                                <strong className="ui-alert-title">Asignación de Vendedor:</strong>
                                El cliente será asignado al vendedor seleccionado y solo ese vendedor podrá ver y gestionar este cliente.
                            </div>
                        </div>

                        <section className="ui-section">
                            <div className="ui-grid">
                                {/* Vendor Selection */}
                                <div className="ui-field ui-span-full">
                                    <label className="ui-label" htmlFor="acp-new-vendedor">
                                        Asignar a Vendedor <span className="ui-required">*</span>
                                    </label>
                                    <SearchableSelect
                                        id="acp-new-vendedor"
                                        value={formData.vendedorId}
                                        onChange={(e) => setFormData({ ...formData, vendedorId: e.target.value })}
                                        required
                                        placeholder="Seleccionar vendedor"
                                        options={vendedores.map(v => ({ value: v.id, label: v.username }))}
                                    />
                                </div>

                                <div className="ui-field">
                                    <label className="ui-label" htmlFor="acp-new-nit">NIT <span className="ui-required">*</span></label>
                                    <input
                                        id="acp-new-nit"
                                        className="ui-input"
                                        type="text"
                                        value={formData.nit}
                                        onChange={(e) => setFormData({ ...formData, nit: e.target.value })}
                                        placeholder="Ej: 123456789"
                                        required
                                    />
                                    <small className="ui-help acp-help">
                                        <span className="material-icons-round" aria-hidden="true">vpn_key</span>
                                        Este será el usuario y contraseña del cliente
                                    </small>
                                </div>

                                <div className="ui-field">
                                    <label className="ui-label" htmlFor="acp-new-nombre">Nombre de Establecimiento <span className="ui-required">*</span></label>
                                    <input
                                        id="acp-new-nombre"
                                        className="ui-input"
                                        type="text"
                                        value={formData.nombre}
                                        onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                                        placeholder="Nombre del establecimiento"
                                        required
                                    />
                                </div>

                                <div className="ui-field">
                                    <label className="ui-label" htmlFor="acp-new-admin">Administrador <span className="ui-required">*</span></label>
                                    <input
                                        id="acp-new-admin"
                                        className="ui-input"
                                        value={formData.administrador}
                                        onChange={(e) => setFormData({ ...formData, administrador: e.target.value })}
                                        placeholder="Nombre del administrador"
                                        required
                                    />
                                </div>

                                <div className="ui-field">
                                    <label className="ui-label" htmlFor="acp-new-rep">Representante Legal <span className="ui-required">*</span></label>
                                    <input
                                        id="acp-new-rep"
                                        className="ui-input"
                                        type="text"
                                        value={formData.representanteLegal}
                                        onChange={(e) => setFormData({ ...formData, representanteLegal: e.target.value })}
                                        placeholder="Nombre del representante legal"
                                        required
                                    />
                                </div>

                                <div className="ui-field">
                                    <label className="ui-label" htmlFor="acp-new-email">Email</label>
                                    <input
                                        id="acp-new-email"
                                        className="ui-input"
                                        type="email"
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        placeholder="correo@ejemplo.com (Opcional)"
                                    />
                                </div>

                                <div className="ui-field">
                                    <label className="ui-label" htmlFor="acp-new-tel">Teléfono</label>
                                    <input
                                        id="acp-new-tel"
                                        className="ui-input"
                                        type="tel"
                                        value={formData.telefono}
                                        onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                                        placeholder="Número de teléfono (Opcional)"
                                    />
                                </div>

                                <div className="ui-field ui-span-full">
                                    <label className="ui-label" htmlFor="acp-new-dir">Dirección</label>
                                    <textarea
                                        id="acp-new-dir"
                                        className="ui-textarea acp-textarea"
                                        value={formData.direccion}
                                        onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
                                        rows="2"
                                        placeholder="Dirección del cliente (Opcional)"
                                    />
                                </div>
                            </div>
                        </section>
                    </div>

                    <div className="ui-modal-footer">
                        <button type="button" onClick={onClose} className="ui-btn ui-btn--secondary">
                            Cancelar
                        </button>
                        <button type="submit" disabled={saving || !isFormValid} className="ui-btn ui-btn--primary">
                            {saving ? 'Guardando...' : 'Crear Cliente'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

/**
 * AdminClientEditModal - Modal for editing an existing client
 */
function AdminClientEditModal({ clientToEdit, vendedores, onClose, onSuccess }) {
    const [formData, setFormData] = useState({
        nit: clientToEdit.nit || '',
        nombre: clientToEdit.nombre || '',
        administrador: clientToEdit.administrador || '',
        representanteLegal: clientToEdit.representanteLegal || '',
        email: clientToEdit.email || '',
        telefono: clientToEdit.telefono || '',
        direccion: clientToEdit.direccion || '',
        vendedorId: clientToEdit.vendedorAsignadoId || ''
    });
    const [saving, setSaving] = useState(false);
    const toast = useToast();

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!formData.vendedorId) {
            toast.warning('Debe seleccionar un vendedor');
            return;
        }

        setSaving(true);

        try {
            await apiClient.patch(`/admin/clients/${clientToEdit.id}`, formData);
            toast.success('¡Cliente actualizado exitosamente!');
            onSuccess();
        } catch (error) {
            console.error('Error al actualizar cliente:', error);
            let errorMessage = 'Error al actualizar cliente';
            const serverData = error.response?.data;

            if (serverData) {
                const messageStr = typeof serverData === 'string' ? serverData : serverData.message;
                if (messageStr && messageStr.length < 200) {
                    errorMessage = messageStr;
                }
            }

            toast.error(errorMessage);
        } finally {
            setSaving(false);
        }
    };

    const isFormValid = formData.nit.trim() && formData.nombre.trim() &&
        formData.administrador.trim() && formData.representanteLegal.trim() &&
        formData.vendedorId;

    return (
        <div className="ui-modal-overlay acp-overlay">
            <div
                className="ui-modal ui-modal--md acp-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="acp-edit-title"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="ui-modal-header">
                    <span className="ui-modal-icon" aria-hidden="true">
                        <span className="material-icons-round">edit</span>
                    </span>
                    <div className="ui-modal-heading">
                        <h3 id="acp-edit-title" className="ui-modal-title">
                            Editar Cliente
                        </h3>
                    </div>
                    <button type="button" className="ui-icon-btn" onClick={onClose} aria-label="Cerrar">
                        <span className="material-icons-round" aria-hidden="true">close</span>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="acp-form">
                    <div className="ui-modal-body">
                        <section className="ui-section">
                            <div className="ui-grid">
                                <div className="ui-field ui-span-full">
                                    <label className="ui-label" htmlFor="acp-edit-vendedor">
                                        Asignar a Vendedor <span className="ui-required">*</span>
                                    </label>
                                    <SearchableSelect
                                        id="acp-edit-vendedor"
                                        value={formData.vendedorId}
                                        onChange={(e) => setFormData({ ...formData, vendedorId: e.target.value })}
                                        required
                                        placeholder="Seleccionar vendedor"
                                        options={vendedores.map(v => ({ value: v.id, label: v.username }))}
                                    />
                                </div>

                                <div className="ui-field">
                                    <label className="ui-label" htmlFor="acp-edit-nit">NIT <span className="ui-required">*</span></label>
                                    <input
                                        id="acp-edit-nit"
                                        className="ui-input"
                                        type="text"
                                        value={formData.nit}
                                        onChange={(e) => setFormData({ ...formData, nit: e.target.value })}
                                        required
                                    />
                                </div>

                                <div className="ui-field">
                                    <label className="ui-label" htmlFor="acp-edit-nombre">Nombre de Establecimiento <span className="ui-required">*</span></label>
                                    <input
                                        id="acp-edit-nombre"
                                        className="ui-input"
                                        type="text"
                                        value={formData.nombre}
                                        onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                                        required
                                    />
                                </div>

                                <div className="ui-field">
                                    <label className="ui-label" htmlFor="acp-edit-admin">Administrador <span className="ui-required">*</span></label>
                                    <input
                                        id="acp-edit-admin"
                                        className="ui-input"
                                        type="text"
                                        value={formData.administrador}
                                        onChange={(e) => setFormData({ ...formData, administrador: e.target.value })}
                                        placeholder="Nombre del administrador"
                                        required
                                    />
                                </div>

                                <div className="ui-field">
                                    <label className="ui-label" htmlFor="acp-edit-rep">Representante Legal <span className="ui-required">*</span></label>
                                    <input
                                        id="acp-edit-rep"
                                        className="ui-input"
                                        type="text"
                                        value={formData.representanteLegal}
                                        onChange={(e) => setFormData({ ...formData, representanteLegal: e.target.value })}
                                        placeholder="Nombre del representante legal"
                                        required
                                    />
                                </div>

                                <div className="ui-field">
                                    <label className="ui-label" htmlFor="acp-edit-email">Email</label>
                                    <input
                                        id="acp-edit-email"
                                        className="ui-input"
                                        type="email"
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        placeholder="Opcional"
                                    />
                                </div>

                                <div className="ui-field">
                                    <label className="ui-label" htmlFor="acp-edit-tel">Teléfono</label>
                                    <input
                                        id="acp-edit-tel"
                                        className="ui-input"
                                        type="tel"
                                        value={formData.telefono}
                                        onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                                        placeholder="Opcional"
                                    />
                                </div>

                                <div className="ui-field ui-span-full">
                                    <label className="ui-label" htmlFor="acp-edit-dir">Dirección</label>
                                    <textarea
                                        id="acp-edit-dir"
                                        className="ui-textarea acp-textarea"
                                        value={formData.direccion}
                                        onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
                                        rows="2"
                                    />
                                </div>
                            </div>
                        </section>
                    </div>

                    <div className="ui-modal-footer">
                        <button type="button" onClick={onClose} className="ui-btn ui-btn--secondary">
                            Cancelar
                        </button>
                        <button type="submit" disabled={saving || !isFormValid} className="ui-btn ui-btn--primary">
                            {saving ? 'Guardando...' : 'Actualizar Cliente'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default AdminClientsPanel;
