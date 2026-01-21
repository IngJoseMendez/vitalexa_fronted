# PROMPT PARA IA DEL FRONTEND

## CONTEXTO
El backend ha sido completamente extendido con dos nuevas funcionalidades principales:
1. **Venta de productos sin stock**
2. **Sistema completo de promociones**

Tu tarea es implementar el frontend (React/Next.js) para estas funcionalidades.

---

## 📡 NUEVOS ENDPOINTS DEL BACKEND

### 1. Promociones (Admin/Owner)

#### Crear Promoción
```
POST /api/admin/promotions
Authorization: Bearer {token} (Role: ADMIN o OWNER)

Request Body:
{
  "nombre": "Pack 40+10 Especial",
  "descripcion": "Compra 40 unidades y recibe 10 surtidas gratis",
  "type": "PACK",  // o "BUY_GET_FREE"
  "buyQuantity": 40,
  "freeQuantity": 10,
  "packPrice": 400000,
  "mainProductId": "uuid-del-producto",
  "freeProductId": null,  // null para surtidos variables
  "allowStackWithDiscounts": false,
  "requiresAssortmentSelection": true,
  "validFrom": "2026-01-21T00:00:00",
  "validUntil": "2026-02-28T23:59:59"
}

Response: PromotionResponse (201 Created)
```

#### Listar Todas las Promociones
```
GET /api/admin/promotions
Authorization: Bearer {token}

Response: PromotionResponse[]
```

#### Obtener Promoción por ID
```
GET /api/admin/promotions/{id}
Authorization: Bearer {token}

Response: PromotionResponse
```

#### Actualizar Promoción
```
PUT /api/admin/promotions/{id}
Authorization: Bearer {token}

Request Body: CreatePromotionRequest (igual que crear)
Response: PromotionResponse
```

#### Cambiar Estado de Promoción
```
PATCH /api/admin/promotions/{id}/status?active=true
Authorization: Bearer {token}

Response: 204 No Content
```

#### Eliminar Promoción
```
DELETE /api/admin/promotions/{id}
Authorization: Bearer {token}

Response: 204 No Content
```

### 2. Promociones (Vendedor)

#### Ver Promociones Válidas
```
GET /api/vendedor/promotions
Authorization: Bearer {token} (Role: VENDEDOR)

Response: PromotionResponse[]
// Solo devuelve promociones activas y dentro del período de validez
```

### 3. Selección de Surtidos (Admin)

#### Agregar Productos Surtidos a Promoción
```
POST /api/admin/orders/{orderId}/promotions/{promotionId}/assortment
Authorization: Bearer {token} (Role: ADMIN o OWNER)

Request Body:
[
  {
    "productId": "uuid-producto-1",
    "cantidad": 5
  },
  {
    "productId": "uuid-producto-2",
    "cantidad": 5
  }
]

Response: 204 No Content
// Cantidad total debe sumar exactamente freeQuantity de la promoción
// Cambia estado de orden de PENDING_PROMOTION_COMPLETION a CONFIRMADO
```

### 4. Órdenes (Modificado)

#### Crear Orden - Ahora Soporta Productos Sin Stock y Promociones
```
POST /api/vendedor/orders
Authorization: Bearer {token} (Role: VENDEDOR)

Request Body:
{
  "clientId": "uuid-cliente",
  "items": [
    {
      "productId": "uuid-producto",
      "cantidad": 50,
      "allowOutOfStock": true  // NUEVO: permite venta sin stock
    }
  ],
  "notas": "Notas de la orden",
  "promotionIds": ["uuid-promo-1"]  // NUEVO: promociones a aplicar
}
```

---

## 📊 NUEVOS TIPOS DE DATOS

### PromotionResponse
```typescript
interface PromotionResponse {
  id: string;
  nombre: string;
  descripcion: string;
  type: 'PACK' | 'BUY_GET_FREE';
  buyQuantity: number;
  freeQuantity: number;
  packPrice: number | null;
  mainProduct: ProductResponse;
  freeProduct: ProductResponse | null;
  allowStackWithDiscounts: boolean;
  requiresAssortmentSelection: boolean;
  active: boolean;
  validFrom: string | null;  // ISO datetime
  validUntil: string | null;  // ISO datetime
  createdAt: string;  // ISO datetime
  isValid: boolean;  // calculado por backend
}
```

