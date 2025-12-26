import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import { getRoleFromToken, decodeJWT } from '../utils/jwtHelper';
import '../styles/Login.css';



export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await client.post('/auth/login', { username, password });
      const token = response.data.token;

      // Extraer el rol del token
      const role = getRoleFromToken(token);


      if (!role) {
        setError('No se pudo obtener el rol del usuario');
        return;
      }

      // Guardar en localStorage
      localStorage.setItem('token', token);
      localStorage.setItem('username', username);
      localStorage.setItem('role', role);

      // Redirigir según el rol (sin prefijo ROLE_)
      const roleClean = role.replace('ROLE_', '');

      if (roleClean === 'ADMIN') {
        navigate('/admin');
      } else if (roleClean === 'VENDEDOR') {
        navigate('/vendedor');
      } else if (roleClean === 'OWNER') {
        navigate('/owner');
      } else {
        navigate('/dashboard'); // Fallback al dashboard antiguo
      }

    } catch (err) {
      setError(err.response?.data?.message || 'Error en login');
    } finally {
      setLoading(false);
    }
  };



  return (
    <div className="login-container">
      <div className="login-card">
        <h1>Sistema Vitalexa</h1>
        <form onSubmit={handleLogin}>
          <div className="input-group">
            <span className="material-icons-round">person</span>
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
              required
            />
          </div>
          <div className="input-group">
            <span className="material-icons-round">lock</span>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
            />
          </div>
          <button type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'} <span className="material-icons-round" style={{ fontSize: '18px' }}>arrow_forward</span>
          </button>
        </form>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
