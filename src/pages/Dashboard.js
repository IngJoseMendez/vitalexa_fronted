import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import '../styles/Dashboard.css';
import { formatCurrency } from '../utils/formatters';
import { useConfirm } from '../components/ConfirmDialog';

export default function Dashboard() {
  const [username, setUsername] = useState('');
  const [activeTab, setActiveTab] = useState('productos');
  const [productos, setProductos] = useState([]);
  const [formData, setFormData] = useState({
    nombre: '',
    descripcion: '',
    precio: '',
    stock: '',
    image: null
  });
  const [selectedProducto, setSelectedProducto] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [role, setRole] = useState('');
  const navigate = useNavigate();
  const askConfirm = useConfirm();

  useEffect(() => {
    const user = localStorage.getItem('username');
    setUsername(user);
    // decode token to extract role
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const authorities = payload.authorities || payload.roles || [];
        const r = Array.isArray(authorities) && authorities.length > 0 ? authorities[0].replace('ROLE_', '') : (payload.role || '');
        setRole(r);
      } catch (e) {
        setRole('');
      }
    }

    cargarProductos();
  }, []);

  const cargarProductos = async () => {
    try {
      setLoading(true);
      const response = await client.get('/admin/products');
      setProductos(response.data);
    } catch (err) {
      setMessage(`Error al cargar productos: ${err.response?.data?.message || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleImageChange = (e) => {
    setFormData(prev => ({
      ...prev,
      image: e.target.files[0]
    }));
  };

  const handleCrearProducto = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const formDataToSend = new FormData();
      formDataToSend.append('nombre', formData.nombre);
      formDataToSend.append('descripcion', formData.descripcion);
      formDataToSend.append('precio', formData.precio);
      formDataToSend.append('stock', formData.stock);
      if (formData.image) {
        formDataToSend.append('image', formData.image);
      }

      // No fijar Content-Type: deja que axios lo determine (incluye boundary)
      await client.post('/admin/products', formDataToSend);

      setMessage('✅ Producto creado exitosamente');
      setFormData({ nombre: '', descripcion: '', precio: '', stock: '', image: null });
      cargarProductos();
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setMessage(`❌ Error: ${err.response?.data?.message || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleActualizarProducto = async (e) => {
    e.preventDefault();
    if (!selectedProducto) return;

    // Si el producto está inactivo no permitir editar
    if (selectedProducto.active === false) {
      setMessage('❌ No se puede editar un producto inactivo/eliminado');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const formDataToSend = new FormData();
      if (formData.nombre) formDataToSend.append('nombre', formData.nombre);
      if (formData.descripcion) formDataToSend.append('descripcion', formData.descripcion);
      if (formData.precio) formDataToSend.append('precio', formData.precio);
      if (formData.stock) formDataToSend.append('stock', formData.stock);
      if (formData.image) {
        formDataToSend.append('image', formData.image);
      }

      // Use POST to the /{id}/update endpoint to avoid PUT multipart issues in some browsers/servers
      const resp = await client.post(`/admin/products/${selectedProducto.id}/update`, formDataToSend);

      setMessage('✅ Producto actualizado exitosamente');
      setFormData({ nombre: '', descripcion: '', precio: '', stock: '', image: null });
      // Actualizar estado localmente para reflejar cambios de forma inmediata
      setProductos(prev => prev.map(p => p.id === selectedProducto.id ? { ...p, ...resp.data } : p));
      setSelectedProducto(null);
      // También refrescar desde servidor
      cargarProductos();
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      console.error('Error al actualizar:', err);
      const serverMsg = err.response?.data || err.message;
      setMessage(`❌ Error: ${serverMsg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleEditarProducto = (producto) => {
    // No permitir editar si está inactivo
    if (producto.active === false) {
      setMessage('❌ No se puede editar un producto inactivo/eliminado');
      return;
    }

    setSelectedProducto(producto);
    setFormData({
      nombre: producto.nombre,
      descripcion: producto.descripcion,
      precio: producto.precio?.toString() || '',
      stock: producto.stock?.toString() || '',
      image: null
    });
    setActiveTab('editar');
  };

  const handleEliminarProducto = async (id) => {
    const ok = await askConfirm({ title: 'Eliminar producto', message: '¿Eliminar producto?', confirmText: 'Eliminar', cancelText: 'Cancelar' });
    if (ok) {
      try {
        setLoading(true);
        const hard = (role === 'ADMIN' || role === 'OWNER');
        // if admin/owner, perform hard delete
        if (hard) {
          await client.delete(`/admin/products/${id}?hard=true`);
          // remove from local list
          setProductos(prev => prev.filter(p => p.id !== id));
        } else {
          await client.delete(`/admin/products/${id}`);
          setProductos(prev => prev.map(p => p.id === id ? { ...p, active: false } : p));
        }
        setMessage('✅ Producto eliminado');
        setTimeout(() => setMessage(''), 3000);
      } catch (err) {
        setMessage(`❌ Error: ${err.response?.data?.message || err.message}`);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleCambiarEstado = async (id, estadoActual) => {
    try {
      setLoading(true);
      const nuevoEstado = !estadoActual;
      // Use PATCH with query param (server expects 'activo')
      await client.patch(`/admin/products/${id}/estado?activo=${nuevoEstado}`);
      setMessage('✅ Estado actualizado');
      cargarProductos();
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setMessage(`❌ Error: ${err.response?.data?.message || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    navigate('/');
  };

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Dashboard Admin - {username}</h1>
        <button onClick={handleLogout} className="logout-btn">Cerrar sesión</button>
      </header>

      <div className="tabs">
        <button
          className={`tab-btn ${activeTab === 'productos' ? 'active' : ''}`}
          onClick={() => { setActiveTab('productos'); setSelectedProducto(null); }}
        >
          📦 Ver Productos
        </button>
        <button
          className={`tab-btn ${activeTab === 'crear' ? 'active' : ''}`}
          onClick={() => { setActiveTab('crear'); setSelectedProducto(null); setFormData({ nombre: '', descripcion: '', precio: '', stock: '', image: null }); }}
        >
          ➕ Crear Producto
        </button>
        {selectedProducto && (
          <button
            className={`tab-btn ${activeTab === 'editar' ? 'active' : ''}`}
            onClick={() => setActiveTab('editar')}
          >
            ✏️ Editar Producto
          </button>
        )}
      </div>

      {message && <div className={`message ${message.includes('✅') ? 'success' : 'error'}`}>{message}</div>}

      <div className="dashboard-content">
        {/* Tab: Ver Productos */}
        {activeTab === 'productos' && (
          <div className="tab-content">
            <h2>Catálogo de Productos</h2>
            {loading ? (
              <p>Cargando...</p>
            ) : productos.length === 0 ? (
              <p>No hay productos aún</p>
            ) : (
              <div className="productos-grid">
                {productos.map(prod => (
                  <div key={prod.id} className="producto-card">
                    {prod.imageUrl ? (
                      <img
                        src={`http://localhost:8080/uploads/${prod.imageUrl}`}
                        alt={prod.nombre}
                        className="producto-imagen"
                      />
                    ) : (
                      <div className="producto-imagen-placeholder">
                        📷 Sin Imagen
                      </div>
                    )}
                    <div className="producto-info">
                      <h3>{prod.nombre}</h3>
                      <p className="descripcion">{prod.descripcion}</p>
                      <p className="precio">${formatCurrency(prod.precio)}</p>
                      <p className="stock">Stock: {prod.stock}</p>
                      <p className={`estado ${prod.active ? 'activo' : 'inactivo'}`}>
                        {prod.active ? '✅ Activo' : '❌ Inactivo'}
                      </p>
                      <div className="acciones">
                        <button
                          onClick={() => handleEditarProducto(prod)}
                          className="btn-editar"
                          disabled={loading}
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleCambiarEstado(prod.id, prod.active)}
                          className="btn-estado"
                          disabled={loading}
                        >
                          {prod.active ? 'Desactivar' : 'Activar'}
                        </button>
                        <button
                          onClick={() => handleEliminarProducto(prod.id)}
                          className="btn-eliminar"
                          disabled={loading}
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab: Crear Producto */}
        {activeTab === 'crear' && (
          <div className="tab-content">
            <h2>Crear Nuevo Producto</h2>
            <form onSubmit={handleCrearProducto} className="producto-form">
              <div className="form-group">
                <label>Nombre *</label>
                <input
                  type="text"
                  name="nombre"
                  value={formData.nombre}
                  onChange={handleInputChange}
                  required
                  disabled={loading}
                />
              </div>

              <div className="form-group">
                <label>Descripción *</label>
                <textarea
                  name="descripcion"
                  value={formData.descripcion}
                  onChange={handleInputChange}
                  required
                  rows="4"
                  disabled={loading}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Precio *</label>
                  <input
                    type="number"
                    name="precio"
                    value={formData.precio}
                    onChange={handleInputChange}
                    step="0.01"
                    required
                    disabled={loading}
                  />
                </div>
                <div className="form-group">
                  <label>Stock *</label>
                  <input
                    type="number"
                    name="stock"
                    value={formData.stock}
                    onChange={handleInputChange}
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Imagen (Opcional)</label>
                <input
                  type="file"
                  name="image"
                  onChange={handleImageChange}
                  accept="image/*"
                  disabled={loading}
                />
              </div>

              <button type="submit" className="btn-submit" disabled={loading}>
                {loading ? 'Creando...' : 'Crear Producto'}
              </button>
            </form>
          </div>
        )}

        {/* Tab: Editar Producto */}
        {activeTab === 'editar' && selectedProducto && (
          <div className="tab-content">
            <h2>Editar Producto: {selectedProducto.nombre}</h2>
            <form onSubmit={handleActualizarProducto} className="producto-form">
              <div className="form-group">
                <label>Nombre *</label>
                <input
                  type="text"
                  name="nombre"
                  value={formData.nombre}
                  onChange={handleInputChange}
                  required
                  disabled={loading}
                />
              </div>

              <div className="form-group">
                <label>Descripción *</label>
                <textarea
                  name="descripcion"
                  value={formData.descripcion}
                  onChange={handleInputChange}
                  required
                  rows="4"
                  disabled={loading}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Precio *</label>
                  <input
                    type="number"
                    name="precio"
                    value={formData.precio}
                    onChange={handleInputChange}
                    step="0.01"
                    required
                    disabled={loading}
                  />
                </div>
                <div className="form-group">
                  <label>Stock *</label>
                  <input
                    type="number"
                    name="stock"
                    value={formData.stock}
                    onChange={handleInputChange}
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Cambiar Imagen (Opcional)</label>
                <input
                  type="file"
                  name="image"
                  onChange={handleImageChange}
                  accept="image/*"
                  disabled={loading}
                />
              </div>

              <button type="submit" className="btn-submit" disabled={loading}>
                {loading ? 'Actualizando...' : 'Actualizar Producto'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
