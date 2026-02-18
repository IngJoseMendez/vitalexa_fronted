# 🎨 PROMPT COMPLETO PARA ACTUALIZACIÓN DEL FRONTEND

## 📋 CONTEXTO GENERAL

El backend del sistema de cartera y pagos ha sido actualizado con nuevas funcionalidades. Este documento contiene todas las especificaciones técnicas necesarias para actualizar el frontend y aprovechar estas mejoras.

---

## 🆕 NUEVAS FUNCIONALIDADES DEL BACKEND

### 1️⃣ REGISTRO DE PAGOS MEJORADO

#### Endpoint actualizado:
```
POST /api/owner/payments
```

#### Request Body (actualizado):
```typescript
interface CreatePaymentRequest {
  orderId: string;  // UUID de la orden
  amount: number;   // Monto del pago
  paymentMethod: 'EFECTIVO' | 'TRANSFERENCIA' | 'CHEQUE' | 'TARJETA' | 'CREDITO' | 'OTRO';  // 🆕 OBLIGATORIO
  actualPaymentDate?: string;  // 🆕 Fecha real del pago en formato "YYYY-MM-DD" (opcional)
  withinDeadline?: boolean;    // Si el pago fue a tiempo
  discountApplied?: number;    // Descuento aplicado
  notes?: string;              // Notas adicionales
}
```

#### Response (actualizado):
```typescript
interface PaymentResponse {
  id: string;                    // UUID del pago
  orderId: string;               // UUID de la orden
  amount: number;                // Monto del pago
  paymentDate: string;           // Timestamp de registro (automático) ISO 8601
  actualPaymentDate: string;     // 🆕 Fecha real del pago "YYYY-MM-DD"
  paymentMethod: string;         // 🆕 Método de pago
  withinDeadline: boolean;       
  discountApplied: number;       
  registeredByUsername: string;  // Usuario que registró
  createdAt: string;             // Timestamp de creación
  notes: string;                 
  isCancelled: boolean;          // 🆕 Si está anulado
  cancelledAt: string | null;    // 🆕 Cuándo se anuló
  cancelledByUsername: string | null;  // 🆕 Quién lo anuló
  cancellationReason: string | null;   // 🆕 Por qué se anuló
}
```

---

### 2️⃣ NUEVOS ENDPOINTS DE PAGOS

#### Obtener todos los pagos de una orden (incluye anulados)
```
GET /api/owner/payments/order/{orderId}
```

#### Obtener solo pagos activos de una orden
```
GET /api/owner/payments/order/{orderId}/active
```

#### Obtener un pago específico por ID
```
GET /api/owner/payments/{paymentId}
```

#### Anular un pago (soft delete)
```
PUT /api/owner/payments/{paymentId}/cancel?reason={motivo}
```
**Response:** `PaymentResponse` con `isCancelled: true`

#### Restaurar un pago anulado
```
PUT /api/owner/payments/{paymentId}/restore
```
**Response:** `PaymentResponse` con `isCancelled: false`

---

### 3️⃣ PANEL DE SALDOS ACTUALIZADO

#### Endpoint principal (sin cambios):
```
GET /api/balances
GET /api/balances?vendedorId={uuid}
```

#### Response actualizado:
```typescript
interface ClientBalanceDTO {
  clientId: string;
  clientName: string;
  clientPhone: string;
  clientRepresentative: string;
  vendedorAsignadoName: string;
  creditLimit: number;
  initialBalance: number;
  totalOrders: number;
  totalPaid: number;
  pendingBalance: number;
  balanceFavor: number;
  pendingOrdersCount: number;
  pendingOrders: OrderPendingDTO[];
  lastPaymentDate: string | null;  // 🆕 Última fecha de pago "YYYY-MM-DD"
  daysOverdue: number;              // 🆕 Días de mora
}
```

#### Obtener facturas pendientes con filtros:
```
GET /api/balances/client/{clientId}/pending-invoices?startDate=2026-01-01&endDate=2026-02-17
```

#### Obtener días de mora:
```
GET /api/balances/client/{clientId}/days-overdue
```
**Response:** `number` (días)

#### Obtener última fecha de pago:
```
GET /api/balances/client/{clientId}/last-payment-date
```
**Response:** `string` (fecha "YYYY-MM-DD") o `204 No Content`

---

### 4️⃣ EXPORTACIÓN A EXCEL

