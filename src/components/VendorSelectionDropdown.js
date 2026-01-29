// src/components/VendorSelectionDropdown.js
import { useState, useEffect } from 'react';
import { useToast } from './ToastContainer';
import orderService from '../api/orderService';

function VendorSelectionDropdown({
  selectedVendor,
  onChangeVendor,
  label = 'Vendedor Asignado',
  required = false,
  disabled = false
}) {
  const [vendedores, setVendedores] = useState([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    const fetchVendedores = async () => {
      try {
        setLoading(true);
        const response = await orderService.getVendedores();
        setVendedores(response.data || []);
      } catch (error) {
        console.error('Error al cargar vendedores:', error);
        toast.error('Error al cargar vendedores');
        setVendedores([]);
      } finally {
        setLoading(false);
      }
    };

    fetchVendedores();
  }, [toast]);

  return (
    <div className="form-group">
      <label className="form-label">
        {label}
        {required && <span className="required">*</span>}
      </label>
      <select
        className="form-control"
        value={selectedVendor || ''}
        onChange={(e) => onChangeVendor(e.target.value || null)}
        disabled={loading || disabled}
      >
        <option value="">
          {loading ? 'Cargando vendedores...' : 'Selecciona un vendedor'}
        </option>
        {vendedores.map((vendedor) => (
          <option key={vendedor.id} value={vendedor.id}>
            {vendedor.nombre || `${vendedor.username} (${vendedor.email})`}
          </option>
        ))}
      </select>
    </div>
  );
}

export default VendorSelectionDropdown;