### OrderItem - Campos Adicionales
```typescript
interface OrderItem {
  // ... campos existentes
  outOfStock: boolean;  // NUEVO
  estimatedArrivalDate: string | null;  // NUEVO (ISO date)
  estimatedArrivalNote: string | null;  // NUEVO
  promotion: PromotionResponse | null;  // NUEVO
  isPromotionItem: boolean;  // NUEVO
  isFreeItem: boolean;  // NUEVO
}
```

### OrdenStatus - Nuevo Estado
```typescript
type OrdenStatus = 
  | 'PENDIENTE'
  | 'PENDING_PROMOTION_COMPLETION'  // NUEVO
  | 'CONFIRMADO'
  | 'COMPLETADO'
  | 'CANCELADO';
```

---

## 🎨 IMPLEMENTACIÓN FRONTEND REQUERIDA

### PARTE 1: Panel de Gestión de Promociones (Admin)

**Ubicación:** `/admin/promociones` o `/admin/promotions`

#### 1.1 Lista de Promociones
**Componente:** `PromotionsList.tsx` (o .jsx)

**Funcionalidades:**
- Mostrar tabla/cards con todas las promociones
- Columnas visibles:
  - Nombre
  - Tipo (Badge: "Pack" o "Compra y Recibe")
  - Cantidades (ej: "40+10")
  - Precio (si es PACK)
  - Producto Principal
  - Estado (Activa/Inactiva)
  - Vigencia (fechas)
  - Badge "Válida Ahora" si isValid = true
- Acciones por fila:
  - ✏️ Editar
  - 🔄 Activar/Desactivar (toggle)
  - 🗑️ Eliminar (con confirmación)

**Código Base:**
```tsx
const [promotions, setPromotions] = useState<PromotionResponse[]>([]);

useEffect(() => {
  fetch('/api/admin/promotions', {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  .then(res => res.json())
  .then(data => setPromotions(data));
}, []);

const toggleStatus = async (id: string, currentStatus: boolean) => {
  await fetch(`/api/admin/promotions/${id}/status?active=${!currentStatus}`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  // Refrescar lista
};
```

#### 1.2 Formulario de Creación/Edición
**Componente:** `PromotionForm.tsx`

**Campos del Formulario:**
1. **Nombre** (text, obligatorio)
2. **Descripción** (textarea, opcional)
3. **Tipo de Promoción** (radio/select)
   - PACK → Mostrar campo "Precio del Pack"
   - BUY_GET_FREE → Ocultar precio del pack
4. **Producto Principal** (select/autocomplete de productos)
5. **Cantidad a Comprar** (number, obligatorio)
6. **Cantidad Gratis/Surtida** (number, obligatorio)
7. **Precio del Pack** (number, solo si tipo = PACK)
8. **Producto Gratis Específico** (select de productos, opcional)
   - Si null → Admin debe seleccionar surtidos manualmente
9. **Permitir combinar con descuentos** (checkbox)
10. **Requiere selección de surtidos** (checkbox, default: true para PACK)
11. **Fecha de Inicio** (datetime, opcional)
12. **Fecha de Fin** (datetime, opcional)

**Validaciones:**
- Si tipo = PACK → Precio del pack es obligatorio
- buyQuantity y freeQuantity deben ser > 0
- Validar que fechas sean coherentes

### PARTE 2: Catálogo de Promociones para Vendedor

**Ubicación:** Panel del vendedor, puede ser:
- Pestaña nueva "Promociones"
- Panel lateral en la vista de creación de orden

**Componente:** `VendedorPromotionsCatalog.tsx`

**Funcionalidades:**
- Listar solo promociones válidas (GET `/api/vendedor/promotions`)
- Cards visuales atractivos mostrando:
  - Nombre de la promoción
  - Descripción
  - Badge del tipo
  - Cantidades (ej: "Compra 40 y recibe 10 gratis")
  - Producto principal con imagen
  - Precio (si es PACK)
  - Badge "Válido hasta {fecha}"
- Botón "Agregar a Orden"
  - Al hacer clic, agregar promotionId al carrito
  - Mostrar advertencia si hay productos sin stock en la promoción

### PARTE 3: Modificación del Carrito de Vendedor

**Componente:** Modificar componente existente del carrito

**Cambios Necesarios:**

#### 3.1 Agregar Productos Sin Stock
- Agregar checkbox o toggle "Permitir venta sin stock" en cada producto
- Visual diferenciado:
  - Badge "Sin Stock" en rojo/naranja
  - Icon de advertencia
  - Tooltip: "Este producto se agregará sin stock disponible"

