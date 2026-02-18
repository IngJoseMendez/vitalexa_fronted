// src/components/modals/EnhancedPaymentFormModal.js
// Formulario mejorado para registro de pagos con método y fecha
import React, { useState, useEffect } from 'react';
import paymentService from '../../api/paymentService';
import { useToast } from '../ToastContainer';
import { formatCurrency, formatDateISO } from '../../utils/formatters';
import './EnhancedPaymentFormModal.css';

const PAYMENT_METHODS = [
    { value: 'EFECTIVO', label: 'Efectivo', icon: '💵' },
    { value: 'TRANSFERENCIA', label: 'Transferencia Bancaria', icon: '🏦' },
    { value: 'CHEQUE', label: 'Cheque', icon: '📝' },
    { value: 'TARJETA', label: 'Tarjeta de Crédito/Débito', icon: '💳' },
    { value: 'CREDITO', label: 'Crédito', icon: '📊' },
    { value: 'OTRO', label: 'Otro', icon: '🔖' }
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
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-container enhanced-payment-form-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>
                        <span className="material-icons-round">payments</span>
                        Registrar Pago
                    </h2>
                    <button className="btn-close" onClick={onClose}>
                        <span className="material-icons-round">close</span>
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        {/* Order Info */}
                        <div className="order-info-card">
                            <div className="info-row">
                                <span className="label">Factura:</span>
                                <span className="value">#{order?.invoiceNumber || order?.orderId}</span>
                            </div>
                            <div className="info-row">
                                <span className="label">Cliente:</span>
                                <span className="value">{order?.clientName || 'N/A'}</span>
                            </div>
                            <div className="info-row">
                                <span className="label">Saldo Pendiente:</span>
                                <span className="value highlight">${formatCurrency(order?.pendingAmount || 0)}</span>
                            </div>
                        </div>

                        {/* Payment Amount */}
                        <div className={`form-group ${errors.amount ? 'has-error' : ''}`}>
                            <label htmlFor="amount">
                                Monto del Pago <span className="required">*</span>
                            </label>
                            <div className="input-with-icon">
                                <span className="input-icon">$</span>
                                <input
                                    type="number"
                                    id="amount"
                                    value={formData.amount}
                                    onChange={(e) => handleChange('amount', e.target.value)}
                                    placeholder="0.00"
                                    step="0.01"
                                    min="0"
                                    max={order?.pendingAmount}
                                    required
                                />
                            </div>
                            {errors.amount && <span className="error-message">{errors.amount}</span>}
                        </div>

                        {/* Payment Method */}
                        <div className={`form-group ${errors.paymentMethod ? 'has-error' : ''}`}>
                            <label htmlFor="paymentMethod">
                                Método de Pago <span className="required">*</span>
                            </label>
                            <select
                                id="paymentMethod"
                                value={formData.paymentMethod}
                                onChange={(e) => handleChange('paymentMethod', e.target.value)}
                                required
                            >
                                {PAYMENT_METHODS.map(method => (
                                    <option key={method.value} value={method.value}>
                                        {method.icon} {method.label}
                                    </option>
                                ))}
                            </select>
                            {errors.paymentMethod && <span className="error-message">{errors.paymentMethod}</span>}
                        </div>

                        {/* Payment Date */}
                        <div className={`form-group ${errors.actualPaymentDate ? 'has-error' : ''}`}>
                            <label htmlFor="actualPaymentDate">
                                Fecha del Pago <span className="required">*</span>
                            </label>
                            <input
                                type="date"
                                id="actualPaymentDate"
                                value={formData.actualPaymentDate}
                                onChange={(e) => handleChange('actualPaymentDate', e.target.value)}
                                max={formatDateISO(new Date())}
                                required
                            />
                            <span className="help-text">Fecha real en que se realizó el pago</span>
                            {errors.actualPaymentDate && <span className="error-message">{errors.actualPaymentDate}</span>}
                        </div>

                        {/* Within Deadline */}
                        <div className="form-group">
                            <label className="checkbox-label">
                                <input
                                    type="checkbox"
                                    checked={formData.withinDeadline}
                                    onChange={(e) => handleChange('withinDeadline', e.target.checked)}
                                />
                                <span>Pago dentro del plazo</span>
                            </label>
                        </div>

                        {/* Discount Applied */}
                        <div className={`form-group ${errors.discountApplied ? 'has-error' : ''}`}>
                            <label htmlFor="discountApplied">Descuento Aplicado</label>
                            <div className="input-with-icon">
                                <span className="input-icon">$</span>
                                <input
                                    type="number"
                                    id="discountApplied"
                                    value={formData.discountApplied}
                                    onChange={(e) => handleChange('discountApplied', e.target.value)}
                                    placeholder="0.00"
                                    step="0.01"
                                    min="0"
                                />
                            </div>
                            {errors.discountApplied && <span className="error-message">{errors.discountApplied}</span>}
                        </div>

                        {/* Notes */}
                        <div className="form-group">
                            <label htmlFor="notes">Notas</label>
                            <textarea
                                id="notes"
                                value={formData.notes}
                                onChange={(e) => handleChange('notes', e.target.value)}
                                placeholder="Ej: Transferencia Bancolombia, Cuenta ***123"
                                rows={3}
                            />
                        </div>
                    </div>

                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
                            Cancelar
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={saving}>
                            {saving ? (
                                <>
                                    <span className="material-icons-round spin">sync</span>
                                    Registrando...
                                </>
                            ) : (
                                <>
                                    <span className="material-icons-round">check</span>
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