#### Endpoint:
```
GET /api/balances/export/excel?vendedorId={uuid}&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&onlyWithDebt=true
```

**Parámetros (todos opcionales):**
- `vendedorId`: UUID del vendedor
- `startDate`: Fecha inicial
- `endDate`: Fecha final
- `onlyWithDebt`: `true` para solo clientes que deben

**Response:** 
- Content-Type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- Archivo Excel con nombre: `cartera_clientes_YYYY-MM-DD.xlsx`

**Estructura del Excel:**
- **Hoja 1**: "Clientes que Deben"
- **Hoja 2**: "Clientes al Día"

**Columnas:**
1. Cliente
2. Teléfono
3. Vendedor
4. Total Facturado
5. Total Pagado
6. Saldo Pendiente
7. Última Fecha Pago
8. Días Mora
9. # Facturas Pendientes
10. Estado (DEBE / AL DÍA)

---

## 🎨 COMPONENTES A CREAR/ACTUALIZAR

### 1️⃣ Formulario de Registro de Pago

**Ubicación sugerida:** `components/payments/PaymentForm.tsx` o `.vue`

**Campos del formulario:**

```typescript
interface PaymentFormData {
  orderId: string;           // Selector de orden (autocompletado)
  amount: number;            // Input numérico
  paymentMethod: PaymentMethod;  // 🆕 Dropdown/Select OBLIGATORIO
  actualPaymentDate: Date;   // 🆕 DatePicker (por defecto: hoy)
  withinDeadline: boolean;   // Checkbox
  discountApplied: number;   // Input numérico (opcional)
  notes: string;             // Textarea (opcional)
}

enum PaymentMethod {
  EFECTIVO = 'EFECTIVO',
  TRANSFERENCIA = 'TRANSFERENCIA',
  CHEQUE = 'CHEQUE',
  TARJETA = 'TARJETA',
  CREDITO = 'CREDITO',
  OTRO = 'OTRO'
}
```

**Validaciones:**
- `amount` > 0
- `amount` <= saldo pendiente de la orden
- `paymentMethod` es obligatorio
- `actualPaymentDate` no puede ser futuro

**UI Sugerida:**

```jsx
<Form onSubmit={handleSubmit}>
  <OrderSelector 
    value={orderId} 
    onChange={setOrderId}
    filterByStatus="COMPLETADO"
  />
  
  <MoneyInput 
    label="Monto del Pago"
    value={amount}
    onChange={setAmount}
    max={pendingBalance}
    required
  />
  
  {/* 🆕 NUEVO */}
  <Select 
    label="Método de Pago *"
    value={paymentMethod}
    onChange={setPaymentMethod}
    required
  >
    <option value="EFECTIVO">💵 Efectivo</option>
    <option value="TRANSFERENCIA">🏦 Transferencia Bancaria</option>
    <option value="CHEQUE">📝 Cheque</option>
    <option value="TARJETA">💳 Tarjeta de Crédito/Débito</option>
    <option value="CREDITO">📊 Crédito</option>
    <option value="OTRO">🔖 Otro</option>
  </Select>
  
  {/* 🆕 NUEVO */}
  <DatePicker 
    label="Fecha del Pago"
    value={actualPaymentDate}
    onChange={setActualPaymentDate}
    max={new Date()}
    helpText="Fecha real en que se realizó el pago"
  />
  
  <Checkbox 
    label="Pago dentro del plazo"
    checked={withinDeadline}
    onChange={setWithinDeadline}
  />
  
  <MoneyInput 
    label="Descuento Aplicado"
    value={discountApplied}
    onChange={setDiscountApplied}
  />
  
  <Textarea 
    label="Notas"
    value={notes}
    onChange={setNotes}
    placeholder="Ej: Transferencia Bancolombia"
  />
  
  <ButtonGroup>
    <Button type="button" variant="secondary" onClick={onCancel}>
      Cancelar
    </Button>
    <Button type="submit" variant="primary">
      Registrar Pago
    </Button>
  </ButtonGroup>
</Form>
```

---

### 2️⃣ Modal de Historial de Pagos

**Ubicación sugerida:** `components/payments/PaymentHistoryModal.tsx`

**Props:**
```typescript
interface PaymentHistoryModalProps {
  orderId: string;
  isOpen: boolean;
  onClose: () => void;
}
```

