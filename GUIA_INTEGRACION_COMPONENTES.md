# 📘 GUÍA DE INTEGRACIÓN - Nuevos Componentes de Cartera y Pagos

Esta guía te muestra **exactamente cómo usar** los nuevos componentes creados en tu aplicación.

---

## 1️⃣ PaymentHistoryModal - Historial de Pagos

### 📦 Importar
```javascript
import PaymentHistoryModal from '../components/modals/PaymentHistoryModal';
```

### 🎯 Uso Básico
```javascript
function MyComponent() {
    const [showHistory, setShowHistory] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState(null);

    return (
        <>
            {/* Botón para abrir el historial */}
            <button onClick={() => setShowHistory(true)}>
                Ver Historial de Pagos
            </button>

            {/* Modal de historial */}
            <PaymentHistoryModal
                isOpen={showHistory}
                onClose={() => setShowHistory(false)}
                orderId={selectedOrder?.id}
                invoiceNumber={selectedOrder?.invoiceNumber}
                onPaymentUpdate={() => {
                    // Función que se ejecuta después de anular/restaurar un pago
                    console.log('Pago actualizado');
                    // Aquí puedes refrescar tus datos
                }}
            />
        </>
    );
}
```

### 📋 Props
| Prop | Tipo | Requerido | Descripción |
|------|------|-----------|-------------|
| `isOpen` | boolean | ✅ Sí | Controla si el modal está visible |
| `onClose` | function | ✅ Sí | Función para cerrar el modal |
| `orderId` | string/number | ✅ Sí | ID de la orden a consultar |
| `invoiceNumber` | string | ❌ No | Número de factura (para mostrar en el título) |
| `onPaymentUpdate` | function | ❌ No | Callback después de anular/restaurar pagos |

---

## 2️⃣ EnhancedPaymentFormModal - Formulario de Pago Mejorado

### 📦 Importar
```javascript
import EnhancedPaymentFormModal from '../components/modals/EnhancedPaymentFormModal';
```

### 🎯 Uso Básico
```javascript
function MyComponent() {
    const [showPaymentForm, setShowPaymentForm] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState(null);

    return (
        <>
            {/* Botón para abrir el formulario */}
            <button onClick={() => setShowPaymentForm(true)}>
                Registrar Pago
            </button>

            {/* Modal de formulario */}
            <EnhancedPaymentFormModal
                isOpen={showPaymentForm}
                onClose={() => setShowPaymentForm(false)}
                order={selectedOrder}
                onPaymentRegistered={() => {
                    // Función que se ejecuta después de registrar un pago
                    console.log('Pago registrado');
                    // Aquí puedes refrescar tus datos
                    setShowPaymentForm(false);
                }}
            />
        </>
    );
}
```

### 📋 Props
| Prop | Tipo | Requerido | Descripción |
|------|------|-----------|-------------|
| `isOpen` | boolean | ✅ Sí | Controla si el modal está visible |
| `onClose` | function | ✅ Sí | Función para cerrar el modal |
| `order` | object | ✅ Sí | Objeto con datos de la orden |
| `onPaymentRegistered` | function | ❌ No | Callback después de registrar el pago |

### 📦 Estructura del objeto `order`
```javascript
{
    orderId: "123",
    invoiceNumber: "FAC-001",
    clientName: "Juan Pérez",
    pendingAmount: 150000.00,
    total: 200000.00,
    paidAmount: 50000.00
}
```

---

## 3️⃣ DaysOverdueBadge - Badge de Días de Mora

### 📦 Importar
```javascript
import DaysOverdueBadge from '../components/DaysOverdueBadge';
```

### 🎯 Uso Básico
```javascript
function MyComponent() {
    const daysOverdue = 25; // Días de mora del cliente

    return (
        <div>
            <span>Estado: </span>
            <DaysOverdueBadge days={daysOverdue} />
        </div>
    );
}
```

### 📋 Props
| Prop | Tipo | Requerido | Descripción |
|------|------|-----------|-------------|
| `days` | number/null | ✅ Sí | Número de días de mora |

### 🎨 Colores automáticos
- 🟢 **Verde** (0-14 días): Cliente al día
- 🟡 **Amarillo** (15-30 días): Mora moderada
- 🔴 **Rojo** (>30 días): Mora severa

---

## 4️⃣ ConfirmDialog con Razón - Confirmación Mejorada

### 📦 Importar
```javascript
import { useConfirm } from '../components/ConfirmDialog';
```

### 🎯 Uso Básico (Sin razón)
```javascript
function MyComponent() {
    const confirm = useConfirm();

    const handleDelete = async () => {
        const confirmed = await confirm({
            title: '¿Eliminar cliente?',
            message: 'Esta acción no se puede deshacer'
        });

        if (confirmed) {
            // Usuario confirmó
            console.log('Cliente eliminado');
        }
    };

    return (
        <button onClick={handleDelete}>Eliminar</button>
    );
}
```

