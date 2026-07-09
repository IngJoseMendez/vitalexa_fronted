// src/components/MiNominaPanel.js
// Panel de Nómina propia — solo lectura para Vendedora
import React, { useState, useEffect, useCallback } from 'react';
import { formatCurrency } from '../utils/formatters';
import { getMyPayroll, getMyPayrollHistory, exportMyPayrollExcel, exportMyPayrollPdf } from '../api/payrollService';
import { useToast } from './ToastContainer';
import './MiNominaPanel.css';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

function pct(decimal) {
  if (decimal == null) return '—';
  return (parseFloat(decimal) * 100).toFixed(2) + '%';
}

function formatPct(value) {
  if (value == null) return '—';
  return parseFloat(value).toFixed(2) + '%';
}

export default function MiNominaPanel() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [nomina, setNomina] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [exporting, setExporting] = useState(false);
  const toast = useToast();

  const handleExport = async (format) => {
    if (exporting) return;
    setExporting(true);
    try {
      const res = format === 'excel'
        ? await exportMyPayrollExcel(month, year)
        : await exportMyPayrollPdf(month, year);
      const ext = format === 'excel' ? 'xlsx' : 'pdf';
      const contentDisposition = res.headers?.['content-disposition'];
      let filename = `mi_nomina_${MESES[month - 1]}_${year}.${ext}`;
      if (contentDisposition) {
        const m = contentDisposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i) ||
          contentDisposition.match(/filename\s*=\s*"?([^";]+)"?/i);
        if (m?.[1]) filename = decodeURIComponent(m[1].replace(/"/g, ''));
      }
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url; a.setAttribute('download', filename);
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`Nómina ${format.toUpperCase()} descargada`);
    } catch (err) {
      toast.error('Error al descargar: ' + (err.response?.data?.message || err.message));
    } finally {
      setExporting(false);
    }
  };

  const fetchNomina = useCallback(async () => {
    setLoading(true);
    setNotFound(false);
    setNomina(null);
    try {
      const res = await getMyPayroll(month, year);
      setNomina(res.data);
    } catch (err) {
      if (err.response?.status === 404) {
        setNotFound(true);
      } else {
        toast.error('Error al cargar tu nómina');
      }
    } finally {
      setLoading(false);
    }
  }, [month, year, toast]);

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await getMyPayrollHistory();
      setHistory(res.data || []);
    } catch {
      setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => { fetchNomina(); }, [fetchNomina]);

  const years = [];
  for (let y = now.getFullYear() - 2; y <= now.getFullYear(); y++) years.push(y);

  return (
    <div className="mn-panel">
      {/* Header */}
      <div className="mn-header">
        <div className="mn-header-icon">
          <span className="material-icons-round">payments</span>
        </div>
        <div>
          <h2>Mi Nómina</h2>
          <p>Consulta tu salario y comisiones mensuales</p>
        </div>
      </div>

      {/* Selector de período */}
      <div className="mn-period">
        <div className="mn-period-selectors">
          <span className="material-icons-round">calendar_month</span>
          <select className="mn-select" value={month} onChange={e => setMonth(Number(e.target.value))}>
            {MESES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
          <select className="mn-select" value={year} onChange={e => setYear(Number(e.target.value))}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        <div className="mn-period-actions">
          {/* ✅ Botones de descarga — solo si hay nómina cargada */}
          {nomina && (
            <>
              <button
                className="mn-btn mn-btn-excel"
                onClick={() => handleExport('excel')}
                disabled={exporting}
                title="Descargar mi nómina en Excel"
              >
                <span className="material-icons-round">table_chart</span>
                Excel
              </button>
              <button
                className="mn-btn mn-btn-pdf"
                onClick={() => handleExport('pdf')}
                disabled={exporting}
                title="Descargar mi nómina en PDF"
              >
                <span className="material-icons-round">picture_as_pdf</span>
                PDF
              </button>
            </>
          )}

          <button
            className={`mn-btn mn-btn-history ${showHistory ? 'active' : ''}`}
            onClick={() => { setShowHistory(!showHistory); if (!showHistory && history.length === 0) fetchHistory(); }}
          >
            <span className="material-icons-round">history</span>
            Historial
          </button>
        </div>
      </div>

      {/* Historial */}
      {showHistory && (
        <div className="mn-history">
          <h3>
            <span className="material-icons-round">history</span>
            Historial de Nóminas
          </h3>
          {loadingHistory ? (
            <p className="mn-history-empty">Cargando...</p>
          ) : history.length === 0 ? (
            <p className="mn-history-empty">No hay nóminas anteriores registradas</p>
          ) : (
            <div className="mn-history-list">
              {history.map(h => (
                <div key={h.id}
                  className="mn-history-item"
                  onClick={() => { setMonth(h.month); setYear(h.year); setShowHistory(false); }}
                >
                  <div>
                    <span className="mn-hi-label">{MESES[h.month - 1]} {h.year}</span>
                    {h.notes && <span className="mn-hi-note">— {h.notes}</span>}
                  </div>
                  <span className="mn-hi-amount">${formatCurrency(h.totalPayout)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Estado principal */}
      {loading ? (
        <div className="mn-state">
          <span className="material-icons-round">hourglass_top</span>
          Cargando nómina...
        </div>
      ) : notFound ? (
        <div className="mn-state card">
          <span className="material-icons-round">receipt_long</span>
          <h3>Nómina no disponible</h3>
          <p>El Owner aún no ha calculado tu nómina para <strong>{MESES[month - 1]} {year}</strong>.</p>
          <p>Consulta a tu supervisor para más información.</p>
        </div>
      ) : nomina ? (
        <NominaView nomina={nomina} />
      ) : null}
    </div>
  );
}

// ─── Vista detallada de la nómina ───────────────────────────
function NominaView({ nomina }) {
  return (
    <div className="mn-nomina">
      {/* Resumen total */}
      <div className="mn-total">
        <p className="mn-total-period">{MESES[nomina.month - 1]} {nomina.year}</p>
        <div className="mn-total-amount">${formatCurrency(nomina.totalPayout)}</div>
        <p className="mn-total-caption">Total a recibir este mes</p>
        <div className="mn-total-split">
          <div>
            <div className="mn-split-label">Salario base</div>
            <div className="mn-split-value">${formatCurrency(nomina.baseSalary)}</div>
          </div>
          <div>
            <div className="mn-split-label">Total comisiones</div>
            <div className="mn-split-value">${formatCurrency(nomina.totalCommissions)}</div>
          </div>
        </div>
      </div>

      {/* Comisión por ventas */}
      <CommissionCard
        title={nomina.salesCommissionByGoal === false ? 'Comisión por Ventas (Directa)' : 'Comisión por Ventas (Por Meta)'}
        icon="trending_up"
        met={nomina.salesCommissionByGoal === false ? true : nomina.salesGoalMet}
        metLabel={nomina.salesCommissionByGoal === false ? '⚡ Modalidad directa — siempre aplica' : 'Meta de ventas cumplida'}
        amount={nomina.salesCommissionAmount}
        rows={[
          { label: 'Modalidad', value: nomina.salesCommissionByGoal === false ? '⚡ % directo sin meta' : '🎯 Solo si cumple meta' },
          ...(nomina.salesCommissionByGoal !== false ? [{ label: 'Meta mensual', value: `$${formatCurrency(nomina.salesGoalTarget)}` }] : []),
          { label: 'Total vendido', value: `$${formatCurrency(nomina.totalSold)}` },
          { label: 'Comisión aplicada', value: pct(nomina.salesCommissionPct) },
        ]}
        detail={nomina.salesCommissionByGoal === false
          ? `Comisión directa: ${pct(nomina.salesCommissionPct)} sobre $${formatCurrency(nomina.totalSold)} vendido.`
          : nomina.salesGoalMet
            ? `Felicitaciones, cumpliste tu meta. Comisión: ${pct(nomina.salesCommissionPct)} sobre $${formatCurrency(nomina.totalSold)}`
            : `Aún no alcanzaste la meta de $${formatCurrency(nomina.salesGoalTarget)}. Vendiste $${formatCurrency(nomina.totalSold)}.`
        }
      />

      {/* Comisión por recaudo */}
      <CommissionCard
        title={nomina.collectionCommissionByGoal === false ? 'Comisión por Recaudo (Directa)' : 'Comisión por Recaudo (Por Umbral)'}
        icon="account_balance_wallet"
        met={nomina.collectionCommissionByGoal === false ? true : nomina.collectionGoalMet}
        metLabel={nomina.collectionCommissionByGoal === false ? '⚡ Modalidad directa — siempre aplica' : 'Meta de recaudo cumplida'}
        amount={nomina.collectionCommissionAmount}
        rows={[
          { label: 'Modalidad', value: nomina.collectionCommissionByGoal === false ? '⚡ % directo sin umbral' : '🎯 Solo si ≥ umbral' },
          ...(nomina.collectionCommissionByGoal !== false ? [
            { label: 'Vendido mes anterior', value: `$${formatCurrency(nomina.prevMonthTotalSold)}` },
            { label: '% Recaudado', value: formatPct(nomina.collectionPct) },
          ] : []),
          { label: 'Total recaudado', value: `$${formatCurrency(nomina.totalCollected)}` },
          { label: 'Comisión aplicada', value: pct(nomina.collectionCommissionPct) },
        ]}
        detail={nomina.collectionCommissionByGoal === false
          ? `Comisión directa: ${pct(nomina.collectionCommissionPct)} sobre $${formatCurrency(nomina.totalCollected)} recaudado.`
          : nomina.collectionGoalMet
            ? `Recaudaste el ${formatPct(nomina.collectionPct)} de lo vendido el mes anterior. ¡Meta superada!`
            : `Recaudaste ${formatPct(nomina.collectionPct)}. Se requería el ${pct(nomina.collectionThresholdPct || 0.8)} para aplicar la comisión.`
        }
      />

      {/* Comisión general */}
      {nomina.generalCommissionEnabled ? (
        <CommissionCard
          title="Comisión General"
          icon="star"
          met={nomina.generalCommissionGoalMet}
          metLabel={nomina.generalCommissionGoalMet ? 'Meta global alcanzada ✅' : 'Meta global no alcanzada ❌'}
          amount={nomina.generalCommissionGoalMet ? nomina.generalCommissionAmount : 0}
          rows={[
            { label: 'Ventas empresa del mes', value: `$${formatCurrency(nomina.totalCompanySales)}` },
            {
              label: nomina.thresholdIsCustom ? '🎯 Umbral personalizado (Owner)' : '📊 Umbral de referencia (suma metas)',
              value: `$${formatCurrency(nomina.effectiveThreshold ?? nomina.totalGlobalGoals)}`,
            },
            { label: 'Estado del umbral', value: nomina.generalCommissionGoalMet ? '✅ Alcanzado' : '❌ No alcanzado' },
            { label: 'Comisión aplicada', value: pct(nomina.generalCommissionPct) },
          ]}
          detail={nomina.generalCommissionGoalMet
            ? `Las ventas del equipo ($${formatCurrency(nomina.totalCompanySales)}) alcanzaron el umbral${nomina.thresholdIsCustom ? ' personalizado' : ' de referencia'}. Comisión: ${pct(nomina.generalCommissionPct)} sobre la suma de metas.`
            : `Las ventas del equipo ($${formatCurrency(nomina.totalCompanySales)}) no alcanzaron el umbral${nomina.thresholdIsCustom ? ' personalizado' : ' de referencia'} de $${formatCurrency(nomina.effectiveThreshold ?? nomina.totalGlobalGoals)}. Comisión general: $0.`
          }
        />
      ) : (
        <div className="mn-disabled">
          <span className="material-icons-round">star_border</span>
          <span>La comisión general no está habilitada para tu perfil.</span>
        </div>
      )}

      {/* Notas */}
      {nomina.notes && (
        <div className="mn-notes">
          📝 <strong>Notas:</strong> {nomina.notes}
        </div>
      )}

      <p className="mn-timestamp">
        Calculado: {new Date(nomina.createdAt).toLocaleString('es-ES')}
      </p>
    </div>
  );
}

// ─── Tarjeta de comisión ─────────────────────────────────────
function CommissionCard({ title, icon, met, metLabel, amount, rows, detail }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`mn-card ${met ? 'met' : 'unmet'}`}>
      <div className="mn-card-head" onClick={() => setExpanded(!expanded)}>
        <div className="mn-card-head-left">
          <span className="material-icons-round">{icon}</span>
          <div>
            <div className="mn-card-title">{title}</div>
            <div className="mn-card-status">
              <span className="material-icons-round">{met ? 'check_circle' : 'cancel'}</span>
              {metLabel}
            </div>
          </div>
        </div>
        <div className="mn-card-head-right">
          <div className="mn-card-amount">${formatCurrency(amount)}</div>
          <span className="material-icons-round mn-card-chevron">{expanded ? 'expand_less' : 'expand_more'}</span>
        </div>
      </div>

      {expanded && (
        <div className="mn-card-body">
          {rows.map((r, i) => (
            <div key={i} className="mn-card-row">
              <span className="mn-row-label">{r.label}:</span>
              <span className="mn-row-value">{r.value}</span>
            </div>
          ))}
          <p className="mn-card-detail">💡 {detail}</p>
        </div>
      )}
    </div>
  );
}
