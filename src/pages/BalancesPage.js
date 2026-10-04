
import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react';
import { formatCurrency, formatDateISO, formatOrderLabel, orderReferenceMatches } from '../utils/formatters';
import balanceService from '../api/balanceService';
import clientApi from '../api/client';
import { useToast } from '../components/ToastContainer';
import { useConfirm } from '../components/ConfirmDialog';
import SearchableSelect from '../components/SearchableSelect';
import usePersistentState from '../hooks/usePersistentState';
import { avatarTone, avatarInitials } from '../utils/avatarTone';
// Los modales (detalle de orden, historial de pagos y registrar pago) se cargan bajo demanda:
// ver los lazyWithRetry() debajo de los imports. Sus hojas de estilo se importan AQUÍ, en el mismo orden
// en que llegaban antes, para que la cascada CSS no cambie y los chunks diferidos no traigan CSS.
import '../styles/areas/AssortmentSelectionModal.css'; // OrderManagementModal
import '../components/modals/OrderAnnulationModal.css';
import '../components/modals/OrderRevertAnnulmentModal.css';
import '../components/modals/HistoricalInvoiceModal.css';
import '../components/modals/OrderManagementModal.css';
import '../components/modals/PaymentHistoryModal.css';
import { ModalFallback, LazyErrorBoundary, lazyWithRetry } from '../components/LazyFallbacks';
import './BalancesPage.css';

// Carga bajo demanda ("prefetch": se descarga en segundo plano cuando el navegador está libre)
// lazyWithRetry = React.lazy con un reintento si la red falla (ver LazyFallbacks.js).
const OrderDetailModal = lazyWithRetry(() =>
    import(/* webpackPrefetch: true */ '../components/modals/OrderManagementModal').then((m) => ({ default: m.OrderDetailModal }))
);
const PaymentHistoryModal = lazyWithRetry(() =>
    import(/* webpackPrefetch: true */ '../components/modals/PaymentHistoryModal').then((m) => ({ default: m.PaymentHistoryModal }))
);
const PaymentFormModal = lazyWithRetry(() =>
    import(/* webpackPrefetch: true */ '../components/modals/OrderManagementModal').then((m) => ({ default: m.PaymentFormModal }))
);

// Preferencias de CÓMO VER que se recuerdan al recargar (usePersistentState, CONVENTIONS §10):
// orden A-Z/Z-A de la lista de clientes y orden (Fecha/Factura, Asc/Desc) de sus facturas.
// Son los valores que alternan los botones; lo guardado que no sea uno de ellos vuelve al defecto.
// La búsqueda, la vendedora y el filtro de estado (Todos/Deben/Al día) NO se recuerdan.
const SORT_DIRECTIONS = ['asc', 'desc'];
const INVOICE_SORT_FIELDS = ['date', 'invoice'];

