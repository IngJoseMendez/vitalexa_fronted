import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdminClientsPanel from './AdminClientsPanel';
import client from '../api/client';
import { prefKey } from '../hooks/usePersistentState';

// Preferencia de vista de Clientes (Admin y Owner, CONVENTIONS §10): el orden A-Z / Z-A se
// recuerda por usuario aunque se recargue la página (aquí: desmontar y volver a montar). Es una
// sola clave para los dos paneles (el componente es el mismo y la clave ya es por usuario). La
// búsqueda, la vendedora y la pestaña Activos/Eliminados NO se recuerdan. Las peticiones son las
// de siempre (el orden es local).
const mockToast = { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() };
jest.mock('./ToastContainer', () => ({ useToast: () => mockToast }));
jest.mock('./ConfirmDialog', () => ({ useConfirm: () => jest.fn(() => Promise.resolve(true)) }));
jest.mock('../api/client', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

const stored = (key) => {
  const raw = localStorage.getItem(prefKey(key));
  return raw === null ? null : JSON.parse(raw);
};
const save = (key, value) => localStorage.setItem(prefKey(key), JSON.stringify(value));

const cliente = (id, nombre, active = true) => ({
  id, nombre, nit: `900${id}`, direccion: 'Calle 1', vendedorAsignadoId: 'v1', vendedorAsignadoNombre: 'NinaTorres',
  totalCompras: 0, active,
});
const ACTIVOS = [cliente('1', 'Abarrotes Sol'), cliente('2', 'Zapatería Luna')];
const ARCHIVADOS = [cliente('9', 'Farmacia Vieja', false)];

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  localStorage.setItem('username', 'admin1');
  localStorage.setItem('role', 'ROLE_ADMIN');
  client.get.mockImplementation((url, config) => {
    if (url === '/admin/clients/vendedores') return Promise.resolve({ data: [{ id: 'v1', username: 'NinaTorres' }] });
    if (url === '/admin/clients') {
      return Promise.resolve({ data: config?.params?.status === 'archived' ? ARCHIVADOS : ACTIVOS });
    }
    return Promise.resolve({ data: [] });
  });
});
afterAll(() => localStorage.clear());

const sortBtn = () => screen.getByRole('button', { name: /^(A-Z|Z-A)$/ });
const shownClients = () => screen.getAllByRole('heading')
  .map((h) => h.textContent)
  .filter((name) => ACTIVOS.some((c) => c.nombre === name));

test('el orden A-Z / Z-A se recuerda al volver a montar y la lista llega ya ordenada', async () => {
  const { unmount } = render(<AdminClientsPanel />);
  await screen.findByText('Abarrotes Sol');
  expect(sortBtn()).toHaveTextContent('A-Z');
  expect(shownClients()).toEqual(['Abarrotes Sol', 'Zapatería Luna']);
  expect(stored('clientsPanel.sortDir')).toBeNull(); // montar no escribe

  fireEvent.click(sortBtn());
  expect(sortBtn()).toHaveTextContent('Z-A');
  expect(shownClients()).toEqual(['Zapatería Luna', 'Abarrotes Sol']);
  expect(stored('clientsPanel.sortDir')).toBe('desc');
  const firstMountCalls = [...client.get.mock.calls]; // cambiar el orden no pidió nada
  unmount();

  // "Recargar la página"
  client.get.mockClear();
  render(<AdminClientsPanel />);
  await screen.findByText('Abarrotes Sol');
  expect(sortBtn()).toHaveTextContent('Z-A');
  expect(shownClients()).toEqual(['Zapatería Luna', 'Abarrotes Sol']);
  // Mismas peticiones de siempre (el orden es local)
  await waitFor(() => expect(client.get.mock.calls).toHaveLength(firstMountCalls.length));
  expect(client.get.mock.calls).toEqual(firstMountCalls);
});

test('la pestaña Eliminados y la búsqueda NO se recuerdan; el orden sí', async () => {
  save('clientsPanel.sortDir', 'desc');
  const { unmount } = render(<AdminClientsPanel />);
  await screen.findByText('Abarrotes Sol');
  fireEvent.click(screen.getByRole('tab', { name: 'Eliminados' }));
  await screen.findByText('Farmacia Vieja');
  fireEvent.change(screen.getByPlaceholderText(/Buscar por nombre/), { target: { value: 'farm' } });
  unmount();

  render(<AdminClientsPanel />);
  await screen.findByText('Abarrotes Sol');
  expect(screen.getByRole('tab', { name: 'Activos' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByPlaceholderText(/Buscar por nombre/)).toHaveValue('');
  expect(sortBtn()).toHaveTextContent('Z-A');
  expect(shownClients()).toEqual(['Zapatería Luna', 'Abarrotes Sol']);
});

test('lo guardado que no es una opción vuelve a A-Z', async () => {
  save('clientsPanel.sortDir', 'za');
  render(<AdminClientsPanel />);
  await screen.findByText('Abarrotes Sol');
  await waitFor(() => expect(sortBtn()).toHaveTextContent('A-Z'));
  expect(shownClients()).toEqual(['Abarrotes Sol', 'Zapatería Luna']);
});