### 🎯 Uso Avanzado (Con razón obligatoria)
```javascript
function MyComponent() {
    const confirm = useConfirm();

    const handleCancelPayment = async () => {
        const result = await confirm({
            title: '¿Anular este pago?',
            message: 'Proporcione una razón para la anulación',
            requireReason: true,
            reasonLabel: 'Razón de anulación',
            reasonPlaceholder: 'Ej: Pago duplicado, error en el monto...'
        });

        if (result) {
            // Usuario confirmó y proporcionó una razón
            console.log('Razón:', result.reason);
            // Aquí puedes usar result.reason para enviarlo al backend
        }
    };

    return (
        <button onClick={handleCancelPayment}>Anular Pago</button>
    );
}
```

### 📋 Opciones
| Opción | Tipo | Requerido | Descripción |
|--------|------|-----------|-------------|
| `title` | string | ✅ Sí | Título del diálogo |
| `message` | string | ✅ Sí | Mensaje descriptivo |
| `confirmText` | string | ❌ No | Texto del botón de confirmar (default: "Aceptar") |
| `cancelText` | string | ❌ No | Texto del botón de cancelar (default: "Cancelar") |
| `requireReason` | boolean | ❌ No | Si requiere campo de razón (default: false) |
| `reasonLabel` | string | ❌ No | Label del campo de razón |
| `reasonPlaceholder` | string | ❌ No | Placeholder del campo de razón |

---

## 5️⃣ Servicios API - Nuevos Endpoints

### 📦 Payment Service
```javascript
import paymentService from '../api/paymentService';

// Obtener pagos activos de una orden
const activePayments = await paymentService.getActiveOrderPayments(orderId);

// Obtener un pago específico
const payment = await paymentService.getPaymentById(paymentId);

// Anular un pago (soft delete)
await paymentService.cancelPayment(paymentId, 'Pago duplicado');

// Restaurar un pago anulado
await paymentService.restorePayment(paymentId);
```

### 📦 Balance Service
```javascript
import balanceService from '../api/balanceService';

// Obtener facturas pendientes con filtro de fechas
const invoices = await balanceService.getPendingInvoices(
    clientId, 
    '2026-01-01',  // startDate (opcional)
    '2026-02-17'   // endDate (opcional)
);

// Obtener días de mora de un cliente
const daysOverdue = await balanceService.getDaysOverdue(clientId);

// Obtener fecha del último pago
const lastPaymentDate = await balanceService.getLastPaymentDate(clientId);

// Exportar a Excel con filtros
const excelBlob = await balanceService.exportToExcel({
    vendedorId: 123,      // Opcional
    onlyWithDebt: true,   // Opcional
    startDate: '2026-01-01',  // Opcional
    endDate: '2026-02-17'     // Opcional
});
```

---

## 6️⃣ Utilidades de Formato

### 📦 Formatters
```javascript
import { formatCurrency, formatDate, formatDateTime, formatDateISO } from '../utils/formatters';

// Formatear moneda
formatCurrency(150000.50);  // "150.000,50"

// Formatear fecha
formatDate('2026-02-17');  // "17/02/2026"
formatDate(new Date());    // "17/02/2026"

// Formatear fecha y hora
formatDateTime('2026-02-17T14:30:00');  // "17/02/2026 14:30"

// Formatear a ISO
formatDateISO(new Date());  // "2026-02-17"
```

---

## 7️⃣ Ejemplo Completo - Integración en un Componente

