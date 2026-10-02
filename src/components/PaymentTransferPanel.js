// src/components/PaymentTransferPanel.js
// Panel de gestión de transferencias de pagos entre vendedores (solo Owner)
import React, { useState, useEffect, useCallback } from 'react';
import paymentTransferService from '../api/paymentTransferService';
import paymentService from '../api/paymentService';
import apiClient from '../api/client';
import { useToast } from './ToastContainer';
import SearchableSelect from './SearchableSelect';
import { formatOrderLabel, orderReferenceMatches } from '../utils/formatters';
import { avatarTone } from '../utils/avatarTone';
import '../styles/areas/PaymentTransferPanel.css';

// ─── Utilidades ──────────────────────────────────────────────────────────────

const MONTHS = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - 2 + i);

const fmt = (val) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(val || 0);

const fmtDate = (dt) => {
    if (!dt) return '—';
    return new Date(dt).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
};

// El selector de orden recibe las órdenes ya filtradas con el buscador de siempre
// (filteredOriginOrders: factura, pedido P-123, valor o cliente); no se vuelve a filtrar
const keepFilteredOrder = () => true;

// ─── Componente Principal ─────────────────────────────────────────────────────

export default function PaymentTransferPanel({ vendedores = [] }) {
    const toast = useToast();
    const [view, setView] = useState('history'); // 'history' | 'create'
    const [transfers, setTransfers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Filtros historial
    const [filterVendedor, setFilterVendedor] = useState('');
    const [filterDirection, setFilterDirection] = useState('dest');
    const [filterStatus, setFilterStatus] = useState('active');

    // Revocación inline
    const [revokingId, setRevokingId] = useState(null);
    const [revokeReason, setRevokeReason] = useState('');
    const [revokeLoading, setRevokeLoading] = useState(false);

    const loadTransfers = useCallback(async () => {
        if (!filterVendedor) { setTransfers([]); return; }
        setLoading(true);
        setError('');
        try {
            const fn = filterDirection === 'origin'
                ? paymentTransferService.getTransfersByOrigin
                : paymentTransferService.getTransfersByDest;
            const res = await fn(filterVendedor);
            let data = res.data;
            if (filterStatus === 'active') data = data.filter(t => !t.isRevoked);
            setTransfers(data);
        } catch (e) {
            setError('Error al cargar transferencias: ' + (e.response?.data?.message || e.message));
        } finally {
            setLoading(false);
        }
    }, [filterVendedor, filterDirection, filterStatus]);

    useEffect(() => { loadTransfers(); }, [loadTransfers]);

    const handleRevoke = async (transferId) => {
        if (!revokeReason.trim()) { toast.warning('Debes ingresar el motivo de revocación'); return; }
        setRevokeLoading(true);
        try {
            await paymentTransferService.revokeTransfer(transferId, revokeReason.trim());
            setSuccess('Transferencia revocada exitosamente');
            setRevokingId(null);
            setRevokeReason('');
            loadTransfers();
        } catch (e) {
            setError('Error al revocar: ' + (e.response?.data?.message || e.message));
        } finally {
            setRevokeLoading(false);
        }
    };

    return (
        <div className="pt-panel">
            {/* ─── Encabezado ───────────────────────────────────────────── */}
            <header className="ui-page-header pt-header">
                <div className="ui-page-heading">
                    <h1 className="ui-page-title">
                        <span className="material-icons-round" aria-hidden="true">swap_horiz</span>
                        Transferencias de Pagos
                    </h1>
                    <p className="ui-page-desc">
                        Asigna montos ya cobrados a otro vendedor para efectos de nómina y metas
                    </p>
                </div>
                <div className="ui-page-actions">
                    <div className="ui-tabs pt-view-tabs" role="tablist" aria-label="Vista de transferencias">
                        <button
                            type="button"
                            role="tab"
                            aria-selected={view === 'history'}
                            className={`ui-tab ${view === 'history' ? 'is-active' : ''}`}
                            onClick={() => { setView('history'); setError(''); setSuccess(''); }}
                        >
                            <span className="material-icons-round" aria-hidden="true">history</span>
                            Historial
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={view === 'create'}
                            className={`ui-tab ${view === 'create' ? 'is-active' : ''}`}
                            onClick={() => { setView('create'); setError(''); setSuccess(''); }}
                        >
                            <span className="material-icons-round" aria-hidden="true">add_circle</span>
                            Nueva Transferencia
                        </button>
                    </div>
                </div>
            </header>

            {/* ─── Alertas (clic para cerrar) ───────────────────────────── */}
            {error && (
                <div className="ui-alert ui-alert--danger pt-alert ui-rise-in" role="alert" onClick={() => setError('')}>
                    <span className="material-icons-round" aria-hidden="true">error_outline</span>
                    <p className="pt-alert-text">{error}</p>
                    <button type="button" className="ui-icon-btn pt-alert-close" aria-label="Cerrar aviso">
                        <span className="material-icons-round" aria-hidden="true">close</span>
                    </button>
                </div>
            )}
            {success && (
                <div className="ui-alert ui-alert--success pt-alert ui-rise-in" role="status" onClick={() => setSuccess('')}>
                    <span className="material-icons-round" aria-hidden="true">check_circle_outline</span>
                    <p className="pt-alert-text">{success}</p>
                    <button type="button" className="ui-icon-btn pt-alert-close" aria-label="Cerrar aviso">
                        <span className="material-icons-round" aria-hidden="true">close</span>
                    </button>
                </div>
            )}

            {/* ─── Vistas ───────────────────────────────────────────────── */}
            <div className="pt-body">
                {view === 'history' && (
                    <HistoryView
                        vendedores={vendedores}
                        transfers={transfers}
                        loading={loading}
                        filterVendedor={filterVendedor}
                        setFilterVendedor={setFilterVendedor}
                        filterDirection={filterDirection}
                        setFilterDirection={setFilterDirection}
                        filterStatus={filterStatus}
                        setFilterStatus={setFilterStatus}
                        revokingId={revokingId}
                        setRevokingId={setRevokingId}
                        revokeReason={revokeReason}
                        setRevokeReason={setRevokeReason}
                        revokeLoading={revokeLoading}
                        onRevoke={handleRevoke}
                    />
                )}
                {view === 'create' && (
                    <CreateTransferView
                        vendedores={vendedores}
                        onSuccess={(msg) => { setSuccess(msg); setView('history'); loadTransfers(); }}
                        onError={(msg) => setError(msg)}
                    />
                )}
            </div>
        </div>
    );
}

// ─── Vista Historial ────────────────────────────────────────────────────────

function HistoryView({
    vendedores, transfers, loading,
    filterVendedor, setFilterVendedor,
    filterDirection, setFilterDirection,
    filterStatus, setFilterStatus,
    revokingId, setRevokingId,
    revokeReason, setRevokeReason,
    revokeLoading, onRevoke
}) {
    return (
        // Solo fade al cambiar de vista: el panel completo ya entra con la subida de la base
        <div className="pt-history ui-enter-fade">
            {/* Filtros */}
            <div className="pt-filters">
                <div className="ui-field">
                    <label className="ui-label" htmlFor="pt-filter-vendedor">Vendedor</label>
                    <SearchableSelect
                        id="pt-filter-vendedor"
                        value={filterVendedor}
                        onChange={e => setFilterVendedor(e.target.value)}
                        placeholder="Selecciona un vendedor"
                        clearable
                        options={vendedores.map(v => ({ value: v.id, label: v.username }))}
                    />
                </div>
                <div className="ui-field">
                    <label className="ui-label" htmlFor="pt-filter-direction">Dirección</label>
                    <select id="pt-filter-direction" className="ui-select" value={filterDirection} onChange={e => setFilterDirection(e.target.value)}>
                        <option value="dest">Como destino (recibe)</option>
                        <option value="origin">Como origen (cede)</option>
                    </select>
                </div>
                <div className="ui-field">
                    <label className="ui-label" htmlFor="pt-filter-status">Estado</label>
                    <select id="pt-filter-status" className="ui-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                        <option value="active">Solo activas</option>
                        <option value="all">Todas</option>
                    </select>
                </div>
            </div>

            {/* Sin vendedor seleccionado */}
            {!filterVendedor && (
                <div className="ui-empty">
                    <span className="material-icons-round ui-empty-icon" aria-hidden="true">manage_search</span>
                    <p className="ui-empty-text">Selecciona un vendedor para ver sus transferencias</p>
                </div>
            )}

            {filterVendedor && loading && (
                <div className="ui-loading" role="status">
                    <span className="ui-spinner" aria-hidden="true"></span>
                    Cargando transferencias…
                </div>
            )}

            {filterVendedor && !loading && transfers.length === 0 && (
                <div className="ui-empty">
                    <span className="material-icons-round ui-empty-icon" aria-hidden="true">inbox</span>
                    <p className="ui-empty-text">No hay transferencias para mostrar</p>
                </div>
            )}

            {/* Tabla */}
            {filterVendedor && !loading && transfers.length > 0 && (
                <div className="ui-table-wrap pt-table-wrap">
                    <table className="ui-table pt-table">
                        <thead>
                            <tr>
                                <th>Estado</th>
                                <th>Pago / Monto</th>
                                <th>Cliente</th>
                                <th>Origen → Destino</th>
                                <th className="ui-num">Transferido</th>
                                <th>Mes destino</th>
                                <th>Motivo</th>
                                <th>Creado por</th>
                                <th>Acción</th>
                            </tr>
                        </thead>
                        <tbody className="ui-stagger">
                            {transfers.map(t => (
                                <React.Fragment key={t.id}>
                                    <tr className={t.isRevoked ? 'pt-row-revoked' : ''}>
                                        <td>
                                            <span className={`ui-badge ${t.isRevoked ? 'ui-badge--danger' : 'ui-badge--success'}`}>
                                                {t.isRevoked ? 'Revocada' : 'Activa'}
                                            </span>
                                        </td>
                                        <td>
                                            <span className="pt-mono">{t.paymentId?.slice(0, 8)}…</span>
                                            <br />
                                            <small className="pt-muted pt-payment-total ui-tabular">{fmt(t.paymentTotalAmount)}</small>
                                        </td>
                                        <td className="pt-td-ellipsis">{t.orderClientName}</td>
                                        {/* Origen (cede) en ámbar → destino (recibe) en azul */}
                                        <td className="pt-td-route">
                                            <span className="ui-badge ui-badge--warning">{t.originVendedorUsername}</span>
                                            <span className="material-icons-round pt-arrow" aria-hidden="true">arrow_forward</span>
                                            <span className="ui-badge ui-badge--primary">{t.destVendedorUsername}</span>
                                        </td>
                                        <td className="ui-num">
                                            {/* Transferido en verde; revocada en rojo tachado (CSS) */}
                                            <strong className="pt-amount ui-amount--success">{fmt(t.amount)}</strong>
                                        </td>
                                        <td className="pt-nowrap">{MONTHS[(t.targetMonth || 1) - 1]} {t.targetYear}</td>
                                        <td className="pt-muted pt-td-ellipsis">{t.reason || '—'}</td>
                                        <td>
                                            <small className="pt-muted">{fmtDate(t.createdAt)}</small>
                                            <br />
                                            <small className="pt-muted">{t.createdByUsername}</small>
                                        </td>
                                        <td>
                                            {!t.isRevoked ? (
                                                <button
                                                    type="button"
                                                    className="ui-btn ui-btn--danger-ghost ui-btn--sm"
                                                    onClick={() => { setRevokingId(t.id); setRevokeReason(''); }}
                                                >
                                                    <span className="material-icons-round" aria-hidden="true">undo</span>
                                                    Revocar
                                                </button>
                                            ) : (
                                                <small className="pt-muted">
                                                    {fmtDate(t.revokedAt)}<br />
                                                    {t.revocationReason}
                                                </small>
                                            )}
                                        </td>
                                    </tr>

                                    {/* Form inline de revocación */}
                                    {revokingId === t.id && (
                                        <tr className="pt-revoke-row">
                                            <td colSpan="9">
                                                <div className="pt-revoke-form">
                                                    <p className="pt-revoke-text">
                                                        <span className="material-icons-round" aria-hidden="true">warning</span>
                                                        <span>Revocar <strong>{fmt(t.amount)}</strong> transferidos a <strong>{t.destVendedorUsername}</strong></span>
                                                    </p>
                                                    <input
                                                        className="ui-input pt-revoke-input"
                                                        type="text"
                                                        aria-label="Motivo de revocación"
                                                        placeholder="Motivo de revocación (requerido)"
                                                        value={revokeReason}
                                                        onChange={e => setRevokeReason(e.target.value)}
                                                        onKeyDown={e => e.key === 'Enter' && onRevoke(t.id)}
                                                    />
                                                    <div className="pt-revoke-actions">
                                                        <button type="button" className="ui-btn ui-btn--danger ui-btn--sm" onClick={() => onRevoke(t.id)} disabled={revokeLoading}>
                                                            {revokeLoading ? 'Revocando…' : 'Confirmar'}
                                                        </button>
                                                        <button type="button" className="ui-btn ui-btn--secondary ui-btn--sm" onClick={() => setRevokingId(null)}>Cancelar</button>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// ─── Vista Crear Transferencia ──────────────────────────────────────────────

function CreateTransferView({ vendedores, onSuccess, onError }) {
    const [step, setStep] = useState(1);

    const [originVendedorId, setOriginVendedorId] = useState('');
    const [originUsername, setOriginUsername] = useState('');
    const [originOrders, setOriginOrders] = useState([]);
    const [loadingOrders, setLoadingOrders] = useState(false);

    const [selectedOrderId, setSelectedOrderId] = useState('');
    const [orderSearch, setOrderSearch] = useState(''); // buscador de factura (client-side)
    const [payments, setPayments] = useState([]);
    const [loadingPayments, setLoadingPayments] = useState(false);
    const [selectedPayment, setSelectedPayment] = useState(null);
    const [availableAmount, setAvailableAmount] = useState(null);

    const [transferAll, setTransferAll] = useState(true);
    const [customAmount, setCustomAmount] = useState('');
    const [destVendedorId, setDestVendedorId] = useState('');
    const [targetMonth, setTargetMonth] = useState(new Date().getMonth() + 1);
    const [targetYear, setTargetYear] = useState(CURRENT_YEAR);
    const [reason, setReason] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // ── Cargar órdenes del vendedor origen ─────────────────────────
    // CORRECCIÓN: la API retorna `o.vendedor` (username string), no `o.vendedorId`
    const loadOriginOrders = async (vendedorId) => {
        setLoadingOrders(true);
        setOriginOrders([]);
        setSelectedOrderId('');
        setOrderSearch('');
        setPayments([]);
        setSelectedPayment(null);
        setAvailableAmount(null);
        const username = vendedores.find(v => v.id === vendedorId)?.username || '';
        setOriginUsername(username);
        try {
            const res = await apiClient.get('/admin/orders');
            // Filtrar por username del vendedor y estado COMPLETADO
            const filtered = res.data.filter(
                o => o.vendedor === username && o.estado === 'COMPLETADO'
            );
            setOriginOrders(filtered);
        } catch (e) {
            onError('Error al cargar órdenes: ' + (e.response?.data?.message || e.message));
        } finally {
            setLoadingOrders(false);
        }
    };

    // ── Cargar pagos activos de la orden ───────────────────────────
    const loadPayments = async (orderId) => {
        setLoadingPayments(true);
        setPayments([]);
        setSelectedPayment(null);
        setAvailableAmount(null);
        try {
            const res = await paymentService.getActiveOrderPayments(orderId);
            setPayments(res.data);
        } catch (e) {
            onError('Error al cargar pagos: ' + (e.response?.data?.message || e.message));
        } finally {
            setLoadingPayments(false);
        }
    };

    // ── Cargar saldo disponible ─────────────────────────────────────
    const loadAvailable = async (paymentId) => {
        try {
            const res = await paymentTransferService.getAvailableAmount(paymentId);
            setAvailableAmount(res.data);
        } catch { setAvailableAmount(null); }
    };

    const selectPayment = (p) => {
        setSelectedPayment(p);
        setCustomAmount('');
        setTransferAll(true);
        loadAvailable(p.id);
    };

    const handleSubmit = async () => {
        const amount = transferAll ? null : parseFloat(customAmount);
        if (!transferAll && (!amount || amount <= 0)) {
            onError('Ingresa un monto válido mayor que cero'); return;
        }
        if (!transferAll && availableAmount !== null && amount > availableAmount) {
            onError(`El monto (${fmt(amount)}) supera el saldo disponible (${fmt(availableAmount)})`); return;
        }
        if (!destVendedorId) { onError('Selecciona el vendedor destino'); return; }
        if (destVendedorId === originVendedorId) { onError('El vendedor destino debe ser diferente al origen'); return; }

        setSubmitting(true);
        try {
            await paymentTransferService.createTransfer({
                paymentId: selectedPayment.id,
                destVendedorId,
                amount: transferAll ? null : amount,
                targetMonth: parseInt(targetMonth),
                targetYear: parseInt(targetYear),
                reason: reason || null,
            });
            onSuccess(`${fmt(transferAll ? availableAmount : amount)} transferidos exitosamente`);
        } catch (e) {
            onError('Error: ' + (e.response?.data?.message || e.message));
        } finally {
            setSubmitting(false);
        }
    };

    // Filtro client-side de las órdenes por número de factura o de pedido, valor o cliente.
    // No toca la carga ni la selección: solo reduce las opciones mostradas en el select.
    const orderQuery = orderSearch.trim().toLowerCase();
    const filteredOriginOrders = !orderQuery ? originOrders : originOrders.filter(o => {
        const total = o.total != null ? String(o.total) : '';
        const cli = (o.cliente || '').toLowerCase();
        // Factura ("1500"), pedido ("P-123", "p123") o parte del id
        return orderReferenceMatches(o, orderQuery) || total.includes(orderQuery) || cli.includes(orderQuery);
    });

    const steps = ['Vendedor Origen', 'Seleccionar Pago', 'Configurar'];

    return (
        <div className="pt-create ui-enter-fade">
            {/* Steps indicator */}
            <ol className="pt-steps">
                {steps.map((label, i) => (
                    <React.Fragment key={i}>
                        <li className={`pt-step ${step > i + 1 ? 'done' : step === i + 1 ? 'current' : ''}`} aria-current={step === i + 1 ? 'step' : undefined}>
                            <div className="pt-step-dot">
                                {step > i + 1
                                    ? <span className="material-icons-round" aria-hidden="true">check</span>
                                    : i + 1}
                            </div>
                            <span className="pt-step-label">{label}</span>
                        </li>
                        {i < steps.length - 1 && <li className={`pt-step-line ${step > i + 1 ? 'done' : ''}`} aria-hidden="true" />}
                    </React.Fragment>
                ))}
            </ol>

            <div className="pt-card">

                {/* ─── STEP 1 ────────────────────────────────────────── */}
                {step === 1 && (
                    <div className="pt-step-content ui-rise-in">
                        <div className="pt-step-head">
                            <h3 className="pt-step-title">
                                <span className="ui-icon-tile ui-icon-tile--primary" aria-hidden="true">
                                    <span className="material-icons-round">person_search</span>
                                </span>
                                Selecciona el vendedor origen
                            </h3>
                            <p className="pt-step-hint">El vendedor que tiene el pago a transferir</p>
                        </div>

                        <div className="pt-vendor-grid">
                            {vendedores.map(v => (
                                <button
                                    type="button"
                                    key={v.id}
                                    className={`pt-vendor-card ${originVendedorId === v.id ? 'selected' : ''}`}
                                    aria-pressed={originVendedorId === v.id}
                                    onClick={() => setOriginVendedorId(v.id)}
                                >
                                    <div className={`ui-avatar ui-avatar--sm ui-avatar--${avatarTone(v.username)}${originVendedorId === v.id ? ' is-selected' : ''} pt-vendor-avatar`} aria-hidden="true">{v.username.charAt(0).toUpperCase()}</div>
                                    <span className="pt-vendor-name">{v.username}</span>
                                    {originVendedorId === v.id && (
                                        <span className="material-icons-round pt-vendor-check" aria-hidden="true">check_circle</span>
                                    )}
                                </button>
                            ))}
                        </div>

                        <div className="pt-step-actions">
                            <button
                                type="button"
                                className="ui-btn ui-btn--primary"
                                disabled={!originVendedorId}
                                onClick={() => { loadOriginOrders(originVendedorId); setStep(2); }}
                            >
                                Continuar
                                <span className="material-icons-round" aria-hidden="true">arrow_forward</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* ─── STEP 2 ────────────────────────────────────────── */}
                {step === 2 && (
                    <div className="pt-step-content ui-rise-in">
                        <div className="pt-step-head">
                            <h3 className="pt-step-title">
                                <span className="ui-icon-tile ui-icon-tile--primary" aria-hidden="true">
                                    <span className="material-icons-round">receipt_long</span>
                                </span>
                                Selecciona la orden y el pago
                            </h3>
                            <p className="pt-step-hint">
                                Órdenes <strong>completadas</strong> de <strong>{originUsername}</strong>
                            </p>
                        </div>

                        <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm pt-btn-back" onClick={() => setStep(1)}>
                            <span className="material-icons-round" aria-hidden="true">arrow_back</span> Atrás
                        </button>

                        {loadingOrders && (
                            <div className="ui-loading" role="status">
                                <span className="ui-spinner" aria-hidden="true"></span> Cargando órdenes…
                            </div>
                        )}

                        {!loadingOrders && originOrders.length === 0 && (
                            <div className="ui-empty">
                                <span className="material-icons-round ui-empty-icon" aria-hidden="true">inventory_2</span>
                                <p className="ui-empty-text">No hay órdenes completadas para <strong>{originUsername}</strong></p>
                            </div>
                        )}

                        {!loadingOrders && originOrders.length > 0 && (
                            <div className="pt-fields">
                                <div className="ui-field">
                                    <label className="ui-label" htmlFor="pt-order-select">
                                        Orden{orderQuery ? ` (${filteredOriginOrders.length} de ${originOrders.length})` : ''}
                                    </label>
                                    {/* Lo que se escribe aquí es el buscador de factura (orderSearch): este campo
                                        reemplaza al par buscador "Buscar factura" + selector de antes, por eso la
                                        etiqueta "Buscar factura" ya no existe (la pérdida de un label en fe-guard es
                                        intencional) y la pista de búsqueda queda visible debajo (pt-order-search-help) */}
                                    <SearchableSelect
                                        id="pt-order-select"
                                        value={selectedOrderId}
                                        onChange={e => { setSelectedOrderId(e.target.value); if (e.target.value) loadPayments(e.target.value); }}
                                        aria-describedby="pt-order-search-help"
                                        placeholder="Selecciona o busca una orden"
                                        searchPlaceholder="N° de factura, pedido (P-123), valor o cliente…"
                                        query={orderSearch}
                                        onQueryChange={setOrderSearch}
                                        filterOption={keepFilteredOrder}
                                        noResultsText={`Sin coincidencias para “${orderSearch.trim()}”`}
                                        options={filteredOriginOrders.map(o => {
                                            const fecha = o.completedAt || o.fecha;
                                            return {
                                                value: o.id,
                                                label: `${formatOrderLabel(o)} — ${o.cliente || '(sin cliente)'} — ${fmt(o.total)}`,
                                                description: fecha ? fmtDate(fecha) : undefined,
                                            };
                                        })}
                                    />
                                    {/* Pista fija (antes era la etiqueta "Buscar factura"). El "Sin coincidencias"
                                        ya lo muestra la lista del campo (noResultsText) y lo anuncia al lector de
                                        pantalla; aquí debajo quedaba tapado por la lista abierta. */}
                                    <p id="pt-order-search-help" className="ui-help">
                                        Escribe el N° de factura, el pedido (P-123), el valor o el cliente para buscar.
                                    </p>
                                </div>
                            </div>
                        )}

                        {loadingPayments && (
                            <div className="ui-loading" role="status">
                                <span className="ui-spinner" aria-hidden="true"></span> Cargando pagos…
                            </div>
                        )}

                        {selectedOrderId && !loadingPayments && payments.length === 0 && (
                            <div className="ui-empty">
                                <span className="material-icons-round ui-empty-icon" aria-hidden="true">credit_card_off</span>
                                <p className="ui-empty-text">Esta orden no tiene pagos activos</p>
                            </div>
                        )}

                        {selectedOrderId && !loadingPayments && payments.length > 0 && (
                            <div className="ui-field">
                                <label className="ui-label">Pagos activos</label>
                                <div className="pt-payments-grid">
                                    {payments.map(p => (
                                        <button
                                            type="button"
                                            key={p.id}
                                            className={`pt-payment-card ${selectedPayment?.id === p.id ? 'selected' : ''}`}
                                            aria-pressed={selectedPayment?.id === p.id}
                                            onClick={() => selectPayment(p)}
                                        >
                                            <div className="pt-payment-top">
                                                <span className="ui-icon-tile ui-icon-tile--sm ui-icon-tile--success" aria-hidden="true">
                                                    <span className="material-icons-round">payments</span>
                                                </span>
                                                <div className="pt-payment-amount">{fmt(p.amount)}</div>
                                                {selectedPayment?.id === p.id && (
                                                    <span className="material-icons-round pt-payment-check" aria-hidden="true">check_circle</span>
                                                )}
                                            </div>
                                            <div className="pt-payment-meta">
                                                <span className="pt-payment-method">{p.paymentMethod || 'Pago'}</span>
                                                {selectedPayment?.id === p.id && availableAmount !== null && (
                                                    <span className={`ui-badge ${availableAmount <= 0 ? 'ui-badge--danger' : 'ui-badge--success'} pt-available-tag`}>
                                                        Disponible: {fmt(availableAmount)}
                                                    </span>
                                                )}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {selectedPayment && availableAmount !== null && availableAmount <= 0 && (
                            <div className="ui-alert ui-alert--warning" role="alert">
                                <span className="material-icons-round" aria-hidden="true">warning</span>
                                <p>Este pago no tiene saldo disponible (ya fue transferido en su totalidad)</p>
                            </div>
                        )}

                        <div className="pt-step-actions">
                            <button
                                type="button"
                                className="ui-btn ui-btn--primary"
                                disabled={!selectedPayment || (availableAmount !== null && availableAmount <= 0)}
                                onClick={() => setStep(3)}
                            >
                                Continuar
                                <span className="material-icons-round" aria-hidden="true">arrow_forward</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* ─── STEP 3 ────────────────────────────────────────── */}
                {step === 3 && (
                    <div className="pt-step-content ui-rise-in">
                        <div className="pt-step-head">
                            <h3 className="pt-step-title">
                                <span className="ui-icon-tile ui-icon-tile--primary" aria-hidden="true">
                                    <span className="material-icons-round">tune</span>
                                </span>
                                Configurar transferencia
                            </h3>
                        </div>

                        <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm pt-btn-back" onClick={() => setStep(2)}>
                            <span className="material-icons-round" aria-hidden="true">arrow_back</span> Atrás
                        </button>

                        {/* Resumen */}
                        <div className="pt-summary-bar">
                            <div className="pt-summary-item">
                                <span className="ui-icon-tile ui-icon-tile--primary" aria-hidden="true">
                                    <span className="material-icons-round">payments</span>
                                </span>
                                <div className="pt-summary-text">
                                    <span className="pt-summary-label">Pago seleccionado</span>
                                    <span className="pt-summary-value">{fmt(selectedPayment?.amount)}</span>
                                </div>
                            </div>
                            <div className="pt-summary-sep" />
                            <div className="pt-summary-item">
                                <span className="ui-icon-tile ui-icon-tile--success" aria-hidden="true">
                                    <span className="material-icons-round">account_balance_wallet</span>
                                </span>
                                <div className="pt-summary-text">
                                    <span className="pt-summary-label">Disponible para transferir</span>
                                    <span className="pt-summary-value pt-summary-highlight ui-text-success">{fmt(availableAmount)}</span>
                                </div>
                            </div>
                        </div>

                        {/* Monto */}
                        <div className="ui-field">
                            <label className="ui-label">Monto a transferir</label>
                            <div className="ui-choice-grid" role="radiogroup" aria-label="Monto a transferir">
                                <label className={`ui-choice ui-choice--compact${transferAll ? ' is-selected' : ''}`}>
                                    <input type="radio" checked={transferAll} onChange={() => setTransferAll(true)} />
                                    <span className="material-icons-round ui-choice-icon" aria-hidden="true">select_all</span>
                                    <span className="ui-choice-text">
                                        <span className="ui-choice-title">Todo el disponible <strong className="ui-tabular">({fmt(availableAmount)})</strong></span>
                                    </span>
                                </label>
                                <label className={`ui-choice ui-choice--compact${!transferAll ? ' is-selected' : ''}`}>
                                    <input type="radio" checked={!transferAll} onChange={() => setTransferAll(false)} />
                                    <span className="material-icons-round ui-choice-icon" aria-hidden="true">edit</span>
                                    <span className="ui-choice-text">
                                        <span className="ui-choice-title">Monto parcial</span>
                                    </span>
                                </label>
                            </div>
                            {!transferAll && (
                                <div className="ui-input-group pt-amount-input">
                                    <span className="ui-input-prefix" aria-hidden="true">$</span>
                                    <input
                                        className="ui-input"
                                        type="number"
                                        aria-label="Monto parcial a transferir"
                                        min="1"
                                        max={availableAmount || undefined}
                                        value={customAmount}
                                        onChange={e => setCustomAmount(e.target.value)}
                                        placeholder={`Ej: ${Math.floor((availableAmount || 0) / 2)}`}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Vendedor destino */}
                        <div className="ui-field">
                            <label className="ui-label">Vendedor destino</label>
                            <div className="pt-vendor-grid">
                                {vendedores
                                    .filter(v => v.id !== originVendedorId)
                                    .map(v => (
                                        <button
                                            type="button"
                                            key={v.id}
                                            className={`pt-vendor-card ${destVendedorId === v.id ? 'selected dest' : ''}`}
                                            aria-pressed={destVendedorId === v.id}
                                            onClick={() => setDestVendedorId(v.id)}
                                        >
                                            <div className={`ui-avatar ui-avatar--sm ui-avatar--${avatarTone(v.username)}${destVendedorId === v.id ? ' is-selected' : ''} pt-vendor-avatar dest`} aria-hidden="true">{v.username.charAt(0).toUpperCase()}</div>
                                            <span className="pt-vendor-name">{v.username}</span>
                                            {destVendedorId === v.id && (
                                                <span className="material-icons-round pt-vendor-check" aria-hidden="true">check_circle</span>
                                            )}
                                        </button>
                                    ))}
                            </div>
                        </div>

                        {/* Mes / Año */}
                        <div className="ui-grid">
                            <div className="ui-field">
                                <label className="ui-label" htmlFor="pt-target-month">Mes destino</label>
                                <select id="pt-target-month" className="ui-select" value={targetMonth} onChange={e => setTargetMonth(e.target.value)}>
                                    {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                                </select>
                            </div>
                            <div className="ui-field">
                                <label className="ui-label" htmlFor="pt-target-year">Año</label>
                                <select id="pt-target-year" className="ui-select" value={targetYear} onChange={e => setTargetYear(e.target.value)}>
                                    {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                            </div>
                        </div>

                        {/* Motivo */}
                        <div className="ui-field">
                            <label className="ui-label" htmlFor="pt-reason">Motivo <span className="ui-optional">(opcional)</span></label>
                            <input
                                id="pt-reason"
                                className="ui-input"
                                type="text"
                                placeholder="Ej: Bonificación comercial, ajuste enero..."
                                value={reason}
                                onChange={e => setReason(e.target.value)}
                                maxLength={200}
                            />
                        </div>

                        {/* Confirmación visual */}
                        {destVendedorId && (
                            <div className="ui-alert ui-alert--info pt-confirm-box">
                                <span className="material-icons-round" aria-hidden="true">info</span>
                                <div>
                                    <strong>{fmt(transferAll ? availableAmount : customAmount)}</strong> se sumarán al{' '}
                                    <strong>totalSold de {vendedores.find(v => v.id === destVendedorId)?.username}</strong>{' '}
                                    en <strong>{MONTHS[(targetMonth || 1) - 1]} {targetYear}</strong>.
                                    <br />
                                    <small className="pt-confirm-note">
                                        Afecta su meta mensual y comisiones. La venta original permanece en {originUsername}.
                                    </small>
                                </div>
                            </div>
                        )}

                        <button
                            type="button"
                            className="ui-btn ui-btn--primary ui-btn--lg ui-btn--block"
                            onClick={handleSubmit}
                            disabled={submitting || !destVendedorId}
                        >
                            {submitting
                                ? <><span className="ui-spinner" aria-hidden="true"></span> Creando…</>
                                : <><span className="material-icons-round" aria-hidden="true">check</span> Confirmar Transferencia</>
                            }
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
