// src/components/PayrollPanel.js
// Panel completo de Nómina para el Owner
import React, { useState, useEffect, useCallback } from 'react';
import { formatCurrency } from '../utils/formatters';
import {
  getAllPayrollConfigs,
  getPayrollConfig,
  savePayrollConfig,
  calculatePayroll,
  calculateAllPayrolls,
  getAllPayrolls,
  getVendorPayrollHistory,
  exportAllPayrollExcel,
  exportAllPayrollPdf,
  exportVendorPayrollExcel,
  exportVendorPayrollPdf,
} from '../api/payrollService';
import { useToast } from './ToastContainer';

// ─── Helpers ───────────────────────────────────────────────
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

// ─── Helper descarga blob ────────────────────────────────────
function downloadBlob(response, fallbackName) {
  const contentDisposition = response.headers?.['content-disposition'];
  let filename = fallbackName;
  if (contentDisposition) {
    const m = contentDisposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i) ||
      contentDisposition.match(/filename\s*=\s*"?([^";]+)"?/i);
    if (m?.[1]) filename = decodeURIComponent(m[1].replace(/"/g, ''));
  }
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const a = document.createElement('a');
  a.href = url; a.setAttribute('download', filename);
  document.body.appendChild(a); a.click(); a.remove();
  window.URL.revokeObjectURL(url);
}

// ─── Componente principal ───────────────────────────────────
export default function PayrollPanel({ vendedores = [] }) {
  const [activeTab, setActiveTab] = useState('nominas'); // 'nominas' | 'config'
  const toast = useToast();

  return (
    <div style={{ padding: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <span className="material-icons-round" style={{ fontSize: '32px', color: '#7c3aed' }}>payments</span>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>Nómina Mensual</h2>
          <p style={{ margin: 0, color: '#6b7280', fontSize: '0.9rem' }}>Gestión de salarios y comisiones</p>
        </div>
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '2px solid #e5e7eb', paddingBottom: '0' }}>
        {[
          { key: 'nominas', label: 'Nóminas', icon: 'receipt_long' },
          { key: 'config', label: 'Configuración', icon: 'settings' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.6rem 1.2rem', border: 'none', cursor: 'pointer',
              fontSize: '0.95rem', fontWeight: 600, borderRadius: '8px 8px 0 0',
              background: activeTab === tab.key ? '#7c3aed' : 'transparent',
              color: activeTab === tab.key ? 'white' : '#6b7280',
              transition: 'all 0.2s',
            }}
          >
            <span className="material-icons-round" style={{ fontSize: '18px' }}>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'nominas' && <NominasTab toast={toast} />}
      {activeTab === 'config' && <ConfigTab vendedores={vendedores} toast={toast} />}
    </div>
  );
}

