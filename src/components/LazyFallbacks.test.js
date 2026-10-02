import { Suspense } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  PanelFallback,
  ModalFallback,
  BellFallback,
  LazyErrorBoundary,
  importWithRetry,
  lazyWithRetry,
} from './LazyFallbacks';

// Los dashboards cargan estos módulos con React.lazy(): si un export cambia de nombre, el error
// solo aparecería al abrir la pestaña o el modal en producción. Aquí se comprueba que cada
// import() diferido sigue entregando un componente.
// Solo se importan los módulos (no se renderizan): basta con simular lo que jest no puede cargar.
jest.mock('../services/NotificationService', () => ({ __esModule: true, default: { connect: () => () => {} } }));
jest.mock('react-router-dom', () => ({ useNavigate: () => jest.fn() }), { virtual: true });
jest.mock('../api/client', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() },
  clientService: {},
  DOWNLOAD_TIMEOUT_MS: 120000,
  API_BASE_URL: '',
}));

const LAZY_TARGETS = [
  ['./NotificationCenter', 'default'],
  ['./TagsPanel', 'default'],
  ['./PromotionsPanel', 'default'],
  ['./AdminClientsPanel', 'default'],
  ['./ProductsPanel', 'default'],
  ['./SpecialProductsPanel', 'default'],
  ['./SpecialPromotionsPanel', 'default'],
  ['./InventoryHistoryPanel', 'default'],
  ['./SalesHistoryPanel', 'default'],
  ['./StockReportPanel', 'default'],
  ['./PayrollPanel', 'default'],
  ['./PaymentTransferPanel', 'default'],
  ['./VendorSpecialProductsPanel', 'default'],
  ['./MiNominaPanel', 'default'],
  ['./modals/EditOrderModal', 'default'],
  ['./modals/CompleteOrderModal', 'default'],
  ['./modals/HistoricalInvoiceModal', 'default'],
  ['./modals/OrderManagementModal', 'OrderDetailModal'],
  ['./modals/OrderManagementModal', 'PaymentFormModal'],
  ['./modals/PaymentHistoryModal', 'PaymentHistoryModal'],
];

describe('componentes cargados bajo demanda', () => {
  test.each(LAZY_TARGETS)('%s expone %s como componente', async (modulePath, exportName) => {
    const mod = await import(`${modulePath}`);
    expect(typeof mod[exportName]).toBe('function');
  });
});