```javascript
import React, { useState } from 'react';
import PaymentHistoryModal from '../components/modals/PaymentHistoryModal';
import EnhancedPaymentFormModal from '../components/modals/EnhancedPaymentFormModal';
import DaysOverdueBadge from '../components/DaysOverdueBadge';
import { useConfirm } from '../components/ConfirmDialog';
import paymentService from '../api/paymentService';
import balanceService from '../api/balanceService';
import { formatCurrency, formatDate } from '../utils/formatters';

function OrderManagement({ order, onRefresh }) {
    const [showHistory, setShowHistory] = useState(false);
    const [showPaymentForm, setShowPaymentForm] = useState(false);
    const [daysOverdue, setDaysOverdue] = useState(null);
    const confirm = useConfirm();

    // Cargar días de mora al montar
    React.useEffect(() => {
        const loadDaysOverdue = async () => {
            try {
                const response = await balanceService.getDaysOverdue(order.clientId);
                setDaysOverdue(response.data);
            } catch (error) {
                console.error('Error loading days overdue:', error);
            }
        };
        loadDaysOverdue();
    }, [order.clientId]);

    // Manejar exportación Excel
    const handleExportExcel = async () => {
        try {
            const response = await balanceService.exportToExcel({
                vendedorId: order.vendedorId
            });
            
            const blob = new Blob([response.data], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `Saldos_${formatDate(new Date())}.xlsx`;
            link.click();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error exporting:', error);
        }
    };

    return (
        <div className="order-management">
            <h2>Orden #{order.invoiceNumber}</h2>
            
            {/* Badge de mora */}
            <DaysOverdueBadge days={daysOverdue} />
            
            {/* Información de orden */}
            <div className="order-info">
                <p>Cliente: {order.clientName}</p>
                <p>Total: ${formatCurrency(order.total)}</p>
                <p>Pagado: ${formatCurrency(order.paidAmount)}</p>
                <p>Pendiente: ${formatCurrency(order.pendingAmount)}</p>
            </div>

            {/* Botones de acción */}
            <div className="actions">
                <button onClick={() => setShowPaymentForm(true)}>
                    Registrar Pago
                </button>
                
                <button onClick={() => setShowHistory(true)}>
                    Ver Historial
                </button>
                
                <button onClick={handleExportExcel}>
                    Exportar Excel
                </button>
            </div>

            {/* Modales */}
            <EnhancedPaymentFormModal
                isOpen={showPaymentForm}
                onClose={() => setShowPaymentForm(false)}
                order={order}
                onPaymentRegistered={() => {
                    setShowPaymentForm(false);
                    onRefresh();
                }}
            />

            <PaymentHistoryModal
                isOpen={showHistory}
                onClose={() => setShowHistory(false)}
                orderId={order.id}
                invoiceNumber={order.invoiceNumber}
                onPaymentUpdate={onRefresh}
            />
        </div>
    );
}

export default OrderManagement;
```

---

## 8️⃣ Estilos Personalizados (Opcional)

Si quieres personalizar los estilos de los componentes, puedes sobrescribir las variables CSS:

```css
/* En tu archivo CSS global */
:root {
    --primary-color: #6366f1;  /* Color principal */
    --text-primary: #0f172a;   /* Color de texto principal */
    --text-secondary: #64748b; /* Color de texto secundario */
}
```

---

## 9️⃣ Tips y Mejores Prácticas

### ✅ DO (Hacer)
- ✅ Manejar errores con try-catch
- ✅ Mostrar feedback al usuario (toasts)
- ✅ Refrescar datos después de acciones
- ✅ Validar datos antes de enviar al servidor
- ✅ Usar estados de loading mientras se procesan datos

### ❌ DON'T (No hacer)
- ❌ Asumir que las llamadas API siempre funcionan
- ❌ Dejar el usuario sin feedback visual
- ❌ Modificar directamente los componentes importados
- ❌ Ignorar los warnings de consola

---

## 🐛 Troubleshooting

### Problema: "Module not found"
**Solución:** Verifica que la ruta de importación sea correcta:
```javascript
// Correcto
import PaymentHistoryModal from '../components/modals/PaymentHistoryModal';

// Incorrecto
import PaymentHistoryModal from './PaymentHistoryModal'; // ❌
```

### Problema: "Cannot read property 'id' of undefined"
**Solución:** Verifica que el objeto `order` tenga los campos necesarios:
```javascript
// Antes de pasar el order, verifica:
if (order && order.id && order.pendingAmount !== undefined) {
    setShowPaymentForm(true);
}
```

### Problema: Modal no se muestra
**Solución:** Verifica el estado `isOpen`:
```javascript
// El estado debe ser true para mostrar el modal
const [isOpen, setIsOpen] = useState(false);

// Para abrir:
setIsOpen(true);
```

---

## 📚 Recursos Adicionales

- 📖 **Documentación técnica completa:** `EXTENSIONES_CARTERA_PAGOS_2026.md`
- 📋 **Resumen ejecutivo:** `RESUMEN_EXTENSIONES_CARTERA.md`
- 💻 **Código fuente:** Ver archivos en `src/components/modals/`

---

## ✅ Checklist de Integración

Antes de integrar los componentes en tu código, verifica:

- [ ] Instaladas todas las dependencias (`npm install`)
- [ ] Backend actualizado con los nuevos endpoints
- [ ] Imports correctos en tus componentes
- [ ] Props requeridos proporcionados
- [ ] Manejo de errores implementado
- [ ] Feedback visual para el usuario
- [ ] Testing en diferentes dispositivos (responsive)

---

¡Listo! Ahora tienes toda la información necesaria para integrar los nuevos componentes en tu aplicación. 🚀

**¿Dudas?** Revisa los archivos de ejemplo en el código fuente.

