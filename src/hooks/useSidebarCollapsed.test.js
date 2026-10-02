import { render, screen, fireEvent } from '@testing-library/react';
import useSidebarCollapsed, { clearStorageKeepingSidebarPrefs, sidebarPrefKey } from './useSidebarCollapsed';
import SidebarToggle from '../components/SidebarToggle';

// Igual que en los dashboards: la clase raíz cambia y el botón vive dentro del menú
function Harness({ panel }) {
    const [collapsed, toggle] = useSidebarCollapsed(panel);
    return (
        <div data-testid="root" className={`admin-dashboard${collapsed ? ' sidebar-collapsed' : ''}`}>
            <SidebarToggle collapsed={collapsed} onToggle={toggle} />
        </div>
    );
}

const originalStorage = Object.getOwnPropertyDescriptor(window, 'localStorage');

beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('username', 'admin1');
});

afterEach(() => {
    if (originalStorage) Object.defineProperty(window, 'localStorage', originalStorage);
    else delete window.localStorage;
});

test('por defecto expandido; al plegar cambia la clase, el botón y se recuerda por usuario', () => {
    const { unmount } = render(<Harness panel="admin" />);
    expect(screen.getByTestId('root')).not.toHaveClass('sidebar-collapsed');

    const toggle = screen.getByRole('button', { name: 'Plegar menú' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(toggle);

    expect(screen.getByTestId('root')).toHaveClass('sidebar-collapsed');
    expect(screen.getByRole('button', { name: 'Expandir menú' })).toHaveAttribute('aria-expanded', 'false');
    expect(localStorage.getItem('vx:sidebarCollapsed:admin:admin1')).toBe('1');

    // Al volver a entrar arranca plegado
    unmount();
    render(<Harness panel="admin" />);
    expect(screen.getByTestId('root')).toHaveClass('sidebar-collapsed');
});

test('la preferencia es por usuario y por panel', () => {
    localStorage.setItem(sidebarPrefKey('admin'), '1'); // admin1 lo plegó en /admin

    localStorage.setItem('username', 'otra');
    const { unmount } = render(<Harness panel="admin" />);
    expect(screen.getByTestId('root')).not.toHaveClass('sidebar-collapsed');
    unmount();

    localStorage.setItem('username', 'admin1');
    render(<Harness panel="owner" />);
    expect(screen.getByTestId('root')).not.toHaveClass('sidebar-collapsed');
});

test('sin almacenamiento (modo privado / bloqueado) el menú igual se pliega', () => {
    Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() { throw new DOMException('Acceso denegado', 'SecurityError'); },
    });

    render(<Harness panel="owner" />);
    expect(screen.getByTestId('root')).not.toHaveClass('sidebar-collapsed');
    fireEvent.click(screen.getByRole('button', { name: 'Plegar menú' }));
    expect(screen.getByTestId('root')).toHaveClass('sidebar-collapsed');
});

test('cerrar sesión borra la sesión pero conserva la preferencia del menú', () => {
    localStorage.setItem('token', 'jwt');
    localStorage.setItem('role', 'ROLE_ADMIN');
    localStorage.setItem('vx:sidebarCollapsed:admin:admin1', '1');
    localStorage.setItem('vx:sidebarCollapsed:owner:dueno', '0');

    clearStorageKeepingSidebarPrefs();

    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('role')).toBeNull();
    expect(localStorage.getItem('username')).toBeNull();
    expect(localStorage.getItem('vx:sidebarCollapsed:admin:admin1')).toBe('1');
    expect(localStorage.getItem('vx:sidebarCollapsed:owner:dueno')).toBe('0');
    expect(localStorage).toHaveLength(2);
});