#### 3.2 Incluir Promociones en el Carrito
- Sección separada "Promociones Aplicadas"
- Mostrar cada promoción con:
  - Nombre
  - Cantidades
  - Productos incluidos (si ya están definidos)
  - Botón para remover

#### 3.3 Advertencias Visuales
- Si la orden contiene productos sin stock:
  ```
  ⚠️ Esta orden incluye productos sin stock disponible
  ```
- Si incluye promociones pendientes de surtidos:
  ```
  ℹ️ Esta orden requiere selección de productos surtidos por Admin
  ```

**Código de Envío de Orden:**
```tsx
const createOrder = async () => {
  const payload = {
    clientId: selectedClient.id,
    items: cartItems.map(item => ({
      productId: item.product.id,
      cantidad: item.cantidad,
      allowOutOfStock: item.allowOutOfStock || false
    })),
    promotionIds: selectedPromotions.map(p => p.id),
    notas: orderNotes
  };

  const response = await fetch('/api/vendedor/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
};
```

### PARTE 4: Panel de Admin - Gestión de Órdenes

**Modificaciones en:** Vista de detalle de orden existente

#### 4.1 Identificación Visual de Items

**Para cada OrderItem, mostrar badges:**
- Si `outOfStock === true` → Badge "Sin Stock" (rojo)
- Si `isPromotionItem === true` → Badge "Promoción" (azul)
- Si `isFreeItem === true` → Badge "Bonificado" (verde)

#### 4.2 Campos de ETA para Productos Sin Stock

**Si item.outOfStock === true:**
- Mostrar formulario para agregar/editar ETA:
  - Campo de fecha: `estimatedArrivalDate`
  - Campo de texto: `estimatedArrivalNote` (ej: "Proveedor confirma llegada")
- Botón "Guardar ETA"
  - PUT `/api/admin/orders/{orderId}` con items actualizados

#### 4.3 Manejo de Órdenes con Estado PENDING_PROMOTION_COMPLETION

**Si orden.estado === 'PENDING_PROMOTION_COMPLETION':**

Mostrar advertencia destacada:
```
⚠️ Esta orden incluye una promoción que requiere selección de productos surtidos

Promoción: {promotion.nombre}
Cantidad de surtidos requerida: {promotion.freeQuantity}

[Botón: Seleccionar Productos Surtidos]
```

**Al hacer clic en "Seleccionar Productos Surtidos":**

Mostrar modal/panel con:

1. **Información de la Promoción:**
   - Nombre
   - Tipo
   - Cantidad requerida

2. **Buscador de Productos**
   - Autocomplete con todos los productos disponibles
   - Mostrar stock disponible de cada producto

3. **Lista de Productos Seleccionados**
   - Tabla con: Producto | Cantidad | Stock Disponible | Acciones
   - Validación en tiempo real:
     - Suma total debe ser exacta a `freeQuantity`
     - Mostrar advertencia si producto no tiene stock suficiente

4. **Botón "Completar Promoción"**
   - Habilitado solo si suma === freeQuantity
   - Al hacer clic:
   ```tsx
   const completePromotion = async () => {
     const payload = selectedProducts.map(p => ({
       productId: p.id,
       cantidad: p.cantidad
     }));

     await fetch(`/api/admin/orders/${orderId}/promotions/${promotionId}/assortment`, {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
         'Authorization': `Bearer ${token}`
       },
       body: JSON.stringify(payload)
     });

     // Refrescar orden - estado cambiará a CONFIRMADO
   };
   ```

