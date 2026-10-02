// src/components/modals/EnhancedPaymentFormModal.js
// Formulario mejorado para registro de pagos con método y fecha
import React, { useState, useEffect } from 'react';
import paymentService from '../../api/paymentService';
import { useToast } from '../ToastContainer';
import { formatCurrency, formatDateISO, formatOrderLabel } from '../../utils/formatters';
import './EnhancedPaymentFormModal.css';

// `icon` = nombre de icono Material (antes emoji); el <option> muestra solo la etiqueta
const PAYMENT_METHODS = [
    { value: 'EFECTIVO', label: 'Efectivo', icon: 'payments' },
    { value: 'TRANSFERENCIA', label: 'Transferencia Bancaria', icon: 'account_balance' },
    { value: 'CHEQUE', label: 'Cheque', icon: 'request_quote' },
    { value: 'TARJETA', label: 'Tarjeta de Crédito/Débito', icon: 'credit_card' },
    { value: 'CREDITO', label: 'Crédito', icon: 'account_balance_wallet' },
    { value: 'OTRO', label: 'Otro', icon: 'sell' }
];

export function EnhancedPaymentFormModal({
    isOpen,
    onClose,
    order,
    onPaymentRegistered
}) {
    const [formData, setFormData] = useState({
        amount: '',
        paymentMethod: 'EFECTIVO',
        actualPaymentDate: formatDateISO(new Date()),
        withinDeadline: true,
        discountApplied: '0',
        notes: ''
    });
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState({});

    const toast = useToast();

    useEffect(() => {
        if (isOpen && order) {
            // Prellenar con el saldo pendiente
            setFormData(prev => ({
                ...prev,
                amount: order.pendingAmount?.toString() || ''
            }));
            setErrors({});
        }
    }, [isOpen, order]);

    const validateForm = () => {
        const newErrors = {};

        const amount = parseFloat(formData.amount);
        if (!formData.amount || isNaN(amount) || amount <= 0) {
            newErrors.amount = 'Ingrese un monto válido';
        } else if (amount > order.pendingAmount) {
            newErrors.amount = `El monto no puede ser mayor al saldo pendiente ($${formatCurrency(order.pendingAmount)})`;
        }

        if (!formData.paymentMethod) {
            newErrors.paymentMethod = 'Seleccione un método de pago';
        }

        if (!formData.actualPaymentDate) {
            newErrors.actualPaymentDate = 'Seleccione la fecha del pago';
        } else {
            const paymentDate = new Date(formData.actualPaymentDate);
            const today = new Date();
            today.setHours(23, 59, 59, 999);

            if (paymentDate > today) {
                newErrors.actualPaymentDate = 'La fecha no puede ser futura';
            }
        }

        const discount = parseFloat(formData.discountApplied);
        if (formData.discountApplied && (isNaN(discount) || discount < 0)) {
            newErrors.discountApplied = 'El descuento debe ser un número positivo';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!validateForm()) {
            toast.warning('Por favor corrija los errores en el formulario');
            return;
        }

        try {
            setSaving(true);

            const paymentData = {
                orderId: order.orderId,
                amount: parseFloat(formData.amount),
                paymentMethod: formData.paymentMethod,
                actualPaymentDate: formData.actualPaymentDate,
                withinDeadline: formData.withinDeadline,
                discountApplied: parseFloat(formData.discountApplied) || 0,
                notes: formData.notes.trim() || null
            };

            await paymentService.createPayment(paymentData);
            toast.success('Pago registrado correctamente');

            if (onPaymentRegistered) {
                onPaymentRegistered();
            }

            onClose();
        } catch (error) {
            console.error('Error registering payment:', error);
            toast.error('Error al registrar el pago: ' + (error.response?.data?.message || error.message));
        } finally {
            setSaving(false);
        }
    };

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        // Limpiar error del campo al cambiar
        if (errors[field]) {
            setErrors(prev => {
                const newErrors = { ...prev };
                delete newErrors[field];
                return newErrors;
            });
        }
    };

    if (!isOpen) return null;

    return (
        <div className="ui-modal-overlay" onClick={onClose}>
            <div
                className="ui-modal ui-modal--sm enhanced-payment-form-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="epf-title"
                onClick={e => e.stopPropagation()}
            >
                <div className="ui-modal-header">
                    <span className="ui-modal-icon ui-modal-icon--success" aria-hidden="true">
                        <span className="material-icons-round">payments</span>
                    </span>
                    <div className="ui-modal-heading">
                        <h2 id="epf-title" className="ui-modal-title">
                            Registrar Pago
                        </h2>
                    </div>
                    <button type="button" className="ui-icon-btn" onClick={onClose} aria-label="Cerrar">
                        <span className="material-icons-round" aria-hidden="true">close</span>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="epf-form">
                    <div className="ui-modal-body">
                        {/* Order Info */}
                        <section className={`ui-section ui-stripe ${(order?.pendingAmount || 0) > 0 ? 'ui-stripe--warning' : 'ui-stripe--success'} epf-summary`}>
                            <dl className="ui-meta">
                                {/* Referencia en azul; saldo pendiente en ámbar (verde si ya no debe) */}
                                <div className="ui-meta-row">
                                    <dt>Orden:</dt>
                                    <dd className="epf-ref">{formatOrderLabel(order)}</dd>
                                </div>
                                <div className="ui-meta-row">
                                    <dt>Cliente:</dt>
                                    <dd>{order?.clientName || 'N/A'}</dd>
                                </div>
                                <div className={`ui-meta-row epf-pending${(order?.pendingAmount || 0) > 0 ? '' : ' is-settled'}`}>
                                    <dt>Saldo Pendiente:</dt>
                                    <dd>${formatCurrency(order?.pendingAmount || 0)}</dd>
                                </div>
                            </dl>
                        </section>

                        <section className="ui-section">
                            <div className="ui-grid">
                                {/* Payment Amount */}
                                <div className="ui-field">
                                    <label className="ui-label" htmlFor="amount">
                                        Monto del Pago <span className="ui-required">*</span>
                                    </label>
                                    <div className="ui-input-group">
                                        <span className="ui-input-prefix" aria-hidden="true">$</span>
                                        <input
                                            className="ui-input"
                                            type="number"
                                            id="amount"
                                            value={formData.amount}
                                            onChange={(e) => handleChange('amount', e.target.value)}
                                            placeholder="0.00"
                                            step="0.01"
                                            min="0"
                                            max={order?.pendingAmount}
                                            aria-invalid={!!errors.amount}
                                            required
                                        />
                                    </div>
                                    {errors.amount && <span className="ui-error">{errors.amount}</span>}
                                </div>

                                {/* Payment Method */}
                                <div className="ui-field">
                                    <label className="ui-label" htmlFor="paymentMethod">
                                        Método de Pago <span className="ui-required">*</span>
                                    </label>
                                    <select
                                        className="ui-select"
                                        id="paymentMethod"
                                        value={formData.paymentMethod}
                                        onChange={(e) => handleChange('paymentMethod', e.target.value)}
                                        aria-invalid={!!errors.paymentMethod}
                                        required
                                    >
                                        {PAYMENT_METHODS.map(method => (
                                            <option key={method.value} value={method.value}>
                                                {method.label}
                                            </option>
                                        ))}
                                    </select>
                                    {errors.paymentMethod && <span className="ui-error">{errors.paymentMethod}</span>}
                                </div>

                                {/* Payment Date */}
                                <div className="ui-field">
                                    <label className="ui-label" htmlFor="actualPaymentDate">
                                        Fecha del Pago <span className="ui-required">*</span>
                                    </label>
                                    <input
                                        className="ui-input"
                                        type="date"
                                        id="actualPaymentDate"
                                        value={formData.actualPaymentDate}
                                        onChange={(e) => handleChange('actualPaymentDate', e.target.value)}
                                        max={formatDateISO(new Date())}
                                        aria-invalid={!!errors.actualPaymentDate}
                                        required
                                    />
                                    <span className="ui-help">Fecha real en que se realizó el pago</span>
                                    {errors.actualPaymentDate && <span className="ui-error">{errors.actualPaymentDate}</span>}
                                </div>

                                {/* Within Deadline */}
                                <div className="ui-field epf-deadline">
                                    <label className="ui-checkbox">
                                        <input
                                            type="checkbox"
                                            checked={formData.withinDeadline}
                                            onChange={(e) => handleChange('withinDeadline', e.target.checked)}
                                        />
                                        <span>Pago dentro del plazo</span>
                                    </label>
                                </div>

                                {/* Discount Applied */}
                                <div className="ui-field">
                                    <label className="ui-label" htmlFor="discountApplied">Descuento Aplicado</label>
                                    <div className="ui-input-group">
                                        <span className="ui-input-prefix" aria-hidden="true">$</span>
                                        <input
                                            className="ui-input"
                                            type="number"
                                            id="discountApplied"
                                            value={formData.discountApplied}
                                            onChange={(e) => handleChange('discountApplied', e.target.value)}
                                            placeholder="0.00"
                                            step="0.01"
                                            min="0"
                                            aria-invalid={!!errors.discountApplied}
                                        />
                                    </div>
                                    {errors.discountApplied && <span className="ui-error">{errors.discountApplied}</span>}
                                </div>

                                {/* Notes */}
                                <div className="ui-field ui-span-full">
                                    <label className="ui-label" htmlFor="notes">Notas</label>
                                    <textarea
                                        className="ui-textarea"
                                        id="notes"
                                        value={formData.notes}
                                        onChange={(e) => handleChange('notes', e.target.value)}
                                        placeholder="Ej: Transferencia Bancolombia, Cuenta ***123"
                                        rows={3}
                                    />
                                </div>
                            </div>
                        </section>
                    </div>

                    <div className="ui-modal-footer">
                        <button type="button" className="ui-btn ui-btn--secondary" onClick={onClose} disabled={saving}>
                            Cancelar
                        </button>
                        <button type="submit" className="ui-btn ui-btn--primary" disabled={saving}>
                            {saving ? (
                                <>
                                    <span className="ui-spinner" aria-hidden="true"></span>
                                    Registrando...
                                </>
                            ) : (
                                <>
                                    <span className="material-icons-round" aria-hidden="true">check</span>
                                    Registrar Pago
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default EnhancedPaymentFormModal;
