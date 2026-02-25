// src/components/MiNominaPanel.js
// Panel de Nómina propia — solo lectura para Vendedora
import React, { useState, useEffect, useCallback } from 'react';
import { formatCurrency } from '../utils/formatters';
import { getMyPayroll, getMyPayrollHistory, exportMyPayrollExcel, exportMyPayrollPdf } from '../api/payrollService';
import { useToast } from './ToastContainer';

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
    <div style={{ padding: '1.5rem', maxWidth: '680px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <span className="material-icons-round" style={{ fontSize: '36px', color: '#7c3aed' }}>payments</span>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>Mi Nómina</h2>
          <p style={{ margin: 0, color: '#6b7280', fontSize: '0.9rem' }}>Consulta tu salario y comisiones mensuales</p>
        </div>
      </div>

      {/* Selector de período */}
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1.5rem', background: 'white', padding: '1rem', borderRadius: '10px', border: '1px solid #e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
        <span className="material-icons-round" style={{ color: '#7c3aed' }}>calendar_month</span>
        <select value={month} onChange={e => setMonth(Number(e.target.value))}
          style={{ padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.95rem' }}>
          {MESES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
        </select>
        <select value={year} onChange={e => setYear(Number(e.target.value))}
          style={{ padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.95rem' }}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        {/* ✅ Botones de descarga — solo si hay nómina cargada */}
        {nomina && (
          <>
            <button
              onClick={() => handleExport('excel')}
              disabled={exporting}
              title="Descargar mi nómina en Excel"
              style={{
                display: 'flex', alignItems: 'center', gap: '0.3rem',
                padding: '0.5rem 0.9rem',
                background: exporting ? '#6ee7b7' : '#10b981',
                color: 'white', border: 'none', borderRadius: '8px',
                cursor: exporting ? 'not-allowed' : 'pointer',
                fontWeight: 600, fontSize: '0.85rem',
              }}
            >
              <span className="material-icons-round" style={{ fontSize: '16px' }}>table_chart</span>
              Excel
            </button>
            <button
              onClick={() => handleExport('pdf')}
              disabled={exporting}
              title="Descargar mi nómina en PDF"
              style={{
                display: 'flex', alignItems: 'center', gap: '0.3rem',
                padding: '0.5rem 0.9rem',
                background: exporting ? '#fca5a5' : '#ef4444',
                color: 'white', border: 'none', borderRadius: '8px',
                cursor: exporting ? 'not-allowed' : 'pointer',
                fontWeight: 600, fontSize: '0.85rem',
              }}
            >
              <span className="material-icons-round" style={{ fontSize: '16px' }}>picture_as_pdf</span>
              PDF
            </button>
          </>
        )}

        <button
          onClick={() => { setShowHistory(!showHistory); if (!showHistory && history.length === 0) fetchHistory(); }}
          style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', background: showHistory ? '#7c3aed' : '#f3f4f6', color: showHistory ? 'white' : '#374151', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}
        >
          <span className="material-icons-round" style={{ fontSize: '18px' }}>history</span>
          Historial
        </button>
      </div>

      {/* Historial */}
      {showHistory && (
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '1.25rem', marginBottom: '1.5rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span className="material-icons-round" style={{ fontSize: '20px', color: '#7c3aed' }}>history</span>
            Historial de Nóminas
          </h3>
          {loadingHistory ? (
            <p style={{ color: '#9ca3af', textAlign: 'center' }}>Cargando...</p>
          ) : history.length === 0 ? (
            <p style={{ color: '#9ca3af', textAlign: 'center' }}>No hay nóminas anteriores registradas</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {history.map(h => (
                <div key={h.id}
                  onClick={() => { setMonth(h.month); setYear(h.year); setShowHistory(false); }}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', borderRadius: '8px', background: '#f9fafb', border: '1px solid #e5e7eb', cursor: 'pointer', transition: 'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f0f4ff'}
                  onMouseLeave={e => e.currentTarget.style.background = '#f9fafb'}
                >
                  <div>
                    <span style={{ fontWeight: 600 }}>{MESES[h.month - 1]} {h.year}</span>
                    {h.notes && <span style={{ fontSize: '0.8rem', color: '#9ca3af', marginLeft: '0.5rem' }}>— {h.notes}</span>}
                  </div>
                  <span style={{ fontWeight: 700, color: '#7c3aed', fontSize: '1rem' }}>${formatCurrency(h.totalPayout)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Estado principal */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>
          <span className="material-icons-round" style={{ fontSize: '48px', display: 'block', marginBottom: '0.5rem' }}>hourglass_top</span>
          Cargando nómina...
        </div>
      ) : notFound ? (
        <div style={{ textAlign: 'center', padding: '3rem', background: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', color: '#6b7280' }}>
          <span className="material-icons-round" style={{ fontSize: '64px', display: 'block', color: '#d1d5db', marginBottom: '1rem' }}>receipt_long</span>
          <h3 style={{ fontWeight: 600, color: '#374151' }}>Nómina no disponible</h3>
          <p>El Owner aún no ha calculado tu nómina para <strong>{MESES[month - 1]} {year}</strong>.</p>
          <p style={{ fontSize: '0.85rem' }}>Consulta a tu supervisor para más información.</p>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Resumen total */}
      <div style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)', borderRadius: '14px', padding: '1.5rem', color: 'white', textAlign: 'center', boxShadow: '0 4px 16px rgba(124,58,237,0.3)' }}>
        <p style={{ margin: 0, opacity: 0.85, fontSize: '0.9rem' }}>{MESES[nomina.month - 1]} {nomina.year}</p>
        <div style={{ fontSize: '2.5rem', fontWeight: 800, margin: '0.25rem 0' }}>${formatCurrency(nomina.totalPayout)}</div>
        <p style={{ margin: 0, opacity: 0.85, fontSize: '0.9rem' }}>Total a recibir este mes</p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.25)' }}>
          <div>
            <div style={{ opacity: 0.75, fontSize: '0.8rem' }}>Salario base</div>
            <div style={{ fontWeight: 700 }}>${formatCurrency(nomina.baseSalary)}</div>
          </div>
          <div>
            <div style={{ opacity: 0.75, fontSize: '0.8rem' }}>Total comisiones</div>
            <div style={{ fontWeight: 700 }}>${formatCurrency(nomina.totalCommissions)}</div>
          </div>
        </div>
      </div>

      {/* Comisión por ventas */}
      <CommissionCard
        title="Comisión por Ventas"
        icon="trending_up"
        met={nomina.salesGoalMet}
        metLabel="Meta de ventas cumplida"
        amount={nomina.salesCommissionAmount}
        rows={[
          { label: 'Meta mensual', value: `$${formatCurrency(nomina.salesGoalTarget)}` },
          { label: 'Total vendido', value: `$${formatCurrency(nomina.totalSold)}` },
          { label: 'Comisión aplicada', value: pct(nomina.salesCommissionPct) },
        ]}
        detail={nomina.salesGoalMet
          ? `Felicitaciones, cumpliste tu meta. Comisión: ${pct(nomina.salesCommissionPct)} sobre $${formatCurrency(nomina.totalSold)}`
          : `Aún no alcanzaste la meta de $${formatCurrency(nomina.salesGoalTarget)}. Vendiste $${formatCurrency(nomina.totalSold)}.`
        }
      />

      {/* Comisión por recaudo */}
      <CommissionCard
        title="Comisión por Recaudo"
        icon="account_balance_wallet"
        met={nomina.collectionGoalMet}
        metLabel="Meta de recaudo cumplida"
        amount={nomina.collectionCommissionAmount}
        rows={[
          { label: 'Vendido mes anterior', value: `$${formatCurrency(nomina.prevMonthTotalSold)}` },
          { label: 'Total recaudado', value: `$${formatCurrency(nomina.totalCollected)}` },
          { label: '% Recaudado', value: formatPct(nomina.collectionPct) },
          { label: 'Comisión aplicada', value: pct(nomina.collectionCommissionPct) },
        ]}
        detail={nomina.collectionGoalMet
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
        <div style={{ background: '#f9fafb', borderRadius: '10px', padding: '1rem', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#9ca3af' }}>
          <span className="material-icons-round" style={{ fontSize: '22px' }}>star_border</span>
          <span style={{ fontSize: '0.9rem' }}>La comisión general no está habilitada para tu perfil.</span>
        </div>
      )}

      {/* Notas */}
      {nomina.notes && (
        <div style={{ background: '#f0f9ff', borderRadius: '10px', padding: '1rem', border: '1px solid #bae6fd', fontSize: '0.9rem', color: '#0c4a6e' }}>
          📝 <strong>Notas:</strong> {nomina.notes}
        </div>
      )}

      <p style={{ fontSize: '0.75rem', color: '#9ca3af', textAlign: 'center' }}>
        Calculado: {new Date(nomina.createdAt).toLocaleString('es-ES')}
      </p>
    </div>
  );
}

// ─── Tarjeta de comisión ─────────────────────────────────────
function CommissionCard({ title, icon, met, metLabel, amount, rows, detail }) {
  const [expanded, setExpanded] = useState(false);
  const color = met ? '#10b981' : '#f59e0b';

  return (
    <div style={{ background: 'white', borderRadius: '12px', border: `1px solid ${color}33`, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: met ? '#f0fdf4' : '#fffbeb' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span className="material-icons-round" style={{ color, fontSize: '22px' }}>{icon}</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#111827' }}>{title}</div>
            <div style={{ fontSize: '0.8rem', color }}>
              <span className="material-icons-round" style={{ fontSize: '13px', verticalAlign: 'middle' }}>{met ? 'check_circle' : 'cancel'}</span>
              {' '}{metLabel}
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 800, fontSize: '1.1rem', color: met ? '#059669' : '#d97706' }}>${formatCurrency(amount)}</div>
          <span className="material-icons-round" style={{ fontSize: '18px', color: '#9ca3af' }}>{expanded ? 'expand_less' : 'expand_more'}</span>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: '1rem', borderTop: `1px solid ${color}22` }}>
          {rows.map((r, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', marginBottom: '0.35rem' }}>
              <span style={{ color: '#6b7280' }}>{r.label}:</span>
              <span style={{ fontWeight: 600, color: '#374151' }}>{r.value}</span>
            </div>
          ))}
          <p style={{ fontSize: '0.82rem', color: '#6b7280', marginTop: '0.75rem', padding: '0.6rem', background: '#f9fafb', borderRadius: '6px', margin: '0.75rem 0 0' }}>
            💡 {detail}
          </p>
        </div>
      )}
    </div>
  );
}