// ─── Tab Nóminas ────────────────────────────────────────────
function NominasTab({ toast }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [nominas, setNominas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selectedNomina, setSelectedNomina] = useState(null);
  const [historyVendedor, setHistoryVendedor] = useState(null);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [calcNotes, setCalcNotes] = useState('');
  const [generalCommissionThreshold, setGeneralCommissionThreshold] = useState('');

  const fetchNominas = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAllPayrolls(month, year);
      setNominas(res.data || []);
    } catch (err) {
      if (err.response?.status !== 404) {
        toast.error('Error al cargar nóminas');
      } else {
        setNominas([]);
      }
    } finally {
      setLoading(false);
    }
  }, [month, year, toast]);

  useEffect(() => { fetchNominas(); }, [fetchNominas]);

  const handleCalculateAll = async () => {
    if (!window.confirm(`¿Calcular nómina de TODOS los vendedores para ${MESES[month - 1]} ${year}? Esto sobreescribirá nóminas existentes.`)) return;
    setCalculating(true);
    try {
      const threshold = generalCommissionThreshold !== '' ? parseFloat(generalCommissionThreshold) : null;
      const res = await calculateAllPayrolls(month, year, threshold);
      setNominas(res.data || []);
      toast.success(`✅ Nóminas calculadas: ${res.data?.length || 0} vendedores`);
    } catch (err) {
      toast.error('Error al calcular nóminas: ' + (err.response?.data?.message || err.message));
    } finally {
      setCalculating(false);
    }
  };

  const handleCalculateOne = async (vendedorId, vendedorUsername) => {
    if (!window.confirm(`¿Recalcular nómina de ${vendedorUsername} para ${MESES[month - 1]} ${year}?`)) return;
    try {
      const res = await calculatePayroll({
        vendedorId,
        month,
        year,
        notes: calcNotes || `Nómina ${MESES[month - 1]} ${year}`,
      });
      toast.success(`Nómina de ${vendedorUsername} calculada`);
      setSelectedNomina(res.data);
      fetchNominas();
    } catch (err) {
      toast.error('Error al calcular nómina: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleOpenHistory = async (vendedorId) => {
    setHistoryVendedor(vendedorId);
    setLoadingHistory(true);
    try {
      const res = await getVendorPayrollHistory(vendedorId);
      setHistory(res.data || []);
    } catch (err) {
      toast.error('Error al cargar historial');
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleExportAll = async (format) => {
    if (exporting) return;
    setExporting(true);
    try {
      const res = format === 'excel'
        ? await exportAllPayrollExcel(month, year)
        : await exportAllPayrollPdf(month, year);
      const ext = format === 'excel' ? 'xlsx' : 'pdf';
      downloadBlob(res, `nominas_${MESES[month - 1]}_${year}.${ext}`);
      toast.success(`Reporte ${format.toUpperCase()} descargado`);
    } catch (err) {
      toast.error('Error al exportar: ' + (err.response?.data?.message || err.message));
    } finally {
      setExporting(false);
    }
  };

  const handleExportVendor = async (vendedorId, vendedorUsername, format) => {
    if (exporting) return;
    setExporting(true);
    try {
      const res = format === 'excel'
        ? await exportVendorPayrollExcel(vendedorId, month, year)
        : await exportVendorPayrollPdf(vendedorId, month, year);
      const ext = format === 'excel' ? 'xlsx' : 'pdf';
      downloadBlob(res, `nomina_${vendedorUsername}_${MESES[month - 1]}_${year}.${ext}`);
      toast.success(`Nómina de ${vendedorUsername} descargada`);
    } catch (err) {
      toast.error('Error al exportar: ' + (err.response?.data?.message || err.message));
    } finally {
      setExporting(false);
    }
  };

  const years = [];
  for (let y = now.getFullYear() - 2; y <= now.getFullYear() + 1; y++) years.push(y);

  return (
    <div>
      {/* Filtros período */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1.5rem', background: 'white', padding: '1rem', borderRadius: '10px', border: '1px solid #e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="material-icons-round" style={{ color: '#7c3aed' }}>calendar_month</span>
          <select value={month} onChange={e => setMonth(Number(e.target.value))}
            style={{ padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.95rem' }}>
            {MESES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            style={{ padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.95rem' }}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        <input
          type="text"
          placeholder="Notas para el cálculo..."
          value={calcNotes}
          onChange={e => setCalcNotes(e.target.value)}
          style={{ flex: 1, minWidth: '180px', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.9rem' }}
        />

        <input
          type="number"
          placeholder="Umbral personalizado ventas (opcional)"
          value={generalCommissionThreshold}
          onChange={e => setGeneralCommissionThreshold(e.target.value)}
          min="0"
          step="100000"
          title="Dejar vacío para usar la suma de metas de los vendedores"
          style={{ width: '230px', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.9rem' }}
        />

        <button
          onClick={handleCalculateAll}
          disabled={calculating || loading}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem',
            padding: '0.6rem 1.2rem', background: calculating ? '#a78bfa' : '#7c3aed',
            color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer',
            fontWeight: 600, fontSize: '0.9rem',
          }}
        >
          <span className="material-icons-round" style={{ fontSize: '18px' }}>
            {calculating ? 'sync' : 'calculate'}
          </span>
          {calculating ? 'Calculando...' : 'Calcular Todas'}
        </button>

        {/* ✅ Exportación general */}
        <button
          onClick={() => handleExportAll('excel')}
          disabled={exporting || nominas.length === 0}
          title="Descargar Excel de todas las nóminas"
          style={{
            display: 'flex', alignItems: 'center', gap: '0.3rem',
            padding: '0.6rem 1rem',
            background: (exporting || nominas.length === 0) ? '#6ee7b7' : '#10b981',
            color: 'white', border: 'none', borderRadius: '8px',
            cursor: (exporting || nominas.length === 0) ? 'not-allowed' : 'pointer',
            fontWeight: 600, fontSize: '0.85rem',
          }}
        >
          <span className="material-icons-round" style={{ fontSize: '16px' }}>table_chart</span>
          Excel
        </button>
        <button
          onClick={() => handleExportAll('pdf')}
          disabled={exporting || nominas.length === 0}
          title="Descargar PDF de todas las nóminas"
          style={{
            display: 'flex', alignItems: 'center', gap: '0.3rem',
            padding: '0.6rem 1rem',
            background: (exporting || nominas.length === 0) ? '#fca5a5' : '#ef4444',
            color: 'white', border: 'none', borderRadius: '8px',
            cursor: (exporting || nominas.length === 0) ? 'not-allowed' : 'pointer',
            fontWeight: 600, fontSize: '0.85rem',
          }}
        >
          <span className="material-icons-round" style={{ fontSize: '16px' }}>picture_as_pdf</span>
          PDF
        </button>
      </div>

      {/* Listado de nóminas */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>
          <span className="material-icons-round" style={{ fontSize: '48px' }}>hourglass_top</span>
          <p>Cargando nóminas...</p>
        </div>
      ) : nominas.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af', background: 'white', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
          <span className="material-icons-round" style={{ fontSize: '64px' }}>receipt_long</span>
          <p style={{ fontSize: '1rem', marginTop: '1rem' }}>No hay nóminas para {MESES[month - 1]} {year}</p>
          <p style={{ fontSize: '0.85rem' }}>Usa el botón <strong>"Calcular Todas"</strong> para generarlas.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
          {nominas.map(n => (
            <NominaCard
              key={n.id}
              nomina={n}
              onView={() => setSelectedNomina(n)}
              onRecalculate={() => handleCalculateOne(n.vendedorId, n.vendedorUsername)}
              onHistory={() => handleOpenHistory(n.vendedorId)}
              onExportExcel={() => handleExportVendor(n.vendedorId, n.vendedorUsername, 'excel')}
              onExportPdf={() => handleExportVendor(n.vendedorId, n.vendedorUsername, 'pdf')}
              exporting={exporting}
            />
          ))}
        </div>
      )}

      {/* Modal Detalle Nómina */}
      {selectedNomina && (
        <NominaDetailModal
          nomina={selectedNomina}
          onClose={() => setSelectedNomina(null)}
          onRecalculate={() => handleCalculateOne(selectedNomina.vendedorId, selectedNomina.vendedorUsername)}
          onExportExcel={() => handleExportVendor(selectedNomina.vendedorId, selectedNomina.vendedorUsername, 'excel')}
          onExportPdf={() => handleExportVendor(selectedNomina.vendedorId, selectedNomina.vendedorUsername, 'pdf')}
          exporting={exporting}
        />
      )}

      {/* Modal Historial */}
      {historyVendedor && (
        <HistoryModal
          vendedorUsername={nominas.find(n => n.vendedorId === historyVendedor)?.vendedorUsername || ''}
          history={history}
          loading={loadingHistory}
          onClose={() => { setHistoryVendedor(null); setHistory([]); }}
          onView={(n) => { setHistoryVendedor(null); setSelectedNomina(n); }}
        />
      )}
    </div>
  );
}

// ─── Tarjeta resumen de nómina ───────────────────────────────
function NominaCard({ nomina, onView, onRecalculate, onHistory, onExportExcel, onExportPdf, exporting }) {
  const goalColor = nomina.salesGoalMet ? '#10b981' : '#f59e0b';
  const collectColor = nomina.collectionGoalMet ? '#10b981' : '#f59e0b';

  return (
    <div style={{
      background: 'white', borderRadius: '12px', border: '1px solid #e5e7eb',
      boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)', padding: '1rem', color: 'white' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>{nomina.vendedorUsername}</div>
            <div style={{ fontSize: '0.85rem', opacity: 0.85 }}>{MESES[nomina.month - 1]} {nomina.year}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>Total Pago</div>
            <div style={{ fontWeight: 700, fontSize: '1.2rem' }}>${formatCurrency(nomina.totalPayout)}</div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <InfoRow label="Salario Base" value={`$${formatCurrency(nomina.baseSalary)}`} />
          <InfoRow label="Comisiones" value={`$${formatCurrency(nomina.totalCommissions)}`} color="#7c3aed" />
        </div>

        {/* Indicators */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
          <Badge
            icon={nomina.salesGoalMet ? 'check_circle' : 'cancel'}
            label="Meta ventas"
            color={goalColor}
          />
          <Badge
            icon={nomina.collectionGoalMet ? 'check_circle' : 'cancel'}
            label="Meta recaudo"
            color={collectColor}
          />
          {nomina.generalCommissionEnabled && (
            <Badge icon="star" label="Com. general" color={nomina.generalCommissionGoalMet ? '#f59e0b' : '#9ca3af'} />
          )}
        </div>

        {nomina.notes && (
          <p style={{ fontSize: '0.8rem', color: '#6b7280', fontStyle: 'italic', marginBottom: '0.75rem', margin: '0 0 0.75rem' }}>
            📝 {nomina.notes}
          </p>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          <button onClick={onView} style={btnStyle('#7c3aed')}>
            <span className="material-icons-round" style={{ fontSize: '15px' }}>visibility</span> Ver
          </button>
          <button onClick={onRecalculate} style={btnStyle('#6b7280')}>
            <span className="material-icons-round" style={{ fontSize: '15px' }}>calculate</span> Recalc.
          </button>
          <button onClick={onHistory} style={btnStyle('#0ea5e9')}>
            <span className="material-icons-round" style={{ fontSize: '15px' }}>history</span> Hist.
          </button>
          <button onClick={onExportExcel} disabled={exporting} title="Descargar Excel" style={{ ...btnStyle('#10b981'), opacity: exporting ? 0.6 : 1 }}>
            <span className="material-icons-round" style={{ fontSize: '15px' }}>table_chart</span>
          </button>
          <button onClick={onExportPdf} disabled={exporting} title="Descargar PDF" style={{ ...btnStyle('#ef4444'), opacity: exporting ? 0.6 : 1 }}>
            <span className="material-icons-round" style={{ fontSize: '15px' }}>picture_as_pdf</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal Detalle Nómina ────────────────────────────────────
function NominaDetailModal({ nomina, onClose, onRecalculate, onExportExcel, onExportPdf, exporting }) {
  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={{ ...modalStyle, maxWidth: '620px' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)', padding: '1.25rem', color: 'white', borderRadius: '12px 12px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Nómina — {nomina.vendedorUsername}</h3>
            <p style={{ margin: 0, fontSize: '0.85rem', opacity: 0.85 }}>{MESES[nomina.month - 1]} {nomina.year}</p>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', color: 'white', cursor: 'pointer', fontSize: '18px' }}>×</button>
        </div>

        {/* Content */}
        <div style={{ padding: '1.5rem', overflowY: 'auto', maxHeight: '75vh' }}>

          {/* Salario Base */}
          <Section title="💼 Salario Base">
            <Row label="Salario base" value={`$${formatCurrency(nomina.baseSalary)}`} highlight />
          </Section>

          {/* Comisión por ventas */}
          <Section title="📈 Comisión por Ventas">
            <Row label="Meta de ventas" value={`$${formatCurrency(nomina.salesGoalTarget)}`} />
            <Row label="Total vendido" value={`$${formatCurrency(nomina.totalSold)}`} />
            <Row label="¿Cumplió meta?" value={nomina.salesGoalMet ? '✅ Sí' : '❌ No'} color={nomina.salesGoalMet ? '#10b981' : '#ef4444'} />
            <Row label="Porcentaje comisión" value={pct(nomina.salesCommissionPct)} />
            <Row label="Comisión ventas" value={`$${formatCurrency(nomina.salesCommissionAmount)}`} highlight color={nomina.salesGoalMet ? '#10b981' : '#9ca3af'} />
          </Section>

          {/* Comisión por recaudo */}
          <Section title="💰 Comisión por Recaudo">
            <Row label="Vendido mes anterior" value={`$${formatCurrency(nomina.prevMonthTotalSold)}`} />
            <Row label="Total recaudado" value={`$${formatCurrency(nomina.totalCollected)}`} />
            <Row label="% Recaudado" value={formatPct(nomina.collectionPct)} />
            <Row label="Umbral requerido" value={pct(nomina.collectionThresholdPct || 0.8)} />
            <Row label="¿Cumplió meta?" value={nomina.collectionGoalMet ? '✅ Sí' : '❌ No'} color={nomina.collectionGoalMet ? '#10b981' : '#ef4444'} />
            <Row label="Porcentaje comisión" value={pct(nomina.collectionCommissionPct)} />
            <Row label="Comisión recaudo" value={`$${formatCurrency(nomina.collectionCommissionAmount)}`} highlight color={nomina.collectionGoalMet ? '#10b981' : '#9ca3af'} />
          </Section>

          {/* Comisión general */}
          <Section title="⭐ Comisión General">
            <Row label="Habilitada" value={nomina.generalCommissionEnabled ? '✅ Sí' : '❌ No'} color={nomina.generalCommissionEnabled ? '#10b981' : '#ef4444'} />
            {nomina.generalCommissionEnabled && (
              <>
                <Row label="Ventas empresa del mes" value={`$${formatCurrency(nomina.totalCompanySales)}`} />
                <Row
                  label={nomina.thresholdIsCustom ? '🎯 Umbral personalizado (Owner)' : '📊 Umbral de referencia (suma metas)'}
                  value={`$${formatCurrency(nomina.effectiveThreshold ?? nomina.totalGlobalGoals)}`}
                />
                <Row label="Estado del umbral" value={nomina.generalCommissionGoalMet ? '✅ Alcanzado' : '❌ No alcanzado'} color={nomina.generalCommissionGoalMet ? '#10b981' : '#ef4444'} />
                <Row label="Porcentaje comisión" value={pct(nomina.generalCommissionPct)} />
                <Row label="Comisión general" value={`$${formatCurrency(nomina.generalCommissionGoalMet ? nomina.generalCommissionAmount : 0)}`} highlight color={nomina.generalCommissionGoalMet ? '#f59e0b' : '#9ca3af'} />
              </>
            )}
          </Section>

          {/* Totales */}
          <div style={{ background: 'linear-gradient(135deg, #f5f3ff, #ede9fe)', borderRadius: '10px', padding: '1.25rem', marginTop: '1rem', border: '2px solid #c4b5fd' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontWeight: 600, color: '#5b21b6' }}>Total Comisiones:</span>
              <span style={{ fontWeight: 700, fontSize: '1.1rem', color: '#7c3aed' }}>${formatCurrency(nomina.totalCommissions)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #c4b5fd', paddingTop: '0.75rem' }}>
              <span style={{ fontWeight: 700, fontSize: '1.1rem', color: '#5b21b6' }}>TOTAL A PAGAR:</span>
              <span style={{ fontWeight: 800, fontSize: '1.4rem', color: '#7c3aed' }}>${formatCurrency(nomina.totalPayout)}</span>
            </div>
          </div>

          {nomina.notes && (
            <p style={{ marginTop: '1rem', padding: '0.75rem', background: '#f9fafb', borderRadius: '8px', fontSize: '0.9rem', color: '#4b5563', border: '1px solid #e5e7eb' }}>
              📝 <strong>Notas:</strong> {nomina.notes}
            </p>
          )}

          <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.75rem' }}>
            Calculado: {new Date(nomina.createdAt).toLocaleString('es-ES')}
            {nomina.updatedAt !== nomina.createdAt && ` · Actualizado: ${new Date(nomina.updatedAt).toLocaleString('es-ES')}`}
          </p>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap' }}>
            <button onClick={onRecalculate} style={{ ...btnStyle('#7c3aed'), flex: 1, justifyContent: 'center', padding: '0.75rem' }}>
              <span className="material-icons-round" style={{ fontSize: '18px' }}>calculate</span> Recalcular
            </button>
            <button onClick={onExportExcel} disabled={exporting} title="Descargar Excel" style={{ ...btnStyle('#10b981'), padding: '0.75rem 1rem', opacity: exporting ? 0.6 : 1 }}>
              <span className="material-icons-round" style={{ fontSize: '18px' }}>table_chart</span> Excel
            </button>
            <button onClick={onExportPdf} disabled={exporting} title="Descargar PDF" style={{ ...btnStyle('#ef4444'), padding: '0.75rem 1rem', opacity: exporting ? 0.6 : 1 }}>
              <span className="material-icons-round" style={{ fontSize: '18px' }}>picture_as_pdf</span> PDF
            </button>
            <button onClick={onClose} style={{ ...btnStyle('#6b7280'), padding: '0.75rem 1.25rem' }}>
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Modal Historial ─────────────────────────────────────────
function HistoryModal({ vendedorUsername, history, loading, onClose, onView }) {
  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={{ ...modalStyle, maxWidth: '520px' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '1.25rem', background: '#1e1b4b', color: 'white', borderRadius: '12px 12px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Historial — {vendedorUsername}</h3>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', color: 'white', cursor: 'pointer', fontSize: '18px' }}>×</button>
        </div>
        <div style={{ padding: '1.25rem', maxHeight: '70vh', overflowY: 'auto' }}>
          {loading ? (
            <p style={{ textAlign: 'center', color: '#9ca3af' }}>Cargando...</p>
          ) : history.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#9ca3af' }}>No hay historial disponible</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {history.map(n => (
                <div key={n.id} style={{ background: '#f9fafb', borderRadius: '10px', padding: '0.875rem', border: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{MESES[n.month - 1]} {n.year}</div>
                    <div style={{ fontSize: '0.85rem', color: '#7c3aed', fontWeight: 700 }}>${formatCurrency(n.totalPayout)}</div>
                    {n.notes && <div style={{ fontSize: '0.75rem', color: '#9ca3af', fontStyle: 'italic' }}>{n.notes}</div>}
                  </div>
                  <button onClick={() => onView(n)} style={btnStyle('#7c3aed')}>
                    <span className="material-icons-round" style={{ fontSize: '15px' }}>visibility</span> Ver
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tab Configuración ───────────────────────────────────────
function ConfigTab({ vendedores, toast }) {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingConfig, setEditingConfig] = useState(null);
  const [saving, setSaving] = useState(false);

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAllPayrollConfigs();
      setConfigs(res.data || []);
    } catch (err) {
      if (err.response?.status !== 404) toast.error('Error al cargar configuraciones');
      setConfigs([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchConfigs(); }, [fetchConfigs]);

  const handleEdit = async (vendedorId) => {
    try {
      const res = await getPayrollConfig(vendedorId);
      setEditingConfig(res.data);
    } catch (err) {
      // No config yet — create a blank one
      const v = vendedores.find(v => v.id === vendedorId);
      setEditingConfig({
        vendedorId,
        vendedorUsername: v?.username || vendedorId,
        baseSalary: 1500000,
        salesCommissionPct: 0.015,
        collectionCommissionPct: 0.03,
        collectionThresholdPct: 0.8,
        generalCommissionEnabled: false,
        generalCommissionPct: 0.02,
      });
    }
  };

  const handleSave = async (configData) => {
    setSaving(true);
    try {
      await savePayrollConfig(configData);
      toast.success('Configuración guardada exitosamente');
      setEditingConfig(null);
      fetchConfigs();
    } catch (err) {
      toast.error('Error al guardar: ' + (err.response?.data?.message || err.message));
    } finally {
      setSaving(false);
    }
  };

  // Build list — merge vendedores with existing configs
  const vendedoresList = vendedores.filter(v => v.active !== false);
  const configMap = {};
  configs.forEach(c => { configMap[c.vendedorId] = c; });

  return (
    <div>
      <p style={{ color: '#6b7280', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
        Configura el salario base y porcentajes de comisión de cada vendedora. Los cambios aplican en el próximo cálculo de nómina.
      </p>

      {loading ? (
        <p style={{ color: '#9ca3af' }}>Cargando configuraciones...</p>
      ) : (
        <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
          {vendedoresList.map(v => {
            const cfg = configMap[v.id];
            return (
              <div key={v.id} style={{ background: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                <div style={{ background: cfg ? '#f5f3ff' : '#f9fafb', padding: '0.875rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e5e7eb' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className="material-icons-round" style={{ color: '#7c3aed', fontSize: '20px' }}>person</span>
                    <span style={{ fontWeight: 600 }}>{v.username}</span>
                  </div>
                  <button onClick={() => handleEdit(v.id)} style={btnStyle('#7c3aed')}>
                    <span className="material-icons-round" style={{ fontSize: '15px' }}>edit</span>
                    {cfg ? 'Editar' : 'Configurar'}
                  </button>
                </div>
                {cfg ? (
                  <div style={{ padding: '0.875rem 1rem' }}>
                    <Row label="Salario base" value={`$${formatCurrency(cfg.baseSalary)}`} />
                    <Row label="Comisión ventas" value={pct(cfg.salesCommissionPct)} />
                    <Row label="Comisión recaudo" value={pct(cfg.collectionCommissionPct)} />
                    <Row label="Umbral recaudo" value={pct(cfg.collectionThresholdPct)} />
                    <Row label="Com. general" value={cfg.generalCommissionEnabled ? `${pct(cfg.generalCommissionPct)} ✅` : '❌ Deshabilitada'} />
                  </div>
                ) : (
                  <div style={{ padding: '1rem', textAlign: 'center', color: '#9ca3af', fontSize: '0.9rem' }}>
                    <span className="material-icons-round" style={{ fontSize: '32px', display: 'block', marginBottom: '0.25rem' }}>settings</span>
                    Sin configuración — usa valores por defecto
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editingConfig && (
        <ConfigEditModal
          config={editingConfig}
          onSave={handleSave}
          onClose={() => setEditingConfig(null)}
          saving={saving}
        />
      )}
    </div>
  );
}

// ─── Modal Editar Config ─────────────────────────────────────
function ConfigEditModal({ config, onSave, onClose, saving }) {
  const [form, setForm] = useState({
    vendedorId: config.vendedorId,
    baseSalary: config.baseSalary ?? 1500000,
    salesCommissionPct: ((config.salesCommissionPct ?? 0.015) * 100).toFixed(3),
    collectionCommissionPct: ((config.collectionCommissionPct ?? 0.03) * 100).toFixed(3),
    collectionThresholdPct: ((config.collectionThresholdPct ?? 0.8) * 100).toFixed(1),
    generalCommissionEnabled: config.generalCommissionEnabled ?? false,
    generalCommissionPct: ((config.generalCommissionPct ?? 0.02) * 100).toFixed(3),
  });

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      vendedorId: form.vendedorId,
      baseSalary: parseFloat(form.baseSalary),
      salesCommissionPct: parseFloat(form.salesCommissionPct) / 100,
      collectionCommissionPct: parseFloat(form.collectionCommissionPct) / 100,
      collectionThresholdPct: parseFloat(form.collectionThresholdPct) / 100,
      generalCommissionEnabled: form.generalCommissionEnabled,
      generalCommissionPct: parseFloat(form.generalCommissionPct) / 100,
    });
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={{ ...modalStyle, maxWidth: '480px' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '1.25rem', background: '#7c3aed', color: 'white', borderRadius: '12px 12px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Configurar Nómina — {config.vendedorUsername}</h3>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', color: 'white', cursor: 'pointer', fontSize: '18px' }}>×</button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: '1.5rem' }}>
          <FieldGroup label="Salario Base ($)">
            <input type="number" value={form.baseSalary} onChange={e => set('baseSalary', e.target.value)} style={inputStyle} min="0" step="1000" required />
          </FieldGroup>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <FieldGroup label="Comisión ventas (%)">
              <input type="number" value={form.salesCommissionPct} onChange={e => set('salesCommissionPct', e.target.value)} style={inputStyle} min="0" max="100" step="0.001" required />
              <small style={{ color: '#9ca3af' }}>Solo si cumplió meta</small>
            </FieldGroup>
            <FieldGroup label="Comisión recaudo (%)">
              <input type="number" value={form.collectionCommissionPct} onChange={e => set('collectionCommissionPct', e.target.value)} style={inputStyle} min="0" max="100" step="0.001" required />
              <small style={{ color: '#9ca3af' }}>Si recauda ≥ umbral</small>
            </FieldGroup>
          </div>

          <FieldGroup label="Umbral de recaudo requerido (%)">
            <input type="number" value={form.collectionThresholdPct} onChange={e => set('collectionThresholdPct', e.target.value)} style={inputStyle} min="0" max="100" step="0.1" required />
            <small style={{ color: '#9ca3af' }}>% de lo vendido el mes anterior que debe recaudar</small>
          </FieldGroup>

          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '1rem', marginTop: '0.5rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', marginBottom: '0.75rem' }}>
              <input
                type="checkbox"
                checked={form.generalCommissionEnabled}
                onChange={e => set('generalCommissionEnabled', e.target.checked)}
                style={{ width: '18px', height: '18px', accentColor: '#7c3aed', cursor: 'pointer' }}
              />
              <span style={{ fontWeight: 600, color: '#374151' }}>Habilitar Comisión General</span>
            </label>
            {form.generalCommissionEnabled && (
              <FieldGroup label="Comisión general (%)">
                <input type="number" value={form.generalCommissionPct} onChange={e => set('generalCommissionPct', e.target.value)} style={inputStyle} min="0" max="100" step="0.001" required />
                <small style={{ color: '#9ca3af' }}>Aplicada sobre la suma de todas las metas globales</small>
              </FieldGroup>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button type="submit" disabled={saving} style={{ ...btnStyle('#7c3aed'), flex: 1, justifyContent: 'center', padding: '0.75rem', fontSize: '0.95rem' }}>
              <span className="material-icons-round" style={{ fontSize: '18px' }}>save</span>
              {saving ? 'Guardando...' : 'Guardar Configuración'}
            </button>
            <button type="button" onClick={onClose} style={{ ...btnStyle('#6b7280'), padding: '0.75rem 1.25rem' }}>Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Helpers de UI ───────────────────────────────────────────
function InfoRow({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{label}</div>
      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{value}</div>
    </div>
  );
}

function Badge({ icon, label, color }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '20px', background: color + '1a', color, fontWeight: 600, border: `1px solid ${color}33` }}>
      <span className="material-icons-round" style={{ fontSize: '13px' }}>{icon}</span>
      {label}
    </span>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: '1rem', background: '#f9fafb', borderRadius: '8px', padding: '0.875rem', border: '1px solid #e5e7eb' }}>
      <h4 style={{ margin: '0 0 0.6rem', fontSize: '0.9rem', color: '#374151', fontWeight: 700 }}>{title}</h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>{children}</div>
    </div>
  );
}

function Row({ label, value, highlight, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.88rem' }}>
      <span style={{ color: '#6b7280' }}>{label}:</span>
      <span style={{ fontWeight: highlight ? 700 : 500, color: color || (highlight ? '#111827' : '#374151') }}>{value}</span>
    </div>
  );
}

function FieldGroup({ label, children }) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#374151', marginBottom: '0.4rem' }}>{label}</label>
      {children}
    </div>
  );
}

// ─── Estilos ─────────────────────────────────────────────────
const inputStyle = {
  width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db',
  borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box',
};

function btnStyle(bg) {
  return {
    display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
    padding: '0.4rem 0.8rem', background: bg, color: 'white',
    border: 'none', borderRadius: '7px', cursor: 'pointer',
    fontSize: '0.82rem', fontWeight: 600, transition: 'opacity 0.15s',
  };
}

const overlayStyle = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 1000, padding: '1rem',
};

const modalStyle = {
  background: 'white', borderRadius: '12px', width: '100%',
  boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
};

