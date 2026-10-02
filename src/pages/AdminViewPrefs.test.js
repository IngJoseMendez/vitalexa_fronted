import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdminDashboard, { AdminNuevaVentaPanel } from './AdminDashboard';
import client from '../api/client';
import { prefKey } from '../hooks/usePersistentState';

// Preferencias de vista del admin (CONVENTIONS §10): en Órdenes el orden (campo y sentido), las
// órdenes por página y las columnas; en Nueva venta, el A-Z de los clientes. Se recuerdan por
// usuario aunque se recargue la página (aquí: desmontar y volver a montar) y la PRIMERA petición
// ya usa lo guardado (no hay una con el defecto seguida de otra). La pestaña de estado y la
// búsqueda NO se recuerdan.
jest.mock('../api/client', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }));
jest.mock('../api/promotionService', () => ({
  __esModule: true,
  default: { getValidAdmin: jest.fn(() => Promise.resolve({ data: [] })), completeAssortment: jest.fn() },
}));
jest.mock('../api/specialPromotionService', () => ({
  __esModule: true,
  default: { getVendorPromotions: jest.fn(() => Promise.resolve({ data: { content: [] } })) },
}));
const mockToast = { error: jest.fn(), success: jest.fn(), warning: jest.fn(), info: jest.fn() };
jest.mock('../components/ToastContainer', () => ({ useToast: () => mockToast }));
jest.mock('../services/NotificationService', () => ({ __esModule: true, default: { connect: () => () => {} } }));
jest.mock('../hooks/useSidebarCollapsed', () => () => [false, () => {}]);
jest.mock('../components/SidebarToggle', () => () => null);
jest.mock('../components/AdminDiscountSection', () => () => null);

const stored = (key) => {
  const raw = localStorage.getItem(prefKey(key));
  return raw === null ? null : JSON.parse(raw);
};
const save = (key, value) => localStorage.setItem(prefKey(key), JSON.stringify(value));

const makeOrder = (id) => ({
  id, estado: 'PENDIENTE', fecha: '2026-10-01T10:00:00', total: 50000, discountedTotal: 50000,
  cliente: `Cliente ${id}`, vendedor: 'NinaTorres', paymentStatus: 'PENDING', notas: '',
  items: [{ productName: 'Crema', cantidad: 1, precioUnitario: 1000, subtotal: 1000 }],
});

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  localStorage.setItem('username', 'admin1');
  // Tres páginas para que se vea la paginación; la página pedida es la que vuelve
  client.get.mockImplementation((url, config) => {
    if (url === '/admin/orders/paginated') {
      const { page } = config.params;
      return Promise.resolve({ data: { content: [makeOrder(`p${page}`)], number: page, totalPages: 3, totalElements: 3 } });
    }
    return Promise.resolve({ data: [] });
  });
});
afterAll(() => localStorage.clear());