**Estado:**
```typescript
const [payments, setPayments] = useState<PaymentResponse[]>([]);
const [showCancelled, setShowCancelled] = useState(true); // Mostrar anulados
```

**Fetch:**
```typescript
// Todos los pagos (incluye anulados)
const fetchPayments = async () => {
  const response = await fetch(`/api/owner/payments/order/${orderId}`);
  const data = await response.json();
  setPayments(data);
};

// Solo pagos activos
const fetchActivePayments = async () => {
  const response = await fetch(`/api/owner/payments/order/${orderId}/active`);
  const data = await response.json();
  setPayments(data);
};
```

**UI Sugerida (Timeline Vertical):**

```jsx
<Modal isOpen={isOpen} onClose={onClose} size="large">
  <ModalHeader>
    <h2>Historial de Pagos - Factura #{invoiceNumber}</h2>
    <ToggleSwitch 
      label="Mostrar pagos anulados"
      checked={showCancelled}
      onChange={setShowCancelled}
    />
  </ModalHeader>
  
  <ModalBody>
    {payments
      .filter(p => showCancelled || !p.isCancelled)
      .map(payment => (
        <TimelineItem key={payment.id}>
          
          {/* Indicador visual */}
          <TimelineIcon cancelled={payment.isCancelled}>
            {payment.isCancelled ? '❌' : '✅'}
          </TimelineIcon>
          
          {/* Contenido del pago */}
          <PaymentCard cancelled={payment.isCancelled}>
            
            {/* Header */}
            <CardHeader>
              <div>
                <Badge variant={payment.isCancelled ? 'danger' : 'success'}>
                  {payment.isCancelled ? 'ANULADO' : 'ACTIVO'}
                </Badge>
                <Money value={payment.amount} />
              </div>
              
              {/* Método de pago con ícono */}
              <PaymentMethodBadge method={payment.paymentMethod}>
                {getPaymentMethodIcon(payment.paymentMethod)} {payment.paymentMethod}
              </PaymentMethodBadge>
            </CardHeader>
            
            {/* Información principal */}
            <CardBody>
              <InfoRow>
                <Label>📅 Fecha del pago:</Label>
                <Value highlight>{formatDate(payment.actualPaymentDate)}</Value>
              </InfoRow>
              
              <InfoRow>
                <Label>🕒 Registrado el:</Label>
                <Value>{formatDateTime(payment.paymentDate)}</Value>
              </InfoRow>
              
              <InfoRow>
                <Label>👤 Registrado por:</Label>
                <Value>{payment.registeredByUsername}</Value>
              </InfoRow>
              
              {payment.notes && (
                <InfoRow>
                  <Label>📝 Notas:</Label>
                  <Value>{payment.notes}</Value>
                </InfoRow>
              )}
              
              {payment.discountApplied > 0 && (
                <InfoRow>
                  <Label>💰 Descuento aplicado:</Label>
                  <Value><Money value={payment.discountApplied} /></Value>
                </InfoRow>
              )}
              
              {/* Si está anulado, mostrar info de anulación */}
              {payment.isCancelled && (
                <AnulacionInfo>
                  <InfoRow>
                    <Label>🚫 Anulado el:</Label>
                    <Value>{formatDateTime(payment.cancelledAt)}</Value>
                  </InfoRow>
                  <InfoRow>
                    <Label>👤 Anulado por:</Label>
                    <Value>{payment.cancelledByUsername}</Value>
                  </InfoRow>
                  <InfoRow>
                    <Label>❓ Razón:</Label>
                    <Value>{payment.cancellationReason}</Value>
                  </InfoRow>
                </AnulacionInfo>
              )}
            </CardBody>
            
            {/* Acciones */}
            <CardFooter>
              {!payment.isCancelled && (
                <Button 
                  variant="danger" 
                  size="small"
                  onClick={() => handleCancelPayment(payment.id)}
                >
                  Anular Pago
                </Button>
              )}
              
              {payment.isCancelled && (
                <Button 
                  variant="warning" 
                  size="small"
                  onClick={() => handleRestorePayment(payment.id)}
                >
                  Restaurar Pago
                </Button>
              )}
            </CardFooter>
            
          </PaymentCard>
        </TimelineItem>
      ))}
  </ModalBody>
</Modal>
```

