import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PromotionFormModal from './PromotionFormModal';
import client from '../../api/client';
import promotionService from '../../api/promotionService';

const mockToast = { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() };
const mockConfirm = jest.fn();
jest.mock('../ToastContainer', () => ({ useToast: () => mockToast }));
jest.mock('../ConfirmDialog', () => ({ useConfirm: () => mockConfirm }));
jest.mock('../../api/client', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('../../api/promotionService', () => ({ __esModule: true, default: { create: jest.fn(), update: jest.fn() } }));

const products = [
    { id: 'm1', nombre: 'Colágeno', precio: 1000, stock: 5, active: true },
    { id: 'g1', nombre: 'Omega', precio: 500, stock: 3, active: true },
];
const vendedores = [{ id: 'v1', username: 'NinaTorres' }, { id: 'v2', username: 'MercyMaestre' }];

// Promoción fija ya creada (respuesta de GET /admin/promotions)
const existing = {
    id: 'p1', nombre: 'Pack 40+2', descripcion: 'Temporada', type: 'PACK', buyQuantity: 40, packPrice: 100000,
    mainProduct: { id: 'm1', nombre: 'Colágeno' }, giftItems: [{ id: 'gi1', product: { id: 'g1', nombre: 'Omega' }, quantity: 2 }],
    allowStackWithDiscounts: false, requiresAssortmentSelection: false, active: true, validFrom: null, validUntil: null,
};

const renderModal = (promotion = null) => {
    const onSuccess = jest.fn();
    const onClose = jest.fn();
    const utils = render(<PromotionFormModal promotion={promotion} onClose={onClose} onSuccess={onSuccess} />);
    const submit = () => fireEvent.submit(utils.container.querySelector('form'));
    return { ...utils, onSuccess, onClose, submit };
};

const lastPayload = (fn) => fn.mock.calls[fn.mock.calls.length - 1].slice(-1)[0];

beforeEach(() => {
    client.get.mockImplementation((url) =>
        Promise.resolve({ data: url === '/admin/clients/vendedores' ? vendedores : products }));
    promotionService.create.mockResolvedValue({ data: { id: 'new', visibleToAll: true } });
    promotionService.update.mockResolvedValue({ data: { id: 'p1', visibleToAll: true } });
    mockConfirm.mockResolvedValue(true);
});

test('crear Surtido: exige el precio del paquete y envía freeQuantity, packPrice y las vendedoras elegidas', async () => {
    const { submit, onSuccess } = renderModal();
    const mainSelect = await screen.findByLabelText(/Producto principal/);

    fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: 'Surtido 13+5' } });
    fireEvent.click(screen.getByLabelText(/Surtido \(Variable\)/));
    fireEvent.change(mainSelect, { target: { value: 'm1' } });
    fireEvent.change(screen.getByLabelText(/Cantidad a comprar/), { target: { value: '13' } });
    fireEvent.change(screen.getByLabelText(/Cantidad Total a Bonificar/), { target: { value: '5' } });

    // Sin precio: no se guarda (el surtido es un paquete a precio fijo)
    submit();
    await waitFor(() => expect(mockToast.warning).toHaveBeenCalledWith('Ingrese el precio del paquete (Surtido)'));
    expect(promotionService.create).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Precio del paquete/), { target: { value: '150000' } });
    expect(screen.getByText(/Precio total del paquete: incluye 13 del producto principal y hasta 5 productos gratis a elección/))
        .toBeInTheDocument();

    // Visibilidad: solo las seleccionadas
    fireEvent.click(screen.getByLabelText(/Solo las seleccionadas/));
    expect(screen.getByText('Ninguna vendedora la verá; solo admin')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Vendedoras asignadas' }));
    fireEvent.click(await screen.findByRole('option', { name: /NinaTorres/ }));
    expect(screen.queryByText('Ninguna vendedora la verá; solo admin')).not.toBeInTheDocument();
    expect(screen.getByText(/comparten asignación/)).toBeInTheDocument();

    submit();
    await waitFor(() => expect(promotionService.create).toHaveBeenCalledTimes(1));
    expect(lastPayload(promotionService.create)).toEqual(expect.objectContaining({
        nombre: 'Surtido 13+5',
        type: 'BUY_GET_FREE',
        buyQuantity: 13,
        freeQuantity: 5,
        packPrice: 150000,
        mainProductId: 'm1',
        requiresAssortmentSelection: true,
        giftItems: [],
        visibleToAll: false,
        allowedVendorIds: ['v1'],
    }));
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalled();
});

