import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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
    const mainProduct = await screen.findByRole('combobox', { name: /Producto principal/ });

    fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: 'Surtido 13+5' } });
    fireEvent.click(screen.getByLabelText(/Surtido \(Variable\)/));
    // Selector con buscador: se escribe el nombre (sin tilde ni mayúsculas) y se elige la opción
    fireEvent.change(mainProduct, { target: { value: 'colageno' } });
    expect(screen.queryByRole('option', { name: /Omega/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: /Colágeno - \$1000\.00 \(Stock: 5\)/ }));
    expect(mainProduct).toHaveValue('Colágeno - $1000.00 (Stock: 5)');
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

test('crear Fija: producto principal y regalo se buscan escribiendo y se envían igual que antes', async () => {
    const { submit } = renderModal();
    const mainProduct = await screen.findByRole('combobox', { name: /Producto principal/ });

    fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: 'Pack Colágeno' } });
    fireEvent.change(mainProduct, { target: { value: 'colageno' } });
    fireEvent.click(screen.getByRole('option', { name: /Colágeno/ }));

    const gift = screen.getByRole('combobox', { name: /Añadir producto gratis/ });
    const addButton = screen.getByRole('button', { name: 'Agregar' });
    expect(addButton).toBeDisabled();

    fireEvent.change(gift, { target: { value: 'omega' } });
    const option = screen.getByRole('option', { name: /Omega/ });
    // Precio y stock en la segunda línea de la opción
    expect(option).toHaveTextContent('Stock: 3');
    expect(screen.queryByRole('option', { name: /Colágeno/ })).not.toBeInTheDocument();
    fireEvent.click(option);
    expect(gift).toHaveValue('Omega');

    fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '2' } });
    expect(addButton).toBeEnabled();
    fireEvent.click(addButton);

    // El regalo queda en la lista y el selector se vacía para el siguiente
    expect(screen.getByText('Omega')).toBeInTheDocument();
    expect(gift).toHaveValue('');
    expect(addButton).toBeDisabled();

    submit();
    await waitFor(() => expect(promotionService.create).toHaveBeenCalledTimes(1));
    expect(lastPayload(promotionService.create)).toEqual(expect.objectContaining({
        nombre: 'Pack Colágeno',
        type: 'PACK',
        mainProductId: 'm1',
        giftItems: [{ productId: 'g1', quantity: 2 }],
    }));
});

test('editar: el producto principal guardado aparece elegido aunque esté inactivo', async () => {
    client.get.mockImplementation(() => Promise.resolve({
        data: [{ ...products[0], active: false }, products[1]],
    }));
    renderModal(existing);

    const mainProduct = await screen.findByRole('combobox', { name: /Producto principal/ });
    expect(mainProduct).toHaveValue('Colágeno - $1000.00 (Stock: 5)');

    fireEvent.focus(mainProduct);
    expect(screen.getByRole('option', { name: /Colágeno/ })).toHaveTextContent('Inactivo');
    // El regalo solo ofrece productos activos
    fireEvent.keyDown(mainProduct, { key: 'Escape' });
    fireEvent.focus(screen.getByRole('combobox', { name: /Añadir producto gratis/ }));
    expect(within(screen.getByRole('listbox')).getAllByRole('option').map((o) => o.textContent)).toEqual([expect.stringContaining('Omega')]);
});