**Funciones auxiliares:**
```typescript
const getPaymentMethodIcon = (method: string): string => {
  const icons = {
    EFECTIVO: '💵',
    TRANSFERENCIA: '🏦',
    CHEQUE: '📝',
    TARJETA: '💳',
    CREDITO: '📊',
    OTRO: '🔖'
  };
  return icons[method] || '💰';
};

const handleCancelPayment = async (paymentId: string) => {
  // Abrir modal pidiendo razón
  const reason = await openReasonModal();
  if (!reason) return;
  
  const response = await fetch(
    `/api/owner/payments/${paymentId}/cancel?reason=${encodeURIComponent(reason)}`,
    { method: 'PUT' }
  );
  
  if (response.ok) {
    toast.success('Pago anulado correctamente');
    fetchPayments(); // Recargar lista
  }
};

const handleRestorePayment = async (paymentId: string) => {
  const response = await fetch(
    `/api/owner/payments/${paymentId}/restore`,
    { method: 'PUT' }
  );
  
  if (response.ok) {
    toast.success('Pago restaurado correctamente');
    fetchPayments();
  }
};
```

---

### 3️⃣ Modal de Razón de Anulación

**Ubicación sugerida:** `components/payments/CancelReasonModal.tsx`

```jsx
<Modal isOpen={isOpen} onClose={onClose} size="small">
  <ModalHeader>
    <h3>Anular Pago</h3>
  </ModalHeader>
  
  <ModalBody>
    <Alert variant="warning">
      ⚠️ El pago será marcado como anulado pero se mantendrá en el historial para auditoría.
    </Alert>
    
    <Textarea 
      label="Razón de la anulación *"
      value={reason}
      onChange={setReason}
      placeholder="Ej: Pago duplicado"
      rows={4}
      required
    />
  </ModalBody>
  
  <ModalFooter>
    <Button variant="secondary" onClick={onClose}>
      Cancelar
    </Button>
    <Button 
      variant="danger" 
      onClick={handleConfirm}
      disabled={!reason.trim()}
    >
      Confirmar Anulación
    </Button>
  </ModalFooter>
</Modal>
```

---

### 4️⃣ Panel de Saldos (Tabla Principal)

**Ubicación:** `pages/Cartera.tsx` o `views/Cartera.vue`

**Tabla actualizada:**

```jsx
<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Cliente</TableHead>
      <TableHead>Teléfono</TableHead>
      <TableHead>Vendedor</TableHead>
      <TableHead>Total Facturado</TableHead>
      <TableHead>Total Pagado</TableHead>
      <TableHead>Saldo Pendiente</TableHead>
      <TableHead>🆕 Última Fecha Pago</TableHead> {/* NUEVO */}
      <TableHead>🆕 Días Mora</TableHead>         {/* NUEVO */}
      <TableHead># Facturas</TableHead>
      <TableHead>Estado</TableHead>
      <TableHead>Acciones</TableHead>
    </TableRow>
  </TableHeader>
  
  <TableBody>
    {balances.map(balance => (
      <TableRow key={balance.clientId}>
        <TableCell>{balance.clientName}</TableCell>
        <TableCell>{balance.clientPhone}</TableCell>
        <TableCell>{balance.vendedorAsignadoName}</TableCell>
        <TableCell><Money value={balance.totalOrders} /></TableCell>
        <TableCell><Money value={balance.totalPaid} /></TableCell>
        <TableCell><Money value={balance.pendingBalance} /></TableCell>
        
        {/* 🆕 NUEVO: Última fecha de pago */}
        <TableCell>
          {balance.lastPaymentDate 
            ? formatDate(balance.lastPaymentDate)
            : <span style={{color: 'gray'}}>Sin pagos</span>
          }
        </TableCell>
        
        {/* 🆕 NUEVO: Días de mora con badge de color */}
        <TableCell>
          <DaysOverdueBadge days={balance.daysOverdue} />
        </TableCell>
        
        <TableCell>{balance.pendingOrdersCount}</TableCell>
        
        <TableCell>
          <Badge variant={balance.pendingBalance > 0 ? 'danger' : 'success'}>
            {balance.pendingBalance > 0 ? 'DEBE' : 'AL DÍA'}
          </Badge>
        </TableCell>
        
        <TableCell>
          <Button 
            size="small"
            onClick={() => openClientDetailModal(balance.clientId)}
          >
            Ver Detalle
          </Button>
        </TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>
```