test('por defecto la ven todas: envía visibleToAll=true y la lista vacía', async () => {
    const { submit } = renderModal(existing);
    await screen.findByLabelText(/Producto principal/);

    expect(screen.getByLabelText(/Todas las vendedoras/)).toBeChecked();
    submit();

    await waitFor(() => expect(promotionService.update).toHaveBeenCalledTimes(1));
    expect(promotionService.update).toHaveBeenCalledWith('p1', expect.objectContaining({
        type: 'PACK',
        packPrice: 100000,
        giftItems: [{ productId: 'g1', quantity: 2 }],
        visibleToAll: true,
        allowedVendorIds: [],
    }));
});

test('al editar carga la restricción guardada (incluida una vendedora que ya no está en la lista) y la conserva', async () => {
    const restricted = {
        ...existing, visibleToAll: false, allowedVendorIds: ['v2', 'v9'], allowedVendorNames: ['MercyMaestre', 'ExVendedora'],
    };
    promotionService.update.mockResolvedValue({ data: { ...restricted } });
    const { submit } = renderModal(restricted);
    await screen.findByLabelText(/Producto principal/);

    expect(screen.getByLabelText(/Solo las seleccionadas/)).toBeChecked();
    expect(await screen.findByText('MercyMaestre')).toBeInTheDocument();
    expect(screen.getByText('ExVendedora')).toBeInTheDocument();

    // Quitar la que ya no es vendedora
    fireEvent.click(screen.getByRole('button', { name: 'Quitar ExVendedora' }));
    submit();

    await waitFor(() => expect(promotionService.update).toHaveBeenCalledTimes(1));
    expect(lastPayload(promotionService.update)).toEqual(expect.objectContaining({
        visibleToAll: false,
        allowedVendorIds: ['v2'],
    }));
    expect(mockToast.warning).not.toHaveBeenCalled();
});

test('"Solo las seleccionadas" sin ninguna pide confirmación antes de guardar', async () => {
    mockConfirm.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const { submit } = renderModal(existing);
    await screen.findByLabelText(/Producto principal/);

    fireEvent.click(screen.getByLabelText(/Solo las seleccionadas/));

    submit();
    await waitFor(() => expect(mockConfirm).toHaveBeenCalledTimes(1));
    expect(promotionService.update).not.toHaveBeenCalled();

    submit();
    await waitFor(() => expect(promotionService.update).toHaveBeenCalledTimes(1));
    expect(lastPayload(promotionService.update)).toEqual(expect.objectContaining({
        visibleToAll: false,
        allowedVendorIds: [],
    }));
});

test('si el backend aún no conoce la visibilidad, avisa que la promoción la siguen viendo todas', async () => {
    promotionService.update.mockResolvedValue({ data: { id: 'p1', nombre: 'Pack 40+2' } }); // sin visibleToAll
    const restricted = { ...existing, visibleToAll: false, allowedVendorIds: ['v1'], allowedVendorNames: ['NinaTorres'] };
    const { submit, onSuccess } = renderModal(restricted);
    await screen.findByLabelText(/Producto principal/);

    submit();

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(mockToast.warning).toHaveBeenCalledWith(expect.stringMatching(/todavía no aplica la restricción por vendedora/));
});