describe('pantallas de espera', () => {
  test('panel y modal muestran "Cargando…" como estado', () => {
    const { unmount } = render(<PanelFallback />);
    expect(screen.getByRole('status')).toHaveTextContent('Cargando…');
    unmount();
    render(<ModalFallback />);
    expect(screen.getByRole('status')).toHaveTextContent('Cargando…');
  });

  test('la campana de espera ocupa el mismo hueco y no es interactiva', () => {
    const { container } = render(<BellFallback />);
    expect(container.querySelector('.notification-center .notification-bell')).not.toBeNull();
    expect(container.querySelector('button')).toBeNull();
    // Modificador que le quita la mano y el fondo al pasar el cursor (NotificationCenter.css)
    expect(container.querySelector('.notification-bell.is-placeholder')).not.toBeNull();
  });

  test('la espera de un modal sin onClose no muestra botones; con onClose, Cancelar y Escape cierran', () => {
    const { unmount } = render(<ModalFallback />);
    expect(screen.queryByRole('button')).toBeNull();
    unmount();

    const onClose = jest.fn();
    render(<ModalFallback onClose={onClose} />);
    expect(screen.getByRole('status')).toHaveTextContent('Cargando…');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('reintento de la descarga (lazyWithRetry)', () => {
  test('si el primer import() falla, lo reintenta una vez y entrega el módulo', async () => {
    const mod = { default: () => null };
    const factory = jest.fn().mockRejectedValueOnce(new Error('Loading chunk 1 failed.')).mockResolvedValueOnce(mod);
    await expect(importWithRetry(factory, 0)).resolves.toBe(mod);
    expect(factory).toHaveBeenCalledTimes(2);
  });

  test('si el reintento también falla, entrega el error (no reintenta en bucle)', async () => {
    const factory = jest.fn().mockRejectedValue(new Error('Loading chunk 1 failed.'));
    await expect(importWithRetry(factory, 0)).rejects.toThrow('Loading chunk 1 failed.');
    expect(factory).toHaveBeenCalledTimes(2);
  });

  test('si el import() funciona a la primera, no lo repite', async () => {
    const mod = { default: () => null };
    const factory = jest.fn().mockResolvedValue(mod);
    await expect(importWithRetry(factory, 0)).resolves.toBe(mod);
    expect(factory).toHaveBeenCalledTimes(1);
  });
});

describe('aviso de error (LazyErrorBoundary)', () => {
  let consoleErrorSpy;
  beforeEach(() => {
    // React informa por consola el error que atrapa el boundary: aquí es el esperado
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => consoleErrorSpy.mockRestore());

  const failingFactory = () => Promise.reject(new Error('Loading chunk 9 failed.'));

  test('pestaña: aviso con Reintentar solo en su lugar; lo de al lado sigue renderizado', async () => {
    const Broken = lazyWithRetry(failingFactory, 0);
    render(
      <div>
        <p>Menú del dashboard</p>
        <LazyErrorBoundary>
          <Suspense fallback={<PanelFallback />}>
            <Broken />
          </Suspense>
        </LazyErrorBoundary>
      </div>
    );
    expect(screen.getByRole('status')).toHaveTextContent('Cargando…');
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar');
    expect(screen.getByRole('button', { name: /Reintentar/ })).toBeInTheDocument();
    expect(screen.getByText('Menú del dashboard')).toBeInTheDocument();
  });

  test('pestaña: al cambiar resetKey vuelve a mostrar el contenido', async () => {
    const Broken = lazyWithRetry(failingFactory, 0);
    const Panel = ({ tab }) => (
      <LazyErrorBoundary resetKey={tab}>
        <Suspense fallback={<PanelFallback />}>
          {tab === 'rota' ? <Broken /> : <p>Pestaña sana</p>}
        </Suspense>
      </LazyErrorBoundary>
    );
    const { rerender } = render(<Panel tab="rota" />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    rerender(<Panel tab="sana" />);
    expect(screen.getByText('Pestaña sana')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('modal: diálogo de error con Cerrar (usa el mismo cierre del modal) y Reintentar', async () => {
    const Broken = lazyWithRetry(failingFactory, 0);
    const onClose = jest.fn();
    render(
      <LazyErrorBoundary variant="modal" onClose={onClose}>
        <Suspense fallback={<ModalFallback onClose={onClose} />}>
          <Broken />
        </Suspense>
      </LazyErrorBoundary>
    );
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveAccessibleName('No se pudo cargar');
    expect(screen.getByRole('button', { name: /Reintentar/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('campana: queda en su hueco como botón que recarga', async () => {
    const Broken = lazyWithRetry(failingFactory, 0);
    const { container } = render(
      <LazyErrorBoundary variant="bell">
        <Suspense fallback={<BellFallback />}>
          <Broken />
        </Suspense>
      </LazyErrorBoundary>
    );
    expect(
      await screen.findByRole('button', { name: 'No se pudieron cargar las notificaciones. Reintentar' })
    ).toBeInTheDocument();
    expect(container.querySelector('.notification-center .notification-bell')).not.toBeNull();
  });

  test('página: aviso centrado con Reintentar', async () => {
    const Broken = lazyWithRetry(failingFactory, 0);
    render(
      <LazyErrorBoundary variant="page">
        <Suspense fallback={<PanelFallback />}>
          <Broken />
        </Suspense>
      </LazyErrorBoundary>
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar');
    expect(screen.getByRole('button', { name: /Reintentar/ })).toBeInTheDocument();
  });
});
