import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ProductFormModal from './ProductFormModal';
import productService from '../../api/productService';

const mockToast = { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() };
jest.mock('../ToastContainer', () => ({ useToast: () => mockToast }));
jest.mock('../../api/productService', () => ({
    __esModule: true,
    default: { updateProduct: jest.fn(), createProduct: jest.fn() },
}));

const producto = {
    id: 'p-1', nombre: 'Crema X', descripcion: 'Hidratante', precio: 2000, stock: -4,
    reorderPoint: 10, tagId: '', active: true,
};

beforeEach(() => {
    productService.updateProduct.mockResolvedValue({ data: new Blob(['pdf']) });
    window.URL.createObjectURL = jest.fn(() => 'blob:huella');
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

afterEach(() => {
    HTMLAnchorElement.prototype.click.mockRestore();
});

test('editar: sin campo de stock (solo lectura) y con accesos a Llegada y Conteo físico', () => {
    const onAddStock = jest.fn();
    const onPhysicalCount = jest.fn();
    render(<ProductFormModal product={producto} tags={[]} onClose={jest.fn()} onSuccess={jest.fn()}
        onAddStock={onAddStock} onPhysicalCount={onPhysicalCount} />);

    expect(screen.queryByLabelText(/Stock inicial/)).not.toBeInTheDocument();
    expect(screen.getByTestId('pfm-stock-actual')).toHaveTextContent('-4');
    expect(screen.getByRole('note')).toHaveTextContent('El stock no se edita aquí');

    fireEvent.click(screen.getByRole('button', { name: 'Registrar llegada' }));
    expect(onAddStock).toHaveBeenCalledWith(producto);
    fireEvent.click(screen.getByRole('button', { name: 'Conteo físico' }));
    expect(onPhysicalCount).toHaveBeenCalledWith(producto);
});

test('editar con stock negativo: se puede cambiar el precio y NO se envía el stock', async () => {
    const onSuccess = jest.fn();
    render(<ProductFormModal product={producto} tags={[]} onClose={jest.fn()} onSuccess={onSuccess} />);

    fireEvent.change(screen.getByDisplayValue('2000'), { target: { value: '2500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar Producto' }));

    await waitFor(() => expect(productService.updateProduct).toHaveBeenCalled());
    const data = productService.updateProduct.mock.calls[0][1];
    expect(data.get('precio')).toBe('2500');
    expect(data.get('stock')).toBeNull();
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
});

test('etiqueta: el campo se escribe para buscarla y se envía el tagId elegido', async () => {
    const tags = [{ id: 't-1', name: 'Facial' }, { id: 't-2', name: 'Capilar' }];
    render(<ProductFormModal product={producto} tags={tags} onClose={jest.fn()} onSuccess={jest.fn()} />);

    const campo = screen.getByRole('combobox', { name: 'Categoría / Etiqueta' });
    fireEvent.change(campo, { target: { value: 'capi' } });
    expect(screen.queryByRole('option', { name: 'Facial' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: '-- Sin etiqueta --' })).not.toBeInTheDocument();
    // El resaltado (<mark>) parte el nombre en jsdom ("Capi lar"); en el navegador es "Capilar"
    fireEvent.click(screen.getByRole('option', { name: /Capi\s*lar/ }));
    expect(campo).toHaveValue('Capilar');

    fireEvent.click(screen.getByRole('button', { name: 'Actualizar Producto' }));
    await waitFor(() => expect(productService.updateProduct).toHaveBeenCalled());
    const data = productService.updateProduct.mock.calls[0][1];
    expect(data.get('tagId')).toBe('t-2');
});

test('crear: el stock inicial sigue en el formulario', () => {
    render(<ProductFormModal product={null} tags={[]} onClose={jest.fn()} onSuccess={jest.fn()} />);

    expect(screen.getByLabelText('Stock inicial *')).toBeInTheDocument();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
});