**Componente DaysOverdueBadge:**
```typescript
const DaysOverdueBadge = ({ days }: { days: number }) => {
  let variant: 'success' | 'warning' | 'danger' = 'success';
  let icon = '✅';
  
  if (days > 30) {
    variant = 'danger';
    icon = '🔴';
  } else if (days >= 15) {
    variant = 'warning';
    icon = '🟡';
  } else if (days > 0) {
    variant = 'success';
    icon = '🟢';
  }
  
  return (
    <Badge variant={variant}>
      {icon} {days} días
    </Badge>
  );
};
```

**Filtros de la tabla:**
```jsx
<FilterBar>
  <Select 
    label="Vendedor"
    value={vendedorFilter}
    onChange={setVendedorFilter}
  >
    <option value="">Todos</option>
    {vendedores.map(v => (
      <option key={v.id} value={v.id}>{v.username}</option>
    ))}
  </Select>
  
  <DateRangePicker 
    startDate={startDate}
    endDate={endDate}
    onChange={(start, end) => {
      setStartDate(start);
      setEndDate(end);
    }}
  />
  
  <Checkbox 
    label="Solo con deuda"
    checked={onlyWithDebt}
    onChange={setOnlyWithDebt}
  />
  
  {/* 🆕 Botón de exportación */}
  <Button 
    variant="success"
    onClick={handleExportExcel}
    leftIcon={<DownloadIcon />}
  >
    Exportar Excel
  </Button>
</FilterBar>
```

**Función de exportación:**
```typescript
const handleExportExcel = async () => {
  const params = new URLSearchParams();
  
  if (vendedorFilter) params.append('vendedorId', vendedorFilter);
  if (startDate) params.append('startDate', formatDateISO(startDate));
  if (endDate) params.append('endDate', formatDateISO(endDate));
  if (onlyWithDebt) params.append('onlyWithDebt', 'true');
  
  const url = `/api/balances/export/excel?${params.toString()}`;
  
  // Descargar archivo
  const response = await fetch(url);
  const blob = await response.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = `cartera_clientes_${new Date().toISOString().split('T')[0]}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  
  toast.success('Cartera exportada correctamente');
};
```

---

### 5️⃣ Modal de Detalle de Cliente

**Ubicación:** `components/balance/ClientBalanceDetailModal.tsx`

```jsx
<Modal isOpen={isOpen} onClose={onClose} size="extra-large">
  <ModalHeader>
    <h2>Detalle de Cartera - {clientName}</h2>
  </ModalHeader>
  
  <ModalBody>
    {/* Información del cliente */}
    <ClientInfoCard>
      <InfoGrid>
        <InfoItem>
          <Label>Cliente:</Label>
          <Value>{balance.clientName}</Value>
        </InfoItem>
        <InfoItem>
          <Label>Teléfono:</Label>
          <Value>{balance.clientPhone}</Value>
        </InfoItem>
        <InfoItem>
          <Label>Vendedor:</Label>
          <Value>{balance.vendedorAsignadoName}</Value>
        </InfoItem>
        <InfoItem>
          <Label>🆕 Última fecha de pago:</Label>
          <Value>{balance.lastPaymentDate || 'Sin pagos'}</Value>
        </InfoItem>
        <InfoItem>
          <Label>🆕 Días de mora:</Label>
          <Value><DaysOverdueBadge days={balance.daysOverdue} /></Value>
        </InfoItem>
      </InfoGrid>
    </ClientInfoCard>
    
    {/* Resumen de saldos */}
    <SummaryGrid>
      <SummaryCard>
        <CardLabel>Total Facturado</CardLabel>
        <CardValue><Money value={balance.totalOrders} /></CardValue>
      </SummaryCard>
      
      <SummaryCard>
        <CardLabel>Total Pagado</CardLabel>
        <CardValue color="green"><Money value={balance.totalPaid} /></CardValue>
      </SummaryCard>
      
      <SummaryCard>
        <CardLabel>Saldo Pendiente</CardLabel>
        <CardValue color="red"><Money value={balance.pendingBalance} /></CardValue>
      </SummaryCard>
      
      <SummaryCard>
        <CardLabel>Saldo a Favor</CardLabel>
        <CardValue color="blue"><Money value={balance.balanceFavor} /></CardValue>
      </SummaryCard>
    </SummaryGrid>
    
    {/* Lista de facturas pendientes */}
    <Section>
      <SectionHeader>
        <h3>Facturas Pendientes ({balance.pendingOrdersCount})</h3>
      </SectionHeader>
      
      <Accordion>
        {balance.pendingOrders.map(order => (
          <AccordionItem key={order.orderId}>
            
            {/* Header del accordion */}
            <AccordionHeader>
              <InvoiceInfo>
                <InvoiceNumber>Factura #{order.invoiceNumber}</InvoiceNumber>
                <InvoiceDate>{formatDate(order.fecha)}</InvoiceDate>
              </InvoiceInfo>
              
              <AmountInfo>
                <div>
                  <Label>Total:</Label>
                  <Money value={order.total} />
                </div>
                <div>
                  <Label>Pagado:</Label>
                  <Money value={order.paidAmount} color="green" />
                </div>
                <div>
                  <Label>Pendiente:</Label>
                  <Money value={order.pendingAmount} color="red" />
                </div>
              </AmountInfo>
              
              <Badge variant={
                order.paymentStatus === 'PAID' ? 'success' :
                order.paymentStatus === 'PARTIAL' ? 'warning' : 'danger'
              }>
                {order.paymentStatus}
              </Badge>
            </AccordionHeader>
            
            {/* Contenido del accordion: Historial de pagos */}
            <AccordionBody>
              <PaymentsTimeline>
                {order.payments.length === 0 ? (
                  <EmptyState>No hay pagos registrados</EmptyState>
                ) : (
                  order.payments.map(payment => (
                    <TimelineItem key={payment.id}>
                      <PaymentItemCompact 
                        payment={payment}
                        onViewDetails={() => openPaymentDetailModal(payment.id)}
                      />
                    </TimelineItem>
                  ))
                )}
              </PaymentsTimeline>
              
              <Button 
                variant="primary"
                onClick={() => openPaymentHistoryModal(order.orderId)}
              >
                Ver Historial Completo
              </Button>
            </AccordionBody>
            
          </AccordionItem>
        ))}
      </Accordion>
    </Section>
  </ModalBody>
