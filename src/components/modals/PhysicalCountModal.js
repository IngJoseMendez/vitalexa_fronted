import React, { useState } from 'react';
import productService from '../../api/productService';
import { formatDelta } from '../../utils/inventoryMovements';
import './PhysicalCountModal.css';

/**
 * Ajuste por CONTEO FÍSICO de un producto.
 *
 * El usuario escribe cuántas unidades contó en la bodega. Como el sistema descuenta el stock
 * al CREAR el pedido, las unidades de pedidos sin despachar siguen en la bodega pero ya
 * están restadas: el backend guarda stock = contado - en pedidos (puede quedar negativo si se
 * vendió más de lo que hay) y deja el movimiento en el historial con usuario y motivo.
 *
 * @param product   { id, nombre, stockEnBD?|stock?, stockComprometido? }
 * @param onSuccess se llama con el resultado para refrescar la pantalla de origen
 */
export default function PhysicalCountModal({ product, onClose, onSuccess }) {
    const [conteo, setConteo] = useState('');
    const [motivo, setMotivo] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [result, setResult] = useState(null);

    if (!product) return null;

    const sistemaActual = product.stockEnBD ?? product.stock;
    const comprometido = product.stockComprometido;
    const conteoNum = conteo === '' ? null : Number(conteo);
    const conteoValido = conteoNum !== null && Number.isInteger(conteoNum) && conteoNum >= 0;
    const vistaPrevia = conteoValido && typeof comprometido === 'number' ? conteoNum - comprometido : null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        if (!conteoValido) {
            setError('Escribe las unidades contadas (un número entero, 0 o más).');
            return;
        }
        if (!motivo.trim()) {
            setError('Escribe el motivo del conteo.');
            return;
        }
        setLoading(true);
        try {
            const response = await productService.registerPhysicalCount(product.id, conteoNum, motivo.trim());
            setResult(response.data);
            if (onSuccess) onSuccess(response.data);
        } catch (err) {
            console.error('Error en conteo físico:', err);
            setError(err?.response?.data?.message || 'No se pudo registrar el conteo físico. Intenta de nuevo.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="pcm-overlay" onClick={onClose}>
            <div
                className="pcm-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="pcm-title"
                onClick={e => e.stopPropagation()}
            >
                <div className="pcm-header">
                    <div>
                        <h3 id="pcm-title">
                            <span className="material-icons-round" aria-hidden="true">fact_check</span>
                            Conteo físico
                        </h3>
                        <p className="pcm-product">{product.nombre}</p>
                    </div>
                    <button type="button" className="pcm-close" onClick={onClose} aria-label="Cerrar">&times;</button>
                </div>

                {result ? (
                    <div className="pcm-body">
                        <div className="pcm-success" role="status">
                            <span className="material-icons-round" aria-hidden="true">check_circle</span>
                            Conteo registrado
                        </div>
                        <dl className="pcm-result">
                            <div><dt>Unidades contadas</dt><dd>{result.conteo}</dd></div>
                            <div><dt>En pedidos sin despachar</dt><dd>{result.comprometido}</dd></div>
                            <div><dt>Sistema antes</dt><dd>{result.stockAnterior}</dd></div>
                            <div><dt>Sistema ahora</dt><dd>{result.stockNuevo}</dd></div>
                            <div>
                                <dt>Diferencia</dt>
                                <dd className={result.diferencia > 0 ? 'pcm-in' : result.diferencia < 0 ? 'pcm-out' : ''}>
                                    {formatDelta(result.diferencia)}
                                </dd>
                            </div>
                        </dl>
                        <p className="pcm-help">Quedó en el historial de inventario con tu usuario y el motivo.</p>
                        <div className="pcm-footer">
                            <button type="button" className="pcm-btn pcm-btn-primary" onClick={onClose}>Listo</button>
                        </div>
                    </div>
                ) : (
                    <form className="pcm-body" onSubmit={handleSubmit} noValidate>
                        <p className="pcm-help">
                            Escribe lo que hay <strong>físicamente</strong> en la bodega. Las unidades de pedidos sin
                            despachar ya están descontadas del sistema, así que el sistema queda en
                            <strong> contado − en pedidos</strong>.
                        </p>

                        {(sistemaActual != null || comprometido != null) && (
                            <div className="pcm-current">
                                {sistemaActual != null && <span>Sistema: <strong>{sistemaActual}</strong></span>}
                                {comprometido != null && <span>En pedidos: <strong>{comprometido}</strong></span>}
                            </div>
                        )}

                        {error && <div className="pcm-error" role="alert">{error}</div>}

                        <label className="pcm-label" htmlFor="pcm-conteo">Unidades contadas en bodega *</label>
                        <input
                            id="pcm-conteo"
                            type="number"
                            min="0"
                            step="1"
                            inputMode="numeric"
                            className="pcm-input"
                            value={conteo}
                            onChange={e => setConteo(e.target.value)}
                            onWheel={e => e.target.blur()}
                            placeholder="Ej: 24"
                            autoFocus
                        />

                        <label className="pcm-label" htmlFor="pcm-motivo">Motivo *</label>
                        <input
                            id="pcm-motivo"
                            type="text"
                            className="pcm-input"
                            value={motivo}
                            maxLength={150}
                            onChange={e => setMotivo(e.target.value)}
                            placeholder="Ej: Inventario mensual, faltante encontrado..."
                        />

                        {vistaPrevia !== null && (
                            <p className="pcm-preview">
                                El sistema quedará en <strong>{vistaPrevia}</strong>
                                {vistaPrevia < 0 && ' (hay más unidades en pedidos que en bodega: faltan por registrar)'}
                            </p>
                        )}

                        <div className="pcm-footer">
                            <button type="button" className="pcm-btn pcm-btn-secondary" onClick={onClose} disabled={loading}>
                                Cancelar
                            </button>
                            <button type="submit" className="pcm-btn pcm-btn-primary" disabled={loading}>
                                {loading ? 'Registrando...' : 'Registrar conteo'}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
