import { render, screen, fireEvent, within } from '@testing-library/react';
import AssortmentSelectionModal from './AssortmentSelectionModal';
import client from '../../api/client';
import promotionService from '../../api/promotionService';

// axios no se resuelve en el Jest de CRA: el cliente y el servicio se reemplazan
jest.mock('../../api/client', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('../../api/promotionService', () => ({ __esModule: true, default: { completeAssortment: jest.fn() } }));
const mockToast = { error: jest.fn(), success: jest.fn(), warning: jest.fn(), info: jest.fn() };
jest.mock('../ToastContainer', () => ({ useToast: () => mockToast }));

// Surtido "13 + hasta 2 gratis" por $100.000
const surtido = {
    id: 'surtido-1', nombre: 'Surtido 13+2', type: 'BUY_GET_FREE', buyQuantity: 13, freeQuantity: 2,
    packPrice: 100000, mainProduct: { id: 'm', nombre: 'Colágeno' },
};
const productos = [
    { id: 'a', nombre: 'Aceite', active: true, stock: 20, precio: 5000 },
    { id: 'b', nombre: 'Bálsamo', active: true, stock: 20, precio: 7000 },
    { id: 'sp', nombre: 'Aceite especial', active: true, stock: 20, isSpecialProduct: true },
];

const renderModal = (props = {}) => {
    const onConfirm = jest.fn();
    const onClose = jest.fn();
    render(
        <AssortmentSelectionModal
            orderId={null}
            promotion={surtido}
            isStandalone={true}
            existingProducts={productos}
            onConfirm={onConfirm}
            onClose={onClose}
            {...props}
        />
    );
    return { onConfirm, onClose };
};

const search = (text) => fireEvent.change(screen.getByLabelText('Buscar Producto'), { target: { value: text } });
const addFromResults = (name) => {
    const row = screen.getByText(name).closest('.product-search-item');
    fireEvent.click(within(row).getByRole('button', { name: 'Agregar' }));
};

beforeEach(() => {
    client.get.mockResolvedValue({ data: productos });
    promotionService.completeAssortment.mockResolvedValue({});
});

test('pide HASTA freeQuantity gratis (no buyQuantity) y los devuelve a $0, sin precio y sin llamar al backend', () => {
    const { onConfirm, onClose } = renderModal();

    expect(screen.getByText('Escoger productos gratis')).toBeInTheDocument();
    expect(screen.getByText(/hasta 2$/)).toBeInTheDocument();

    search('a');
    // Los productos especiales no se ofrecen como gratis
    expect(screen.queryByText('Aceite especial')).not.toBeInTheDocument();
    addFromResults('Aceite');
    search('b');
    addFromResults('Bálsamo');

    // Ya escogió los 2: no se puede agregar un tercero (antes pedía 13 = buyQuantity)
    expect(screen.getByLabelText('Buscar Producto')).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Agregar paquete' }));
    expect(onConfirm).toHaveBeenCalledWith([
        { productId: 'a', nombre: 'Aceite', cantidad: 1 },
        { productId: 'b', nombre: 'Bálsamo', cantidad: 1 },
    ]);
    expect(onClose).toHaveBeenCalled();
    expect(promotionService.completeAssortment).not.toHaveBeenCalled();
    expect(client.get).not.toHaveBeenCalled();
});

test('la cantidad de un gratis no pasa del máximo del paquete', () => {
    const { onConfirm } = renderModal();

    search('a');
    addFromResults('Aceite');
    fireEvent.change(screen.getByLabelText('Cantidad de Aceite'), { target: { value: '9' } });

    fireEvent.click(screen.getByRole('button', { name: 'Agregar paquete' }));
    expect(onConfirm).toHaveBeenCalledWith([{ productId: 'a', nombre: 'Aceite', cantidad: 2 }]);
});

test('se puede agregar el paquete sin escoger gratis (es "hasta")', () => {
    const { onConfirm } = renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Agregar paquete' }));
    expect(onConfirm).toHaveBeenCalledWith([]);
});

test('un surtido sin "Cantidad Total a Bonificar" (creado antes del cambio) no se puede agregar', () => {
    const { onConfirm } = renderModal({ promotion: { ...surtido, freeQuantity: null } });

    expect(screen.getByRole('alert')).toHaveTextContent(/Cantidad Total a Bonificar/);
    const boton = screen.getByRole('button', { name: 'Agregar paquete' });
    expect(boton).toBeDisabled();
    fireEvent.click(boton);
    expect(onConfirm).not.toHaveBeenCalled();
});

test('muestra el precio del paquete, o GRATIS si va bonificado', () => {
    renderModal({ promotion: { ...surtido, isBonified: true, packPrice: null } });
    expect(screen.getByText('GRATIS (bonificada)')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
