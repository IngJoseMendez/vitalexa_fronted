import React, { useState, useEffect } from 'react';
import client from '../api/client';
import { useToast } from '../components/ToastContainer';
import '../styles/OwnerDashboard.css';

// ✅ CONFIGURACIÓN CENTRALIZADA
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080';

// ✅ FUNCIÓN HELPER PARA URL DE IMÁGENES
const getImageUrl = (imageUrl) => {
  if (!imageUrl) return null;
  return `${API_BASE_URL}/api/images/products/${imageUrl}`;
};

// ✅ PLACEHOLDER SVG
const PLACEHOLDER_IMAGE = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23f3f4f6" width="200" height="200"/%3E%3Ctext fill="%239ca3af" font-family="Arial, sans-serif" font-size="16" dy="10" font-weight="bold" x="50%25" y="50%25" text-anchor="middle"%3ESin Imagen%3C/text%3E%3C/svg%3E';

function OwnerDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [vendedores, setVendedores] = useState([]);
  const [saleGoals, setSaleGoals] = useState([]);
  const toast = useToast();

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);

      const [ordersRes, productsRes] = await Promise.all([
        client.get('/admin/orders'),
        client.get('/admin/products')
      ]);

      setOrders(ordersRes.data);
      setProducts(productsRes.data);
      calculateStats(ordersRes.data, productsRes.data);

      try {
        const vendedoresRes = await client.get('/admin/sale-goals/vendedores');
        setVendedores(vendedoresRes.data);
      } catch (vendedorError) {
        console.warn('Error al cargar vendedores:', vendedorError);
        setVendedores([]);
      }

    } catch (error) {
      console.error('Error al cargar datos:', error);
      toast.error('Error al cargar datos del dashboard');
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (ordersData, productsData) => {
    const completedOrders = ordersData.filter(o => o.estado === 'COMPLETADO');
    const pendingOrders = ordersData.filter(o => o.estado === 'PENDIENTE' || o.estado === 'CONFIRMADO');

    const totalRevenue = completedOrders.reduce((sum, o) => sum + parseFloat(o.total), 0);
    const activeProducts = productsData.filter(p => p.active).length;
    const lowStockProducts = productsData.filter(p => p.stock < 10 && p.active).length;

    setStats({
      totalOrders: ordersData.length,
      completedOrders: completedOrders.length,
      pendingOrders: pendingOrders.length,
      totalRevenue: totalRevenue,
      activeProducts: activeProducts,
      totalProducts: productsData.length,
      lowStockProducts: lowStockProducts
    });
  };

  if (loading) {
    return (
      <div className="owner-dashboard">
        <div className="loading">Cargando dashboard...</div>
      </div>
    );
  }

  return (
    <div className="owner-dashboard">
      <header className="dashboard-header">
        <h1><span className="material-icons-round" style={{ fontSize: '32px', verticalAlign: 'middle', color: '#fbbf24' }}>verified_user</span> Owner Panel</h1>
        <p>Complete business overview</p>
      </header>

      <nav className="dashboard-tabs">
        <button
          className={activeTab === 'overview' ? 'active' : ''}
          onClick={() => setActiveTab('overview')}
        >
          <span className="material-icons-round">dashboard</span> Overview
        </button>
        <button
          className={activeTab === 'orders' ? 'active' : ''}
          onClick={() => setActiveTab('orders')}
        >
          <span className="material-icons-round">inventory</span> Orders ({stats?.totalOrders || 0})
        </button>
        <button
          className={activeTab === 'products' ? 'active' : ''}
          onClick={() => setActiveTab('products')}
        >
          <span className="material-icons-round">store</span> Products ({stats?.totalProducts || 0})
        </button>
        <button
          className={activeTab === 'metas' ? 'active' : ''}
          onClick={() => setActiveTab('metas')}
        >
          <span className="material-icons-round">trending_up</span> Metas ({vendedores.length})
        </button>
        <button
          className={activeTab === 'reports' ? 'active' : ''}
          onClick={() => setActiveTab('reports')}
        >
          <span className="material-icons-round">insights</span> Reports
        </button>
      </nav>

      <div className="dashboard-content">
        {activeTab === 'overview' && <OverviewTab stats={stats} />}
        {activeTab === 'orders' && (
          <OrdersTab
            orders={orders}
            onSelectOrder={setSelectedOrder}
          />
        )}
        {activeTab === 'products' && <ProductsTab products={products} />}
        {activeTab === 'metas' && (
          <SaleGoalsTab
            vendedores={vendedores}
            onUpdate={fetchData}
            toast={toast}
          />
        )}
        {activeTab === 'reports' && <ReportsTab orders={orders} products={products} />}
      </div>

      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
        />
      )}
    </div>
  );
}

