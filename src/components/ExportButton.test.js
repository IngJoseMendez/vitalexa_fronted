import React, { useEffect, useState } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import ExportButton, { EXPORT_FORMATS } from './ExportButton';

describe('ExportButton', () => {
    test.each([
        ['excel', 'table_view', 'Excel'],
        ['pdf', 'picture_as_pdf', 'PDF'],
        ['csv', 'description', 'CSV'],
    ])('kind=%s: clase de formato, icono y etiqueta por defecto', (kind, icon, label) => {
        render(<ExportButton kind={kind} onClick={() => {}} />);
        const btn = screen.getByRole('button', { name: label });

        expect(btn).toHaveAttribute('type', 'button');
        expect(btn).toHaveClass('ui-btn', `ui-btn--${kind}`);
        expect(btn).not.toHaveClass('is-loading');
        expect(btn).not.toHaveAttribute('aria-busy');
        expect(btn.querySelector('.material-icons-round')).toHaveTextContent(icon);
        expect(btn.querySelector('.ui-spinner')).toBeNull();
        expect(EXPORT_FORMATS[kind].icon).toBe(icon);
    });

    test('loading: spinner en lugar del icono, texto de carga, aria-busy y clase is-loading', () => {
        render(<ExportButton kind="excel" label="Excel" loading disabled onClick={() => {}} />);
        const btn = screen.getByRole('button', { name: 'Exportando...' });

        expect(btn).toHaveClass('ui-btn', 'ui-btn--excel', 'is-loading');
        expect(btn).toHaveAttribute('aria-busy', 'true');
        expect(btn.querySelector('.ui-spinner')).not.toBeNull();
        expect(btn.querySelector('.material-icons-round')).toBeNull();
        // La etiqueta normal solo reserva el ancho: oculta para lectores de pantalla
        const sizer = btn.querySelector('.ui-btn-label-sizer');
        expect(sizer).toHaveTextContent('Excel');
        expect(sizer).toHaveAttribute('aria-hidden', 'true');
        expect(btn).toBeDisabled();
    });

    test('loadingLabel personalizado', () => {
        render(<ExportButton kind="pdf" label="PDF" loading loadingLabel="Generando..." onClick={() => {}} />);
        expect(screen.getByRole('button', { name: 'Generando...' })).toHaveClass('ui-btn--pdf', 'is-loading');
        expect(screen.queryByText('Exportando...')).toBeNull();
    });

    test('sin loading no muestra el texto de carga', () => {
        render(<ExportButton kind="csv" label="CSV" onClick={() => {}} />);
        expect(screen.queryByText('Exportando...')).toBeNull();
        expect(screen.getByText('CSV')).toBeInTheDocument();
    });

    test('onClick se llama con el evento', () => {
        const onClick = jest.fn();
        render(<ExportButton kind="excel" label="Excel" onClick={onClick} />);
        fireEvent.click(screen.getByRole('button', { name: 'Excel' }));
        expect(onClick).toHaveBeenCalledTimes(1);
        expect(onClick.mock.calls[0][0]).toHaveProperty('type', 'click');
    });

    test('disabled: no llama a onClick y queda deshabilitado', () => {
        const onClick = jest.fn();
        render(<ExportButton kind="excel" label="Excel" disabled onClick={onClick} />);
        const btn = screen.getByRole('button', { name: 'Excel' });
        expect(btn).toBeDisabled();
        fireEvent.click(btn);
        expect(onClick).not.toHaveBeenCalled();
    });

    test('pasa title, aria-label, className, tamaño, block y otros atributos tal cual', () => {
        render(
            <ExportButton
                kind="excel"
                label="Exportar TODOS los Clientes"
                title="Descargar Excel"
                aria-label="Descargar todos los clientes en Excel"
                className="acp-export-all-btn"
                size="lg"
                block
                data-testid="export-all"
                onClick={() => {}}
            />
        );
        const btn = screen.getByTestId('export-all');
        expect(btn).toHaveAttribute('title', 'Descargar Excel');
        expect(btn).toHaveAttribute('aria-label', 'Descargar todos los clientes en Excel');
        expect(btn).toHaveClass('ui-btn', 'ui-btn--excel', 'ui-btn--lg', 'ui-btn--block', 'acp-export-all-btn');
        expect(btn).toHaveTextContent('Exportar TODOS los Clientes');
        expect(btn).toHaveAttribute('type', 'button');
    });

    test('size="sm" agrega ui-btn--sm; size="md" no agrega tamaño', () => {
        const { rerender } = render(<ExportButton kind="pdf" size="sm" onClick={() => {}} />);
        expect(screen.getByRole('button', { name: 'PDF' })).toHaveClass('ui-btn--sm');
        rerender(<ExportButton kind="pdf" size="md" onClick={() => {}} />);
        const btn = screen.getByRole('button', { name: 'PDF' });
        expect(btn).not.toHaveClass('ui-btn--sm');
        expect(btn).not.toHaveClass('ui-btn--lg');
    });

    test('type siempre es "button" (no envía formularios)', () => {
        const onSubmit = jest.fn((e) => e.preventDefault());
        render(
            <form onSubmit={onSubmit}>
                <ExportButton kind="excel" type="submit" onClick={() => {}} />
            </form>
        );
        const btn = screen.getByRole('button', { name: 'Excel' });
        expect(btn).toHaveAttribute('type', 'button');
        fireEvent.click(btn);
        expect(onSubmit).not.toHaveBeenCalled();
    });

    // Patrón exportingKey (SPEC §3): un solo boolean "exporting" para las guardas y los
    // disabled, y una clave para saber cuál botón se pulsó. Solo ese muestra "Exportando...".
    test('patrón exportingKey: solo el botón pulsado muestra la carga; los demás quedan deshabilitados', async () => {
        let finish;
        function Group() {
            const [exporting, setExporting] = useState(false);
            const [exportingKey, setExportingKey] = useState(null);
            useEffect(() => { if (!exporting) setExportingKey(null); }, [exporting]);
            const handleExport = async () => {
                if (exporting) return;
                setExporting(true);
                await new Promise((resolve) => { finish = resolve; });
                setExporting(false);
            };
            return (
                <div>
                    {['excel', 'pdf', 'csv'].map((k) => (
                        <ExportButton
                            key={k}
                            kind={k}
                            loading={exporting && exportingKey === k}
                            disabled={exporting}
                            onClick={() => { setExportingKey(k); handleExport(k); }}
                        />
                    ))}
                </div>
            );
        }

        render(<Group />);
        fireEvent.click(screen.getByRole('button', { name: 'PDF' }));

        expect(screen.getAllByText('Exportando...')).toHaveLength(1);
        const busy = screen.getByRole('button', { name: 'Exportando...' });
        expect(busy).toHaveClass('ui-btn--pdf', 'is-loading');
        expect(screen.getByRole('button', { name: 'Excel' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Excel' })).not.toHaveClass('is-loading');
        expect(screen.getByRole('button', { name: 'CSV' })).toBeDisabled();

        await act(async () => { finish(); });

        expect(screen.queryByText('Exportando...')).toBeNull();
        expect(screen.getByRole('button', { name: 'PDF' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'PDF' })).not.toHaveAttribute('aria-busy');
    });

    // Variante recomendada en CONVENTIONS §9.3: la clave se marca en onClickCapture y el
    // onClick queda idéntico al de hoy (fe-guard no reporta pérdida del handler)
    test('patrón exportingKey con onClickCapture: la clave se marca antes del handler', async () => {
        const order = [];
        let finish;
        function Group() {
            const [exporting, setExporting] = useState(false);
            const [exportingKey, setExportingKey] = useState(null);
            useEffect(() => { if (!exporting) setExportingKey(null); }, [exporting]);
            const handleExportReport = async (format) => {
                if (exporting) return;
                order.push(`export:${format}`);
                setExporting(true);
                await new Promise((resolve) => { finish = resolve; });
                setExporting(false);
            };
            return (
                <div>
                    {['excel', 'csv'].map((k) => (
                        <ExportButton
                            key={k}
                            kind={k}
                            loading={exporting && exportingKey === k}
                            disabled={exporting}
                            onClickCapture={() => { order.push(`key:${k}`); setExportingKey(k); }}
                            onClick={() => handleExportReport(k)}
                        />
                    ))}
                </div>
            );
        }

        render(<Group />);
        fireEvent.click(screen.getByRole('button', { name: 'Excel' }));

        expect(order).toEqual(['key:excel', 'export:excel']);
        expect(screen.getByRole('button', { name: 'Exportando...' })).toHaveClass('ui-btn--excel');
        expect(screen.getByRole('button', { name: 'CSV' })).toBeDisabled();

        // Un botón deshabilitado no dispara onClickCapture: la clave no se pisa
        fireEvent.click(screen.getByRole('button', { name: 'CSV' }));
        expect(order).toEqual(['key:excel', 'export:excel']);
        expect(screen.getByRole('button', { name: 'Exportando...' })).toHaveClass('ui-btn--excel');

        await act(async () => { finish(); });
        expect(screen.queryByText('Exportando...')).toBeNull();
    });
});