</Modal>
```

---

## 🎨 ESTILOS Y DISEÑO

### Colores para Días de Mora:
```css
.days-overdue-0-14 {
  color: #10b981; /* Verde */
  background-color: #d1fae5;
}

.days-overdue-15-30 {
  color: #f59e0b; /* Amarillo */
  background-color: #fef3c7;
}

.days-overdue-31-plus {
  color: #ef4444; /* Rojo */
  background-color: #fee2e2;
}
```

### Timeline de Pagos:
```css
.payment-timeline {
  position: relative;
  padding-left: 40px;
}

.payment-timeline::before {
  content: '';
  position: absolute;
  left: 15px;
  top: 0;
  bottom: 0;
  width: 2px;
  background: #e5e7eb;
}

.timeline-icon {
  position: absolute;
  left: 0;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
  border: 2px solid #10b981;
}

.timeline-icon.cancelled {
  border-color: #ef4444;
  opacity: 0.6;
}
```

### Pago Anulado:
```css
.payment-card.cancelled {
  opacity: 0.7;
  border: 2px dashed #ef4444;
  background: #fee2e2;
}

.payment-card.cancelled::after {
  content: '❌ ANULADO';
  position: absolute;
  top: 10px;
  right: 10px;
  color: #ef4444;
  font-weight: bold;
  font-size: 12px;
}
```

---

## 📱 RESPONSIVE

### Mobile (< 768px):
- Tabla de cartera: scroll horizontal
- Modales: full screen
- Formularios: stack vertical
- Timeline: versión simplificada

### Tablet (768px - 1024px):
- Tabla visible pero compacta
- Modales: 90% del ancho
- Formularios: 2 columnas donde sea posible

### Desktop (> 1024px):
- Tabla completa
- Modales: tamaño fijo centrado
- Formularios: layout optimizado

---

## 🔒 PERMISOS Y VISIBILIDAD

### Lógica de permisos en el frontend:

```typescript
// Composable/Hook de permisos
const usePaymentPermissions = () => {
  const { user } = useAuth();
  
  return {
    canRegisterPayment: user?.role === 'OWNER',
    canCancelPayment: user?.role === 'OWNER',
    canRestorePayment: user?.role === 'OWNER',
    canViewAllBalances: ['OWNER', 'ADMIN'].includes(user?.role),
    canExportExcel: ['OWNER', 'ADMIN', 'VENDEDOR'].includes(user?.role),
    canViewPaymentHistory: ['OWNER', 'ADMIN', 'VENDEDOR'].includes(user?.role),
  };
};
```

**Aplicar en componentes:**
```jsx
const { canCancelPayment, canRestorePayment } = usePaymentPermissions();

