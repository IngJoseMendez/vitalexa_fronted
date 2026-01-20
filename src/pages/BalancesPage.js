
import { useState, useEffect, useCallback } from 'react';
import balanceService from '../api/balanceService';
import clientApi from '../api/client';
import { useToast } from '../components/ToastContainer';
import { useConfirm } from '../components/ConfirmDialog';
import { OrderDetailModal } from '../components/modals/OrderManagementModal';
import './BalancesPage.css';

function BalancesPage() {
    const [balances, setBalances] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedClient, setSelectedClient] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const toast = useToast();
    const userRole = localStorage.getItem('role');

    const fetchBalances = useCallback(async () => {
        try {
            setLoading(true);
            const response = await balanceService.getAllBalances();
            setBalances(response.data || []);
        } catch (error) {
            console.error('Error fetching balances:', error);
            toast.error('Error al cargar saldos: ' + (error.response?.data?.message || error.message));
            setBalances([]);
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        fetchBalances();
    }, [fetchBalances]);

    const filteredBalances = balances.filter(b =>
        b.clientName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.clientPhone?.includes(searchTerm)
    );

    const getRoleLabel = () => {
        if (userRole === 'ROLE_OWNER') return 'Owner';
        if (userRole === 'ROLE_ADMIN') return 'Administrador';
        if (userRole === 'ROLE_VENDEDOR') return 'Vendedor';
        return '';
    };

    if (loading) {
        return (
            <div className="balances-page">
                <div className="loading-state">
                    <span className="material-icons-round spin">sync</span>
                    <p>Cargando saldos de clientes...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="balances-page">
            {/* Header */}
            <div className="balances-header">
                <div className="header-breadcrumbs">
                    <button
                        className="btn-back"
                        onClick={() => {
                            if (userRole === 'ROLE_OWNER') window.location.href = '/owner';
                            else if (userRole === 'ROLE_ADMIN') window.location.href = '/admin';
                            else if (userRole === 'ROLE_VENDEDOR') window.location.href = '/vendedor';
                            else window.history.back();
                        }}
                    >
                        <span className="material-icons-round">arrow_back</span>
                        Volver al Dashboard
                    </button>
                </div>
                <div className="header-title">
                    <h1>
                        <span className="material-icons-round">account_balance_wallet</span>
                        Panel de Saldos
                    </h1>
                    <span className="role-badge">{getRoleLabel()}</span>
                </div>
                <div className="header-actions">
                    <div className="search-box">
                        <span className="material-icons-round">search</span>
                        <input
                            type="text"
                            placeholder="Buscar cliente..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button className="btn-refresh" onClick={fetchBalances}>
                        <span className="material-icons-round">refresh</span>
                        Actualizar
                    </button>
                </div>
            </div>

            {/* Summary Stats */}
            <div className="balances-stats">
                <div className="stat-card">
                    <span className="stat-icon clients">
                        <span className="material-icons-round">people</span>
                    </span>
                    <div className="stat-content">
                        <span className="stat-value">{balances.length}</span>
                        <span className="stat-label">Clientes</span>
                    </div>
                </div>
                <div className="stat-card">
                    <span className="stat-icon pending">
                        <span className="material-icons-round">pending</span>
                    </span>
                    <div className="stat-content">
                        <span className="stat-value">
                            ${balances.reduce((sum, b) => sum + (b.pendingBalance || 0), 0).toFixed(2)}
                        </span>
                        <span className="stat-label">Total Pendiente</span>
                    </div>
                </div>
                <div className="stat-card">
                    <span className="stat-icon paid">
                        <span className="material-icons-round">check_circle</span>
                    </span>
                    <div className="stat-content">
                        <span className="stat-value">
                            ${balances.reduce((sum, b) => sum + (b.totalPaid || 0), 0).toFixed(2)}
                        </span>
                        <span className="stat-label">Total Pagado</span>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="balances-content">
                {/* Clients List */}
                <div className="clients-list-panel">
                    <h2>
                        <span className="material-icons-round">list</span>
                        Clientes ({filteredBalances.length})
                    </h2>

                    {filteredBalances.length === 0 ? (
                        <div className="empty-state">
                            <span className="material-icons-round">search_off</span>
                            <p>No se encontraron clientes</p>
                        </div>
                    ) : (
                        <div className="clients-list">
                            {filteredBalances.map(client => (
                                <div
                                    key={client.clientId}
                                    className={`client-card ${selectedClient?.clientId === client.clientId ? 'active' : ''}`}
                                    onClick={() => setSelectedClient(client)}
                                >
                                    <div className="client-main">
                                        <span className="client-avatar">
                                            {client.clientName?.charAt(0).toUpperCase()}
                                        </span>
                                        <div className="client-info">
                                            <span className="client-name">{client.clientName}</span>
                                            <span className="client-phone">{client.clientPhone || 'Sin teléfono'}</span>
                                        </div>
                                    </div>
                                    <div className="client-balance">
                                        {client.pendingBalance > 0 ? (
                                            <>
                                                <span className="balance-amount warning">
                                                    ${(client.pendingBalance || 0).toFixed(2)}
                                                </span>
                                                <span className="balance-label">Pendiente</span>
                                            </>
                                        ) : (
                                            <>
                                                <span className="balance-amount success" style={{ fontSize: '1.1rem' }}>
                                                    Al día
                                                </span>
                                                <span className="balance-label success">Sin deuda</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Client Detail Panel */}
                <div className="client-detail-panel">
                    {selectedClient ? (
                        <ClientDetailView
                            client={selectedClient}
                            onRefresh={fetchBalances}
                            userRole={userRole}
                        />
                    ) : (
                        <div className="no-selection">
                            <span className="material-icons-round">person_search</span>
                            <p>Selecciona un cliente para ver detalles</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ============================================
// CLIENT DETAIL VIEW COMPONENT
// ============================================
function ClientDetailView({ client, onRefresh, userRole }) {
    const [clientDetail, setClientDetail] = useState(null);
    const [loading, setLoading] = useState(true);
    const [creditLimit, setCreditLimit] = useState('');
    const [initialBalance, setInitialBalance] = useState('');
    const [saving, setSaving] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortOrder, setSortOrder] = useState('desc'); // 'asc' or 'desc'

    // Modal States
    const [selectedOrderForModal, setSelectedOrderForModal] = useState(null);
    const [loadingOrder, setLoadingOrder] = useState(false);

    // Services
    const toast = useToast();
    const confirm = useConfirm();
    const isOwner = userRole === 'ROLE_OWNER';

    const fetchClientDetail = useCallback(async () => {
        try {
            setLoading(true);
            const response = await balanceService.getClientBalance(client.clientId);
            setClientDetail(response.data);
            setCreditLimit(response.data?.creditLimit?.toString() || '');
        } catch (error) {
            console.error('Error fetching client detail:', error);
            toast.error('Error al cargar detalles del cliente');
        } finally {
            setLoading(false);
        }
    }, [client.clientId, toast]);

    useEffect(() => {
        fetchClientDetail();
    }, [fetchClientDetail]);

    // FETCH FULL ORDER DETAILS FOR MODAL
    const handleManageOrder = async (orderId) => {
        if (!orderId) {
            toast.error('ID de orden no válido');
            return;
        }

        try {
            setLoadingOrder(true);
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

            if (foundOrder) {
                setSelectedOrderForModal(foundOrder);
            } else {
                console.warn(`Order ${orderId} not found in full list`);
                toast.error('No se pudo encontrar la información completa de la orden');
            }
        } catch (error) {
            console.error('Error fetching orders:', error);
            toast.error('Error al cargar detalles de la orden');
        } finally {
            setLoadingOrder(false);
        }
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

    if (loading) {
        return (
            <div className="detail-loading">
                <span className="material-icons-round spin">sync</span>
                Cargando detalles...
            </div>
        );
    }

    return (
        <div className="client-detail-content">
            {/* Client Header */}
            <div className="detail-header">
                <div className="client-avatar large">
                    {client.clientName?.charAt(0).toUpperCase()}
                </div>
                <div className="client-title">
                    <h2>{client.clientName}</h2>
                    <p>{client.clientPhone || 'Sin teléfono'}</p>
                </div>
            </div>

            {/* Balance Summary */}
            <div className="balance-summary-grid">
                <div className="summary-card">
                    <span className="material-icons-round">account_balance</span>
                    <div>
                        <span className="value">${(clientDetail?.totalOwed || 0).toFixed(2)}</span>
                        <span className="label">Total Adeudado</span>
                    </div>
                </div>
                <div className="summary-card success">
                    <span className="material-icons-round">payments</span>
                    <div>
                        <span className="value">${(clientDetail?.totalPaid || 0).toFixed(2)}</span>
                        <span className="label">Total Pagado</span>
                    </div>
                </div>
                <div className="summary-card warning">
                    <span className="material-icons-round">pending</span>
                    <div>
                        <span className="value">${(clientDetail?.pendingBalance || 0).toFixed(2)}</span>
                        <span className="label">Saldo Pendiente</span>
                    </div>
                </div>
            </div>

            {/* Owner Controls */}
            {isOwner && (
                <div className="owner-controls">
                    {/* Credit Limit Control */}
                    <div className="control-section">
                        <h3>
                            <span className="material-icons-round">credit_card</span>
                            Límite de Crédito
                        </h3>
                        <div className="control-row">
                            <div className="input-group">
                                <span className="prefix">$</span>
                                <input
                                    type="number"
                                    value={creditLimit}
                                    onChange={(e) => setCreditLimit(e.target.value)}
                                    placeholder="Ej: 500.00"
                                    min="0"
                                    step="0.01"
                                />
                            </div>
                            <button
                                className="btn-save"
                                onClick={handleSaveCreditLimit}
                                disabled={saving === 'credit'}
                            >
                                {saving === 'credit' ? '...' : 'Guardar'}
                            </button>
                            {clientDetail?.creditLimit && (
                                <button
                                    className="btn-remove"
                                    onClick={handleRemoveCreditLimit}
                                    disabled={saving === 'removeCredit'}
                                >
                                    {saving === 'removeCredit' ? '...' : 'Eliminar'}
                                </button>
                            )}
                        </div>
                        {clientDetail?.creditLimit && (
                            <p className="control-info">
                                Límite actual: <strong>${clientDetail.creditLimit.toFixed(2)}</strong>
                            </p>
                        )}
                    </div>

                    {/* Initial Balance Control */}
                    {!clientDetail?.initialBalanceSet && (
                        <div className="control-section">
                            <h3>
                                <span className="material-icons-round">account_balance_wallet</span>
                                Saldo Inicial
                            </h3>
                            <p className="control-description">
                                Establece el saldo inicial pendiente del cliente (solo se puede hacer una vez).
                            </p>
                            <div className="control-row">
                                <div className="input-group">
                                    <span className="prefix">$</span>
                                    <input
                                        type="number"
                                        value={initialBalance}
                                        onChange={(e) => setInitialBalance(e.target.value)}
                                        placeholder="Ej: 100.00"
                                        min="0"
                                        step="0.01"
                                    />
                                </div>
                                <button
                                    className="btn-save primary"
                                    onClick={handleSaveInitialBalance}
                                    disabled={saving === 'initial'}
                                >
                                    {saving === 'initial' ? '...' : 'Establecer'}
                                </button>
                            </div>
                        </div>
                    )}

                    {clientDetail?.initialBalanceSet && (
                        <div className="control-section readonly">
                            <h3>
                                <span className="material-icons-round">account_balance_wallet</span>
                                Saldo Inicial
                            </h3>
                            <p className="control-info">
                                Saldo inicial establecido: <strong>${(clientDetail.initialBalance || 0).toFixed(2)}</strong>
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* Pending Orders */}
            <div className="orders-section">
                <h3>
                    <span className="material-icons-round">receipt_long</span>
                    Órdenes Pendientes de Pago
                </h3>

                {/* Search and Sort Controls */}
                <div className="orders-filters">
                    <div className="search-input-wrapper">
                        <span className="material-icons-round">search</span>
                        <input
                            type="text"
                            placeholder="Buscar por factura..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button
                        className="btn-sort"
                        onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                        title={sortOrder === 'asc' ? 'Orden Ascendente' : 'Orden Descendente'}
                    >
                        <span className="material-icons-round">sort_by_alpha</span>
                        {sortOrder === 'asc' ? 'Asc' : 'Desc'}
                    </button>
                </div>
                {clientDetail?.pendingOrders?.length > 0 ? (
                    <div className="orders-list">
                        {clientDetail.pendingOrders
                            .filter(order => {
                                const invoice = String(order.invoiceNumber || '');
                                return invoice.toLowerCase().includes(searchTerm.toLowerCase());
                            })
                            .sort((a, b) => {
                                const invoiceA = String(a.invoiceNumber || '');
                                const invoiceB = String(b.invoiceNumber || '');
                                return sortOrder === 'asc'
                                    ? invoiceA.localeCompare(invoiceB)
                                    : invoiceB.localeCompare(invoiceA);
                            })
                            .map(order => (
                                <div key={order.id} className="order-item">
                                    <div className="order-main">
                                        <span className="order-id">#{order.invoiceNumber || order.id?.substring(0, 8)}</span>
                                        <span className="order-date">
                                            {new Date(order.fecha).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <div className="order-amounts">
                                        <div className="amount-row">
                                            <span>Total:</span>
                                            <strong>${(order.total || 0).toFixed(2)}</strong>
                                        </div>
                                        <div className="amount-row">
                                            <span>Pagado:</span>
                                            <span className="paid">${(order.paidAmount || 0).toFixed(2)}</span>
                                        </div>
                                        <div className="amount-row pending">
                                            <span>Pendiente:</span>
                                            <strong>${(order.pendingAmount || 0).toFixed(2)}</strong>
                                        </div>
                                    </div>
                                    {/* Manage Button - Only for Owner */}
                                    {userRole === 'ROLE_OWNER' && (
                                        <button
                                            className="btn-manage-order"
                                            onClick={() => handleManageOrder(order.id || order.orderId)}
                                            title="Gestionar Pagos y Detalles"
                                            disabled={loadingOrder}
                                        >
                                            <span className="material-icons-round">edit</span>
                                        </button>
                                    )}
                                </div>
                            ))}
                    </div>
                ) : (
                    <div className="empty-orders">
                        <span className="material-icons-round">check_circle</span>
                        <p>No hay órdenes pendientes de pago</p>
                    </div>
                )}
            </div>

            {/* Order Management Modal */}
            {selectedOrderForModal && (
                <OrderDetailModal
                    order={selectedOrderForModal}
                    userRole={userRole}
                    onClose={() => setSelectedOrderForModal(null)}
                    onRefresh={() => {
                        // Refresh client detail to update balances
                        fetchClientDetail();
                        // Also refresh the specific order to update totals/discounts
                        handleManageOrder(selectedOrderForModal.id || selectedOrderForModal.orderId);
                    }}
                />
            )}

            {loadingOrder && (
                <div className="modal-overlay">
                    <div className="loading-state">
                        <span className="material-icons-round spin">sync</span>
                        <p>Cargando orden...</p>
                    </div>
                </div>
            )}
        </div>
    );
}

export default BalancesPage;