function BalancesPage() {
    const [balances, setBalances] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedClient, setSelectedClient] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [vendedores, setVendedores] = useState([]);
    const [selectedVendedor, setSelectedVendedor] = useState('');
    const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'owing', 'up_to_date'
    const [sortOrder, setSortOrder] = usePersistentState('balances.clients.sortDir', 'asc', { allowed: SORT_DIRECTIONS, sync: true });
    // Solo presentación: el botón "Exportar Excel" muestra su carga mientras se genera el archivo
    const [exporting, setExporting] = useState(false);
    // Actualización silenciosa: la página entera en esqueleto solo hasta la primera carga
    // (initialized); "Actualizar" muestra su spinner en el botón (refreshing); balancesVersion
    // sube con cada carga terminada para que el detalle abierto se actualice sin remontarse.
    const [initialized, setInitialized] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [balancesVersion, setBalancesVersion] = useState(0);
    // Número de la última petición (cambiar de vendedora mientras llega una recarga no deja los
    // saldos de la anterior) y vendedora de los saldos que se ven
    const balancesRequestSeqRef = useRef(0);
    const shownQueryRef = useRef(null);
    const toast = useToast();
    const userRole = localStorage.getItem('role');

    // Fetch vendors once on mount if admin/owner
    useEffect(() => {
        const fetchVendors = async () => {
            const isAdminOrOwner = userRole === 'ROLE_ADMIN' || userRole === 'ROLE_OWNER';
            if (isAdminOrOwner) {
                try {
                    const response = await clientApi.get('/admin/clients/vendedores');
                    setVendedores(response.data || []);
                } catch (error) {
                    console.error('Error fetching vendors:', error);
                    toast.error('Error al cargar vendedores');
                }
            }
        };
        fetchVendors();
    }, [userRole, toast]);

    const fetchBalances = useCallback(async (vendedorIdArg) => {
        const requestId = ++balancesRequestSeqRef.current;
        const isLatest = () => requestId === balancesRequestSeqRef.current;
        // Botón "Actualizar" (llega el evento del clic): spinner en el botón, la lista no se vacía
        const manual = !!vendedorIdArg && typeof vendedorIdArg.preventDefault === 'function';
        let silent = false;
        try {
            // Determine actual ID to use:
            // 1. If explicit ID passed (string/number), use it.
            // 2. If it's explicitly null/empty string, we want ALL balances.
            // 3. If it's an event object or undefined, check current selectedVendedor state to persist filter.
            let idToUse = null;

            // null = "Todos los vendedores" (typeof null es 'object': sin esta comprobación caía en la
            // rama del filtro anterior y mostraba los saldos de la vendedora que ya no está elegida)
            if (vendedorIdArg === null || (vendedorIdArg !== undefined && typeof vendedorIdArg !== 'object')) {
                // If it's a primitive value (string id, empty string, number), use it directly
                idToUse = vendedorIdArg;
            } else if (selectedVendedor && vendedores.length > 0) {
                // Try to find the ID for the currently selected vendor username
                const vendorObj = vendedores.find(v => v.username === selectedVendedor);
                if (vendorObj) idToUse = vendorObj.id;
            }

            // Misma consulta que ya se ve (Actualizar, o un pago/cupo/saldo guardado en el
            // detalle): en silencio. Primera carga u otra vendedora: esqueleto en la lista.
            const queryKey = String(idToUse ?? '');
            silent = shownQueryRef.current === queryKey;
            if (!silent) setLoading(true);
            if (manual) setRefreshing(true);

            const response = await balanceService.getAllBalances(idToUse);
            if (isLatest()) {
                setBalances(response.data || []);
                shownQueryRef.current = queryKey;
            }

        } catch (error) {
            console.error('Error fetching balances:', error);
            if (isLatest()) {
                toast.error('Error al cargar saldos: ' + (error.response?.data?.message || error.message));
                // Si falla una recarga silenciosa se quedan los saldos que ya se ven
                if (!silent) {
                    setBalances([]);
                    shownQueryRef.current = null;
                }
            }
        } finally {
            if (isLatest()) {
                setLoading(false);
                setRefreshing(false);
                setInitialized(true);
                // Antes el detalle abierto se remontaba aquí y volvía a pedir el saldo del
                // cliente; ahora sigue montado y lo pide en su lugar al ver este número nuevo
                setBalancesVersion((v) => v + 1);
            }
        }
    }, [toast, selectedVendedor, vendedores]);

    // Initial fetch of balances
    useEffect(() => {
        // Only fetch initial balances if we are not waiting for vendors (or if we already have them/don't need them)
        // Actually, just fetching on mount is fine, subsequent refetches happen via user interaction or vendor change
        fetchBalances();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Run once on mount

    const filteredBalances = useMemo(() => balances.filter(b => {
        // Text Search
        const matchesSearch = b.clientName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            b.clientPhone?.includes(searchTerm) ||
            b.clientRepresentative?.toLowerCase().includes(searchTerm.toLowerCase());

        // Status Filter
        if (filterStatus === 'owing') {
            return matchesSearch && (b.pendingBalance || 0) > 0;
        }
        if (filterStatus === 'up_to_date') {
            return matchesSearch && (b.pendingBalance || 0) <= 0;
        }

        return matchesSearch;
    }).sort((a, b) => {
        const nameA = a.clientName || '';
        const nameB = b.clientName || '';
        return sortOrder === 'asc'
            ? nameA.localeCompare(nameB)
            : nameB.localeCompare(nameA);
    }), [balances, searchTerm, filterStatus, sortOrder]);

    // Totales memoizados (solo dependen de balances, no de búsqueda/orden)
    const totalPending = useMemo(() => balances.reduce((sum, b) => sum + (b.pendingBalance || 0), 0), [balances]);
    const totalPaidAll = useMemo(() => balances.reduce((sum, b) => sum + (b.totalPaid || 0), 0), [balances]);

    // Export to Excel function
    const handleExportExcel = async () => {
        try {
            setExporting(true);
            toast.info('Generando archivo Excel...');

            // Prepare filters
            const filters = {};

            // Get vendor ID if filtered
            if (selectedVendedor && vendedores.length > 0) {
                const vendorObj = vendedores.find(v => v.username === selectedVendedor);
                if (vendorObj) filters.vendedorId = vendorObj.id;
            }

            // Add debt filter if applicable
            if (filterStatus === 'owing') {
                filters.onlyWithDebt = true;
            }

            const response = await balanceService.exportToExcel(filters);

            // Create download link
            const blob = new Blob([response.data], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;

            // Generate filename with date
            const dateStr = formatDateISO(new Date()).replace(/-/g, '');
            const vendorStr = selectedVendedor ? `_${selectedVendedor}` : '';
            link.download = `Saldos_Clientes${vendorStr}_${dateStr}.xlsx`;

            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);

            toast.success('Archivo Excel descargado correctamente');
        } catch (error) {
            console.error('Error exporting to Excel:', error);
            toast.error('Error al exportar a Excel: ' + (error.response?.data?.message || error.message));
        } finally {
            setExporting(false);
        }
    };

    const getRoleLabel = () => {
        if (userRole === 'ROLE_OWNER') return 'Owner';
        if (userRole === 'ROLE_ADMIN') return 'Administrador';
        if (userRole === 'ROLE_VENDEDOR') return 'Vendedor';
        return '';
    };

    // Valor de una tarjeta de resumen mientras llegan los saldos de otra vendedora
    const statSkeleton = (
        <>
            <span className="ui-skeleton ui-skeleton--text bp-stat-skeleton" aria-hidden="true" />
            <span className="ui-sr-only">Cargando</span>
        </>
    );

    if (loading && !initialized) {
        // Esqueleto con la forma de la página (título, estadísticas y lista de clientes), solo
        // en la primera carga. aria-busy: solo aparece con fade; al cargar, el contenido entra
        // con la subida.
        return (
            <div className="balances-page">
                <div className="bp-skeleton" role="status" aria-busy="true">
                    <span className="ui-sr-only">Cargando saldos de clientes...</span>
                    <span className="ui-skeleton bp-skeleton-title" aria-hidden="true" />
                    <div className="bp-skeleton-stats" aria-hidden="true">
                        {[0, 1, 2].map((i) => (
                            <span key={i} className="ui-skeleton ui-skeleton--block" />
                        ))}
                    </div>
                    <div className="bp-skeleton-list" aria-hidden="true">
                        {[0, 1, 2, 3, 4].map((i) => (
                            <div key={i} className="bp-skeleton-row">
                                <span className="ui-skeleton ui-skeleton--circle bp-skeleton-avatar" />
                                <div className="ui-skeleton-stack bp-skeleton-lines">
                                    <span className="ui-skeleton ui-skeleton--title" />
                                    <span className="ui-skeleton ui-skeleton--text bp-skeleton-short" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={`balances-page ${selectedClient ? 'detail-open' : ''}`}>
            {/* Header */}
            <div className="bp-header">
                <button
                    type="button"
                    className="ui-btn ui-btn--ghost ui-btn--sm bp-back"
                    onClick={() => {
                        if (userRole === 'ROLE_OWNER') window.location.href = '/owner';
                        else if (userRole === 'ROLE_ADMIN') window.location.href = '/admin';
                        else if (userRole === 'ROLE_VENDEDOR') window.location.href = '/vendedor';
                        else window.history.back();
                    }}
                >
                    <span className="material-icons-round" aria-hidden="true">arrow_back</span>
                    Volver al Dashboard
                </button>
                <div className="bp-title-row">
                    <h1 className="ui-page-title">
                        <span className="material-icons-round" aria-hidden="true">account_balance_wallet</span>
                        Panel de Saldos
                    </h1>
                    <span className="ui-badge ui-badge--primary bp-role">{getRoleLabel()}</span>
                </div>
            </div>

            {/* Toolbar: búsqueda + filtros (sticky en móvil) + acciones */}
            <div className="bp-controls">
                <div className="bp-toolbar">
                    <div className="ui-search bp-search">
                        <span className="material-icons-round ui-search-icon" aria-hidden="true">search</span>
                        <input
                            type="text"
                            className="ui-input"
                            aria-label="Buscar cliente"
                            placeholder="Buscar cliente..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    {/* Filtro de Estado — segmentado */}
                    <div className="ui-tabs bp-status" role="group" aria-label="Filtrar por estado">
                        <button
                            type="button"
                            aria-pressed={filterStatus === 'all'}
                            className={`ui-tab ${filterStatus === 'all' ? 'is-active' : ''}`}
                            onClick={() => setFilterStatus('all')}
                        >
                            Todos
                        </button>
                        <button
                            type="button"
                            aria-pressed={filterStatus === 'owing'}
                            className={`ui-tab bp-status-owing ${filterStatus === 'owing' ? 'is-active' : ''}`}
                            onClick={() => setFilterStatus('owing')}
                        >
                            <span className="material-icons-round" aria-hidden="true">error_outline</span>
                            Deben
                        </button>
                        <button
                            type="button"
                            aria-pressed={filterStatus === 'up_to_date'}
                            className={`ui-tab bp-status-ok ${filterStatus === 'up_to_date' ? 'is-active' : ''}`}
                            onClick={() => setFilterStatus('up_to_date')}
                        >
                            <span className="material-icons-round" aria-hidden="true">check_circle</span>
                            Al día
                        </button>
                    </div>
                </div>

                <div className="bp-toolbar-actions">
                    {/* Filter by Vendor (Only if Admin/Owner) */}
                    {(userRole === 'ROLE_ADMIN' || userRole === 'ROLE_OWNER') && (
                        <div className="bp-vendor-filter">
                            <SearchableSelect
                                aria-label="Filtrar por vendedor"
                                value={selectedVendedor}
                                emptyOption={{ label: 'Todos los vendedores' }}
                                options={vendedores.map(v => ({ value: v.username, label: v.username }))}
                                onChange={async (e) => {
                                    const username = e.target.value;
                                    setSelectedVendedor(username);

                                    if (!username) {
                                        // Reset to all vendors
                                        fetchBalances(null);
                                        return;
                                    }

                                    // Find vendor ID  by username
                                    const vendorObj = vendedores.find(v => v.username === username);
                                    if (vendorObj) {
                                        // Call fetchBalances with vendorId - backend will filter
                                        fetchBalances(vendorObj.id);
                                    }
                                }}
                            />
                        </div>
                    )}

                    {/* Recarga silenciosa: la lista y el detalle abierto se quedan; spinner aquí */}
                    <button
                        type="button"
                        className={`ui-btn ui-btn--secondary bp-refresh${refreshing ? ' is-loading' : ''}`}
                        onClick={fetchBalances}
                        aria-busy={refreshing || undefined}
                    >
                        {refreshing
                            ? <span className="ui-spinner" aria-hidden="true" />
                            : <span className="material-icons-round" aria-hidden="true">refresh</span>}
                        Actualizar
                    </button>

                    {/* Botón de formato Excel (verde), mismo marcado que ExportButton kind="excel":
                        mientras exporta, spinner + "Exportando..." sin cambiar de ancho */}
                    <button
                        type="button"
                        className={`ui-btn ui-btn--excel bp-export${exporting ? ' is-loading' : ''}`}
                        onClick={handleExportExcel}
                        disabled={exporting}
                        aria-busy={exporting || undefined}
                        title="Exportar a Excel"
                    >
                        {exporting
                            ? <span className="ui-spinner" aria-hidden="true" />
                            : <span className="material-icons-round" aria-hidden="true">table_view</span>}
                        <span className="ui-btn-label">
                            {exporting && <span className="ui-btn-label-sizer" aria-hidden="true">Exportar Excel</span>}
                            <span>{exporting ? 'Exportando...' : 'Exportar Excel'}</span>
                        </span>
                    </button>
                </div>
            </div>

            {/* Summary Stats: el número va en el color de su significado
                (clientes = azul, pendiente = ámbar, pagado = verde).
                Al elegir otra vendedora (loading después de la carga inicial) los saldos que hay
                en memoria son de la vendedora anterior: los totales van en esqueleto hasta que
                llegan los nuevos, igual que la lista, para no leer un pendiente que no
                corresponde. Las recargas silenciosas (misma consulta) los cambian en su lugar. */}
            <div className="bp-stats ui-stagger" aria-busy={loading || undefined}>
                <div className="ui-stat">
                    <span className="ui-stat-icon ui-stat-icon--primary" aria-hidden="true">
                        <span className="material-icons-round">people</span>
                    </span>
                    <div className="ui-stat-content">
                        <span className="ui-stat-value ui-text-primary">{loading ? statSkeleton : balances.length}</span>
                        <span className="ui-stat-label">Clientes</span>
                    </div>
                </div>
                <div className="ui-stat">
                    <span className="ui-stat-icon ui-stat-icon--warning" aria-hidden="true">
                        <span className="material-icons-round">pending</span>
                    </span>
                    <div className="ui-stat-content">
                        <span className="ui-stat-value ui-text-warning">
                            {loading ? statSkeleton : `$${formatCurrency(totalPending)}`}
                        </span>
                        <span className="ui-stat-label">Total Pendiente</span>
                    </div>
                </div>
                <div className="ui-stat">
                    <span className="ui-stat-icon ui-stat-icon--success" aria-hidden="true">
                        <span className="material-icons-round">check_circle</span>
                    </span>
                    <div className="ui-stat-content">
                        <span className="ui-stat-value ui-text-success">
                            {loading ? statSkeleton : `$${formatCurrency(totalPaidAll)}`}
                        </span>
                        <span className="ui-stat-label">Total Pagado</span>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="bp-content">
                {/* Clients List */}
                <div className="bp-list-panel">
                    <div className="bp-list-head">
                        {/* Sin número mientras llegan los saldos de otra vendedora */}
                        <h2 className="bp-panel-title">
                            {loading ? 'Clientes' : `Clientes (${filteredBalances.length})`}
                        </h2>

                        <button
                            type="button"
                            className="ui-btn ui-btn--secondary ui-btn--sm"
                            onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                            title={sortOrder === 'asc' ? 'Orden Ascendente' : 'Orden Descendente'}
                        >
                            <span className="material-icons-round" aria-hidden="true">sort_by_alpha</span>
                            {sortOrder === 'asc' ? 'A-Z' : 'Z-A'}
                        </button>
                    </div>

                    {loading ? (
                        // Otra vendedora (lo pidió el usuario): esqueleto solo en la lista; el
                        // buscador, los filtros y el detalle abierto siguen en su lugar
                        <div className="bp-list-skeleton" role="status" aria-busy="true">
                            <span className="ui-sr-only">Cargando saldos de clientes...</span>
                            {[0, 1, 2, 3, 4].map((i) => (
                                <div key={i} className="bp-skeleton-row" aria-hidden="true">
                                    <span className="ui-skeleton ui-skeleton--circle bp-skeleton-avatar" />
                                    <div className="ui-skeleton-stack bp-skeleton-lines">
                                        <span className="ui-skeleton ui-skeleton--title" />
                                        <span className="ui-skeleton ui-skeleton--text bp-skeleton-short" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : filteredBalances.length === 0 ? (
                        <div className="ui-empty ui-empty--plain">
                            <span className="material-icons-round ui-empty-icon" aria-hidden="true">search_off</span>
                            <p className="ui-empty-title">No se encontraron clientes</p>
                        </div>
                    ) : (
                        <div className="bp-clients ui-stagger">
                            {filteredBalances.map(client => (
                                <div
                                    key={client.clientId}
                                    className={`bp-client ${selectedClient?.clientId === client.clientId ? 'is-active' : ''}`}
                                    onClick={() => setSelectedClient(client)}
                                >
                                    <div className="bp-client-main">
                                        {/* Avatar de iniciales con tono fijo por nombre; el abierto lleva anillo azul */}
                                        <span
                                            className={`ui-avatar ui-avatar--${avatarTone(client.clientName)}${selectedClient?.clientId === client.clientId ? ' is-selected' : ''}`}
                                            aria-hidden="true"
                                        >
                                            {avatarInitials(client.clientName)}
                                        </span>
                                        <div className="bp-client-info">
                                            <span className="bp-client-name">{client.clientName}</span>
                                            {client.clientRepresentative && (
                                                <span className="bp-client-rep">
                                                    <span className="material-icons-round" aria-hidden="true">badge</span>
                                                    {client.clientRepresentative}
                                                </span>
                                            )}
                                            <span className="bp-client-phone">{client.clientPhone || 'Sin teléfono'}</span>
                                        </div>
                                    </div>
                                    <div className="bp-client-balance">
                                        {client.pendingBalance > 0 ? (
                                            <>
                                                {/* Pendiente en ámbar; en rojo si el cliente tiene mora */}
                                                <span className={`bp-balance-amount ${client.daysOverdue > 30 ? 'ui-amount--danger' : 'ui-amount--warning'}`}>
                                                    ${formatCurrency(client.pendingBalance || 0)}
                                                </span>
                                                <span className="bp-balance-label">Pendiente</span>
                                                {client.daysOverdue > 0 && (
                                                    <span className={`ui-badge ${client.daysOverdue > 30 ? 'ui-badge--danger' : 'ui-badge--warning'} bp-overdue`}>
                                                        {client.daysOverdue}d mora
                                                    </span>
                                                )}
                                            </>
                                        ) : (
                                            <>
                                                <span className="ui-badge ui-badge--success bp-uptodate">
                                                    Al día
                                                </span>
                                                <span className="bp-balance-label">Sin deuda</span>
                                            </>
                                        )}
                                    </div>
                                    <span className="material-icons-round bp-chevron" aria-hidden="true">chevron_right</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Client Detail Panel */}
                <div className="bp-detail-panel">
                    <button
                        type="button"
                        className="bp-back-to-list"
                        onClick={() => setSelectedClient(null)}
                    >
                        <span className="material-icons-round" aria-hidden="true">arrow_back</span>
                        Volver a clientes
                    </button>
                    {selectedClient ? (
                        <ClientDetailView
                            client={selectedClient}
                            onRefresh={fetchBalances}
                            userRole={userRole}
                            refreshKey={balancesVersion}
                        />
                    ) : (
                        <div className="ui-empty ui-empty--plain bp-no-selection">
                            <span className="material-icons-round ui-empty-icon" aria-hidden="true">person_search</span>
                            <p className="ui-empty-text">Selecciona un cliente para ver detalles</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// Día (entero, sin hora ni zona horaria) de una fecha del backend "YYYY-MM-DD..." o null.
// Solo para comparar fechas de factura al decidir el color de "vencida".
const MS_PER_DAY = 24 * 60 * 60 * 1000;
function invoiceDayNumber(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
    if (!match) return null;
    return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / MS_PER_DAY;
}

// Porcentaje pagado de una factura (0–100), solo para la mini barra. Protegido contra /0.
function invoicePaidPct(paid, total) {
    const t = Number(total) || 0;
    if (t <= 0) return 0;
    return Math.min(100, Math.max(0, ((Number(paid) || 0) / t) * 100));
}

// ============================================
// CLIENT DETAIL VIEW COMPONENT
// ============================================
function ClientDetailView({ client, onRefresh, userRole, refreshKey }) {
    const [clientDetail, setClientDetail] = useState(null);
    const [loading, setLoading] = useState(true);
    const [creditLimit, setCreditLimit] = useState('');
    const [initialBalance, setInitialBalance] = useState('');
    const [balanceFavorAmount, setBalanceFavorAmount] = useState('');
    const [saving, setSaving] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    // Se recuerdan por usuario y valen para todos los clientes (antes volvían a Fecha/Desc al
    // recargar o al volver a abrir el detalle)
    const [sortOrder, setSortOrder] = usePersistentState('balances.invoices.sortDir', 'desc', { allowed: SORT_DIRECTIONS, sync: true });
    const [sortBy, setSortBy] = usePersistentState('balances.invoices.sort', 'date', { allowed: INVOICE_SORT_FIELDS, sync: true });

    // Modal States
    const [selectedOrderForModal, setSelectedOrderForModal] = useState(null);
    const [loadingOrder, setLoadingOrder] = useState(false);
    const [showPaymentHistory, setShowPaymentHistory] = useState(false);
    const [selectedOrderForHistory, setSelectedOrderForHistory] = useState(null);
    const [showPaymentForm, setShowPaymentForm] = useState(false);
    const [selectedOrderForPayment, setSelectedOrderForPayment] = useState(null);

    // Services
    const toast = useToast();
    const confirm = useConfirm();
    const isOwner = userRole === 'ROLE_OWNER';

    // Actualización silenciosa del detalle: el esqueleto solo sale al abrir otro cliente. Las
    // recargas del MISMO cliente (después de un pago, cupo, saldo inicial o saldo a favor, o al
    // actualizar la lista) cambian los números en su lugar: los modales abiertos (historial de
    // pagos, registrar pago, detalle de la orden) siguen abiertos y no salta el scroll.
    const detailRequestSeqRef = useRef(0);
    const shownClientIdRef = useRef(null);
    // Límite de crédito tal como llegó del servidor: si el usuario lo está cambiando (el campo ya
    // no coincide), una recarga silenciosa no le borra lo que escribió
    const loadedCreditLimitRef = useRef('');
    // Sube con cada recarga terminada: el detalle de orden abierto vuelve a pedir lo suyo en su
    // lugar (antes se remontaba con todo el detalle del cliente y se cerraba)
    const [detailVersion, setDetailVersion] = useState(0);

    const fetchClientDetail = useCallback(async () => {
        const requestId = ++detailRequestSeqRef.current;
        const isLatest = () => requestId === detailRequestSeqRef.current;
        const silent = shownClientIdRef.current === client.clientId;
        try {
            if (!silent) setLoading(true);
            const response = await balanceService.getClientBalance(client.clientId);
            if (!isLatest()) return; // se abrió otro cliente mientras llegaba
            const serverCreditLimit = response.data?.creditLimit?.toString() || '';
            setClientDetail(response.data);
            if (silent) {
                setCreditLimit((typed) => (typed === loadedCreditLimitRef.current ? serverCreditLimit : typed));
            } else {
                setCreditLimit(serverCreditLimit);
            }
            loadedCreditLimitRef.current = serverCreditLimit;
            shownClientIdRef.current = client.clientId;
        } catch (error) {
            console.error('Error fetching client detail:', error);
            // Si falla una recarga silenciosa se queda el detalle que ya se ve
            if (isLatest()) toast.error('Error al cargar detalles del cliente');
        } finally {
            if (isLatest()) {
                setLoading(false);
                setDetailVersion((v) => v + 1);
            }
        }
    }, [client.clientId, toast]);

    useEffect(() => {
        fetchClientDetail();
    }, [fetchClientDetail]);

    // La lista de saldos recargó (refreshKey cambió): se pide de nuevo el saldo de este cliente,
    // en silencio (antes lo pedía porque toda la página se remontaba)
    const lastRefreshKeyRef = useRef(refreshKey);
    useEffect(() => {
        if (refreshKey === lastRefreshKeyRef.current) return;
        lastRefreshKeyRef.current = refreshKey;
        fetchClientDetail();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refreshKey]);

    // FETCH FULL ORDER DETAILS FOR MODAL
    // silent: recarga de la orden que ya está abierta (después de un cambio hecho en ella): sin
    // el aviso "Cargando orden..." encima del modal, y solo si ese modal sigue abierto
    const handleManageOrder = async (orderId, { silent = false } = {}) => {
        if (!orderId) {
            toast.error('ID de orden no válido');
            return;
        }

        try {
            if (!silent) setLoadingOrder(true);
            let response;
            let foundOrder = null;

            // Como no existe endpoint de orden individual, obtenemos todas y filtramos
            if (userRole === 'ROLE_OWNER') {
                response = await clientApi.get('/owner/orders');
            } else if (userRole === 'ROLE_ADMIN') {
                response = await clientApi.get('/admin/orders');
            } else {
                response = await clientApi.get('/vendedor/orders');
            }

            if (response.data && Array.isArray(response.data)) {
                // Buscar por ID (convertir a string por seguridad)
                foundOrder = response.data.find(o => String(o.id) === String(orderId));
            }

            if (foundOrder && silent) {
                setSelectedOrderForModal((open) => (
                    open && String(open.id || open.orderId) === String(orderId) ? foundOrder : open
                ));
            } else if (foundOrder) {
                setSelectedOrderForModal(foundOrder);
            } else {
                console.warn(`Order ${orderId} not found in full list`);
                toast.error('No se pudo encontrar la información completa de la orden');
            }
        } catch (error) {
            console.error('Error fetching orders:', error);
            toast.error('Error al cargar detalles de la orden');
        } finally {
            if (!silent) setLoadingOrder(false);
        }
    };

    // MOSTRAR HISTORIAL DE PAGOS AL HACER CLICK EN FACTURA
    const handleShowPaymentHistory = (order) => {
        setSelectedOrderForHistory(order);
        setShowPaymentHistory(true);
    };

    // CERRAR MODAL DE HISTORIAL DE PAGOS
    const handleClosePaymentHistory = () => {
        setShowPaymentHistory(false);
        setSelectedOrderForHistory(null);
    };

    // ACTUALIZAR DATOS DESPUÉS DE CAMBIOS EN PAGOS
    const handlePaymentUpdate = () => {
        fetchClientDetail();
        onRefresh();
    };

    // ABRIR MODAL DE REGISTRO DE PAGO
    const handleOpenPaymentForm = (order) => {
        setSelectedOrderForPayment({
            ...order,
            clientName: client.clientName
        });
        setShowPaymentForm(true);
    };

    // CERRAR MODAL DE REGISTRO DE PAGO
    const handleClosePaymentForm = () => {
        setShowPaymentForm(false);
        setSelectedOrderForPayment(null);
    };

    // DESPUÉS DE REGISTRAR UN PAGO
    const handlePaymentRegistered = () => {
        fetchClientDetail();
        onRefresh();
    };

    // Save credit limit
    const handleSaveCreditLimit = async () => {
        if (!creditLimit || parseFloat(creditLimit) < 0) {
            toast.warning('Ingrese un límite de crédito válido');
            return;
        }

        try {
            setSaving('credit');
            await balanceService.setCreditLimit(client.clientId, parseFloat(creditLimit));
            toast.success('Límite de crédito guardado');
            fetchClientDetail();
            onRefresh();
        } catch (error) {
            console.error('Error saving credit limit:', error);
            toast.error('Error al guardar límite de crédito');
        } finally {
            setSaving(null);
        }
    };

    // Remove credit limit
    const handleRemoveCreditLimit = async () => {
        const confirmed = await confirm({
            title: '¿Eliminar límite de crédito?',
            message: 'El cliente podrá comprar sin restricción de crédito.'
        });

        if (!confirmed) return;

        try {
            setSaving('removeCredit');
            await balanceService.removeCreditLimit(client.clientId);
            toast.success('Límite de crédito eliminado');
            setCreditLimit('');
            fetchClientDetail();
            onRefresh();
        } catch (error) {
            console.error('Error removing credit limit:', error);
            toast.error('Error al eliminar límite de crédito');
        } finally {
            setSaving(null);
        }
    };

    // Save initial balance
    const handleSaveInitialBalance = async () => {
        if (!initialBalance || parseFloat(initialBalance) < 0) {
            toast.warning('Ingrese un saldo inicial válido');
            return;
        }

        const confirmed = await confirm({
            title: '¿Establecer saldo inicial?',
            message: 'Esta acción solo puede realizarse una vez por cliente.'
        });

        if (!confirmed) return;

        try {
            setSaving('initial');
            await balanceService.setInitialBalance(client.clientId, parseFloat(initialBalance));
            toast.success('Saldo inicial establecido');
            fetchClientDetail();
            onRefresh();
        } catch (error) {
            console.error('Error saving initial balance:', error);
            toast.error('Error al establecer saldo inicial: ' + (error.response?.data?.message || error.message));
        } finally {
            setSaving(null);
        }
    };

    // Add balance favor
    const handleAddBalanceFavor = async () => {
        if (!balanceFavorAmount || parseFloat(balanceFavorAmount) <= 0) {
            toast.warning('Ingrese un monto válido mayor a 0');
            return;
        }

        const confirmed = await confirm({
            title: '¿Agregar Saldo a Favor?',
            message: `Se agregarán $${formatCurrency(parseFloat(balanceFavorAmount))} al saldo a favor del cliente.`
        });

        if (!confirmed) return;

        try {
            setSaving('balanceFavor');
            await balanceService.addBalanceFavor(client.clientId, parseFloat(balanceFavorAmount));
            toast.success('Saldo a favor agregado correctamente');
            setBalanceFavorAmount('');
            fetchClientDetail();
            onRefresh();
        } catch (error) {
            console.error('Error adding balance favor:', error);
            toast.error('Error al agregar saldo a favor');
        } finally {
            setSaving(null);
        }
    };

    if (loading) {
        // Esqueleto con la forma del detalle: encabezado, tres tarjetas de resumen y facturas
        return (
            <div className="bp-detail-skeleton" role="status" aria-busy="true">
                <span className="ui-sr-only">Cargando detalles...</span>
                <div className="bp-skeleton-row" aria-hidden="true">
                    <span className="ui-skeleton ui-skeleton--circle bp-skeleton-avatar bp-skeleton-avatar--lg" />
                    <div className="ui-skeleton-stack bp-skeleton-lines">
                        <span className="ui-skeleton ui-skeleton--title" />
                        <span className="ui-skeleton ui-skeleton--text bp-skeleton-short" />
                    </div>
                </div>
                <div className="bp-skeleton-stats" aria-hidden="true">
                    {[0, 1, 2].map((i) => (
                        <span key={i} className="ui-skeleton ui-skeleton--block" />
                    ))}
                </div>
                <div className="ui-skeleton-stack" aria-hidden="true">
                    {[0, 1, 2].map((i) => (
                        <span key={i} className="ui-skeleton ui-skeleton--block" />
                    ))}
                </div>
            </div>
        );
    }

    // Mora: tono semántico según días (mismos umbrales de siempre)
    // Mora en toda la pantalla: al día = verde, 1 a 30 días = ámbar, más de 30 = rojo
    const overdueTone = clientDetail?.daysOverdue > 30 ? 'danger' : clientDetail?.daysOverdue > 0 ? 'warning' : 'success';

    // ---- Solo presentación (no cambia ningún cálculo ni dato enviado) ----
    const hasMora = clientDetail?.daysOverdue > 0;
    const detailPaid = clientDetail?.totalPaid || 0;
    const detailPending = clientDetail?.pendingBalance || 0;
    // Tono del saldo pendiente: ámbar; rojo si hay mora; verde si no debe nada
    const pendingTone = detailPending > 0 ? (clientDetail?.daysOverdue > 30 ? 'danger' : 'warning') : 'success';
    // "Pagado X %": lo pagado sobre lo cobrado al cliente (pagado + pendiente, que ya incluye el
    // saldo inicial; sin saldo inicial es igual a "Total Órdenes"). Protegido contra división por 0.
    const chargedTotal = detailPaid + detailPending;
    const paidPct = chargedTotal > 0 ? Math.min(100, Math.max(0, (detailPaid / chargedTotal) * 100)) : 0;
    // Hacia abajo: con un saldo mínimo pendiente nunca se lee "100 %"
    const paidPctLabel = Math.floor(paidPct);

    // Factura vencida (franja y monto en rojo). El backend calcula la mora del cliente
    // (daysOverdue) desde la factura con saldo más antigua; con esa misma referencia, una factura
    // con saldo está vencida si su fecha es anterior a "fecha más antigua + días de mora"
    // (así no se repite aquí el plazo de pago del backend). Sin mora no hay facturas vencidas.
    const pendingInvoiceDays = (clientDetail?.pendingOrders || [])
        .filter(o => o.pendingAmount > 0)
        .map(o => invoiceDayNumber(o.fecha))
        .filter(d => d !== null);
    const overdueCutoff = hasMora && pendingInvoiceDays.length > 0
        ? Math.min(...pendingInvoiceDays) + clientDetail.daysOverdue
        : null;
    const isInvoiceOverdue = (order) => {
        if (overdueCutoff === null || !(order.pendingAmount > 0)) return false;
        const day = invoiceDayNumber(order.fecha);
        return day !== null && day < overdueCutoff;
    };

    return (
        <div className="bp-detail ui-rise-in">
            {/* Client Header */}
            <div className="bp-detail-header">
                <span
                    className={`ui-avatar ui-avatar--lg ui-avatar--${avatarTone(client.clientName)}`}
                    aria-hidden="true"
                >
                    {avatarInitials(client.clientName)}
                </span>
                <div className="bp-detail-title">
                    <h2>{client.clientName}</h2>
                    <p className={`bp-detail-phone${client.clientPhone ? '' : ' is-empty'}`}>
                        <span className="ui-icon-tile ui-icon-tile--sm ui-icon-tile--success" aria-hidden="true">
                            <span className="material-icons-round">phone</span>
                        </span>
                        {client.clientPhone || 'Sin teléfono'}
                    </p>
                </div>
            </div>

            {/* Balance Summary: total (azul), pagado (verde), pendiente (ámbar; rojo con mora) */}
            <div className="bp-summary ui-stagger">
                <div className="ui-stat bp-summary-card">
                    <span className="ui-stat-icon ui-stat-icon--primary" aria-hidden="true">
                        <span className="material-icons-round">account_balance</span>
                    </span>
                    <div className="ui-stat-content">
                        <span className="ui-stat-value">${formatCurrency(clientDetail?.totalOrders || 0)}</span>
                        <span className="ui-stat-label">Total Órdenes</span>
                    </div>
                </div>
                <div className="ui-stat bp-summary-card">
                    <span className="ui-stat-icon ui-stat-icon--success" aria-hidden="true">
                        <span className="material-icons-round">payments</span>
                    </span>
                    <div className="ui-stat-content">
                        <span className="ui-stat-value ui-text-success">${formatCurrency(clientDetail?.totalPaid || 0)}</span>
                        <span className="ui-stat-label">Total Pagado</span>
                    </div>
                </div>
                <div className={`ui-stat bp-summary-card bp-summary-card--${pendingTone}`}>
                    <span className={`ui-stat-icon ui-stat-icon--${pendingTone}`} aria-hidden="true">
                        <span className="material-icons-round">pending</span>
                    </span>
                    <div className="ui-stat-content">
                        <span className={`ui-stat-value ui-text-${pendingTone}`}>${formatCurrency(clientDetail?.pendingBalance || 0)}</span>
                        <span className="ui-stat-label">Saldo Pendiente</span>
                    </div>
                </div>
            </div>

            {/* Barra "Pagado X %" (verde sobre pista clara) */}
            {chargedTotal > 0 && (
                <div className="bp-paid-progress">
                    <div className="ui-progress-meta">
                        <span>Pagado</span>
                        <span className="bp-paid-pct">{paidPctLabel} %</span>
                    </div>
                    <div
                        className="ui-progress ui-progress--lg ui-progress--success"
                        style={{ '--value': paidPct }}
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={paidPctLabel}
                        aria-label="Porcentaje pagado"
                    >
                        <span className="ui-progress-bar" />
                    </div>
                </div>
            )}

            {/* Days Overdue & Last Payment */}
            <div className="bp-extra-info">
                {clientDetail?.daysOverdue > 0 && (
                    <span className={`ui-badge ui-badge--${overdueTone} bp-extra-badge`}>
                        <span className="material-icons-round" aria-hidden="true">schedule</span>
                        {clientDetail.daysOverdue} días de mora
                    </span>
                )}
                {clientDetail?.lastPaymentDate && (
                    <span className="ui-badge ui-badge--primary bp-extra-badge">
                        <span className="material-icons-round" aria-hidden="true">event</span>
                        Último pago: {new Date(clientDetail.lastPaymentDate).toLocaleDateString()}
                    </span>
                )}
            </div>

            {/* Owner Controls */}
            {isOwner && (
                <div className="bp-owner-controls">
                    {/* Credit Limit Control */}
                    <section className="ui-section bp-control">
                        <h3 className="ui-section-title bp-control-title">
                            <span className="material-icons-round ui-icon-tile ui-icon-tile--sm ui-icon-tile--primary" aria-hidden="true">credit_card</span>
                            Límite de Crédito
                        </h3>
                        <div className="bp-control-row">
                            <div className="ui-input-group">
                                <span className="ui-input-prefix" aria-hidden="true">$</span>
                                <input
                                    type="number"
                                    className="ui-input"
                                    aria-label="Límite de crédito"
                                    value={creditLimit}
                                    onChange={(e) => setCreditLimit(e.target.value)}
                                    placeholder="Ej: 500.00"
                                    min="0"
                                    step="0.01"
                                />
                            </div>
                            <button
                                type="button"
                                className="ui-btn ui-btn--primary"
                                onClick={handleSaveCreditLimit}
                                disabled={saving === 'credit'}
                            >
                                {saving === 'credit' ? '...' : 'Guardar'}
                            </button>
                            {clientDetail?.creditLimit && (
                                <button
                                    type="button"
                                    className="ui-btn ui-btn--danger-ghost"
                                    onClick={handleRemoveCreditLimit}
                                    disabled={saving === 'removeCredit'}
                                >
                                    {saving === 'removeCredit' ? '...' : 'Eliminar'}
                                </button>
                            )}
                        </div>
                        {clientDetail?.creditLimit && (
                            <p className="bp-control-info">
                                Límite actual: <strong>${formatCurrency(clientDetail.creditLimit)}</strong>
                            </p>
                        )}
                    </section>

                    {/* Balance Favor Control */}
                    <section className="ui-section bp-control">
                        <h3 className="ui-section-title bp-control-title">
                            <span className="material-icons-round ui-icon-tile ui-icon-tile--sm ui-icon-tile--success" aria-hidden="true">savings</span>
                            Saldo a Favor
                        </h3>
                        <p className="ui-section-desc bp-control-desc">
                            Agrega saldo a favor para que se descuente automáticamente en futuras compras.
                        </p>
                        <div className="bp-control-row">
                            <div className="ui-input-group">
                                <span className="ui-input-prefix" aria-hidden="true">$</span>
                                <input
                                    type="number"
                                    className="ui-input"
                                    aria-label="Monto de saldo a favor"
                                    value={balanceFavorAmount}
                                    onChange={(e) => setBalanceFavorAmount(e.target.value)}
                                    placeholder="Ej: 150000"
                                    min="0"
                                    step="0.01"
                                />
                            </div>
                            <button
                                type="button"
                                className="ui-btn ui-btn--primary"
                                onClick={handleAddBalanceFavor}
                                disabled={saving === 'balanceFavor'}
                            >
                                {saving === 'balanceFavor' ? '...' : 'Agregar'}
                            </button>
                        </div>
                        {(clientDetail?.balanceFavor > 0) && (
                            <p className="bp-control-info is-success">
                                Saldo a favor disponible: <strong>${formatCurrency(clientDetail.balanceFavor || 0)}</strong>
                            </p>
                        )}
                    </section>

                    {/* Initial Balance Control */}
                    {!clientDetail?.initialBalanceSet && (
                        <section className="ui-section bp-control">
                            <h3 className="ui-section-title bp-control-title">
                                <span className="material-icons-round ui-icon-tile ui-icon-tile--sm ui-icon-tile--teal" aria-hidden="true">account_balance_wallet</span>
                                Saldo Inicial
                            </h3>
                            <p className="ui-section-desc bp-control-desc">
                                Establece el saldo inicial pendiente del cliente (solo se puede hacer una vez).
                            </p>
                            <div className="bp-control-row">
                                <div className="ui-input-group">
                                    <span className="ui-input-prefix" aria-hidden="true">$</span>
                                    <input
                                        type="number"
                                        className="ui-input"
                                        aria-label="Saldo inicial"
                                        value={initialBalance}
                                        onChange={(e) => setInitialBalance(e.target.value)}
                                        placeholder="Ej: 100.00"
                                        min="0"
                                        step="0.01"
                                    />
                                </div>
                                <button
                                    type="button"
                                    className="ui-btn ui-btn--primary"
                                    onClick={handleSaveInitialBalance}
                                    disabled={saving === 'initial'}
                                >
                                    {saving === 'initial' ? '...' : 'Establecer'}
                                </button>
                            </div>
                        </section>
                    )}

                    {clientDetail?.initialBalanceSet && (
                        <section className="ui-section bp-control is-readonly">
                            <h3 className="ui-section-title bp-control-title">
                                <span className="material-icons-round ui-icon-tile ui-icon-tile--sm ui-icon-tile--teal" aria-hidden="true">account_balance_wallet</span>
                                Saldo Inicial
                            </h3>
                            <p className="bp-control-info">
                                Saldo inicial establecido: <strong>${formatCurrency(clientDetail.initialBalance || 0)}</strong>
                            </p>
                        </section>
                    )}
                </div>
            )}

            {/* Pending Orders */}
            <div className="bp-orders">
                <h3 className="bp-orders-title">
                    <span className="material-icons-round ui-icon-tile ui-icon-tile--sm ui-icon-tile--primary" aria-hidden="true">receipt_long</span>
                    Órdenes Pendientes de Pago
                </h3>

                {/* Search and Sort Controls */}
                <div className="bp-orders-filters">
                    <div className="ui-search bp-orders-search">
                        <span className="material-icons-round ui-search-icon" aria-hidden="true">search</span>
                        <input
                            type="text"
                            className="ui-input"
                            aria-label="Buscar por factura o pedido"
                            placeholder="Buscar por factura o pedido (P-123)..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="bp-sort-row">
                    <button
                        type="button"
                        className="ui-btn ui-btn--secondary ui-btn--sm"
                        onClick={() => setSortBy(prev => prev === 'invoice' ? 'date' : 'invoice')}
                        title={sortBy === 'invoice' ? 'Ordenar por factura' : 'Ordenar por fecha'}
                    >
                        <span className="material-icons-round" aria-hidden="true">
                            {sortBy === 'date' ? 'calendar_today' : 'tag'}
                        </span>
                        {sortBy === 'date' ? 'Fecha' : 'Factura'}
                    </button>
                    <button
                        type="button"
                        className="ui-btn ui-btn--secondary ui-btn--sm"
                        onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                        title={sortOrder === 'asc' ? 'Orden Ascendente' : 'Orden Descendente'}
                    >
                        <span className="material-icons-round" aria-hidden="true">
                            {sortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                        </span>
                        {sortOrder === 'asc' ? 'Asc' : 'Desc'}
                    </button>
                    </div>
                </div>
                {clientDetail?.pendingOrders?.length > 0 ? (
                    <div className="bp-order-list ui-stagger">
                        {clientDetail.pendingOrders
                            // Factura ("1500", "#1500") o pedido ("123", "P-123", "p123")
                            .filter(order => orderReferenceMatches(order, searchTerm))
                            .sort((a, b) => {
                                if (sortBy === 'date') {
                                    const dateA = new Date(a.fecha || 0).getTime();
                                    const dateB = new Date(b.fecha || 0).getTime();
                                    return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
                                }
                                const invoiceA = String(a.invoiceNumber || '');
                                const invoiceB = String(b.invoiceNumber || '');
                                return sortOrder === 'asc'
                                    ? invoiceA.localeCompare(invoiceB)
                                    : invoiceB.localeCompare(invoiceA);
                            })
                            .map(order => {
                                // Estado de pago → badge de cartera (Pagado=success, Parcial=primary,
                                // Pendiente=warning: en cartera "pendiente" requiere atención)
                                const statusInfo = order.pendingAmount <= 0
                                    ? { text: 'Pagado', tone: 'success' }
                                    : order.paidAmount > 0
                                        ? { text: 'Parcial', tone: 'primary' }
                                        : { text: 'Pendiente', tone: 'warning' };
                                // Solo presentación: franja de 4px por estado (vencida = rojo),
                                // montos con color y mini barra de pago (mismos valores mostrados)
                                const overdue = isInvoiceOverdue(order);
                                const stripeTone = overdue ? 'danger' : statusInfo.tone;
                                // Saldada (incluye facturas en $0): barra llena, igual que su badge "Pagado"
                                const orderPaidPct = order.pendingAmount <= 0
                                    ? 100
                                    : invoicePaidPct(order.paidAmount, order.discountedTotal || order.total || 0);
                                const paidClass = order.paidAmount > 0 ? 'ui-amount--success' : 'is-zero';
                                const pendingClass = order.pendingAmount > 0
                                    ? (overdue ? 'ui-amount--danger' : 'ui-amount--warning')
                                    : 'is-zero';

                                return (
                                    <div key={order.orderId || order.id} className={`bp-order ui-stripe ui-stripe--${stripeTone}`}>
                                        {/* Main order info - CLICKEABLE para ver historial */}
                                        <div
                                            className="bp-order-main"
                                            onClick={() => handleShowPaymentHistory(order)}
                                            title="Ver historial de pagos"
                                        >
                                            <div className="bp-order-ref">
                                                <span className="bp-order-id">{formatOrderLabel(order)}</span>
                                                <span className="bp-order-date">
                                                    <span className="material-icons-round" aria-hidden="true">event</span>
                                                    {new Date(order.fecha).toLocaleDateString()}
                                                </span>
                                                {/* Payment Status Badge */}
                                                <span className={`ui-badge ui-badge--${statusInfo.tone}`}>
                                                    {statusInfo.text}
                                                </span>
                                            </div>
                                            {/* Mini barra de pago de la factura (verde) */}
                                            <div
                                                className="ui-progress ui-progress--sm ui-progress--success bp-order-progress"
                                                style={{ '--value': orderPaidPct }}
                                                role="progressbar"
                                                aria-valuemin={0}
                                                aria-valuemax={100}
                                                aria-valuenow={Math.floor(orderPaidPct)}
                                                aria-label="Porcentaje pagado de la factura"
                                            >
                                                <span className="ui-progress-bar" />
                                            </div>
                                        </div>
                                        <dl className="bp-order-amounts">
                                            <div className="bp-amount-row">
                                                <dt>Total:</dt>
                                                <dd>${formatCurrency(order.discountedTotal || order.total || 0)}</dd>
                                            </div>
                                            <div className="bp-amount-row">
                                                <dt>Pagado:</dt>
                                                <dd className={paidClass}>${formatCurrency(order.paidAmount || 0)}</dd>
                                            </div>
                                            <div className="bp-amount-row is-pending">
                                                <dt>Pendiente:</dt>
                                                <dd className={pendingClass}>${formatCurrency(order.pendingAmount || 0)}</dd>
                                            </div>
                                        </dl>
                                        {/* Action Buttons */}
                                        <div className="bp-order-actions">
                                            {/* History Button - Available for all users */}
                                            <button
                                                type="button"
                                                className="ui-icon-btn ui-icon-btn--bordered ui-icon-btn--lg bp-history-btn"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleShowPaymentHistory(order);
                                                }}
                                                title="Ver historial de pagos"
                                                aria-label="Ver historial de pagos"
                                            >
                                                <span className="material-icons-round" aria-hidden="true">history</span>
                                            </button>

                                            {/* Register Payment Button - Only for Owner, and only if pending > 0 */}
                                            {isOwner && order.pendingAmount > 0 && (
                                                <button
                                                    type="button"
                                                    className="ui-btn ui-btn--primary"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleOpenPaymentForm(order);
                                                    }}
                                                    title="Registrar Pago"
                                                >
                                                    <span className="material-icons-round" aria-hidden="true">payments</span>
                                                    Pagar
                                                </button>
                                            )}

                                            {/* Ver detalle de la factura (descuentos y pagos): Owner y Admin.
                                                Dentro del detalle, registrar/anular pagos sigue siendo solo del Owner. */}
                                            {(isOwner || userRole === 'ROLE_ADMIN') && (
                                                <button
                                                    type="button"
                                                    className="ui-icon-btn ui-icon-btn--bordered ui-icon-btn--lg"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleManageOrder(order.id || order.orderId);
                                                    }}
                                                    title="Ver detalles de la orden"
                                                    aria-label="Ver detalles de la orden"
                                                    disabled={loadingOrder}
                                                >
                                                    <span className="material-icons-round" aria-hidden="true">visibility</span>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                    </div>
                ) : (
                    <div className="ui-empty ui-empty--plain bp-orders-empty">
                        <span className="material-icons-round ui-empty-icon" aria-hidden="true">check_circle</span>
                        <p className="ui-empty-text">No hay órdenes pendientes de pago</p>
                    </div>
                )}
            </div>

            {/* Order Management Modal */}
            {selectedOrderForModal && (
                <LazyErrorBoundary variant="modal" onClose={() => setSelectedOrderForModal(null)}>
                <Suspense fallback={<ModalFallback onClose={() => setSelectedOrderForModal(null)} />}>
                    <OrderDetailModal
                        order={selectedOrderForModal}
                        userRole={userRole}
                        onClose={() => setSelectedOrderForModal(null)}
                        onRefresh={() => {
                            // Refresh client detail to update balances
                            fetchClientDetail();
                            // Also refresh the specific order to update totals/discounts
                            handleManageOrder(selectedOrderForModal.id || selectedOrderForModal.orderId, { silent: true });
                        }}
                        refreshKey={detailVersion}
                    />
                </Suspense>
                </LazyErrorBoundary>
            )}

            {/* Payment History Modal */}
            {showPaymentHistory && selectedOrderForHistory && (
                <LazyErrorBoundary variant="modal" onClose={handleClosePaymentHistory}>
                <Suspense fallback={<ModalFallback onClose={handleClosePaymentHistory} />}>
                    <PaymentHistoryModal
                        isOpen={showPaymentHistory}
                        onClose={handleClosePaymentHistory}
                        orderId={selectedOrderForHistory.id || selectedOrderForHistory.orderId}
                        invoiceNumber={selectedOrderForHistory.invoiceNumber}
                        orderNumber={selectedOrderForHistory.orderNumber}
                        onPaymentUpdate={handlePaymentUpdate}
                        userRole={userRole}
                    />
                </Suspense>
                </LazyErrorBoundary>
            )}

            {/* Payment Form Modal (reusing styled modal from OrderManagementModal) */}
            {showPaymentForm && selectedOrderForPayment && (
                <LazyErrorBoundary variant="modal" onClose={handleClosePaymentForm}>
                <Suspense fallback={<ModalFallback onClose={handleClosePaymentForm} />}>
                    <PaymentFormModal
                        orderId={selectedOrderForPayment.orderId || selectedOrderForPayment.id}
                        orderTotal={selectedOrderForPayment.discountedTotal || selectedOrderForPayment.total || 0}
                        totalPaid={selectedOrderForPayment.paidAmount || 0}
                        availableCredit={clientDetail?.balanceFavor || 0}
                        onClose={handleClosePaymentForm}
                        onSuccess={() => {
                            handleClosePaymentForm();
                            handlePaymentRegistered();
                        }}
                    />
                </Suspense>
                </LazyErrorBoundary>
            )}

            {loadingOrder && (
                <div className="ui-modal-overlay bp-loading-overlay">
                    <div className="ui-loading bp-loading-dialog" role="status">
                        <span className="ui-spinner" aria-hidden="true"></span>
                        <p>Cargando orden...</p>
                    </div>
                </div>
            )}
        </div>
    );
}

export default BalancesPage;
