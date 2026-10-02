import { render, fireEvent, waitFor, screen } from '@testing-library/react';
import HistoricalInvoiceModal from './HistoricalInvoiceModal';
import client from '../../api/client';

// Clientes eliminados (archivados) en el selector de cliente de la factura histórica:
// /owner/invoices/clients trae a todos (para encontrar al cliente al EDITAR), pero a un
// archivado no se le hacen facturas nuevas ni se le pasa una factura de otro cliente.

const mockToast = { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() };
jest.mock('../ToastContainer', () => ({ useToast: () => mockToast }));
jest.mock('../ConfirmDialog', () => ({ useConfirm: () => jest.fn(() => Promise.resolve(true)) }));
jest.mock('../../api/client', () => ({ __esModule: true, default: { get: jest.fn(), put: jest.fn(), post: jest.fn() } }));

const clientes = [
    { id: 'c-1', nombre: 'Droguería Activa', nit: '900', active: true },
    { id: 'c-2', nombre: 'Droguería Vieja', nit: '901', active: false },
    { id: 'c-3', nombre: 'Droguería Cerrada', nit: '902', active: false },
];

beforeEach(() => {
    jest.clearAllMocks();
    client.get.mockResolvedValue({ data: clientes });
});

const searchBox = () => screen.getByLabelText(/Buscar Cliente/);

test('factura nueva: el selector no ofrece clientes eliminados', async () => {
    render(<HistoricalInvoiceModal onClose={jest.fn()} onSuccess={jest.fn()} />);
    await waitFor(() => expect(client.get).toHaveBeenCalledWith('/owner/invoices/clients'));

    fireEvent.focus(searchBox());

    expect(await screen.findByText('Droguería Activa')).toBeInTheDocument();
    expect(screen.queryByText(/Droguería Vieja/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Droguería Cerrada/)).not.toBeInTheDocument();
});

test('factura nueva: buscar el nombre de un eliminado no lo muestra', async () => {
    render(<HistoricalInvoiceModal onClose={jest.fn()} onSuccess={jest.fn()} />);
    await waitFor(() => expect(client.get).toHaveBeenCalledWith('/owner/invoices/clients'));

    fireEvent.change(searchBox(), { target: { value: 'Vieja' } });

    expect(await screen.findByText('No se encontraron clientes')).toBeInTheDocument();
    expect(screen.queryByText(/Droguería Vieja/)).not.toBeInTheDocument();
});

test('editar la factura de un cliente eliminado: lo encuentra y lo ofrece (marcado), pero no a otros eliminados', async () => {
    const factura = {
        id: 'o-1', invoiceNumber: 700, estado: 'COMPLETADO', cliente: 'Droguería Vieja',
        fecha: '2026-09-01T10:00:00', completedAt: '2026-09-02T10:00:00', total: 300000, invoiceType: 'NORMAL',
    };
    render(<HistoricalInvoiceModal initialOrder={factura} onClose={jest.fn()} onSuccess={jest.fn()} />);

    // Precarga: el cliente archivado de la factura queda seleccionado (no se pierde al guardar)
    await waitFor(() => expect(searchBox()).toHaveValue('Droguería Vieja'));
    expect(screen.getByTitle('Limpiar búsqueda')).toHaveClass('has-check');

    // Al borrar la búsqueda: activos + el cliente actual (marcado); nunca otro archivado
    fireEvent.change(searchBox(), { target: { value: '' } });
    fireEvent.focus(searchBox());

    expect(await screen.findByText('Droguería Activa')).toBeInTheDocument();
    expect(screen.getByText('Droguería Vieja (eliminado)')).toBeInTheDocument();
    expect(screen.queryByText(/Droguería Cerrada/)).not.toBeInTheDocument();
});
