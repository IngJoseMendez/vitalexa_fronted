// src/components/PaymentTransferPanel.js
// Panel de gestión de transferencias de pagos entre vendedores (solo Owner)
import React, { useState, useEffect, useCallback } from 'react';
import paymentTransferService from '../api/paymentTransferService';
import paymentService from '../api/paymentService';
import apiClient from '../api/client';

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

// ─── Componente Principal ─────────────────────────────────────────────────────

export default function PaymentTransferPanel({ vendedores = [] }) {
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
        if (!revokeReason.trim()) { alert('Debes ingresar el motivo de revocación'); return; }
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
            {/* ─── Header Hero ──────────────────────────────────────────── */}
            <div className="pt-hero">
                <div className="pt-hero-left">
                    <div className="pt-hero-icon">
                        <span className="material-icons-round">swap_horiz</span>
                    </div>
                    <div>
                        <h1 className="pt-hero-title">Transferencias de Pagos</h1>
                        <p className="pt-hero-sub">
                            Asigna montos ya cobrados a otro vendedor para efectos de nómina y metas
                        </p>
                    </div>
                </div>
                <div className="pt-hero-actions">
                    <button
                        className={`pt-view-btn ${view === 'history' ? 'active' : ''}`}
                        onClick={() => { setView('history'); setError(''); setSuccess(''); }}
                    >
                        <span className="material-icons-round">history</span>
                        Historial
                    </button>
                    <button
                        className={`pt-view-btn primary ${view === 'create' ? 'active' : ''}`}
                        onClick={() => { setView('create'); setError(''); setSuccess(''); }}
                    >
                        <span className="material-icons-round">add_circle</span>
                        Nueva Transferencia
                    </button>
                </div>
            </div>

            {/* ─── Alertas ──────────────────────────────────────────────── */}
            {error && (
                <div className="pt-alert pt-alert-error" onClick={() => setError('')}>
                    <span className="material-icons-round">error_outline</span>
                    {error}
                    <button className="pt-alert-close">✕</button>
                </div>
            )}
            {success && (
                <div className="pt-alert pt-alert-success" onClick={() => setSuccess('')}>
                    <span className="material-icons-round">check_circle_outline</span>
                    {success}
                    <button className="pt-alert-close">✕</button>
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

            <style>{styles}</style>
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
        <div>
            {/* Filtros */}
            <div className="pt-filters">
                <div className="pt-filter-group">
                    <label className="pt-filter-label">Vendedor</label>
                    <select className="pt-select" value={filterVendedor} onChange={e => setFilterVendedor(e.target.value)}>
                        <option value="">— Todos / seleccionar —</option>
                        {vendedores.map(v => (
                            <option key={v.id} value={v.id}>{v.username}</option>
                        ))}
                    </select>
                </div>
                <div className="pt-filter-group">
                    <label className="pt-filter-label">Dirección</label>
                    <select className="pt-select" value={filterDirection} onChange={e => setFilterDirection(e.target.value)}>
                        <option value="dest">Como destino (recibe)</option>
                        <option value="origin">Como origen (cede)</option>
                    </select>
                </div>
                <div className="pt-filter-group">
                    <label className="pt-filter-label">Estado</label>
                    <select className="pt-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                        <option value="active">Solo activas</option>
                        <option value="all">Todas</option>
                    </select>
                </div>
            </div>

            {/* Sin vendedor seleccionado */}
            {!filterVendedor && (
                <div className="pt-empty">
                    <span className="material-icons-round">manage_search</span>
                    <p>Selecciona un vendedor para ver sus transferencias</p>
                </div>
            )}

            {filterVendedor && loading && (
                <div className="pt-loading">
                    <span className="material-icons-round pt-spin">sync</span>
                    Cargando transferencias…
                </div>
            )}

            {filterVendedor && !loading && transfers.length === 0 && (
                <div className="pt-empty">
                    <span className="material-icons-round">inbox</span>
                    <p>No hay transferencias para mostrar</p>
                </div>
            )}

            {/* Tabla */}
            {filterVendedor && !loading && transfers.length > 0 && (
                <div className="pt-table-wrap">
                    <table className="pt-table">
                        <thead>
                            <tr>
                                <th>Estado</th>
                                <th>Pago / Monto</th>
                                <th>Cliente</th>
                                <th>Origen → Destino</th>
                                <th>Transferido</th>
                                <th>Mes destino</th>
                                <th>Motivo</th>
                                <th>Creado por</th>
                                <th>Acción</th>
                            </tr>
                        </thead>
                        <tbody>
                            {transfers.map(t => (
                                <React.Fragment key={t.id}>
                                    <tr className={t.isRevoked ? 'pt-row-revoked' : ''}>
                                        <td>
                                            <span className={`pt-badge ${t.isRevoked ? 'pt-badge-red' : 'pt-badge-green'}`}>
                                                {t.isRevoked ? '🔴 Revocada' : '🟢 Activa'}
                                            </span>
                                        </td>
                                        <td>
                                            <span className="pt-mono">{t.paymentId?.slice(0, 8)}…</span>
                                            <br />
                                            <small className="pt-muted">{fmt(t.paymentTotalAmount)}</small>
                                        </td>
                                        <td className="pt-td-ellipsis">{t.orderClientName}</td>
                                        <td>
                                            <span className="pt-chip pt-chip-blue">{t.originVendedorUsername}</span>
                                            <span className="pt-arrow">→</span>
                                            <span className="pt-chip pt-chip-purple">{t.destVendedorUsername}</span>
                                        </td>
                                        <td>
                                            <strong className="pt-amount">{fmt(t.amount)}</strong>
                                        </td>
                                        <td>{MONTHS[(t.targetMonth || 1) - 1]} {t.targetYear}</td>
                                        <td className="pt-muted pt-td-ellipsis">{t.reason || '—'}</td>
                                        <td>
                                            <small className="pt-muted">{fmtDate(t.createdAt)}</small>
                                            <br />
                                            <small className="pt-muted">{t.createdByUsername}</small>
                                        </td>
                                        <td>
                                            {!t.isRevoked ? (
                                                <button
                                                    className="pt-btn-danger-sm"
                                                    onClick={() => { setRevokingId(t.id); setRevokeReason(''); }}
                                                >
                                                    <span className="material-icons-round" style={{ fontSize: 14 }}>undo</span>
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
                                                    <span className="material-icons-round" style={{ color: '#f59e0b' }}>warning</span>
                                                    <span>Revocar <strong>{fmt(t.amount)}</strong> transferidos a <strong>{t.destVendedorUsername}</strong></span>
                                                    <input
                                                        className="pt-input"
                                                        type="text"
                                                        placeholder="Motivo de revocación (requerido)"
                                                        value={revokeReason}
                                                        onChange={e => setRevokeReason(e.target.value)}
                                                        onKeyDown={e => e.key === 'Enter' && onRevoke(t.id)}
                                                    />
                                                    <button className="pt-btn-danger" onClick={() => onRevoke(t.id)} disabled={revokeLoading}>
                                                        {revokeLoading ? 'Revocando…' : 'Confirmar'}
                                                    </button>
                                                    <button className="pt-btn-secondary" onClick={() => setRevokingId(null)}>Cancelar</button>
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
            onSuccess(`✅ ${fmt(transferAll ? availableAmount : amount)} transferidos exitosamente`);
        } catch (e) {
            onError('Error: ' + (e.response?.data?.message || e.message));
        } finally {
            setSubmitting(false);
        }
    };

    const steps = ['Vendedor Origen', 'Seleccionar Pago', 'Configurar'];

    return (
        <div className="pt-create">
            {/* Steps indicator */}
            <div className="pt-steps">
                {steps.map((label, i) => (
                    <React.Fragment key={i}>
                        <div className={`pt-step ${step > i + 1 ? 'done' : step === i + 1 ? 'current' : ''}`}>
                            <div className="pt-step-dot">
                                {step > i + 1
                                    ? <span className="material-icons-round" style={{ fontSize: 16 }}>check</span>
                                    : i + 1}
                            </div>
                            <span className="pt-step-label">{label}</span>
                        </div>
                        {i < steps.length - 1 && <div className={`pt-step-line ${step > i + 1 ? 'done' : ''}`} />}
                    </React.Fragment>
                ))}
            </div>

            <div className="pt-card">

                {/* ─── STEP 1 ────────────────────────────────────────── */}
                {step === 1 && (
                    <div className="pt-step-content">
                        <h3 className="pt-step-title">
                            <span className="material-icons-round">person_search</span>
                            Selecciona el vendedor origen
                        </h3>
                        <p className="pt-step-hint">El vendedor que tiene el pago a transferir</p>

                        <div className="pt-vendor-grid">
                            {vendedores.map(v => (
                                <button
                                    key={v.id}
                                    className={`pt-vendor-card ${originVendedorId === v.id ? 'selected' : ''}`}
                                    onClick={() => setOriginVendedorId(v.id)}
                                >
                                    <div className="pt-vendor-avatar">{v.username.charAt(0).toUpperCase()}</div>
                                    <span className="pt-vendor-name">{v.username}</span>
                                    {originVendedorId === v.id && (
                                        <span className="material-icons-round pt-vendor-check">check_circle</span>
                                    )}
                                </button>
                            ))}
                        </div>

                        <button
                            className="pt-btn-primary"
                            disabled={!originVendedorId}
                            onClick={() => { loadOriginOrders(originVendedorId); setStep(2); }}
                        >
                            Continuar
                            <span className="material-icons-round">arrow_forward</span>
                        </button>
                    </div>
                )}

                {/* ─── STEP 2 ────────────────────────────────────────── */}
                {step === 2 && (
                    <div className="pt-step-content">
                        <h3 className="pt-step-title">
                            <span className="material-icons-round">receipt_long</span>
                            Selecciona la orden y el pago
                        </h3>
                        <p className="pt-step-hint">
                            Órdenes <strong>completadas</strong> de <strong>{originUsername}</strong>
                        </p>

                        <button className="pt-btn-back" onClick={() => setStep(1)}>
                            <span className="material-icons-round">arrow_back</span> Atrás
                        </button>

                        {loadingOrders && (
                            <div className="pt-loading">
                                <span className="material-icons-round pt-spin">sync</span> Cargando órdenes…
                            </div>
                        )}

                        {!loadingOrders && originOrders.length === 0 && (
                            <div className="pt-empty">
                                <span className="material-icons-round">inventory_2</span>
                                <p>No hay órdenes completadas para <strong>{originUsername}</strong></p>
                            </div>
                        )}

                        {!loadingOrders && originOrders.length > 0 && (
                            <div>
                                <label className="pt-field-label">Orden</label>
                                <select
                                    className="pt-select-lg"
                                    value={selectedOrderId}
                                    onChange={e => { setSelectedOrderId(e.target.value); if (e.target.value) loadPayments(e.target.value); }}
                                >
                                    <option value="">— Selecciona una orden —</option>
                                    {originOrders.map(o => (
                                        <option key={o.id} value={o.id}>
                                            {o.invoiceNumber ? `Factura #${o.invoiceNumber}` : `#${o.id.slice(0, 8)}`}
                                            {' — '}{o.cliente || '(sin cliente)'}
                                            {' — '}{fmt(o.total)}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {loadingPayments && (
                            <div className="pt-loading">
                                <span className="material-icons-round pt-spin">sync</span> Cargando pagos…
                            </div>
                        )}

                        {selectedOrderId && !loadingPayments && payments.length === 0 && (
                            <div className="pt-empty">
                                <span className="material-icons-round">credit_card_off</span>
                                <p>Esta orden no tiene pagos activos</p>
                            </div>
                        )}

                        {selectedOrderId && !loadingPayments && payments.length > 0 && (
                            <div>
                                <label className="pt-field-label" style={{ marginTop: 16 }}>Pagos activos</label>
                                <div className="pt-payments-grid">
                                    {payments.map(p => (
                                        <button
                                            key={p.id}
                                            className={`pt-payment-card ${selectedPayment?.id === p.id ? 'selected' : ''}`}
                                            onClick={() => selectPayment(p)}
                                        >
                                            <div className="pt-payment-amount">{fmt(p.amount)}</div>
                                            <div className="pt-payment-meta">
                                                <span className="pt-payment-method">{p.paymentMethod || 'Pago'}</span>
                                                {selectedPayment?.id === p.id && availableAmount !== null && (
                                                    <span className={`pt-available-tag ${availableAmount <= 0 ? 'zero' : ''}`}>
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
                            <div className="pt-alert pt-alert-warning">
                                <span className="material-icons-round">warning</span>
                                Este pago no tiene saldo disponible (ya fue transferido en su totalidad)
                            </div>
                        )}

                        <button
                            className="pt-btn-primary"
                            disabled={!selectedPayment || (availableAmount !== null && availableAmount <= 0)}
                            onClick={() => setStep(3)}
                        >
                            Continuar
                            <span className="material-icons-round">arrow_forward</span>
                        </button>
                    </div>
                )}

                {/* ─── STEP 3 ────────────────────────────────────────── */}
                {step === 3 && (
                    <div className="pt-step-content">
                        <h3 className="pt-step-title">
                            <span className="material-icons-round">tune</span>
                            Configurar transferencia
                        </h3>

                        <button className="pt-btn-back" onClick={() => setStep(2)}>
                            <span className="material-icons-round">arrow_back</span> Atrás
                        </button>

                        {/* Resumen */}
                        <div className="pt-summary-bar">
                            <div className="pt-summary-item">
                                <span className="pt-summary-label">Pago seleccionado</span>
                                <span className="pt-summary-value">{fmt(selectedPayment?.amount)}</span>
                            </div>
                            <div className="pt-summary-sep" />
                            <div className="pt-summary-item">
                                <span className="pt-summary-label">Disponible para transferir</span>
                                <span className="pt-summary-value pt-summary-highlight">{fmt(availableAmount)}</span>
                            </div>
                        </div>

                        {/* Monto */}
                        <div className="pt-field-group">
                            <label className="pt-field-label">Monto a transferir</label>
                            <div className="pt-radio-group">
                                <label className="pt-radio-opt">
                                    <input type="radio" checked={transferAll} onChange={() => setTransferAll(true)} />
                                    <span>Todo el disponible <strong>({fmt(availableAmount)})</strong></span>
                                </label>
                                <label className="pt-radio-opt">
                                    <input type="radio" checked={!transferAll} onChange={() => setTransferAll(false)} />
                                    <span>Monto parcial</span>
                                </label>
                            </div>
                            {!transferAll && (
                                <input
                                    className="pt-input pt-input-amount"
                                    type="number"
                                    min="1"
                                    max={availableAmount || undefined}
                                    value={customAmount}
                                    onChange={e => setCustomAmount(e.target.value)}
                                    placeholder={`Ej: ${Math.floor((availableAmount || 0) / 2)}`}
                                />
                            )}
                        </div>

                        {/* Vendedor destino */}
                        <div className="pt-field-group">
                            <label className="pt-field-label">Vendedor destino</label>
                            <div className="pt-vendor-grid">
                                {vendedores
                                    .filter(v => v.id !== originVendedorId)
                                    .map(v => (
                                        <button
                                            key={v.id}
                                            className={`pt-vendor-card ${destVendedorId === v.id ? 'selected dest' : ''}`}
                                            onClick={() => setDestVendedorId(v.id)}
                                        >
                                            <div className="pt-vendor-avatar dest">{v.username.charAt(0).toUpperCase()}</div>
                                            <span className="pt-vendor-name">{v.username}</span>
                                            {destVendedorId === v.id && (
                                                <span className="material-icons-round pt-vendor-check">check_circle</span>
                                            )}
                                        </button>
                                    ))}
                            </div>
                        </div>

                        {/* Mes / Año */}
                        <div className="pt-field-group pt-field-row">
                            <div>
                                <label className="pt-field-label">Mes destino</label>
                                <select className="pt-select" value={targetMonth} onChange={e => setTargetMonth(e.target.value)}>
                                    {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="pt-field-label">Año</label>
                                <select className="pt-select" value={targetYear} onChange={e => setTargetYear(e.target.value)}>
                                    {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                            </div>
                        </div>

                        {/* Motivo */}
                        <div className="pt-field-group">
                            <label className="pt-field-label">Motivo <span style={{ fontWeight: 400, color: '#94a3b8' }}>(opcional)</span></label>
                            <input
                                className="pt-input"
                                type="text"
                                placeholder="Ej: Bonificación comercial, ajuste enero..."
                                value={reason}
                                onChange={e => setReason(e.target.value)}
                                maxLength={200}
                            />
                        </div>

                        {/* Confirmación visual */}
                        {destVendedorId && (
                            <div className="pt-confirm-box">
                                <span className="material-icons-round" style={{ color: '#2563eb', fontSize: 20 }}>info</span>
                                <div>
                                    <strong>{fmt(transferAll ? availableAmount : customAmount)}</strong> se sumarán al{' '}
                                    <strong>totalSold de {vendedores.find(v => v.id === destVendedorId)?.username}</strong>{' '}
                                    en <strong>{MONTHS[(targetMonth || 1) - 1]} {targetYear}</strong>.
                                    <br />
                                    <small style={{ color: '#64748b' }}>
                                        Afecta su meta mensual y comisiones. La venta original permanece en {originUsername}.
                                    </small>
                                </div>
                            </div>
                        )}

                        <button
                            className="pt-btn-primary pt-btn-full"
                            onClick={handleSubmit}
                            disabled={submitting || !destVendedorId}
                        >
                            {submitting
                                ? <><span className="material-icons-round pt-spin">sync</span> Creando…</>
                                : <><span className="material-icons-round">check</span> Confirmar Transferencia</>
                            }
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Estilos ─────────────────────────────────────────────────────────────────

const styles = `
/* Variables locales alineadas con Owner Dashboard */
.pt-panel {
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  color: #0f172a;
  padding: 0;
}

/* ── Hero ─────────────────────────────── */
.pt-hero {
  background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%);
  border-radius: 1.25rem;
  padding: 2rem 2.5rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 1.5rem;
  box-shadow: 0 10px 25px -5px rgba(37, 99, 235, 0.35);
  position: relative;
  overflow: hidden;
}
.pt-hero::before {
  content: '';
  position: absolute;
  top: -60%;
  right: -5%;
  width: 350px;
  height: 350px;
  background: radial-gradient(circle, rgba(255,255,255,0.12), transparent 70%);
  pointer-events: none;
}
.pt-hero-left { display: flex; align-items: center; gap: 1.25rem; position: relative; z-index: 1; }
.pt-hero-icon {
  width: 54px; height: 54px; border-radius: 1rem;
  background: rgba(255,255,255,0.2);
  backdrop-filter: blur(10px);
  display: flex; align-items: center; justify-content: center;
  color: white;
}
.pt-hero-icon .material-icons-round { font-size: 28px; }
.pt-hero-title { font-size: 1.6rem; font-weight: 800; color: white; margin: 0; letter-spacing: -0.02em; }
.pt-hero-sub { color: rgba(255,255,255,0.75); margin: 4px 0 0 0; font-size: 0.9rem; }
.pt-hero-actions { display: flex; gap: 0.75rem; position: relative; z-index: 1; }
.pt-view-btn {
  display: flex; align-items: center; gap: 0.4rem;
  padding: 0.65rem 1.25rem; border-radius: 0.75rem; border: 1px solid rgba(255,255,255,0.35);
  background: rgba(255,255,255,0.15); backdrop-filter: blur(10px);
  color: white; font-weight: 600; font-size: 0.875rem; cursor: pointer;
  transition: all 0.2s ease;
}
.pt-view-btn .material-icons-round { font-size: 18px; }
.pt-view-btn:hover { background: rgba(255,255,255,0.25); transform: translateY(-1px); }
.pt-view-btn.active { background: white; color: #2563eb; border-color: white; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
.pt-view-btn.primary.active { background: white; color: #2563eb; }

/* ── Body ─────────────────────────────── */
.pt-body { min-height: 300px; }

/* ── Alerts ──────────────────────────── */
.pt-alert {
  display: flex; align-items: center; gap: 0.75rem;
  padding: 0.85rem 1.25rem; border-radius: 0.85rem;
  margin-bottom: 1rem; font-size: 0.9rem; cursor: pointer;
  border: 1px solid transparent;
}
.pt-alert .material-icons-round { font-size: 20px; flex-shrink: 0; }
.pt-alert-close { background: none; border: none; cursor: pointer; margin-left: auto; font-size: 0.85rem; }
.pt-alert-error { background: #fef2f2; border-color: #fca5a5; color: #991b1b; }
.pt-alert-success { background: #f0fdf4; border-color: #86efac; color: #166534; }
.pt-alert-warning { background: #fffbeb; border-color: #fde68a; color: #92400e; margin-top: 1rem; }

/* ── Filtros ─────────────────────────── */
.pt-filters {
  display: flex; flex-wrap: wrap; gap: 1rem;
  background: #f8fafc; border: 1px solid #e2e8f0;
  border-radius: 1rem; padding: 1rem 1.25rem;
  margin-bottom: 1.5rem;
}
.pt-filter-group { display: flex; flex-direction: column; gap: 4px; min-width: 180px; }
.pt-filter-label { font-size: 0.75rem; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
.pt-select {
  padding: 0.5rem 0.85rem; border-radius: 0.6rem;
  border: 1px solid #e2e8f0; background: white;
  color: #0f172a; font-size: 0.875rem; cursor: pointer;
}
.pt-select:focus { outline: none; border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }

/* ── Tabla ───────────────────────────── */
.pt-table-wrap { overflow-x: auto; border-radius: 1rem; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
.pt-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.pt-table th {
  background: #f8fafc; color: #64748b; padding: 0.75rem 1rem;
  text-align: left; font-weight: 700; font-size: 0.75rem;
  text-transform: uppercase; letter-spacing: 0.04em;
  border-bottom: 1px solid #e2e8f0; white-space: nowrap;
}
.pt-table td {
  padding: 0.85rem 1rem; border-bottom: 1px solid #f1f5f9;
  color: #0f172a; vertical-align: middle;
}
.pt-table tbody tr:hover td { background: #f8fafc; }
.pt-table tbody tr:last-child td { border-bottom: none; }
.pt-row-revoked td { opacity: 0.55; }
.pt-badge { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }
.pt-badge-green { background: #dcfce7; color: #166534; }
.pt-badge-red { background: #fee2e2; color: #991b1b; }
.pt-mono { font-family: monospace; font-size: 0.8rem; color: #64748b; }
.pt-muted { color: #94a3b8; font-size: 0.8rem; }
.pt-td-ellipsis { max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pt-chip {
  display: inline-block; padding: 2px 8px; border-radius: 9999px;
  font-size: 0.8rem; font-weight: 600;
}
.pt-chip-blue { background: #dbeafe; color: #1d4ed8; }
.pt-chip-purple { background: #ede9fe; color: #6d28d9; }
.pt-arrow { margin: 0 4px; color: #94a3b8; font-size: 0.85rem; }
.pt-amount { color: #059669; font-size: 0.95rem; font-weight: 700; }
.pt-btn-danger-sm {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 5px 12px; border-radius: 8px; font-size: 0.8rem; font-weight: 600;
  background: #fef2f2; color: #dc2626; border: 1px solid #fca5a5; cursor: pointer;
  transition: all 0.2s;
}
.pt-btn-danger-sm:hover { background: #fee2e2; }

/* ── Revocación inline ───────────────── */
.pt-revoke-row td { background: #fffbeb !important; border-bottom: 2px solid #fde68a; }
.pt-revoke-form {
  display: flex; align-items: center; gap: 0.75rem;
  flex-wrap: wrap; padding: 0.5rem;
}
.pt-revoke-form span { font-size: 0.9rem; color: #0f172a; }
.pt-btn-danger {
  padding: 7px 16px; border-radius: 8px; background: #dc2626;
  color: white; border: none; font-weight: 600; font-size: 0.85rem; cursor: pointer;
}
.pt-btn-secondary {
  padding: 7px 16px; border-radius: 8px; background: white;
  color: #64748b; border: 1px solid #e2e8f0; font-size: 0.85rem; cursor: pointer;
}

/* ── Empty / Loading ─────────────────── */
.pt-empty {
  text-align: center; padding: 3rem 1rem; color: #94a3b8;
  border: 2px dashed #e2e8f0; border-radius: 1rem; margin: 1rem 0;
}
.pt-empty .material-icons-round { font-size: 3rem; display: block; margin-bottom: 0.75rem; }
.pt-empty p { margin: 0; font-size: 0.95rem; }
.pt-loading {
  display: flex; align-items: center; gap: 0.5rem; justify-content: center;
  padding: 1.5rem; color: #64748b; font-size: 0.9rem;
}
.pt-loading .material-icons-round { font-size: 20px; }
@keyframes spin { to { transform: rotate(360deg); } }
.pt-spin { animation: spin 1s linear infinite; display: inline-block; }

/* ── Create form ─────────────────────── */
.pt-create { max-width: 760px; }
.pt-steps {
  display: flex; align-items: center; margin-bottom: 2rem;
}
.pt-step { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.pt-step-dot {
  width: 36px; height: 36px; border-radius: 50%;
  background: #f1f5f9; border: 2px solid #e2e8f0;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.9rem; font-weight: 700; color: #94a3b8;
  transition: all 0.3s;
}
.pt-step.current .pt-step-dot { background: #2563eb; border-color: #2563eb; color: white; box-shadow: 0 4px 12px rgba(37,99,235,0.3); }
.pt-step.done .pt-step-dot { background: #10b981; border-color: #10b981; color: white; }
.pt-step-label { font-size: 0.72rem; color: #94a3b8; font-weight: 500; text-align: center; white-space: nowrap; }
.pt-step.current .pt-step-label { color: #2563eb; font-weight: 700; }
.pt-step-line { flex: 1; height: 2px; background: #e2e8f0; margin: 0 8px; margin-bottom: 22px; transition: background 0.3s; }
.pt-step-line.done { background: #10b981; }
.pt-card {
  background: white; border-radius: 1.25rem; border: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04); padding: 2rem;
}
.pt-step-content { max-width: 640px; }
.pt-step-title {
  display: flex; align-items: center; gap: 0.6rem;
  font-size: 1.15rem; font-weight: 700; margin-bottom: 4px;
}
.pt-step-title .material-icons-round { color: #2563eb; font-size: 22px; }
.pt-step-hint { color: #64748b; font-size: 0.875rem; margin-bottom: 1.5rem; }
.pt-btn-back {
  display: inline-flex; align-items: center; gap: 4px;
  color: #2563eb; background: none; border: none; cursor: pointer;
  font-size: 0.875rem; font-weight: 600; padding: 0; margin-bottom: 1.25rem;
}
.pt-btn-back:hover { text-decoration: underline; }

/* Vendor grid */
.pt-vendor-grid { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 1.5rem; }
.pt-vendor-card {
  display: flex; align-items: center; gap: 0.6rem;
  padding: 0.6rem 1rem; border-radius: 0.75rem;
  border: 1.5px solid #e2e8f0; background: white;
  cursor: pointer; font-size: 0.875rem; font-weight: 600;
  color: #0f172a; transition: all 0.2s; position: relative;
}
.pt-vendor-card:hover { border-color: #2563eb; background: #eff6ff; }
.pt-vendor-card.selected { border-color: #2563eb; background: #eff6ff; color: #1d4ed8; }
.pt-vendor-card.selected.dest { border-color: #6d28d9; background: #f5f3ff; color: #5b21b6; }
.pt-vendor-avatar {
  width: 32px; height: 32px; border-radius: 50%;
  background: #dbeafe; color: #1d4ed8;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.875rem; font-weight: 800; flex-shrink: 0;
}
.pt-vendor-avatar.dest { background: #ede9fe; color: #6d28d9; }
.pt-vendor-name { flex: 1; }
.pt-vendor-check { font-size: 18px; color: #10b981; }

/* Order / Select */
.pt-field-label { display: block; font-size: 0.8rem; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 6px; }
.pt-select-lg {
  width: 100%; padding: 0.7rem 1rem; border-radius: 0.75rem;
  border: 1.5px solid #e2e8f0; background: white;
  color: #0f172a; font-size: 0.95rem; margin-bottom: 1.25rem;
  transition: border-color 0.2s;
}
.pt-select-lg:focus { outline: none; border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }

/* Payments */
.pt-payments-grid { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 1.25rem; }
.pt-payment-card {
  display: flex; flex-direction: column; gap: 4px;
  padding: 0.9rem 1.25rem; border-radius: 0.85rem;
  border: 1.5px solid #e2e8f0; background: white;
  cursor: pointer; text-align: left; transition: all 0.2s; min-width: 160px;
}
.pt-payment-card:hover { border-color: #2563eb; background: #f8fafc; }
.pt-payment-card.selected { border-color: #10b981; background: #f0fdf4; }
.pt-payment-amount { font-size: 1.15rem; font-weight: 800; color: #059669; }
.pt-payment-meta { display: flex; flex-direction: column; gap: 2px; }
.pt-payment-method { font-size: 0.78rem; color: #64748b; }
.pt-available-tag {
  font-size: 0.78rem; font-weight: 700; color: #059669;
  background: #dcfce7; padding: 2px 6px; border-radius: 6px;
}
.pt-available-tag.zero { color: #dc2626; background: #fee2e2; }

/* Form fields */
.pt-field-group { margin-bottom: 1.25rem; }
.pt-field-row { display: flex; gap: 1rem; }
.pt-field-row > div { flex: 1; }
.pt-radio-group { display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px; }
.pt-radio-opt { display: flex; align-items: center; gap: 8px; font-size: 0.9rem; cursor: pointer; color: #0f172a; }
.pt-input {
  width: 100%; padding: 0.65rem 0.9rem; border-radius: 0.65rem;
  border: 1.5px solid #e2e8f0; background: white; color: #0f172a;
  font-size: 0.9rem; transition: border-color 0.2s; box-sizing: border-box;
}
.pt-input:focus { outline: none; border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
.pt-input-amount { margin-top: 8px; }

/* Summary bar */
.pt-summary-bar {
  display: flex; gap: 0; background: #f8fafc;
  border: 1px solid #e2e8f0; border-radius: 0.85rem;
  padding: 1rem 1.5rem; margin-bottom: 1.5rem; align-items: center;
}
.pt-summary-item { flex: 1; }
.pt-summary-label { display: block; font-size: 0.75rem; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 3px; }
.pt-summary-value { font-size: 1.1rem; font-weight: 700; color: #0f172a; }
.pt-summary-highlight { color: #059669; }
.pt-summary-sep { width: 1px; background: #e2e8f0; height: 40px; margin: 0 1.5rem; }

/* Confirm box */
.pt-confirm-box {
  display: flex; align-items: flex-start; gap: 0.75rem;
  background: #eff6ff; border: 1px solid #bfdbfe;
  border-radius: 0.85rem; padding: 1rem 1.25rem;
  margin-bottom: 1.25rem; font-size: 0.9rem; color: #1e40af;
  line-height: 1.5;
}
.pt-confirm-box .material-icons-round { flex-shrink: 0; margin-top: 1px; }

/* Buttons */
.pt-btn-primary {
  display: inline-flex; align-items: center; gap: 0.5rem;
  padding: 0.75rem 1.75rem; border-radius: 0.75rem;
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  color: white; border: none; font-weight: 700; font-size: 0.95rem;
  cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 12px rgba(37,99,235,0.25);
  margin-top: 0.5rem;
}
.pt-btn-primary .material-icons-round { font-size: 18px; }
.pt-btn-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(37,99,235,0.35); }
.pt-btn-primary:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }
.pt-btn-full { width: 100%; justify-content: center; padding: 0.9rem 1.75rem; font-size: 1rem; }
`;