// Solo mostrar botón de anular si tiene permiso
{canCancelPayment && !payment.isCancelled && (
  <Button onClick={handleCancel}>Anular Pago</Button>
)}
```

---

## 🧪 TESTING

### Tests E2E sugeridos:

1. **Registrar pago con fecha pasada**
   - Seleccionar orden
   - Ingresar monto
   - Seleccionar método de pago
   - Seleccionar fecha hace 5 días
   - Verificar que se registra correctamente

2. **Anular un pago**
   - Abrir historial de pagos
   - Click en "Anular Pago"
   - Ingresar razón
   - Verificar que se marca como anulado
   - Verificar que el saldo de la orden se actualiza

3. **Restaurar un pago anulado**
   - Abrir historial de pagos
   - Localizar pago anulado
   - Click en "Restaurar Pago"
   - Verificar que se reactiva
   - Verificar que el saldo se recalcula

4. **Exportar cartera a Excel**
   - Seleccionar filtros
   - Click en "Exportar Excel"
   - Verificar que se descarga el archivo
   - Verificar que el Excel contiene 2 hojas
   - Verificar que los datos son correctos

5. **Ver días de mora**
   - Abrir panel de cartera
   - Verificar que se muestran los días de mora
   - Verificar colores según rango (verde/amarillo/rojo)

---

## 🚀 PRIORIDAD DE IMPLEMENTACIÓN

### Fase 1 (Crítico):
1. ✅ Actualizar formulario de registro de pago (método + fecha)
2. ✅ Actualizar historial de pagos para mostrar nuevos campos
3. ✅ Agregar columnas "Última fecha" y "Días mora" a tabla de cartera

### Fase 2 (Importante):
4. ✅ Implementar anulación de pagos
5. ✅ Implementar modal de historial con timeline
6. ✅ Implementar exportación a Excel

### Fase 3 (Mejoras):
7. ✅ Mejorar modal de detalle de cliente
8. ✅ Agregar filtros avanzados
9. ✅ Implementar restauración de pagos
10. ✅ Testing exhaustivo

---

## 📖 TIPOS TYPESCRIPT COMPLETOS

```typescript
// types/payment.ts
export enum PaymentMethod {
  EFECTIVO = 'EFECTIVO',
  TRANSFERENCIA = 'TRANSFERENCIA',
  CHEQUE = 'CHEQUE',
  TARJETA = 'TARJETA',
  CREDITO = 'CREDITO',
  OTRO = 'OTRO'
}

export interface CreatePaymentRequest {
  orderId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  actualPaymentDate?: string; // YYYY-MM-DD
  withinDeadline?: boolean;
  discountApplied?: number;
  notes?: string;
}

export interface PaymentResponse {
  id: string;
  orderId: string;
  amount: number;
  paymentDate: string; // ISO 8601
  actualPaymentDate: string; // YYYY-MM-DD
  paymentMethod: PaymentMethod;
  withinDeadline: boolean;
  discountApplied: number;
  registeredByUsername: string;
  createdAt: string; // ISO 8601
  notes: string;
  isCancelled: boolean;
  cancelledAt: string | null; // ISO 8601
  cancelledByUsername: string | null;
  cancellationReason: string | null;
}

export interface ClientBalanceDTO {
  clientId: string;
  clientName: string;
  clientPhone: string;
  clientRepresentative: string;
  vendedorAsignadoName: string;
  creditLimit: number;
  initialBalance: number;
  totalOrders: number;
  totalPaid: number;
  pendingBalance: number;
  balanceFavor: number;
  pendingOrdersCount: number;
  pendingOrders: OrderPendingDTO[];
  lastPaymentDate: string | null; // YYYY-MM-DD
  daysOverdue: number;
}

