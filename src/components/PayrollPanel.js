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
import { useConfirm } from './ConfirmDialog';
import { EXPORT_FORMATS } from './ExportButton';
import { avatarTone, avatarInitials } from '../utils/avatarTone';
import '../styles/areas/PayrollPanel.css';

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

// ─── Contenido de botón de exportación ───────────────────────
// Mismo marcado que ExportButton: icono del formato (o spinner mientras exporta) y etiqueta;
// mientras carga, la etiqueta normal queda invisible debajo del texto de carga para que el botón
// no se encoja. El <button> sigue en este archivo con su mismo onClick/disabled/title.
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

// Avatar de iniciales de la vendedora (tono determinista por nombre)
function VendorAvatar({ name, size = '' }) {
  return (
    <span className={`ui-avatar${size ? ` ui-avatar--${size}` : ''} ui-avatar--${avatarTone(name)}`} aria-hidden="true">
      {avatarInitials(name)}
    </span>
  );
}

// ─── Componente principal ───────────────────────────────────
export default function PayrollPanel({ vendedores = [] }) {
  const [activeTab, setActiveTab] = useState('nominas'); // 'nominas' | 'config'
  const toast = useToast();
  const askConfirm = useConfirm();

  return (
    <div className="prl">
      {/* Header */}
      <header className="ui-page-header prl-header">
        <div className="ui-page-heading">
          <h2 className="ui-page-title">
            <span className="material-icons-round" aria-hidden="true">payments</span>
            Nómina Mensual
          </h2>
          <p className="ui-page-desc">Gestión de salarios y comisiones</p>
        </div>
      </header>

      {/* Sub-tabs */}
      <div className="ui-tabs prl-tabs" role="tablist" aria-label="Secciones de nómina">
        {[
          { key: 'nominas', label: 'Nóminas', icon: 'receipt_long' },
          { key: 'config', label: 'Configuración', icon: 'settings' },
        ].map(tab => (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`ui-tab ${activeTab === tab.key ? 'is-active' : ''}`}
          >
            <span className="material-icons-round" aria-hidden="true">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'nominas' && <NominasTab toast={toast} askConfirm={askConfirm} />}
      {activeTab === 'config' && <ConfigTab vendedores={vendedores} toast={toast} />}
    </div>
  );
}

// ─── Tab Nóminas ────────────────────────────────────────────
function NominasTab({ toast, askConfirm }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [nominas, setNominas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [exporting, setExporting] = useState(false);
  // Qué botón inició la exportación: 'all:excel' | 'all:pdf' (barra superior),
  // 'card:excel:<id>' | 'card:pdf:<id>' (tarjeta de esa nómina) y 'modal:excel:<id>' |
  // 'modal:pdf:<id>' (detalle). Solo ese muestra la carga; "exporting" sigue siendo la única
  // guarda y el disabled de todos.
  const [exportingKey, setExportingKey] = useState(null);
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

  useEffect(() => { if (!exporting) setExportingKey(null); }, [exporting]);

  const exportBusy = (key) => exporting && exportingKey === key;

  const handleCalculateAll = async () => {
    const ok = await askConfirm({
      title: 'Calcular nómina de todos',
      message: `Se calculará la nómina de TODOS los vendedores para ${MESES[month - 1]} ${year}. Esto sobreescribirá las nóminas existentes de ese mes. ¿Continuar?`,
      confirmText: 'Calcular',
      cancelText: 'Cancelar'
    });
    if (!ok) return;
    setCalculating(true);
    try {
      const threshold = generalCommissionThreshold !== '' ? parseFloat(generalCommissionThreshold) : null;
      const res = await calculateAllPayrolls(month, year, threshold);
      setNominas(res.data || []);
      toast.success(`Nóminas calculadas: ${res.data?.length || 0} vendedores`);
    } catch (err) {
      toast.error('Error al calcular nóminas: ' + (err.response?.data?.message || err.message));
    } finally {
      setCalculating(false);
    }
  };

  const handleCalculateOne = async (vendedorId, vendedorUsername) => {
    const ok = await askConfirm({
      title: 'Recalcular nómina',
      message: `¿Recalcular la nómina de ${vendedorUsername} para ${MESES[month - 1]} ${year}?`,
      confirmText: 'Recalcular',
      cancelText: 'Cancelar'
    });
    if (!ok) return;
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
    <div className="prl-tab-panel">
      {/* Filtros período */}
      <div className="prl-toolbar">
        <div className="prl-period">
          <span className="ui-icon-tile ui-icon-tile--primary prl-period-icon" aria-hidden="true">
            <span className="material-icons-round">calendar_month</span>
          </span>
          <select className="ui-select prl-select" aria-label="Mes" value={month} onChange={e => setMonth(Number(e.target.value))}>
            {MESES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
          <select className="ui-select prl-select" aria-label="Año" value={year} onChange={e => setYear(Number(e.target.value))}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        <input
          type="text"
          className="ui-input prl-notes-input"
          aria-label="Notas para el cálculo"
          placeholder="Notas para el cálculo..."
          value={calcNotes}
          onChange={e => setCalcNotes(e.target.value)}
        />

        <input
          type="number"
          className="ui-input prl-threshold-input"
          aria-label="Umbral personalizado ventas (opcional)"
          placeholder="Umbral personalizado ventas (opcional)"
          value={generalCommissionThreshold}
          onChange={e => setGeneralCommissionThreshold(e.target.value)}
          min="0"
          step="100000"
          title="Dejar vacío para usar la suma de metas de los vendedores"
        />

        <div className="prl-toolbar-actions">
          <button
            type="button"
            className="ui-btn ui-btn--primary"
            onClick={handleCalculateAll}
            disabled={calculating || loading}
          >
            {calculating
              ? <span className="ui-spinner" aria-hidden="true"></span>
              : <span className="material-icons-round" aria-hidden="true">calculate</span>}
            {calculating ? 'Calculando...' : 'Calcular Todas'}
          </button>

          {/* Exportación general: Excel verde, PDF rojo; solo el pulsado muestra la carga */}
          <button
            type="button"
            className={`ui-btn ui-btn--excel${exportBusy('all:excel') ? ' is-loading' : ''}`}
            aria-busy={exportBusy('all:excel') || undefined}
            onClickCapture={() => setExportingKey('all:excel')}
            onClick={() => handleExportAll('excel')}
            disabled={exporting || nominas.length === 0}
            title="Descargar Excel de todas las nóminas"
          >
            <ExportButtonContent kind="excel" busy={exportBusy('all:excel')} label="Excel" />
          </button>
          <button
            type="button"
            className={`ui-btn ui-btn--pdf${exportBusy('all:pdf') ? ' is-loading' : ''}`}
            aria-busy={exportBusy('all:pdf') || undefined}
            onClickCapture={() => setExportingKey('all:pdf')}
            onClick={() => handleExportAll('pdf')}
            disabled={exporting || nominas.length === 0}
            title="Descargar PDF de todas las nóminas"
          >
            <ExportButtonContent kind="pdf" busy={exportBusy('all:pdf')} label="PDF" />
          </button>
        </div>
      </div>

      {/* Listado de nóminas */}
      {loading ? (
        <div className="prl-loading" aria-busy="true">
          <div className="ui-loading prl-state" role="status">
            <span className="ui-spinner" aria-hidden="true"></span>
            <p>Cargando nóminas...</p>
          </div>
          {/* Esqueletos con la forma de las tarjetas de nómina */}
          <div className="prl-grid" aria-hidden="true">
            {[0, 1, 2].map(i => (
              <div key={i} className="prl-card prl-card--skeleton">
                <div className="prl-card-head">
                  <div className="prl-card-identity">
                    <span className="ui-skeleton ui-skeleton--circle prl-skeleton-avatar" />
                    <div className="ui-skeleton-stack prl-skeleton-heading">
                      <span className="ui-skeleton ui-skeleton--title prl-skeleton-title" />
                      <span className="ui-skeleton ui-skeleton--text prl-skeleton-sub" />
                    </div>
                  </div>
                  <span className="ui-skeleton prl-skeleton-total" />
                </div>
                <div className="prl-card-body">
                  <span className="ui-skeleton ui-skeleton--block" />
                  <span className="ui-skeleton ui-skeleton--text prl-skeleton-sub" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : nominas.length === 0 ? (
        <div className="ui-empty prl-state">
          <span className="material-icons-round ui-empty-icon" aria-hidden="true">receipt_long</span>
          <p className="ui-empty-title">No hay nóminas para {MESES[month - 1]} {year}</p>
          <p className="ui-empty-text">Usa el botón <strong>"Calcular Todas"</strong> para generarlas.</p>
        </div>
      ) : (
        <div className="prl-grid ui-stagger">
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
              exportingKey={exportingKey}
              onExportKey={setExportingKey}
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
          exportingKey={exportingKey}
          onExportKey={setExportingKey}
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
function NominaCard({ nomina, onView, onRecalculate, onHistory, onExportExcel, onExportPdf, exporting, exportingKey, onExportKey }) {
  const goalTone = nomina.salesGoalMet ? 'success' : 'warning';
  const collectTone = nomina.collectionGoalMet ? 'success' : 'warning';
  // Clave propia de cada botón de esta tarjeta: solo el pulsado muestra la carga
  const excelKey = `card:excel:${nomina.id}`;
  const pdfKey = `card:pdf:${nomina.id}`;
  const excelBusy = exporting && exportingKey === excelKey;
  const pdfBusy = exporting && exportingKey === pdfKey;
  const hasCommissions = Number(nomina.totalCommissions) > 0;

  return (
    <article className="prl-card">
      {/* Header */}
      <div className="prl-card-head">
        <div className="prl-card-identity">
          <VendorAvatar name={nomina.vendedorUsername} />
          <div className="prl-card-heading">
            <h3 className="prl-card-title">{nomina.vendedorUsername}</h3>
            <p className="prl-card-subtitle">{MESES[nomina.month - 1]} {nomina.year}</p>
          </div>
        </div>
        <div className="prl-card-total">
          <span className="prl-card-total-label">Total Pago</span>
          <span className="prl-card-total-value">${formatCurrency(nomina.totalPayout)}</span>
        </div>
      </div>

      {/* Body */}
      <div className="prl-card-body">
        <div className="prl-info-grid">
          <InfoRow label="Salario Base" value={`$${formatCurrency(nomina.baseSalary)}`} icon="work" tone="primary" />
          <InfoRow
            label="Comisiones"
            value={`$${formatCurrency(nomina.totalCommissions)}`}
            icon="trending_up"
            tone="success"
            valueClassName={hasCommissions ? 'ui-text-success' : ''}
          />
        </div>

        {/* Indicators */}
        <div className="prl-badges">
          {nomina.salesCommissionByGoal === false ? (
            <Badge icon="bolt" label="Ventas directa" tone="primary" />
          ) : (
            <Badge icon={nomina.salesGoalMet ? 'check_circle' : 'cancel'} label="Meta ventas" tone={goalTone} />
          )}
          {nomina.collectionCommissionByGoal === false ? (
            <Badge icon="bolt" label="Recaudo directo" tone="primary" />
          ) : (
            <Badge icon={nomina.collectionGoalMet ? 'check_circle' : 'cancel'} label="Meta recaudo" tone={collectTone} />
          )}
          {nomina.generalCommissionEnabled && (
            <Badge icon="star" label="Com. general" tone={nomina.generalCommissionGoalMet ? 'success' : 'neutral'} />
          )}
        </div>

        {nomina.notes && (
          <p className="prl-card-notes">
            <span className="material-icons-round" aria-hidden="true">notes</span>
            <span>{nomina.notes}</span>
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="prl-card-actions">
        <button type="button" className="ui-btn ui-btn--secondary ui-btn--sm" onClick={onView}>
          <span className="material-icons-round" aria-hidden="true">visibility</span> Ver
        </button>
        <button type="button" className="ui-btn ui-btn--secondary ui-btn--sm" onClick={onRecalculate}>
          <span className="material-icons-round" aria-hidden="true">calculate</span> Recalc.
        </button>
        <button type="button" className="ui-btn ui-btn--secondary ui-btn--sm" onClick={onHistory}>
          <span className="material-icons-round" aria-hidden="true">history</span> Hist.
        </button>
        <span className="prl-card-actions-spacer" />
        <button
          type="button"
          className={`ui-icon-btn ui-icon-btn--bordered ui-icon-btn--excel${excelBusy ? ' is-loading' : ''}`}
          aria-busy={excelBusy || undefined}
          onClickCapture={() => onExportKey(excelKey)}
          onClick={onExportExcel} disabled={exporting} title="Descargar Excel" aria-label="Descargar Excel">
          {excelBusy
            ? <span className="ui-spinner" aria-hidden="true" />
            : <span className="material-icons-round" aria-hidden="true">{EXPORT_FORMATS.excel.icon}</span>}
        </button>
        <button
          type="button"
          className={`ui-icon-btn ui-icon-btn--bordered ui-icon-btn--pdf${pdfBusy ? ' is-loading' : ''}`}
          aria-busy={pdfBusy || undefined}
          onClickCapture={() => onExportKey(pdfKey)}
          onClick={onExportPdf} disabled={exporting} title="Descargar PDF" aria-label="Descargar PDF">
          {pdfBusy
            ? <span className="ui-spinner" aria-hidden="true" />
            : <span className="material-icons-round" aria-hidden="true">{EXPORT_FORMATS.pdf.icon}</span>}
        </button>
      </div>
    </article>
  );
}

// ─── Modal Detalle Nómina ────────────────────────────────────
function NominaDetailModal({ nomina, onClose, onRecalculate, onExportExcel, onExportPdf, exporting, exportingKey, onExportKey }) {
  // Claves propias de los botones del detalle (distintas de las de la tarjeta de atrás)
  const excelKey = `modal:excel:${nomina.id}`;
  const pdfKey = `modal:pdf:${nomina.id}`;
  const excelBusy = exporting && exportingKey === excelKey;
  const pdfBusy = exporting && exportingKey === pdfKey;

  return (
    <div className="ui-modal-overlay" onClick={onClose}>
      <div className="ui-modal ui-modal--md prl-modal" role="dialog" aria-modal="true" aria-labelledby="prl-detail-title" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="ui-modal-header">
          <VendorAvatar name={nomina.vendedorUsername} />
          <div className="ui-modal-heading">
            <h3 id="prl-detail-title" className="ui-modal-title">Nómina — {nomina.vendedorUsername}</h3>
            <p className="ui-modal-subtitle">{MESES[nomina.month - 1]} {nomina.year}</p>
          </div>
          <button type="button" className="ui-icon-btn" onClick={onClose} aria-label="Cerrar">
            <span className="material-icons-round" aria-hidden="true">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="ui-modal-body">

          {/* Salario Base */}
          <Section icon="work" tone="primary" title="💼 Salario Base">
            <Row label="Salario base" value={`$${formatCurrency(nomina.baseSalary)}`} highlight />
          </Section>

          {/* Comisión por ventas */}
          <Section icon="trending_up" tone="success" title={nomina.salesCommissionByGoal === false ? '📈 Comisión por Ventas (Directa — Sin Meta)' : '📈 Comisión por Ventas (Por Meta)'}>
            <Row label="Modalidad" value={nomina.salesCommissionByGoal === false ? '% directo sobre lo vendido' : 'Solo si cumple meta'} tone="neutral" />
            {nomina.salesCommissionByGoal !== false && (
              <>
                <Row label="Meta de ventas" value={`$${formatCurrency(nomina.salesGoalTarget)}`} />
                <Row label="¿Cumplió meta?" value={nomina.salesGoalMet ? 'Sí' : 'No'} tone={nomina.salesGoalMet ? 'success' : 'warning'} />
              </>
            )}
            <Row label="Total vendido" value={`$${formatCurrency(nomina.totalSold)}`} />
            <Row label="Porcentaje comisión" value={pct(nomina.salesCommissionPct)} />
            <Row label="Comisión ventas" value={`$${formatCurrency(nomina.salesCommissionAmount)}`} highlight positive muted={!(nomina.salesCommissionByGoal === false || nomina.salesGoalMet)} />
          </Section>

          {/* Comisión por recaudo */}
          <Section icon="account_balance_wallet" tone="teal" title={nomina.collectionCommissionByGoal === false ? '💰 Comisión por Recaudo (Directa — Sin Umbral)' : '💰 Comisión por Recaudo (Por Umbral)'}>
            <Row label="Modalidad" value={nomina.collectionCommissionByGoal === false ? '% directo sobre lo recaudado' : 'Solo si recauda ≥ umbral'} tone="neutral" />
            {nomina.collectionCommissionByGoal !== false && (
              <>
                <Row label="Vendido mes anterior" value={`$${formatCurrency(nomina.prevMonthTotalSold)}`} />
                <Row label="% Recaudado" value={formatPct(nomina.collectionPct)} />
                <Row label="Umbral requerido" value={pct(nomina.collectionThresholdPct || 0.8)} />
                <Row label="¿Cumplió meta?" value={nomina.collectionGoalMet ? 'Sí' : 'No'} tone={nomina.collectionGoalMet ? 'success' : 'warning'} />
              </>
            )}
            <Row label="Total recaudado" value={`$${formatCurrency(nomina.totalCollected)}`} />
            <Row label="Porcentaje comisión" value={pct(nomina.collectionCommissionPct)} />
            <Row label="Comisión recaudo" value={`$${formatCurrency(nomina.collectionCommissionAmount)}`} highlight positive muted={!(nomina.collectionCommissionByGoal === false || nomina.collectionGoalMet)} />
          </Section>

          {/* Comisión general */}
          <Section icon="star" tone="warning" title="⭐ Comisión General">
            <Row label="Habilitada" value={nomina.generalCommissionEnabled ? 'Sí' : 'No'} tone={nomina.generalCommissionEnabled ? 'success' : 'neutral'} />
            {nomina.generalCommissionEnabled && (
              <>
                <Row label="Ventas empresa del mes" value={`$${formatCurrency(nomina.totalCompanySales)}`} />
                <Row
                  label={nomina.thresholdIsCustom ? 'Umbral personalizado (Owner)' : 'Umbral de referencia (suma metas)'}
                  value={`$${formatCurrency(nomina.effectiveThreshold ?? nomina.totalGlobalGoals)}`}
                />
                <Row label="Estado del umbral" value={nomina.generalCommissionGoalMet ? 'Alcanzado' : 'No alcanzado'} tone={nomina.generalCommissionGoalMet ? 'success' : 'warning'} />
                <Row label="Porcentaje comisión" value={pct(nomina.generalCommissionPct)} />
                <Row label="Comisión general" value={`$${formatCurrency(nomina.generalCommissionGoalMet ? nomina.generalCommissionAmount : 0)}`} highlight positive muted={!nomina.generalCommissionGoalMet} />
              </>
            )}
          </Section>

          {/* Totales */}
          <section className="prl-totals">
            <div className="prl-totals-row">
              <span className="prl-totals-label">Total Comisiones:</span>
              <span className={`prl-totals-value${Number(nomina.totalCommissions) > 0 ? ' ui-text-success' : ''}`}>${formatCurrency(nomina.totalCommissions)}</span>
            </div>
            <div className="prl-totals-row is-grand">
              <span className="prl-totals-label">TOTAL A PAGAR:</span>
              <span className="prl-totals-value">${formatCurrency(nomina.totalPayout)}</span>
            </div>
          </section>

          {nomina.notes && (
            <p className="prl-notes">
              <span className="material-icons-round" aria-hidden="true">notes</span>
              <span><strong>Notas:</strong> {nomina.notes}</span>
            </p>
          )}

          <p className="prl-timestamp">
            Calculado: {new Date(nomina.createdAt).toLocaleString('es-ES')}
            {nomina.updatedAt !== nomina.createdAt && ` · Actualizado: ${new Date(nomina.updatedAt).toLocaleString('es-ES')}`}
          </p>
        </div>

        {/* Actions */}
        <div className="ui-modal-footer">
          <div className="ui-modal-footer-start">
            <button
              type="button"
              className={`ui-btn ui-btn--excel${excelBusy ? ' is-loading' : ''}`}
              aria-busy={excelBusy || undefined}
              onClickCapture={() => onExportKey(excelKey)}
              onClick={onExportExcel} disabled={exporting} title="Descargar Excel">
              <ExportButtonContent kind="excel" busy={excelBusy} label="Excel" />
            </button>
            <button
              type="button"
              className={`ui-btn ui-btn--pdf${pdfBusy ? ' is-loading' : ''}`}
              aria-busy={pdfBusy || undefined}
              onClickCapture={() => onExportKey(pdfKey)}
              onClick={onExportPdf} disabled={exporting} title="Descargar PDF">
              <ExportButtonContent kind="pdf" busy={pdfBusy} label="PDF" />
            </button>
          </div>
          <button type="button" className="ui-btn ui-btn--secondary" onClick={onClose}>
            Cerrar
          </button>
          <button type="button" className="ui-btn ui-btn--primary" onClick={onRecalculate}>
            <span className="material-icons-round" aria-hidden="true">calculate</span> Recalcular
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal Historial ─────────────────────────────────────────
function HistoryModal({ vendedorUsername, history, loading, onClose, onView }) {
  return (
    <div className="ui-modal-overlay" onClick={onClose}>
      <div className="ui-modal ui-modal--sm prl-modal" role="dialog" aria-modal="true" aria-labelledby="prl-history-title" onClick={e => e.stopPropagation()}>
        <div className="ui-modal-header">
          <span className="ui-modal-icon" aria-hidden="true">
            <span className="material-icons-round">history</span>
          </span>
          <div className="ui-modal-heading">
            <h3 id="prl-history-title" className="ui-modal-title">Historial — {vendedorUsername}</h3>
          </div>
          <button type="button" className="ui-icon-btn" onClick={onClose} aria-label="Cerrar">
            <span className="material-icons-round" aria-hidden="true">close</span>
          </button>
        </div>
        <div className="ui-modal-body">
          {loading ? (
            <p className="prl-modal-state">Cargando...</p>
          ) : history.length === 0 ? (
            <p className="prl-modal-state">No hay historial disponible</p>
          ) : (
            <div className="prl-history-list ui-stagger">
              {history.map(n => (
                <div key={n.id} className="prl-history-item">
                  <span className="ui-icon-tile ui-icon-tile--sm ui-icon-tile--primary" aria-hidden="true">
                    <span className="material-icons-round">event</span>
                  </span>
                  <div className="prl-history-text">
                    <div className="prl-history-period">{MESES[n.month - 1]} {n.year}</div>
                    <div className="prl-history-amount ui-text-success">${formatCurrency(n.totalPayout)}</div>
                    {n.notes && <div className="prl-history-notes">{n.notes}</div>}
                  </div>
                  <button type="button" className="ui-btn ui-btn--secondary ui-btn--sm" onClick={() => onView(n)}>
                    <span className="material-icons-round" aria-hidden="true">visibility</span> Ver
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
        salesCommissionByGoal: true,
        collectionCommissionPct: 0.03,
        collectionCommissionByGoal: true,
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
    <div className="prl-tab-panel">
      <p className="prl-intro">
        Configura el salario base y porcentajes de comisión de cada vendedora. Los cambios aplican en el próximo cálculo de nómina.
      </p>

      {loading ? (
        <p className="prl-inline-state">Cargando configuraciones...</p>
      ) : (
        <div className="prl-grid ui-stagger">
          {vendedoresList.map(v => {
            const cfg = configMap[v.id];
            return (
              <article key={v.id} className="prl-card">
                <div className="prl-config-head">
                  <div className="prl-config-name">
                    <VendorAvatar name={v.username} size="sm" />
                    <span>{v.username}</span>
                  </div>
                  <button type="button" className="ui-btn ui-btn--secondary ui-btn--sm" onClick={() => handleEdit(v.id)}>
                    <span className="material-icons-round" aria-hidden="true">edit</span>
                    {cfg ? 'Editar' : 'Configurar'}
                  </button>
                </div>
                {cfg ? (
                  <div className="prl-config-body">
                    <Row label="Salario base" value={`$${formatCurrency(cfg.baseSalary)}`} />
                    <Row
                      label="Comisión ventas"
                      value={<>{pct(cfg.salesCommissionPct)} <span className="ui-badge ui-badge--primary">{cfg.salesCommissionByGoal === false ? 'Directa' : 'Por meta'}</span></>}
                    />
                    <Row
                      label="Comisión recaudo"
                      value={<>{pct(cfg.collectionCommissionPct)} <span className="ui-badge ui-badge--primary">{cfg.collectionCommissionByGoal === false ? 'Directa' : `Umbral ${pct(cfg.collectionThresholdPct)}`}</span></>}
                    />
                    <Row
                      label="Com. general"
                      value={cfg.generalCommissionEnabled
                        ? <span className="ui-badge ui-badge--success"><span className="material-icons-round" aria-hidden="true">check</span>{pct(cfg.generalCommissionPct)}</span>
                        : <span className="ui-badge ui-badge--neutral">Deshabilitada</span>}
                    />
                  </div>
                ) : (
                  <div className="prl-config-empty">
                    <span className="ui-icon-tile ui-icon-tile--sky" aria-hidden="true">
                      <span className="material-icons-round">settings</span>
                    </span>
                    Sin configuración — usa valores por defecto
                  </div>
                )}
              </article>
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
    salesCommissionByGoal: config.salesCommissionByGoal ?? true,
    collectionCommissionPct: ((config.collectionCommissionPct ?? 0.03) * 100).toFixed(3),
    collectionCommissionByGoal: config.collectionCommissionByGoal ?? true,
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
      salesCommissionByGoal: form.salesCommissionByGoal,
      collectionCommissionPct: parseFloat(form.collectionCommissionPct) / 100,
      collectionCommissionByGoal: form.collectionCommissionByGoal,
      collectionThresholdPct: parseFloat(form.collectionThresholdPct) / 100,
      generalCommissionEnabled: form.generalCommissionEnabled,
      generalCommissionPct: parseFloat(form.generalCommissionPct) / 100,
    });
  };

  // Tarjeta de elección (radio) del sistema: seleccionada = borde y fondo primario suave
  const choiceClass = (active) => `ui-choice ui-choice--compact${active ? ' is-selected' : ''}`;

  return (
    <div className="ui-modal-overlay" onClick={onClose}>
      <div className="ui-modal ui-modal--md prl-modal" role="dialog" aria-modal="true" aria-labelledby="prl-config-title" onClick={e => e.stopPropagation()}>
        <div className="ui-modal-header">
          <span className="ui-modal-icon" aria-hidden="true">
            <span className="material-icons-round">tune</span>
          </span>
          <div className="ui-modal-heading">
            <h3 id="prl-config-title" className="ui-modal-title">Configurar Nómina — {config.vendedorUsername}</h3>
          </div>
          <button type="button" className="ui-icon-btn" onClick={onClose} aria-label="Cerrar">
            <span className="material-icons-round" aria-hidden="true">close</span>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="prl-form">
          <div className="ui-modal-body">

            <section className="ui-section">
              <FieldGroup label="Salario Base ($)" htmlFor="prl-base-salary">
                <div className="ui-input-group">
                  <span className="ui-input-prefix" aria-hidden="true">$</span>
                  <input id="prl-base-salary" type="number" className="ui-input" value={form.baseSalary} onChange={e => set('baseSalary', e.target.value)} min="0" step="1000" required />
                </div>
              </FieldGroup>
            </section>

            {/* ── Comisión Ventas ── */}
            <section className="ui-section">
              <div className="ui-section-head">
                <div>
                  <h4 className="ui-section-title prl-section-title">
                    <span className="ui-icon-tile ui-icon-tile--sm ui-icon-tile--success" aria-hidden="true">
                      <span className="material-icons-round">trending_up</span>
                    </span>
                    Comisión por Ventas
                  </h4>
                </div>
              </div>
              <div className="ui-stack prl-stack">
                <FieldGroup label="Porcentaje (%)" htmlFor="prl-sales-pct">
                  <div className="ui-input-group ui-input-group--suffix">
                    <input id="prl-sales-pct" type="number" className="ui-input" value={form.salesCommissionPct} onChange={e => set('salesCommissionPct', e.target.value)} min="0" max="100" step="0.001" required />
                    <span className="ui-input-suffix" aria-hidden="true">%</span>
                  </div>
                </FieldGroup>
                <div className="ui-field">
                  <p className="ui-label prl-mode-label">Modalidad:</p>
                  <div className="ui-choice-grid" role="radiogroup" aria-label="Modalidad de comisión por ventas">
                    <label className={choiceClass(form.salesCommissionByGoal === true)}>
                      <input type="radio" name="salesMode" checked={form.salesCommissionByGoal === true}
                        onChange={() => set('salesCommissionByGoal', true)} />
                      <span className="material-icons-round ui-choice-icon" aria-hidden="true">flag</span>
                      <span className="ui-choice-text">
                        <span className="ui-choice-title">Solo si cumple meta</span>
                      </span>
                    </label>
                    <label className={choiceClass(form.salesCommissionByGoal === false)}>
                      <input type="radio" name="salesMode" checked={form.salesCommissionByGoal === false}
                        onChange={() => set('salesCommissionByGoal', false)} />
                      <span className="material-icons-round ui-choice-icon" aria-hidden="true">bolt</span>
                      <span className="ui-choice-text">
                        <span className="ui-choice-title">Siempre (directa)</span>
                      </span>
                    </label>
                  </div>
                  <small className="ui-help">
                    {form.salesCommissionByGoal === false
                      ? 'Se aplica: totalVendido × % — sin importar meta'
                      : 'Se aplica solo si la vendedora cumplió su meta mensual'}
                  </small>
                </div>
              </div>
            </section>

            {/* ── Comisión Recaudo ── */}
            <section className="ui-section">
              <div className="ui-section-head">
                <div>
                  <h4 className="ui-section-title prl-section-title">
                    <span className="ui-icon-tile ui-icon-tile--sm ui-icon-tile--teal" aria-hidden="true">
                      <span className="material-icons-round">account_balance</span>
                    </span>
                    Comisión por Recaudo
                  </h4>
                </div>
              </div>
              <div className="ui-stack prl-stack">
                <FieldGroup label="Porcentaje (%)" htmlFor="prl-collection-pct">
                  <div className="ui-input-group ui-input-group--suffix">
                    <input id="prl-collection-pct" type="number" className="ui-input" value={form.collectionCommissionPct} onChange={e => set('collectionCommissionPct', e.target.value)} min="0" max="100" step="0.001" required />
                    <span className="ui-input-suffix" aria-hidden="true">%</span>
                  </div>
                </FieldGroup>
                <div className="ui-field">
                  <p className="ui-label prl-mode-label">Modalidad:</p>
                  <div className="ui-choice-grid" role="radiogroup" aria-label="Modalidad de comisión por recaudo">
                    <label className={choiceClass(form.collectionCommissionByGoal === true)}>
                      <input type="radio" name="collectionMode" checked={form.collectionCommissionByGoal === true}
                        onChange={() => set('collectionCommissionByGoal', true)} />
                      <span className="material-icons-round ui-choice-icon" aria-hidden="true">flag</span>
                      <span className="ui-choice-text">
                        <span className="ui-choice-title">Solo si ≥ umbral</span>
                      </span>
                    </label>
                    <label className={choiceClass(form.collectionCommissionByGoal === false)}>
                      <input type="radio" name="collectionMode" checked={form.collectionCommissionByGoal === false}
                        onChange={() => set('collectionCommissionByGoal', false)} />
                      <span className="material-icons-round ui-choice-icon" aria-hidden="true">bolt</span>
                      <span className="ui-choice-text">
                        <span className="ui-choice-title">Siempre (directa)</span>
                      </span>
                    </label>
                  </div>
                  {form.collectionCommissionByGoal !== false && (
                    <FieldGroup label="Umbral de recaudo requerido (%)" htmlFor="prl-collection-threshold" className="prl-field-spaced">
                      <div className="ui-input-group ui-input-group--suffix">
                        <input id="prl-collection-threshold" type="number" className="ui-input" value={form.collectionThresholdPct} onChange={e => set('collectionThresholdPct', e.target.value)} min="0" max="100" step="0.1" required />
                        <span className="ui-input-suffix" aria-hidden="true">%</span>
                      </div>
                      <small className="ui-help">% de lo vendido el mes anterior</small>
                    </FieldGroup>
                  )}
                  <small className="ui-help">
                    {form.collectionCommissionByGoal === false
                      ? 'Se aplica: totalRecaudado × % — sin importar umbral'
                      : 'Se aplica solo si recaudó ≥ umbral del mes anterior'}
                  </small>
                </div>
              </div>
            </section>

            {/* ── Comisión General ── */}
            <section className="ui-section">
              <label className="ui-switch ui-switch--plain">
                <input
                  type="checkbox"
                  checked={form.generalCommissionEnabled}
                  onChange={e => set('generalCommissionEnabled', e.target.checked)}
                />
                <span className="ui-switch-track"><span className="ui-switch-thumb" /></span>
                <span className="ui-switch-text">
                  <span className="ui-switch-title">Habilitar Comisión General</span>
                </span>
              </label>
              {form.generalCommissionEnabled && (
                <FieldGroup label="Comisión general (%)" htmlFor="prl-general-pct" className="prl-field-spaced">
                  <div className="ui-input-group ui-input-group--suffix">
                    <input id="prl-general-pct" type="number" className="ui-input" value={form.generalCommissionPct} onChange={e => set('generalCommissionPct', e.target.value)} min="0" max="100" step="0.001" required />
                    <span className="ui-input-suffix" aria-hidden="true">%</span>
                  </div>
                  <small className="ui-help">Aplicada sobre la suma de todas las metas globales</small>
                </FieldGroup>
              )}
            </section>
          </div>

          <div className="ui-modal-footer">
            <button type="button" className="ui-btn ui-btn--secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="ui-btn ui-btn--primary" disabled={saving}>
              <span className="material-icons-round" aria-hidden="true">save</span>
              {saving ? 'Guardando...' : 'Guardar Configuración'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Helpers de UI ───────────────────────────────────────────
// icon/tone: baldosa de color junto al dato; valueClassName: color del monto (p. ej. verde)
function InfoRow({ label, value, icon, tone = 'primary', valueClassName = '' }) {
  return (
    <div className="prl-info">
      {icon && (
        <span className={`ui-icon-tile ui-icon-tile--sm ui-icon-tile--${tone}`} aria-hidden="true">
          <span className="material-icons-round">{icon}</span>
        </span>
      )}
      <div className="prl-info-text">
        <div className="prl-info-label">{label}</div>
        <div className={`prl-info-value${valueClassName ? ` ${valueClassName}` : ''}`}>{value}</div>
      </div>
    </div>
  );
}

// tone: neutral | primary | success | warning | danger (badge semántico del sistema)
function Badge({ icon, label, tone = 'neutral' }) {
  return (
    <span className={`ui-badge ui-badge--${tone}`}>
      <span className="material-icons-round" aria-hidden="true">{icon}</span>
      {label}
    </span>
  );
}

// Los títulos de sección traen un emoji decorativo heredado al inicio: se muestra el
// icono Material (prop icon) en su lugar, sin emojis como iconos.
const LEADING_EMOJI = /^(💼|📈|💰|⭐)\s*/;

// tone: color de la baldosa del icono (primary | success | teal | warning…)
function Section({ icon, tone = 'primary', title, children }) {
  return (
    <section className="ui-section prl-detail-section">
      <h4 className="ui-section-title prl-section-title">
        {icon && (
          <span className={`ui-icon-tile ui-icon-tile--sm ui-icon-tile--${tone}`} aria-hidden="true">
            <span className="material-icons-round">{icon}</span>
          </span>
        )}
        {typeof title === 'string' ? title.replace(LEADING_EMOJI, '') : title}
      </h4>
      <div className="prl-rows">{children}</div>
    </section>
  );
}

// tone → el valor se muestra como badge semántico; muted → monto que no aplica;
// positive → monto ganado (comisión que sí aplica) en verde
function Row({ label, value, highlight, tone, muted, positive }) {
  const valueClass = `prl-row-value${highlight ? ' is-highlight' : ''}${muted ? ' is-muted' : positive ? ' is-positive' : ''}`;
  return (
    <div className="prl-row">
      <span className="prl-row-label">{label}:</span>
      {tone
        ? <span className={`ui-badge ui-badge--${tone}`}>{value}</span>
        : <span className={valueClass}>{value}</span>}
    </div>
  );
}

function FieldGroup({ label, htmlFor, className = '', children }) {
  return (
    <div className={`ui-field ${className}`}>
      <label className="ui-label" htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  );
}