// ===== OVERVIEW TAB =====
function OverviewTab({ stats }) {
  return (
    <div className="overview-tab">
      <div className="stats-grid">
        <div className="stat-card revenue">
          <div className="stat-icon"><span className="material-icons-round">payments</span></div>
          <div className="stat-info">
            <h3>Total Revenue</h3>
            <p className="stat-value">${stats?.totalRevenue?.toFixed(2) || '0.00'}</p>
          </div>
        </div>

        <div className="stat-card orders">
          <div className="stat-icon"><span className="material-icons-round">shopping_bag</span></div>
          <div className="stat-info">
            <h3>Completed Orders</h3>
            <p className="stat-value">{stats?.completedOrders || 0}</p>
            <span className="stat-subtitle">of {stats?.totalOrders || 0} total</span>
          </div>
        </div>

        <div className="stat-card pending">
          <div className="stat-icon"><span className="material-icons-round">hourglass_top</span></div>
          <div className="stat-info">
            <h3>Pending Orders</h3>
            <p className="stat-value">{stats?.pendingOrders || 0}</p>
          </div>
        </div>

        <div className="stat-card products">
          <div className="stat-icon"><span className="material-icons-round">inventory_2</span></div>
          <div className="stat-info">
            <h3>Active Products</h3>
            <p className="stat-value">{stats?.activeProducts || 0}</p>
            <span className="stat-subtitle">of {stats?.totalProducts || 0} total</span>
          </div>
        </div>

        {stats?.lowStockProducts > 0 && (
          <div className="stat-card warning">
            <div className="stat-icon"><span className="material-icons-round">warning_amber</span></div>
            <div className="stat-info">
              <h3>Low Stock</h3>
              <p className="stat-value">{stats.lowStockProducts}</p>
              <span className="stat-subtitle">products need restock</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ===== ORDERS TAB =====
function OrdersTab({ orders }) {
  const [filter, setFilter] = useState('pending');

  const filteredOrders = orders.filter(order => {
    if (filter === 'pending') {
      return order.estado === 'PENDIENTE' || order.estado === 'CONFIRMADO';
    }
    if (filter === 'completed') {
      return order.estado === 'COMPLETADO';
    }
    if (filter === 'all') {
      return true;
    }
    return order.estado === filter;
  });

  return (
    <div className="orders-section">
      <div className="orders-header">
        <h2><span className="material-icons-round" style={{ fontSize: '32px', color: 'var(--primary)', verticalAlign: 'middle' }}>assignment</span> Orders Management</h2>
        <div className="filter-tabs">
          <button
            className={filter === 'pending' ? 'active' : ''}
            onClick={() => setFilter('pending')}
          >
            <span className="material-icons-round">pending_actions</span> Pending ({orders.filter(o => o.estado === 'PENDIENTE' || o.estado === 'CONFIRMADO').length})
          </button>
          <button
            className={filter === 'completed' ? 'active' : ''}
            onClick={() => setFilter('completed')}
          >
            <span className="material-icons-round">check_circle</span> Completed ({orders.filter(o => o.estado === 'COMPLETADO').length})
          </button>
          <button
            className={filter === 'all' ? 'active' : ''}
            onClick={() => setFilter('all')}
          >
            <span className="material-icons-round">analytics</span> All ({orders.length})
          </button>
        </div>
      </div>

      <div className="orders-grid">
        {filteredOrders.length === 0 ? (
          <div className="empty-state">
            <p><span className="material-icons-round" style={{ fontSize: '48px', color: 'var(--text-muted)' }}>search_off</span> No orders found</p>
          </div>
        ) : (
          filteredOrders.map(order => (
            <div key={order.id} className="order-card">
              <div className="order-header">
                <span className="order-id">#{order.id.substring(0, 8)}</span>
                <span className={`order-status status-${order.estado.toLowerCase()}`}>
                  {order.estado}
                </span>
              </div>

              <div className="order-info">
                <p><strong>Vendedor:</strong> {order.vendedor}</p>
                <p><strong>Cliente:</strong> {order.cliente}</p>
                <p><strong>Fecha:</strong> {new Date(order.fecha).toLocaleString('es-ES')}</p>
                <p className="order-total">
                  <strong>Total:</strong> ${parseFloat(order.total).toFixed(2)}
                </p>

                {order.notas && (
                  <div className="order-notes">
                    <strong><span className="material-icons-round">note</span> Notes:</strong>
                    <p>{order.notas}</p>
                  </div>
                )}
              </div>

              <details className="order-details">
                <summary>Ver productos ({order.items.length})</summary>
                <ul>
                  {order.items.map((item, idx) => (
                    <li key={idx}>
                      <span className="item-name">{item.productName}</span>
                      <span className="item-qty">
                        {item.cantidad} x ${parseFloat(item.precioUnitario).toFixed(2)}
                      </span>
                      <span className="item-subtotal">
                        ${parseFloat(item.subtotal).toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ===== ✅ PRODUCTS TAB - CORREGIDO =====
function ProductsTab({ products }) {
  const [filter, setFilter] = useState('all');

  const filteredProducts = products.filter(product => {
    if (filter === 'all') return true;
    if (filter === 'active') return product.active;
    if (filter === 'inactive') return !product.active;
    if (filter === 'lowstock') return product.stock < 10 && product.active;
    return true;
  });

  return (
    <div className="products-tab">
      <div className="tab-header">
        <h2>Product Inventory</h2>
        <div className="filter-buttons">
          <button
            className={filter === 'all' ? 'active' : ''}
            onClick={() => setFilter('all')}
          >
            Todos ({products.length})
          </button>
          <button
            className={filter === 'active' ? 'active' : ''}
            onClick={() => setFilter('active')}
          >
            Activos ({products.filter(p => p.active).length})
          </button>
          <button
            className={filter === 'lowstock' ? 'active' : ''}
            onClick={() => setFilter('lowstock')}
          >
            Stock Bajo ({products.filter(p => p.stock < 10 && p.active).length})
          </button>
        </div>
      </div>

      <div className="products-grid">
        {filteredProducts.map(product => (
          <div key={product.id} className="product-card">
            <div className="product-image">
              {/* ✅ IMAGEN CORREGIDA */}
              <img
                src={getImageUrl(product.imageUrl) || PLACEHOLDER_IMAGE}
                alt={product.nombre}
                onError={(e) => {
                  console.warn(`⚠️ Error cargando imagen: ${product.imageUrl}`);
                  e.target.src = PLACEHOLDER_IMAGE;
                }}
                loading="lazy"
              />
            </div>

            <div className="product-info">
              <h3>{product.nombre}</h3>
              <p className="product-description">{product.descripcion}</p>

              <div className="product-stats">
                <div className="stat">
                  <span className="label">Precio:</span>
                  <span className="value">${parseFloat(product.precio).toFixed(2)}</span>
                </div>
                <div className="stat">
                  <span className="label">Stock:</span>
                  <span className={`value ${product.stock < 10 ? 'low' : ''}`}>
                    {product.stock} unidades
                  </span>
                </div>
              </div>

              <div className="product-status">
                <span className={`badge ${product.active ? 'active' : 'inactive'}`}>
                  {product.active ? <><span className="material-icons-round">check_circle</span> Active</> : <><span className="material-icons-round">cancel</span> Inactive</>}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===== REPORTS TAB =====
function ReportsTab({ orders, products }) {
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({
    startDate: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });
  const toast = useToast();
  const [activeReportTab, setActiveReportTab] = useState('overview');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetchReportData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange]);

  const fetchReportData = async () => {
    try {
      setLoading(true);
      const response = await client.get('/owner/reports/complete', {
        params: {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate
        }
      });
      setReportData(response.data);
    } catch (error) {
      console.error('Error al cargar reportes:', error);
      toast.error('Error al cargar reportes');
    } finally {
      setLoading(false);
    }
  };

  const handleDateChange = (field, value) => {
    setDateRange(prev => ({ ...prev, [field]: value }));
  };

  const handleExportReport = async (format) => {
    try {
      setExporting(true);
      const response = await client.get(`/reports/export/complete/${format}`, {
        params: {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate
        },
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;

      const fileName = `reporte_completo_${dateRange.startDate}_${dateRange.endDate}.${format}`;
      link.setAttribute('download', fileName);

      document.body.appendChild(link);
      link.click();
      link.remove();

      toast.success(`Reporte ${format.toUpperCase()} descargado exitosamente`);
    } catch (error) {
      console.error(`Error al exportar a ${format}:`, error);
      toast.error(`Error al exportar reporte a ${format.toUpperCase()}`);
    } finally {
      setExporting(false);
    }
  };

  const handleExportSpecific = async (type, format) => {
    try {
      setExporting(true);
      let endpoint = '';
      let params = {};

      switch (type) {
        case 'sales':
          endpoint = `/reports/export/sales/${format}`;
          params = {
            startDate: dateRange.startDate,
            endDate: dateRange.endDate
          };
          break;
        case 'products':
          endpoint = `/reports/export/products/${format}`;
          break;
        case 'clients':
          endpoint = `/reports/export/clients/${format}`;
          break;
        default:
          return;
      }

      const response = await client.get(endpoint, {
        params: params,
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;

      const fileName = `reporte_${type}_${new Date().toISOString().split('T')[0]}.${format}`;
      link.setAttribute('download', fileName);

      document.body.appendChild(link);
      link.click();
      link.remove();

      toast.success(`Reporte de ${type} descargado exitosamente`);
    } catch (error) {
      console.error(`Error al exportar ${type}:`, error);
      toast.error(`Error al exportar reporte de ${type}`);
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return <div className="loading">Generando reportes...</div>;
  }

  if (!reportData) {
    return <div className="no-data">No hay datos disponibles</div>;
  }

  return (
    <div className="reports-tab">
      <div className="reports-header">
        <h2>📈 Sistema de Reportes</h2>
        <div className="date-range-selector">
          <label>
            Desde:
            <input
              type="date"
              value={dateRange.startDate}
              onChange={(e) => handleDateChange('startDate', e.target.value)}
            />
          </label>
          <label>
            Hasta:
            <input
              type="date"
              value={dateRange.endDate}
              onChange={(e) => handleDateChange('endDate', e.target.value)}
            />
          </label>
          <button onClick={fetchReportData} className="btn-refresh">
            🔄 Actualizar
          </button>
        </div>
      </div>

      <div className="export-section">
        <h3>📥 Exportar Reporte Completo</h3>
        <div className="export-buttons">
          <button
            onClick={() => handleExportReport('pdf')}
            disabled={exporting}
            className="btn-export btn-pdf"
          >
            📄 Descargar PDF
          </button>
          <button
            onClick={() => handleExportReport('excel')}
            disabled={exporting}
            className="btn-export btn-excel"
          >
            📊 Descargar Excel
          </button>
          <button
            onClick={() => handleExportReport('csv')}
            disabled={exporting}
            className="btn-export btn-csv"
          >
            📋 Descargar CSV
          </button>
        </div>
      </div>

      <nav className="report-tabs">
        <button
          className={activeReportTab === 'overview' ? 'active' : ''}
          onClick={() => setActiveReportTab('overview')}
        >
          📊 Resumen General
        </button>
        <button
          className={activeReportTab === 'sales' ? 'active' : ''}
          onClick={() => setActiveReportTab('sales')}
        >
          💰 Ventas
        </button>
        <button
          className={activeReportTab === 'products' ? 'active' : ''}
          onClick={() => setActiveReportTab('products')}
        >
          📦 Productos
        </button>
        <button
          className={activeReportTab === 'vendors' ? 'active' : ''}
          onClick={() => setActiveReportTab('vendors')}
        >
          👥 Vendedores
        </button>
        <button
          className={activeReportTab === 'clients' ? 'active' : ''}
          onClick={() => setActiveReportTab('clients')}
        >
          🛍️ Clientes
        </button>
      </nav>

      <div className="report-content">
        {activeReportTab === 'overview' && <OverviewReport data={reportData} />}
        {activeReportTab === 'sales' && (
          <>
            <div className="export-specific">
              <button onClick={() => handleExportSpecific('sales', 'pdf')} disabled={exporting}>
                📄 Exportar Ventas PDF
              </button>
            </div>
            <SalesReport data={reportData.salesReport} />
          </>
        )}
        {activeReportTab === 'products' && (
          <>
            <div className="export-specific">
              <button onClick={() => handleExportSpecific('products', 'excel')} disabled={exporting}>
                📊 Exportar Productos Excel
              </button>
            </div>
            <ProductsReport data={reportData.productReport} />
          </>
        )}
        {activeReportTab === 'vendors' && <VendorsReport data={reportData.vendorReport} />}
        {activeReportTab === 'clients' && (
          <>
            <div className="export-specific">
              <button onClick={() => handleExportSpecific('clients', 'csv')} disabled={exporting}>
                📋 Exportar Clientes CSV
              </button>
            </div>
            <ClientsReport data={reportData.clientReport} />
          </>
        )}
      </div>

      {exporting && (
        <div className="exporting-overlay">
          <div className="exporting-message">
            <div className="spinner"></div>
            <p>Generando reporte...</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== OVERVIEW REPORT =====
function OverviewReport({ data }) {
  const { salesReport, productReport, clientReport } = data;

  return (
    <div className="overview-report">
      <div className="report-grid">
        <div className="report-card highlight">
          <div className="card-icon">💰</div>
          <div className="card-content">
            <h3>Ingresos Totales</h3>
            <p className="big-number">${parseFloat(salesReport.totalRevenue).toFixed(2)}</p>
            <span className="card-subtitle">
              Promedio por orden: ${parseFloat(salesReport.averageOrderValue).toFixed(2)}
            </span>
          </div>
        </div>

        <div className="report-card">
          <div className="card-icon">📦</div>
          <div className="card-content">
            <h3>Órdenes</h3>
            <p className="big-number">{salesReport.totalOrders}</p>
            <div className="card-breakdown">
              <span className="success">✓ {salesReport.completedOrders} completadas</span>
              <span className="pending">⏳ {salesReport.pendingOrders} pendientes</span>
              <span className="canceled">✗ {salesReport.canceledOrders} canceladas</span>
            </div>
          </div>
        </div>

        <div className="report-card">
          <div className="card-icon">🛍️</div>
          <div className="card-content">
            <h3>Inventario</h3>
            <p className="big-number">{productReport.activeProducts}</p>
            <div className="card-breakdown">
              <span>Valor total: ${parseFloat(productReport.totalInventoryValue).toFixed(2)}</span>
              {productReport.lowStockProducts > 0 && (
                <span className="warning">⚠️ {productReport.lowStockProducts} con stock bajo</span>
              )}
            </div>
          </div>
        </div>

        <div className="report-card">
          <div className="card-icon">👥</div>
          <div className="card-content">
            <h3>Clientes</h3>
            <p className="big-number">{clientReport.totalClients}</p>
            <span className="card-subtitle">
              {clientReport.activeClients} activos
            </span>
          </div>
        </div>
      </div>

      <div className="chart-section">
        <h3>📊 Tendencia de Ventas</h3>
        <SalesChart data={salesReport.dailySales} />
      </div>

      <div className="chart-section">
        <h3>🏆 Top 5 Productos Más Vendidos</h3>
        <TopProductsChart data={productReport.topSellingProducts.slice(0, 5)} />
      </div>
    </div>
  );
}

// ===== SALES REPORT =====
function SalesReport({ data }) {
  return (
    <div className="sales-report">
      <div className="metrics-grid">
        <div className="metric-box">
          <h4>Ingresos Totales</h4>
          <p className="metric-value">${parseFloat(data.totalRevenue).toFixed(2)}</p>
        </div>
        <div className="metric-box">
          <h4>Promedio por Orden</h4>
          <p className="metric-value">${parseFloat(data.averageOrderValue).toFixed(2)}</p>
        </div>
        <div className="metric-box">
          <h4>Total Órdenes</h4>
          <p className="metric-value">{data.totalOrders}</p>
        </div>
        <div className="metric-box">
          <h4>Tasa de Éxito</h4>
          <p className="metric-value">
            {data.totalOrders > 0
              ? ((data.completedOrders / data.totalOrders) * 100).toFixed(1)
              : 0}%
          </p>
        </div>
      </div>

      <div className="status-breakdown">
        <h3>Estado de Órdenes</h3>
        <div className="status-bars">
          <div className="status-bar">
            <div className="status-label">
              <span>Completadas</span>
              <span>{data.completedOrders}</span>
            </div>
            <div className="bar-container">
              <div
                className="bar completed"
                style={{
                  width: `${(data.completedOrders / data.totalOrders) * 100}%`
                }}
              />
            </div>
          </div>
          <div className="status-bar">
            <div className="status-label">
              <span>Pendientes</span>
              <span>{data.pendingOrders}</span>
            </div>
            <div className="bar-container">
              <div
                className="bar pending"
                style={{
                  width: `${(data.pendingOrders / data.totalOrders) * 100}%`
                }}
              />
            </div>
          </div>
          <div className="status-bar">
            <div className="status-label">
              <span>Canceladas</span>
              <span>{data.canceledOrders}</span>
            </div>
            <div className="bar-container">
              <div
                className="bar canceled"
                style={{
                  width: `${(data.canceledOrders / data.totalOrders) * 100}%`
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="daily-sales-section">
        <h3>Ventas Diarias</h3>
        <SalesChart data={data.dailySales} />
      </div>

      <div className="monthly-sales-section">
        <h3>Ventas Mensuales</h3>
        <table className="sales-table">
          <thead>
            <tr>
              <th>Mes</th>
              <th>Año</th>
              <th>Órdenes</th>
              <th>Ingresos</th>
            </tr>
          </thead>
          <tbody>
            {data.monthlySales.map((month, idx) => (
              <tr key={idx}>
                <td>{month.month}</td>
                <td>{month.year}</td>
                <td>{month.orders}</td>
                <td>${parseFloat(month.revenue).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ===== ✅ PRODUCTS REPORT - CORREGIDO =====
function ProductsReport({ data }) {
  return (
    <div className="products-report">
      <div className="metrics-grid">
        <div className="metric-box">
          <h4>Total Productos</h4>
          <p className="metric-value">{data.totalProducts}</p>
        </div>
        <div className="metric-box">
          <h4>Productos Activos</h4>
          <p className="metric-value">{data.activeProducts}</p>
        </div>
        <div className="metric-box">
          <h4>Valor Inventario</h4>
          <p className="metric-value">${parseFloat(data.totalInventoryValue).toFixed(2)}</p>
        </div>
        <div className="metric-box warning">
          <h4>Stock Bajo</h4>
          <p className="metric-value">{data.lowStockProducts}</p>
        </div>
      </div>

      <div className="top-products-section">
        <h3>🏆 Top 10 Productos Más Vendidos</h3>
        <div className="top-products-list">
          {data.topSellingProducts.map((product, idx) => (
            <div key={idx} className="top-product-item">
              <div className="product-rank">#{idx + 1}</div>
              <div className="product-image">
                {/* ✅ IMAGEN CORREGIDA */}
                <img
                  src={getImageUrl(product.imageUrl) || PLACEHOLDER_IMAGE}
                  alt={product.productName}
                  onError={(e) => {
                    console.warn(`⚠️ Error cargando imagen: ${product.imageUrl}`);
                    e.target.src = PLACEHOLDER_IMAGE;
                  }}
                  loading="lazy"
                />
              </div>
              <div className="product-details">
                <h4>{product.productName}</h4>
                <p>{product.quantitySold} unidades vendidas</p>
              </div>
              <div className="product-revenue">
                ${parseFloat(product.revenue).toFixed(2)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {data.lowStockDetails.length > 0 && (
        <div className="low-stock-section">
          <h3>⚠️ Productos con Stock Bajo</h3>
          <table className="low-stock-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Stock Actual</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {data.lowStockDetails.map((product, idx) => (
                <tr key={idx}>
                  <td>{product.productName}</td>
                  <td className={product.currentStock === 0 ? 'out-of-stock' : 'low-stock'}>
                    {product.currentStock}
                  </td>
                  <td>
                    <span className={`badge ${product.status === 'SIN STOCK' ? 'danger' : 'warning'}`}>
                      {product.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ===== VENDORS REPORT =====
function VendorsReport({ data }) {
  return (
    <div className="vendors-report">
      <div className="report-header-stat">
        <h3>Total de Vendedores</h3>
        <p className="big-stat">{data.totalVendors}</p>
      </div>

      <div className="top-vendors-section">
        <h3>🏆 Top 10 Vendedores</h3>
        <div className="vendors-list">
          {data.topVendors.map((vendor, idx) => (
            <div key={idx} className="vendor-card">
              <div className="vendor-rank">#{idx + 1}</div>
              <div className="vendor-info">
                <h4>{vendor.vendorName}</h4>
                <div className="vendor-stats">
                  <span>📦 {vendor.totalOrders} órdenes</span>
                  <span>💰 ${parseFloat(vendor.totalRevenue).toFixed(2)}</span>
                  <span>📊 Promedio: ${parseFloat(vendor.averageOrderValue).toFixed(2)}</span>
                </div>
              </div>
              <div className="vendor-performance">
                <div className="performance-bar">
                  <div
                    className="bar-fill"
                    style={{
                      width: `${Math.min(
                        (vendor.totalOrders / data.topVendors[0].totalOrders) * 100,
                        100
                      )}%`
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ===== CLIENTS REPORT =====
function ClientsReport({ data }) {
  return (
    <div className="clients-report">
      <div className="metrics-grid">
        <div className="metric-box">
          <h4>Total Clientes</h4>
          <p className="metric-value">{data.totalClients}</p>
        </div>
        <div className="metric-box">
          <h4>Clientes Activos</h4>
          <p className="metric-value">{data.activeClients}</p>
        </div>
      </div>

      <div className="top-clients-section">
        <h3>🏆 Top 10 Mejores Clientes</h3>
        <table className="clients-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Cliente</th>
              <th>Teléfono</th>
              <th>Órdenes</th>
              <th>Total Gastado</th>
            </tr>
          </thead>
          <tbody>
            {data.topClients.map((client, idx) => (
              <tr key={idx}>
                <td>{idx + 1}</td>
                <td>{client.clientName}</td>
                <td>{client.clientPhone}</td>
                <td>{client.totalOrders}</td>
                <td className="amount">${parseFloat(client.totalSpent).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ===== SALES CHART =====
function SalesChart({ data }) {
  if (!data || data.length === 0) {
    return <div className="no-data">No hay datos para mostrar</div>;
  }

  const maxRevenue = Math.max(...data.map(d => parseFloat(d.revenue)));

  return (
    <div className="sales-chart">
      <div className="chart-bars">
        {data.map((day, idx) => (
          <div key={idx} className="chart-bar-container">
            <div
              className="chart-bar"
              style={{
                height: `${(parseFloat(day.revenue) / maxRevenue) * 200}px`
              }}
              title={`$${parseFloat(day.revenue).toFixed(2)}`}
            >
              <span className="bar-value">${parseFloat(day.revenue).toFixed(0)}</span>
            </div>
            <div className="bar-label">
              {new Date(day.date).toLocaleDateString('es-ES', {
                day: '2-digit',
                month: 'short'
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===== TOP PRODUCTS CHART =====
function TopProductsChart({ data }) {
  if (!data || data.length === 0) {
    return <div className="no-data">No hay datos para mostrar</div>;
  }

  const maxQuantity = Math.max(...data.map(d => d.quantitySold));

  return (
    <div className="top-products-chart">
      {data.map((product, idx) => (
        <div key={idx} className="product-bar-row">
          <div className="product-name">{product.productName}</div>
          <div className="product-bar-container">
            <div
              className="product-bar"
              style={{
                width: `${(product.quantitySold / maxQuantity) * 100}%`
              }}
            >
              <span className="bar-text">{product.quantitySold} unidades</span>
            </div>
          </div>
          <div className="product-amount">${parseFloat(product.revenue).toFixed(2)}</div>
        </div>
      ))}
    </div>
  );
}

// ===== ORDER DETAIL MODAL =====
function OrderDetailModal({ order, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Detalle de Orden #{order.id.substring(0, 8)}</h3>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <div className="order-detail">
          <div className="detail-section">
            <h4>Información General</h4>
            <p><strong>Estado:</strong> <span className={`badge ${order.estado.toLowerCase()}`}>{order.estado}</span></p>
            <p><strong>Vendedor:</strong> {order.vendedor}</p>
            <p><strong>Cliente:</strong> {order.cliente}</p>
            <p><strong>Fecha:</strong> {new Date(order.fecha).toLocaleString()}</p>
            <p><strong>Total:</strong> <span className="total-amount">${parseFloat(order.total).toFixed(2)}</span></p>
          </div>

          {order.notas && (
            <div className="detail-section notes-section">
              <h4>📝 Notas</h4>
              <p>{order.notas}</p>
            </div>
          )}

          <div className="detail-section">
            <h4>Productos ({order.items.length})</h4>
            <table className="items-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Cantidad</th>
                  <th>Precio Unit.</th>
                  <th>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item, idx) => (
                  <tr key={idx}>
                    <td>{item.productName}</td>
                    <td>{item.cantidad}</td>
                    <td>${parseFloat(item.precioUnitario).toFixed(2)}</td>
                    <td>${parseFloat(item.subtotal).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===== SALE GOALS TAB =====
function SaleGoalsTab({ vendedores, onUpdate, toast }) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedVendedor, setSelectedVendedor] = useState(null);
  const [currentMonth] = useState(new Date().getMonth() + 1);
  const [currentYear] = useState(new Date().getFullYear());

  const handleCreateGoal = (vendedor) => {
    setSelectedVendedor(vendedor);
    setShowCreateModal(true);
  };

  const handleDeleteGoal = async (goalId) => {
    if (!window.confirm('¿Estás seguro de eliminar esta meta?')) return;

    try {
      await client.delete(`/admin/sale-goals/${goalId}`);
      toast.success('Meta eliminada exitosamente');
      onUpdate();
    } catch (error) {
      console.error('Error al eliminar meta:', error);
      toast.error('Error al eliminar meta');
    }
  };

  return (
    <div className="sale-goals-tab">
      <div className="tab-header">
        <h2>
          <span className="material-icons-round">trending_up</span>
          Gestión de Metas de Ventas
        </h2>
        <p className="subtitle">
          Mes actual: {getMonthName(currentMonth)} {currentYear}
        </p>
      </div>

      <div className="vendedores-grid">
        {vendedores.length === 0 ? (
          <div className="empty-state">
            <span className="material-icons-round">person_off</span>
            <p>No hay vendedores registrados</p>
          </div>
        ) : (
          vendedores.map((vendedor) => (
            <div key={vendedor.id} className="vendedor-card">
              <div className="vendedor-header">
                <div className="vendedor-info">
                  <h3>
                    <span className="material-icons-round">person</span>
                    {vendedor.username}
                  </h3>
                  <span className={`status-badge ${vendedor.active ? 'active' : 'inactive'}`}>
                    {vendedor.active ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
              </div>

              {vendedor.currentGoal ? (
                <div className="goal-details">
                  <div className="goal-stats">
                    <div className="stat">
                      <span className="label">Meta:</span>
                      <span className="value">${parseFloat(vendedor.currentGoal.targetAmount).toFixed(2)}</span>
                    </div>
                    <div className="stat">
                      <span className="label">Actual:</span>
                      <span className="value">${parseFloat(vendedor.currentGoal.currentAmount).toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="progress-section">
                    <div className="progress-header">
                      <span>Progreso</span>
                      <span className="percentage">{parseFloat(vendedor.currentGoal.percentage).toFixed(1)}%</span>
                    </div>
                    <div className="progress-bar">
                      <div
                        className={`progress-fill ${vendedor.currentGoal.completed ? 'completed' : ''}`}
                        style={{ width: `${Math.min(parseFloat(vendedor.currentGoal.percentage), 100)}%` }}
                      />
                    </div>
                  </div>

                  {vendedor.currentGoal.completed && (
                    <div className="goal-completed">
                      <span className="material-icons-round">check_circle</span>
                      ¡Meta Completada!
                    </div>
                  )}

                  <div className="goal-actions">
                    <button
                      className="btn-edit-goal"
                      onClick={() => handleCreateGoal(vendedor)}
                    >
                      <span className="material-icons-round">edit</span>
                      Editar Meta
                    </button>
                    <button
                      className="btn-delete-goal"
                      onClick={() => handleDeleteGoal(vendedor.currentGoal.id)}
                    >
                      <span className="material-icons-round">delete</span>
                      Eliminar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="no-goal">
                  <span className="material-icons-round">report_problem</span>
                  <p>No tiene meta asignada este mes</p>
                  <button
                    className="btn-create-goal"
                    onClick={() => handleCreateGoal(vendedor)}
                  >
                    <span className="material-icons-round">add</span>
                    Asignar Meta
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {showCreateModal && (
        <CreateGoalModal
          vendedor={selectedVendedor}
          existingGoal={selectedVendedor.currentGoal}
          onClose={() => {
            setShowCreateModal(false);
            setSelectedVendedor(null);
          }}
          onSuccess={() => {
            setShowCreateModal(false);
            setSelectedVendedor(null);
            onUpdate();
          }}
          toast={toast}
        />
      )}
    </div>
  );
}

// ===== CREATE/EDIT GOAL MODAL =====
function CreateGoalModal({ vendedor, existingGoal, onClose, onSuccess, toast }) {
  const [targetAmount, setTargetAmount] = useState(
    existingGoal ? parseFloat(existingGoal.targetAmount) : ''
  );
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!targetAmount || targetAmount <= 0) {
      toast.error('La meta debe ser mayor a 0');
      return;
    }

    try {
      setLoading(true);

      if (existingGoal) {
        await client.put(`/admin/sale-goals/${existingGoal.id}`, {
          targetAmount: parseFloat(targetAmount)
        });
        toast.success('Meta actualizada exitosamente');
      } else {
        await client.post('/admin/sale-goals', {
          vendedorId: vendedor.id,
          targetAmount: parseFloat(targetAmount),
          month: month,
          year: year
        });
        toast.success('Meta creada exitosamente');
      }

      onSuccess();
    } catch (error) {
      console.error('Error al guardar meta:', error);
      toast.error(error.response?.data?.message || 'Error al guardar meta');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            {existingGoal ? 'Editar Meta' : 'Crear Nueva Meta'}
          </h3>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="goal-form">
          <div className="form-group">
            <label>Vendedor</label>
            <input
              type="text"
              value={vendedor.username}
              disabled
              className="input-disabled"
            />
          </div>

          <div className="form-group">
            <label>Meta de Ventas ($) *</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={targetAmount}
              onChange={(e) => setTargetAmount(e.target.value)}
              placeholder="Ej: 50000.00"
              required
              className="input-amount"
            />
          </div>

          {!existingGoal && (
            <>
              <div className="form-row">
                <div className="form-group">
                  <label>Mes *</label>
                  <select
                    value={month}
                    onChange={(e) => setMonth(parseInt(e.target.value))}
                    required
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                      <option key={m} value={m}>
                        {getMonthName(m)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Año *</label>
                  <input
                    type="number"
                    min="2024"
                    max="2030"
                    value={year}
                    onChange={(e) => setYear(parseInt(e.target.value))}
                    required
                  />
                </div>
              </div>
            </>
          )}

          <div className="form-actions">
            <button
              type="button"
              onClick={onClose}
              className="btn-cancel"
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-save"
              disabled={loading}
            >
              {loading ? 'Guardando...' : (existingGoal ? 'Actualizar' : 'Crear Meta')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function getMonthName(month) {
  const months = [
    '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  return months[month];
}

export default OwnerDashboard;
