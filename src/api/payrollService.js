// src/api/payrollService.js
import client from './client';

// ============================================================
// OWNER — Configuración de Nómina
// ============================================================

/** Lista la configuración de nómina de todos los vendedores activos */
export const getAllPayrollConfigs = () =>
  client.get('/owner/payroll/config');

/** Obtiene la configuración de nómina de un vendedor específico */
export const getPayrollConfig = (vendedorId) =>
  client.get(`/owner/payroll/config/${vendedorId}`);

/** Crea o actualiza la configuración de nómina de un vendedor */
export const savePayrollConfig = (data) =>
  client.post('/owner/payroll/config', data);

// ============================================================
// OWNER — Cálculo de Nómina
// ============================================================

/** Calcula (o recalcula) la nómina de un vendedor para un mes/año */
export const calculatePayroll = (data) =>
  client.post('/owner/payroll/calculate', data);

/** Calcula la nómina de todos los vendedores activos para un mes/año */
export const calculateAllPayrolls = (month, year) =>
  client.post('/owner/payroll/calculate-all', null, { params: { month, year } });

/** Lista las nóminas calculadas de todos los vendedores para un mes/año */
export const getAllPayrolls = (month, year) =>
  client.get('/owner/payroll', { params: { month, year } });

/** Obtiene la nómina de un vendedor específico en un mes/año */
export const getVendorPayroll = (vendedorId, month, year) =>
  client.get(`/owner/payroll/${vendedorId}`, { params: { month, year } });

/** Historial completo de nóminas de un vendedor */
export const getVendorPayrollHistory = (vendedorId) =>
  client.get(`/owner/payroll/${vendedorId}/history`);

// ============================================================
// VENDEDOR — Solo lectura propia
// ============================================================

/** La vendedora consulta su propia nómina de un mes/año */
export const getMyPayroll = (month, year) =>
  client.get('/vendedor/payroll', { params: { month, year } });

/** La vendedora consulta su historial completo de nóminas */
export const getMyPayrollHistory = () =>
  client.get('/vendedor/payroll/history');

// ============================================================
// OWNER / ADMIN — Exportación de Nómina
// ============================================================

/** Excel general de todos los vendedores (OWNER y ADMIN) */
export const exportAllPayrollExcel = (month, year) =>
  client.get('/owner/payroll/export/excel', {
    params: { month, year },
    responseType: 'blob',
  });

/** PDF general de todos los vendedores (OWNER y ADMIN) */
export const exportAllPayrollPdf = (month, year) =>
  client.get('/owner/payroll/export/pdf', {
    params: { month, year },
    responseType: 'blob',
  });

/** Excel de un vendedor específico (OWNER, ADMIN y VENDEDOR solo el suyo) */
export const exportVendorPayrollExcel = (vendedorId, month, year) =>
  client.get(`/owner/payroll/export/${vendedorId}/excel`, {
    params: { month, year },
    responseType: 'blob',
  });

/** PDF de un vendedor específico (OWNER, ADMIN y VENDEDOR solo el suyo) */
export const exportVendorPayrollPdf = (vendedorId, month, year) =>
  client.get(`/owner/payroll/export/${vendedorId}/pdf`, {
    params: { month, year },
    responseType: 'blob',
  });

/** Excel de la propia vendedora (lee usuario del token, sin necesitar ID) */
export const exportMyPayrollExcel = (month, year) =>
  client.get('/owner/payroll/export/me/excel', {
    params: { month, year },
    responseType: 'blob',
  });

/** PDF de la propia vendedora (lee usuario del token, sin necesitar ID) */
export const exportMyPayrollPdf = (month, year) =>
  client.get('/owner/payroll/export/me/pdf', {
    params: { month, year },
    responseType: 'blob',
  });