export interface OrderPendingDTO {
  orderId: string;
  invoiceNumber: number;
  fecha: string; // ISO 8601
  total: number;
  discountedTotal: number | null;
  paidAmount: number;
  pendingAmount: number;
  paymentStatus: 'PENDING' | 'PARTIAL' | 'PAID';
  payments: PaymentResponse[];
}
```

---

## 📞 ENDPOINTS COMPLETOS

```typescript
// services/paymentService.ts
export const paymentAPI = {
  // Registrar pago
  register: (data: CreatePaymentRequest) =>
    api.post<PaymentResponse>('/api/owner/payments', data),
  
  // Obtener todos los pagos de una orden (incluye anulados)
  getByOrder: (orderId: string) =>
    api.get<PaymentResponse[]>(`/api/owner/payments/order/${orderId}`),
  
  // Obtener solo pagos activos
  getActiveByOrder: (orderId: string) =>
    api.get<PaymentResponse[]>(`/api/owner/payments/order/${orderId}/active`),
  
  // Obtener un pago por ID
  getById: (paymentId: string) =>
    api.get<PaymentResponse>(`/api/owner/payments/${paymentId}`),
  
  // Anular pago
  cancel: (paymentId: string, reason: string) =>
    api.put<PaymentResponse>(`/api/owner/payments/${paymentId}/cancel`, null, {
      params: { reason }
    }),
  
  // Restaurar pago
  restore: (paymentId: string) =>
    api.put<PaymentResponse>(`/api/owner/payments/${paymentId}/restore`),
};

// services/balanceService.ts
export const balanceAPI = {
  // Obtener saldos
  getAll: (vendedorId?: string) =>
    api.get<ClientBalanceDTO[]>('/api/balances', {
      params: { vendedorId }
    }),
  
  // Exportar a Excel
  exportExcel: (params: {
    vendedorId?: string;
    startDate?: string;
    endDate?: string;
    onlyWithDebt?: boolean;
  }) =>
    api.get('/api/balances/export/excel', {
      params,
      responseType: 'blob'
    }),
  
  // Facturas pendientes con filtros
  getPendingInvoices: (
    clientId: string,
    startDate?: string,
    endDate?: string
  ) =>
    api.get<OrderPendingDTO[]>(`/api/balances/client/${clientId}/pending-invoices`, {
      params: { startDate, endDate }
    }),
  
  // Días de mora
  getDaysOverdue: (clientId: string) =>
    api.get<number>(`/api/balances/client/${clientId}/days-overdue`),
  
  // Última fecha de pago
  getLastPaymentDate: (clientId: string) =>
    api.get<string>(`/api/balances/client/${clientId}/last-payment-date`),
};
```

---

## ✅ CHECKLIST COMPLETO FRONTEND

### Componentes:
- [ ] `PaymentForm` - Formulario de registro actualizado
- [ ] `PaymentHistoryModal` - Timeline de pagos con auditoría
- [ ] `CancelReasonModal` - Modal para anular pagos
- [ ] `ClientBalanceTable` - Tabla con nuevas columnas
- [ ] `ClientBalanceDetailModal` - Modal de detalle mejorado
- [ ] `DaysOverdueBadge` - Badge de días de mora con colores
- [ ] `PaymentMethodBadge` - Badge de método de pago con íconos
- [ ] `ExportExcelButton` - Botón de exportación

### Servicios/API:
- [ ] `paymentAPI.register` - Actualizar para incluir nuevos campos
- [ ] `paymentAPI.cancel` - Implementar anulación
- [ ] `paymentAPI.restore` - Implementar restauración
- [ ] `balanceAPI.exportExcel` - Implementar exportación
- [ ] `balanceAPI.getPendingInvoices` - Facturas con filtros
- [ ] `balanceAPI.getDaysOverdue` - Días de mora
- [ ] `balanceAPI.getLastPaymentDate` - Última fecha

### Tipos TypeScript:
- [ ] `PaymentMethod` enum
- [ ] `CreatePaymentRequest` actualizado
- [ ] `PaymentResponse` actualizado
- [ ] `ClientBalanceDTO` actualizado

### Permisos:
- [ ] `usePaymentPermissions` hook/composable
- [ ] Validación de rol para registrar pagos
- [ ] Validación de rol para anular/restaurar
- [ ] Validación de rol para exportar Excel

### Testing:
- [ ] Test: Registrar pago con fecha pasada
- [ ] Test: Anular pago
- [ ] Test: Restaurar pago
- [ ] Test: Exportar Excel
- [ ] Test: Ver historial con pagos anulados
- [ ] Test: Cálculo de días de mora
- [ ] Test: Badges de colores según mora

---

**NOTA IMPORTANTE:** Todo el backend está funcionando y compilando correctamente. Los endpoints están listos para ser consumidos desde el frontend. Solo falta la implementación de la UI.

¡Éxito con la implementación! 🚀