**Código Ejemplo completo del Modal:**
```tsx
const AssortmentSelectionModal = ({ orderId, promotion, onClose, onComplete }) => {
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [products, setProducts] = useState([]);

  const totalSelected = selectedProducts.reduce((sum, p) => sum + p.cantidad, 0);
  const isValid = totalSelected === promotion.freeQuantity;

  const handleAddProduct = (product, cantidad) => {
    setSelectedProducts([...selectedProducts, { ...product, cantidad }]);
  };

  const handleComplete = async () => {
    const payload = selectedProducts.map(p => ({
      productId: p.id,
      cantidad: p.cantidad
    }));

    try {
      await fetch(`/api/admin/orders/${orderId}/promotions/${promotion.id}/assortment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      
      onComplete();
      onClose();
    } catch (error) {
      // Manejar error
    }
  };

  return (
    <Modal onClose={onClose}>
      <h2>Seleccionar Productos Surtidos</h2>
      <p>Promoción: {promotion.nombre}</p>
      <p>Cantidad requerida: {promotion.freeQuantity}</p>
      <p>Cantidad seleccionada: {totalSelected} / {promotion.freeQuantity}</p>

      {/* Buscador de productos */}
      <ProductSearchAutocomplete onSelect={handleAddProduct} />

      {/* Lista de productos seleccionados */}
      <table>
        <thead>
          <tr>
            <th>Producto</th>
            <th>Cantidad</th>
            <th>Stock</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {selectedProducts.map((p, idx) => (
            <tr key={idx}>
              <td>{p.nombre}</td>
              <td>{p.cantidad}</td>
              <td>{p.stock}</td>
              <td>
                <button onClick={() => removeProduct(idx)}>Eliminar</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <button 
        onClick={handleComplete} 
        disabled={!isValid}
      >
        Completar Promoción
      </button>
    </Modal>
  );
};
```

#### 4.4 Visualización de Productos Bonificados

**Después de completar la selección:**
- Los productos surtidos aparecen en la orden como OrderItems normales
- Diferenciados con badges "Bonificado" y "Gratis"
- Precio unitario: $0
- Se muestra la promoción asociada

---

## 🎯 FLUJOS DE TRABAJO ESPERADOS

### Flujo 1: Admin Crea Promoción Tipo PACK
1. Admin navega a `/admin/promociones`
2. Clic en "Crear Promoción"
3. Completa formulario:
   - Nombre: "Pack 40+10"
   - Tipo: PACK
   - Cantidad a comprar: 40
   - Cantidad surtida: 10
   - Precio: 400000
   - Producto: Selecciona producto X
   - Requiere selección de surtidos: ✓
4. Submit → POST `/api/admin/promotions`
5. Promoción creada y visible en lista

### Flujo 2: Vendedor Crea Orden con Promoción
1. Vendedor crea orden normal
2. Ve pestaña "Promociones Disponibles"
3. Selecciona "Pack 40+10"
4. Agrega 40 unidades del producto al carrito
5. La promoción se agrega automáticamente
6. Confirma orden → POST `/api/vendedor/orders` con `promotionIds`
7. Orden creada con estado `PENDING_PROMOTION_COMPLETION`

### Flujo 3: Admin Completa Promoción con Surtidos
1. Admin ve orden en estado "Pendiente de Surtidos"
2. Clic en "Seleccionar Productos Surtidos"
3. Modal se abre mostrando la promoción
4. Busca y agrega 5 unidades de Producto A
5. Busca y agrega 5 unidades de Producto B
6. Total: 10 (válido)
7. Clic "Completar Promoción"
8. POST `/api/admin/orders/{id}/promotions/{promId}/assortment`
9. Orden cambia a estado `CONFIRMADO`
10. Productos surtidos visibles en la orden con precio $0

### Flujo 4: Vendedor Vende Sin Stock
1. Vendedor agrega producto al carrito
2. Producto muestra "Stock: 0"
3. Activa checkbox "Permitir venta sin stock"
4. Badge "Sin Stock" aparece
5. Confirma orden → enviado con `allowOutOfStock: true`
6. Orden creada, OrderItem tiene `outOfStock: true`
7. Admin ve badge "Sin Stock" en la orden
8. Admin agrega ETA: fecha + nota
9. Cliente/vendedor puede ver fecha estimada de llegada

---

## 🎨 CONSIDERACIONES DE UX/UI

### Colores y Badges Recomendados
```tsx
const badges = {
  outOfStock: { 
    color: 'red', 
    text: 'Sin Stock',
    icon: '⚠️' 
  },
  promotion: { 
    color: 'blue', 
    text: 'Promoción',
    icon: '🎁' 
  },
  freeItem: { 
    color: 'green', 
    text: 'Bonificado',
    icon: '✓' 
  },
  pendingAssortment: { 
    color: 'orange', 
    text: 'Pendiente Surtidos',
    icon: '⏳' 
  }
};
```

### Iconografía
- 🎁 Promociones
- ⚠️ Sin stock
- ✓ Productos gratis/bonificados
- 📅 ETA / Fecha estimada
- 🔄 Estado de orden

### Mensajes de Usuario
- **Al agregar sin stock:** "Este producto se agregará sin inventario disponible. El admin deberá confirmar fecha de llegada."
- **Al aplicar promoción:** "Promoción '{nombre}' aplicada. Recibirás {X} productos adicionales."
- **Orden pendiente surtidos:** "Esta orden está esperando que el administrador seleccione los productos surtidos de la promoción."

---

## ✅ CHECKLIST DE IMPLEMENTACIÓN

### Admin - Promociones
- [ ] Crear página `/admin/promociones`
- [ ] Componente lista de promociones
- [ ] Formulario crear/editar promoción
- [ ] Toggle activar/desactivar
- [ ] Eliminar con confirmación
- [ ] Validaciones de formulario

### Admin - Órdenes
- [ ] Mostrar badges en OrderItems (sin stock, promoción, bonificado)
- [ ] Formulario ETA para productos sin stock
- [ ] Detectar estado PENDING_PROMOTION_COMPLETION
- [ ] Modal de selección de surtidos
- [ ] Buscador de productos en modal
- [ ] Validación de cantidades
- [ ] POST completar promoción
- [ ] Actualizar vista después de completar

### Vendedor - Promociones
- [ ] Crear sección/pestaña de promociones
- [ ] Listar promociones válidas
- [ ] Cards visuales atractivos
- [ ] Botón agregar promoción al carrito

### Vendedor - Carrito
- [ ] Checkbox "Permitir venta sin stock"
- [ ] Badge visual "Sin Stock"
- [ ] Sección "Promociones Aplicadas"
- [ ] Advertencias visuales
- [ ] Enviar allowOutOfStock en request
- [ ] Enviar promotionIds en request

### General
- [ ] Tipos TypeScript actualizados
- [ ] Manejo de errores del backend
- [ ] Loading states
- [ ] Toasts/notificaciones de éxito
- [ ] Responsive design
- [ ] Accesibilidad

---

## 🚀 EJEMPLOS DE REQUESTS COMPLETOS

### Crear Promoción PACK
```javascript
fetch('/api/admin/promotions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    nombre: "Pack 40+10 Especial Enero",
    descripcion: "Compra 40 unidades del producto X y recibe 10 productos surtidos gratis",
    type: "PACK",
    buyQuantity: 40,
    freeQuantity: 10,
    packPrice: 400000,
    mainProductId: "e4b2c3d1-5678-90ab-cdef-1234567890ab",
    freeProductId: null,
    allowStackWithDiscounts: false,
    requiresAssortmentSelection: true,
    validFrom: "2026-01-21T00:00:00",
    validUntil: "2026-01-31T23:59:59"
  })
});
```

### Crear Orden con Producto Sin Stock y Promoción
```javascript
fetch('/api/vendedor/orders', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    clientId: "12345678-90ab-cdef-1234-567890abcdef",
    items: [
      {
        productId: "prod-uuid-1",
        cantidad: 50,
        allowOutOfStock: true  // Este producto no tiene stock
      },
      {
        productId: "prod-uuid-2",
        cantidad: 20,
        allowOutOfStock: false
      }
    ],
    promotionIds: ["promo-uuid-1"],
    notas: "Cliente necesita envío urgente"
  })
});
```

### Completar Promoción con Surtidos
```javascript
fetch('/api/admin/orders/order-uuid-123/promotions/promo-uuid-1/assortment', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify([
    { productId: "producto-a-uuid", cantidad: 5 },
    { productId: "producto-b-uuid", cantidad: 3 },
    { productId: "producto-c-uuid", cantidad: 2 }
    // Total: 10 (debe coincidir con freeQuantity de la promoción)
  ])
});
```

---

## 🔍 VALIDACIONES IMPORTANTES

1. **En formulario de promoción:**
   - Si tipo = PACK → packPrice es obligatorio
   - buyQuantity > 0
   - freeQuantity > 0
   - validUntil debe ser posterior a validFrom

2. **En selección de surtidos:**
   - Suma de cantidades debe ser exacta a promotion.freeQuantity
   - No permitir enviar si no coincide

3. **En venta sin stock:**
   - Mostrar advertencia clara al vendedor
   - Confirmar que el usuario entiende las implicaciones

4. **En carrito:**
   - Validar que las promociones sigan siendo válidas antes de enviar
   - Verificar stock si allowOutOfStock es false

---

Este es el prompt completo para implementar el frontend. Si tienes dudas sobre algún endpoint, flujo o componente específico, consulta la documentación del backend en [backend_changes.md](file:///C:/Users/Jose%20Pc/.gemini/antigravity/brain/5cbffe42-d73c-48c1-b753-085566460290/backend_changes.md).
