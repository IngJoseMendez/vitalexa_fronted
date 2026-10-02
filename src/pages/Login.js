import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import { getRoleFromToken } from '../utils/jwtHelper';
import '../styles/Login.css';

// V dorada de la marca (el mismo archivo que usa el header: se descarga una sola vez).
// El ?v=2 evita que el navegador o el hosting sirvan el logo viejo (el de React) desde la caché.
const BRAND_LOGO_SRC = `${process.env.PUBLIC_URL || ''}/logo192.png?v=2`;

// Saludo según la hora del equipo (detalle de bienvenida, no afecta el inicio de sesión)
const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return { text: 'Buenos días', icon: 'wb_sunny' };
  if (hour >= 12 && hour < 19) return { text: 'Buenas tardes', icon: 'wb_twilight' };
  return { text: 'Buenas noches', icon: 'dark_mode' };
};

// Hojas del fondo (posiciones fijas: sin Math.random para que no cambien en cada render)
const LEAVES = [
  { x: 6, delay: 0, duration: 18, size: 26, icon: 'eco' },
  { x: 18, delay: 6, duration: 22, size: 18, icon: 'spa' },
  { x: 34, delay: 11, duration: 20, size: 22, icon: 'eco' },
  { x: 58, delay: 3, duration: 24, size: 16, icon: 'eco' },
  { x: 74, delay: 9, duration: 19, size: 24, icon: 'spa' },
  { x: 88, delay: 14, duration: 23, size: 20, icon: 'eco' },
];

const FEATURES = [
  { icon: 'point_of_sale', tone: 'primary', text: 'Ventas y pedidos al instante' },
  { icon: 'inventory_2', tone: 'success', text: 'Inventario y cartera siempre al día' },
  { icon: 'insights', tone: 'gold', text: 'Reportes listos en un clic' },
];

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [shake, setShake] = useState(false);
  const [greeting] = useState(getGreeting);
  const navigate = useNavigate();

  // La tarjeta "tiembla" suave cuando el inicio de sesión falla
  useEffect(() => {
    if (error) setShake(true);
  }, [error]);

  const updateCapsLock = (e) => {
    if (typeof e.getModifierState === 'function') setCapsLockOn(e.getModifierState('CapsLock'));
  };

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
      } else if (roleClean === 'EMPACADOR') {
        navigate('/empacador');
      } else if (roleClean === 'CLIENTE') {
        navigate('/cliente', { replace: true });
      } else {
        navigate('/login', { replace: true }); // o a donde quieras mandar roles desconocidos
      }


    } catch (err) {
      setError(err.response?.data?.message || 'Error en login');
    } finally {
      setLoading(false);
    }
  };



  return (
    <div className="login-container">
      {/* Fondo animado: luces de marca, puntos y hojas (decorativo) */}
      <div className="login-bg" aria-hidden="true">
        <span className="login-blob login-blob--blue" />
        <span className="login-blob login-blob--green" />
        <span className="login-blob login-blob--gold" />
        <span className="login-dots" />
        {LEAVES.map((leaf, i) => (
          <span
            key={i}
            className="login-leaf material-icons-round"
            style={{
              '--x': `${leaf.x}%`,
              '--delay': `${leaf.delay}s`,
              '--duration': `${leaf.duration}s`,
              '--size': `${leaf.size}px`,
            }}
          >
            {leaf.icon}
          </span>
        ))}
      </div>

      <div className="login-layout">
      {/* Panel de marca (solo en pantallas grandes) */}
      <section className="login-showcase" aria-label="Vitalexa">
        <p className="login-showcase-kicker">
          <span className="material-icons-round" aria-hidden="true">spa</span>
          Medicina natural
        </p>
        <p className="login-showcase-title">Todo tu negocio, en un solo lugar.</p>
        <ul className="login-features">
          {FEATURES.map((feature, i) => (
            <li key={feature.icon} className={`login-feature login-feature--${feature.tone}`} style={{ '--i': i }}>
              <span className="login-feature-icon material-icons-round" aria-hidden="true">{feature.icon}</span>
              {feature.text}
            </li>
          ))}
        </ul>
      </section>

      <div
        className={`login-card${shake ? ' is-shaking' : ''}`}
        onAnimationEnd={(e) => {
          if (e.animationName === 'login-shake') setShake(false);
        }}
      >
        <p className="login-greeting">
          <span className="material-icons-round" aria-hidden="true">{greeting.icon}</span>
          {greeting.text}
        </p>
        {/* Marca: la V dorada + nombre */}
        <div className="login-logo">
          <img
            src={BRAND_LOGO_SRC}
            alt="Vitalexa Logo"
            width="72"
            height="72"
            onError={(e) => {
              // Si falla, mostrar el nombre como antes
              e.target.style.display = 'none';
            }}
          />
          <h1 className="login-brand-name">Vitalexa</h1>
          <p className="login-brand-subtitle">Sistema de Gestión</p>
        </div>
        <p className="login-intro">Ingresa con tu usuario para continuar.</p>
        <form onSubmit={handleLogin} className="login-form">
          <div className="input-group ui-field">
            <label className="ui-label" htmlFor="login-username">Usuario</label>
            <div className="ui-input-group">
              <span className="material-icons-round ui-input-icon" aria-hidden="true">person</span>
              <input
                id="login-username"
                className="ui-input"
                type="text"
                placeholder="Tu usuario"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
                required
              />
            </div>
          </div>
          <div className="input-group ui-field">
            <label className="ui-label" htmlFor="login-password">Contraseña</label>
            <div className="ui-input-group">
              <span className="material-icons-round ui-input-icon" aria-hidden="true">lock</span>
              <input
                id="login-password"
                className="ui-input login-password-input"
                type={showPassword ? 'text' : 'password'}
                placeholder="Tu contraseña"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={updateCapsLock}
                onKeyUp={updateCapsLock}
                onBlur={() => setCapsLockOn(false)}
                disabled={loading}
                required
                aria-describedby={capsLockOn ? 'login-caps-hint' : undefined}
              />
              {/* Ojito: mostrar / ocultar la contraseña */}
              <button
                type="button"
                className="login-eye ui-icon-btn"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                aria-pressed={showPassword}
                disabled={loading}
              >
                <span className={`material-icons-round login-eye-icon${showPassword ? ' is-open' : ''}`} aria-hidden="true">
                  {showPassword ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>
            {capsLockOn && (
              <p id="login-caps-hint" className="login-caps ui-help" role="status">
                <span className="material-icons-round" aria-hidden="true">keyboard_capslock</span>
                Bloq Mayús está activado
              </p>
            )}
          </div>
          <button
            type="submit"
            disabled={loading}
            className="login-submit ui-btn ui-btn--primary ui-btn--lg ui-btn--block"
          >
            {loading && <span className="ui-spinner login-spinner" aria-hidden="true" />}
            {loading ? 'Ingresando…' : 'Ingresar'}
            {!loading && <span className="material-icons-round login-submit-arrow" aria-hidden="true">arrow_forward</span>}
          </button>
        </form>
        {error && (
          <div className="login-error ui-alert ui-alert--danger" role="alert">
            <span className="material-icons-round" aria-hidden="true">error_outline</span>
            <p className="error">{error}</p>
          </div>
        )}
      </div>
      </div>

      <p className="login-footer">Acceso exclusivo para el equipo de Vitalexa</p>
    </div>
  );
}
