// Botón para plegar el menú lateral de Admin/Owner a una barra de solo iconos (los nombres
// quedan en el tooltip de cada botón). En móvil (<= 768px) el CSS lo oculta: allí el menú ya es
// una barra horizontal. Aspecto: .ui-icon-btn del sistema; posición y visibilidad en
// src/styles/Dashboard.css (layout compartido de dashboards).
function SidebarToggle({ collapsed, onToggle }) {
  const label = collapsed ? 'Expandir menú' : 'Plegar menú';
  return (
    <button
      type="button"
      className="sidebar-toggle ui-icon-btn"
      onClick={onToggle}
      aria-expanded={!collapsed}
      aria-label={label}
      title={label}
    >
      <span className="material-icons-round" aria-hidden="true">
        {collapsed ? 'menu' : 'menu_open'}
      </span>
    </button>
  );
}

export default SidebarToggle;