describe('Órdenes', () => {
  const ordersCalls = () => client.get.mock.calls.filter(([url]) => url === '/admin/orders/paginated');
  const firstParams = () => ordersCalls()[0][1].params;
  const lastParams = () => ordersCalls()[ordersCalls().length - 1][1].params;
  const sortSelect = () => screen.getByRole('combobox', { name: 'Ordenar por' });
  // Su nombre sale del <label> que lo envuelve: "Mostrar <valor> por página"
  const pageSizeSelect = () => screen.getByRole('combobox', { name: /^Mostrar/ });
  const columnsSelect = () => screen.getByTitle('Tarjetas por fila');
  // La grilla no tiene rol: se mira su estilo (las columnas son solo presentación)
  // eslint-disable-next-line -- sin rol accesible: se mira la grilla (testing-library/no-node-access)
  const grid = (container) => container.querySelector('.orders-grid');
  // Al montar, el buscador confirma su valor inicial a los 300 ms y pone la página en 0
  const settleSearchDebounce = () => act(() => new Promise((resolve) => setTimeout(resolve, 350)));

  test('el primer render y la PRIMERA petición ya usan lo guardado (ninguna con el defecto)', async () => {
    save('admin.orders.sort', 'invoiceNumber');
    save('admin.orders.sortDir', 'asc');
    save('admin.orders.pageSize', 50);
    save('admin.orders.columns', '3');
    const { container } = render(<AdminDashboard />);

    // Primer render (todavía con esqueletos): los controles ya muestran lo guardado
    expect(sortSelect()).toHaveValue('invoiceNumber');
    expect(screen.getByRole('button', { name: 'Orden Ascendente' })).toBeInTheDocument();
    expect(pageSizeSelect()).toHaveValue('50');
    expect(columnsSelect()).toHaveValue('3');
    expect(grid(container)).toHaveStyle({ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' });

    await screen.findByText('Ver productos (1)');
    await settleSearchDebounce();
    expect(firstParams()).toEqual({ page: 0, size: 50, status: 'pending', sortBy: 'invoiceNumber', sortOrder: 'asc' });
    ordersCalls().forEach(([, config]) => {
      expect(config.params).toMatchObject({ size: 50, sortBy: 'invoiceNumber', sortOrder: 'asc' });
    });
    expect(grid(container)).toHaveStyle({ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' });
  });

  test('orden, sentido, por página y columnas se recuerdan al volver a montar; cambiarlos vuelve a la página 1 como siempre', async () => {
    const { unmount } = render(<AdminDashboard />);
    await screen.findByText('Ver productos (1)');
    await settleSearchDebounce();
    expect(firstParams()).toEqual({ page: 0, size: 20, status: 'pending', sortBy: 'fecha', sortOrder: 'desc' });
    expect(columnsSelect()).toHaveValue('auto');
    // Montar no escribe nada
    ['sort', 'sortDir', 'pageSize', 'columns'].forEach((k) => expect(stored(`admin.orders.${k}`)).toBeNull());

    // En la página 2, cambiar el orden vuelve a la página 1 (igual que antes)
    fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }));
    await waitFor(() => expect(lastParams().page).toBe(1));
    fireEvent.change(sortSelect(), { target: { value: 'orderNumber' } });
    await waitFor(() => expect(lastParams()).toMatchObject({ page: 0, sortBy: 'orderNumber' }));

    fireEvent.click(screen.getByRole('button', { name: 'Orden Descendente' }));
    await waitFor(() => expect(lastParams()).toMatchObject({ page: 0, sortOrder: 'asc' }));

    fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }));
    await waitFor(() => expect(lastParams().page).toBe(1));
    fireEvent.change(pageSizeSelect(), { target: { value: '50' } });
    await waitFor(() => expect(lastParams()).toEqual({ page: 0, size: 50, status: 'pending', sortBy: 'orderNumber', sortOrder: 'asc' }));

    // Columnas: solo presentación, no pide nada ni cambia de página
    const callsBefore = ordersCalls().length;
    fireEvent.change(columnsSelect(), { target: { value: '2' } });
    expect(ordersCalls()).toHaveLength(callsBefore);

    // Mismo tipo que el estado: el tamaño como número y las columnas como texto
    expect(stored('admin.orders.sort')).toBe('orderNumber');
    expect(stored('admin.orders.sortDir')).toBe('asc');
    expect(stored('admin.orders.pageSize')).toBe(50);
    expect(stored('admin.orders.columns')).toBe('2');
    unmount();

    // "Recargar la página"
    client.get.mockClear();
    const { container } = render(<AdminDashboard />);
    expect(sortSelect()).toHaveValue('orderNumber');
    expect(screen.getByRole('button', { name: 'Orden Ascendente' })).toBeInTheDocument();
    expect(pageSizeSelect()).toHaveValue('50');
    expect(columnsSelect()).toHaveValue('2');
    await screen.findByText('Ver productos (1)');
    expect(grid(container)).toHaveStyle({ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' });
    expect(firstParams()).toEqual({ page: 0, size: 50, status: 'pending', sortBy: 'orderNumber', sortOrder: 'asc' });
  });

  test('la pestaña de estado y la búsqueda NO se recuerdan', async () => {
    save('admin.orders.sort', 'total');
    const { unmount } = render(<AdminDashboard />);
    await screen.findByText('Ver productos (1)');
    fireEvent.click(screen.getByRole('tab', { name: /Completadas/ }));
    fireEvent.change(screen.getByLabelText('Buscar órdenes'), { target: { value: '1500' } });
    await waitFor(() => expect(lastParams()).toMatchObject({ status: 'completed', search: '1500' }));
    unmount();

    client.get.mockClear();
    render(<AdminDashboard />);
    expect(screen.getByRole('tab', { name: /Pendientes/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Buscar órdenes')).toHaveValue('');
    await screen.findByText('Ver productos (1)');
    // El orden sí (es cómo se ve); estado y búsqueda vuelven a los de siempre
    expect(firstParams()).toEqual({ page: 0, size: 20, status: 'pending', sortBy: 'total', sortOrder: 'desc' });
  });

  test('lo guardado que no es una opción del control (o de otro tipo, o JSON roto) vuelve al defecto', async () => {
    save('admin.orders.sort', 'precio');
    save('admin.orders.sortDir', 'up');
    save('admin.orders.pageSize', '50'); // texto: el estado guarda números
    localStorage.setItem(prefKey('admin.orders.columns'), '{roto');
    render(<AdminDashboard />);
    expect(sortSelect()).toHaveValue('fecha');
    expect(screen.getByRole('button', { name: 'Orden Descendente' })).toBeInTheDocument();
    expect(pageSizeSelect()).toHaveValue('20');
    expect(columnsSelect()).toHaveValue('auto');
    await screen.findByText('Ver productos (1)');
    expect(firstParams()).toEqual({ page: 0, size: 20, status: 'pending', sortBy: 'fecha', sortOrder: 'desc' });
  });

  test('cada usuario tiene las suyas (equipo compartido)', async () => {
    save('admin.orders.pageSize', 100); // admin1
    localStorage.setItem('username', 'admin2');
    render(<AdminDashboard />);
    expect(pageSizeSelect()).toHaveValue('20');
    await screen.findByText('Ver productos (1)');
    expect(firstParams().size).toBe(20);
  });

  test('otra pestaña cambia "por página" u orden: esta sigue en su página (no pide una que ya no existe); las columnas sí se sincronizan; al recargar usa lo último', async () => {
    // 60 órdenes: con 20 por página hay 3 páginas; con 100, una sola (la página 3 quedaría vacía)
    client.get.mockImplementation((url, config) => {
      if (url === '/admin/orders/paginated') {
        const { page, size } = config.params;
        const totalPages = Math.ceil(60 / size);
        const content = page < totalPages ? [makeOrder(`p${page}`)] : [];
        return Promise.resolve({ data: { content, number: page, totalPages, totalElements: 60 } });
      }
      return Promise.resolve({ data: [] });
    });
    // La otra pestaña guarda y el navegador avisa a esta con un evento 'storage'
    const otherTabSaves = (key, value) => {
      const storageKey = prefKey(key);
      const raw = JSON.stringify(value);
      localStorage.setItem(storageKey, raw);
      act(() => {
        window.dispatchEvent(new StorageEvent('storage', { key: storageKey, newValue: raw, storageArea: localStorage }));
      });
    };

    const { container, unmount } = render(<AdminDashboard />);
    await screen.findByText('Ver productos (1)');
    await settleSearchDebounce();
    fireEvent.click(screen.getByRole('button', { name: 'Última página' }));
    await waitFor(() => expect(lastParams()).toEqual({ page: 2, size: 20, status: 'pending', sortBy: 'fecha', sortOrder: 'desc' }));
    expect(await screen.findByText('Cliente p2')).toBeInTheDocument(); // llegó la página 3
    expect(screen.getByText('Página 3 de 3')).toBeInTheDocument();
    const callsBefore = ordersCalls().length;

    otherTabSaves('admin.orders.pageSize', 100);
    otherTabSaves('admin.orders.sort', 'orderNumber');
    otherTabSaves('admin.orders.sortDir', 'asc');
    await settleSearchDebounce();
    // Ninguna petición nueva (antes salía {page: 2, size: 100}: "No se encontraron órdenes" y sin
    // paginación para volver); los controles siguen mostrando lo que se usa aquí
    expect(ordersCalls()).toHaveLength(callsBefore);
    expect(pageSizeSelect()).toHaveValue('20');
    expect(sortSelect()).toHaveValue('fecha');
    expect(screen.getByRole('button', { name: 'Orden Descendente' })).toBeInTheDocument();
    expect(screen.getByText('Página 3 de 3')).toBeInTheDocument();
    expect(screen.queryByText('No se encontraron órdenes en esta categoría')).not.toBeInTheDocument();

    // Las columnas son solo presentación: llegan de la otra pestaña sin pedir nada
    otherTabSaves('admin.orders.columns', '2');
    expect(columnsSelect()).toHaveValue('2');
    expect(grid(container)).toHaveStyle({ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' });
    expect(ordersCalls()).toHaveLength(callsBefore);

    // Elegir aquí hace lo de siempre: vuelve a la página 1 con el tamaño elegido, y se guarda
    fireEvent.change(pageSizeSelect(), { target: { value: '50' } });
    await waitFor(() => expect(lastParams()).toEqual({ page: 0, size: 50, status: 'pending', sortBy: 'fecha', sortOrder: 'desc' }));
    expect(stored('admin.orders.pageSize')).toBe(50);
    unmount();

    // Recargar: lo último guardado (el tamaño elegido aquí, el orden de la otra pestaña), desde la página 1
    client.get.mockClear();
    render(<AdminDashboard />);
    await screen.findByText('Ver productos (1)');
    expect(firstParams()).toEqual({ page: 0, size: 50, status: 'pending', sortBy: 'orderNumber', sortOrder: 'asc' });
  });

  test('las columnas guardadas con la clave vieja (adminOrdersColumns) se conservan una sola vez y la clave vieja se borra', async () => {
    localStorage.setItem('adminOrdersColumns', '4');
    const { unmount } = render(<AdminDashboard />);
    expect(columnsSelect()).toHaveValue('4');
    expect(stored('admin.orders.columns')).toBe('4');
    expect(localStorage.getItem('adminOrdersColumns')).toBeNull();
    await screen.findByText('Ver productos (1)');
    unmount();

    // No pisa una preferencia ya guardada; un valor viejo inválido se descarta
    save('admin.orders.columns', '2');
    localStorage.setItem('adminOrdersColumns', '5');
    const view = render(<AdminDashboard />);
    expect(columnsSelect()).toHaveValue('2');
    expect(localStorage.getItem('adminOrdersColumns')).toBeNull();
    await screen.findByText('Ver productos (1)');
    view.unmount();

    localStorage.removeItem(prefKey('admin.orders.columns'));
    localStorage.setItem('adminOrdersColumns', '9');
    render(<AdminDashboard />);
    expect(columnsSelect()).toHaveValue('auto');
    expect(stored('admin.orders.columns')).toBeNull();
    expect(localStorage.getItem('adminOrdersColumns')).toBeNull();
    await screen.findByText('Ver productos (1)');
  });
});

describe('Nueva venta', () => {
  beforeEach(() => {
    client.get.mockImplementation((url) => {
      if (url === '/admin/clients/vendedores') return Promise.resolve({ data: [{ id: 'v1', username: 'NinaTorres' }] });
      if (url === '/admin/clients/seller/v1') {
        return Promise.resolve({ data: [{ id: 'c1', nombre: 'Abarrotes Sol' }, { id: 'c2', nombre: 'Zapatería Luna' }] });
      }
      return Promise.resolve({ data: [] });
    });
  });

  // Elige la vendedora y abre el selector de clientes (todos contienen "a")
  const shownClients = async () => {
    const vendorSelect = await screen.findByLabelText(/^Vendedor/);
    fireEvent.change(vendorSelect, { target: { value: 'nina' } });
    fireEvent.click(screen.getAllByRole('option').find((o) => o.textContent === 'NinaTorres'));
    expect(await screen.findByText('2 clientes encontrados')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Cliente'), { target: { value: 'a' } });
    return screen.getAllByRole('option').map((o) => o.textContent);
  };

  test('el orden A-Z / Z-A de los clientes se recuerda al volver a montar', async () => {
    const { unmount } = render(<AdminNuevaVentaPanel />);
    expect(await shownClients()).toEqual(['Abarrotes Sol', 'Zapatería Luna']);
    expect(stored('admin.newSaleClients.sortDir')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Ordenar A-Z' }));
    expect(stored('admin.newSaleClients.sortDir')).toBe('desc');
    unmount();

    render(<AdminNuevaVentaPanel />);
    expect(await shownClients()).toEqual(['Zapatería Luna', 'Abarrotes Sol']);
  });
});
