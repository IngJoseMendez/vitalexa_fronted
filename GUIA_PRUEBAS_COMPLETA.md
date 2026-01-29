// GUÍA DE VERIFICACIÓN Y PRUEBAS - 7 CARACTERÍSTICAS IMPLEMENTADAS

═══════════════════════════════════════════════════════════════════════════════

## 🧪 PLAN DE PRUEBAS POR CARACTERÍSTICA

───────────────────────────────────────────────────────────────────────────────
### 1️⃣ ASSORTMENT PROMOTIONS (Mix & Match)
───────────────────────────────────────────────────────────────────────────────

**Prerrequisitos:**
- Crear una promoción de tipo "Surtido (Variable)" con:
  - buyQuantity = 40
  - freeQuantity = 15
  - requiresAssortmentSelection = true

**Pasos de Prueba (Vendedor):**
1. Ir a "Nueva Venta"
2. En catálogo de promociones, buscar y agregar la promoción surtida
3. Se debe abrir modal "Seleccionar Productos Surtidos"
4. Confirmar que debe seleccionar exactamente 40 productos
5. Seleccionar 40 productos diferentes (con búsqueda)
6. Verificar contador: "Total: 40/40"
7. Click "Confirmar"
8. Productos deben aparecer en carrito como items normales
9. Crear orden y verificar que se envía con `relatedPromotionId`

**Pasos de Prueba (Admin - Gestionar Orden Pendiente):**
1. Ir a "Órdenes"
2. Filtrar por "Pendiente Surtidos"
3. Abrir orden con estado PENDING_PROMOTION_COMPLETION
4. Verificar alerta: "Acción Requerida: Completar Promoción"
5. Click en "Seleccionar Surtidos para [Promoción]"
6. Modal se abre sin modo standalone
7. Seleccionar exactamente 15 productos para regalar
8. Confirmar y verificar que orden pasa a siguiente estado

**Validaciones Esperadas:**
✅ No permite seleccionar cantidad diferente a la requerida
✅ Buscador funciona correctamente
✅ Items seleccionados se agregan al carrito
✅ Promoción se vincula correctamente a items

───────────────────────────────────────────────────────────────────────────────
### 2️⃣ FIXED PROMOTIONS CONSTRAINTS (Mismo Producto)
───────────────────────────────────────────────────────────────────────────────

**Pasos de Prueba:**
1. Ir a "Promociones"
2. Click "Nueva Promoción"
3. Seleccionar tipo "Concreta (Fija)"
4. Seleccionar mismo producto para:
   - "Producto Principal" (buyQuantity 40)
   - "Productos de Regalo" (primer regalo)
5. Click "Guardar"

**Validaciones Esperadas:**
✅ No aparece validación que impida usar el mismo producto
✅ Promoción se crea exitosamente
✅ Backend acepta la creación sin error

───────────────────────────────────────────────────────────────────────────────
### 3️⃣ FREIGHT OPTION (Flete)
───────────────────────────────────────────────────────────────────────────────

**Prueba como VENDEDOR:**
1. Ir a "Nueva Venta"
2. Agregar productos al carrito
3. Verificar que NO aparece checkbox "Incluir Flete"
4. Crear orden normalmente
5. Verificar que includeFreight = false en la orden

**Prueba como ADMIN:**
1. Ir a "Nueva Venta" (o usar el mismo endpoint)
2. Agregar productos al carrito
3. Verificar que SÍ aparece:
   - Dropdown "Asignar Vendedor" (REQUIRED)
   - Checkbox "Incluir Flete en Orden"
4. Seleccionar vendedor
5. Marcar "Incluir Flete"
6. Crear orden
7. Verificar en backend:
   - sellerId = ID del vendedor seleccionado
   - includeFreight = true

**Validaciones Esperadas:**
✅ Checkbox solo visible para Admin/Owner
✅ Flag se incluye en payload
✅ Vendedor es obligatorio para Admin
✅ Sin vendedor → muestra error "Debe asignar un vendedor"

───────────────────────────────────────────────────────────────────────────────
### 4️⃣ CLIENT VALIDATION (Relaxed / Relajada)
───────────────────────────────────────────────────────────────────────────────

**Prueba de Espacios en Nombres:**
1. Ir a "Clientes" (Admin)
2. Click "Nuevo Cliente"
3. Llenar campos con espacios:
   - NIT: 123456789
   - Nombre: "Mi Establecimiento de Prueba"
   - Administrador: "Juan Carlos López García"
   - Representante Legal: "María José Pérez Martínez"
   - Email: test@example.com
   - Teléfono: +57 320 1234567
   - Dirección: "Calle 10 Apto 5-40 Zona Centro"
   - Vendedor: Seleccionar uno
4. Click "Crear Cliente"

**Validaciones Esperadas:**
✅ Acepta espacios en todos los campos de texto
✅ Cliente se crea correctamente
✅ Valores con espacios se guardan sin modificar

───────────────────────────────────────────────────────────────────────────────
### 5️⃣ ORDER ANNULLING (Anular Órdenes)
───────────────────────────────────────────────────────────────────────────────

**Pasos de Prueba:**
1. Ir a "Órdenes"
2. Click en una orden con estado "Pendiente" o "Confirmado"
3. Verificar botón rojo "Anular Venta" en header (solo Admin/Owner)
4. Click en "Anular Venta"
5. Se abre modal "Anular Orden"
6. Verificar contenido:
   - Icono de advertencia
   - Texto: "Al anular esta orden, se restaurará el stock..."
   - Textarea para motivo
   - Botones: "Cancelar" y "Anular Orden"
7. Click "Anular Orden" sin ingresar motivo → Error: "Debes ingresar un motivo"
8. Ingresar motivo: "Cliente solicitó cancelación"
9. Click "Anular Orden"
10. Verificar:
    - Toast: "Orden anulada correctamente"
    - Modal cierra
    - Orden se actualiza con estado "Anulada"
    - Botón "Anular Venta" ya no aparece

**Validaciones Esperadas:**
✅ Modal requiere motivo no vacío
✅ Endpoint POST /admin/orders/{id}/annul se llamó con reason
✅ Status cambia a ANULADA
✅ No se puede anular orden si ya está ANULADA
✅ Badge cambia a color gris/rojo con "Anulada"

───────────────────────────────────────────────────────────────────────────────
### 6️⃣ ADMIN CREATING ORDERS AS SELLER
───────────────────────────────────────────────────────────────────────────────

**Pasos de Prueba:**
1. Login como ADMIN
2. Ir a "Nueva Venta"
3. Verificar nuevos campos:
   - Dropdown "Asignar Vendedor" ✅
   - Checkbox "Incluir Flete" ✅
4. Rellenar orden normalmente pero:
   - Agregar productos
   - Seleccionar cliente (o marcar "sin cliente")
   - Seleccionar vendedor del dropdown
   - (Opcional) Marcar flete
5. Click "Finalizar Venta"
6. Verificar:
   - POST a `/admin/orders` (no `/vendedor/orders`)
   - Payload incluye: sellerId, includeFreight
   - Toast: "¡Venta registrada exitosamente!"
   - Orden aparece con vendedor asignado

**Validación - Sin Vendedor:**
1. Rellenar orden sin seleccionar vendedor
2. Click "Finalizar Venta"
3. Verificar error: "Debe asignar un vendedor para crear esta orden"

**Validaciones Esperadas:**
✅ Dropdown carga vendedores desde /admin/clients/vendedores
✅ Vendedor es requerido (validación bloqueante)
✅ Endpoint correcto: /admin/orders
✅ sellerId incluido en payload
✅ Backend vincula orden al vendedor asignado

───────────────────────────────────────────────────────────────────────────────
### 7️⃣ ADMIN CREATING CLIENTS FOR SELLERS
───────────────────────────────────────────────────────────────────────────────

**Pasos de Prueba:**
1. Login como ADMIN
2. Ir a "Clientes"
3. Click "Nuevo Cliente"
4. Verificar campo "Asignar a Vendedor" (REQUIRED)
5. Llenar formulario:
   - Asignar a Vendedor: Seleccionar uno
   - NIT: 987654321
   - Nombre: "Test Client"
   - Administrador: "Test Admin"
   - Representante Legal: "Test Legal"
   - Email: test@client.com
   - Teléfono: 3101234567
   - Dirección: "Carrera 50 #20-30"
6. Click "Crear Cliente"
7. Verificar:
   - POST a `/admin/clients` con vendedorId
   - Toast: "¡Cliente creado y asignado exitosamente!"
   - Cliente aparece con vendedor asignado

**Validación - Sin Vendedor:**
1. Intentar crear cliente sin seleccionar vendedor
2. Click "Crear Cliente"
3. Campo debe estar resaltado o mostrar error

**Validaciones Esperadas:**
✅ Dropdown "Asignar a Vendedor" carga lista
✅ Vendedor es requerido (botón deshabilitado sin selección)
✅ Endpoint: /admin/clients con vendedorId
✅ Cliente queda asignado al vendedor
✅ Vendedor solo ve este cliente

═══════════════════════════════════════════════════════════════════════════════

## 🔍 VERIFICACIÓN DE CÓDIGOS DE ERROR

Cuando ocurren errores, verificar:

```
❌ Error: "Debe asignar un vendedor para crear esta orden"
   → Causas posibles:
      - Admin no seleccionó vendedor
      - Dropdown no cargó (GET /admin/clients/vendedores falló)

❌ Error: "Debe asignar un vendedor para asignar el cliente"
   → En AdminClientsPanel, vendedor no seleccionado

❌ Error al anular: "El motivo es obligatorio"
   → Usuario click en "Anular Orden" sin ingresar motivo

❌ Error: "Debe seleccionar exactamente X productos"
   → En AssortmentSelectionModal, cantidad no coincide

❌ 403 Forbidden al crear /admin/orders
   → Usuario no es Admin/Owner, backend validó permisos

❌ 404 GET /admin/clients/vendedores
   → Endpoint no existe en backend, verificar API
```

═══════════════════════════════════════════════════════════════════════════════

## 📊 CHECKLIST DE VALIDACIÓN FINAL

### Archivos Creados:
- [x] src/api/orderService.js
- [x] src/api/clientService.js
- [x] src/components/modals/OrderAnnulationModal.js
- [x] src/components/modals/OrderAnnulationModal.css
- [x] src/components/VendorSelectionDropdown.js

### Archivos Modificados:
- [x] src/utils/types.js (Status ANULADA agregado)
- [x] src/components/modals/OrderManagementModal.js (Modal de anulación)
- [x] src/pages/VendedorDashboard.js (Flete + Vendedor)
- [x] src/components/AdminClientsPanel.js (Ya tenía vendor)

### Estados & UI:
- [x] Nuevos estados en componentes
- [x] Nuevos campos visuales (Flete, Vendedor)
- [x] Nuevos modales (Anulación)
- [x] Nuevas validaciones

### API & Servicios:
- [x] orderService: annulOrder, getVendedores, createAdminOrder
- [x] clientService: createAdminClient, getVendedores
- [x] Endpoints esperados documentados

### Validaciones:
- [x] Admin/Owner debe asignar vendedor
- [x] Flete solo para Admin/Owner
- [x] Motivo de anulación obligatorio
- [x] Promociones surtidas con cantidad exacta

═══════════════════════════════════════════════════════════════════════════════

## 🚀 DEPLOYMENT CHECKLIST

Antes de ir a producción:

1. **Backend:**
   - [ ] Endpoint POST /admin/orders soporta `sellerId` y `includeFreight`
   - [ ] Endpoint POST /admin/orders/{id}/annul retorna status ANULADA
   - [ ] Endpoint GET /admin/clients/vendedores devuelve lista de vendedores
   - [ ] Validación de permisos en backend (solo Admin/Owner)

2. **Frontend:**
   - [ ] Proyecto compila sin errores ✅
   - [ ] Componentes importan correctamente
   - [ ] Servicios están disponibles
   - [ ] CSS cargado correctamente

3. **Testing:**
   - [ ] Pruebas unitarias de servicios
   - [ ] Pruebas de integración (UI + API)
   - [ ] Pruebas de permisos (Auth)
   - [ ] Casos edge (sin cliente, sin stock, etc.)

4. **Documentación:**
   - [ ] API docs actualizados
   - [ ] Manual de usuario por rol
   - [ ] Guía de troubleshooting

═══════════════════════════════════════════════════════════════════════════════

## 💡 TIPS & TROUBLESHOOTING

**Si el dropdown de vendedor está vacío:**
```
→ Verificar: GET /admin/clients/vendedores retorna datos
→ Check console para errores de red
→ Validar que el usuario tiene permisos de lectura de vendedores
```

**Si no aparece el modal de anulación:**
```
→ Verificar: userRole === 'ROLE_ADMIN' || 'ROLE_OWNER'
→ Verificar: orden.estado !== 'ANULADA'
→ Check console para errores de importación
```

**Si flete no se guarda:**
```
→ Verificar: includeFreight se incluye en payload
→ Verificar: Backend recibe y procesa el flag
→ Check Network tab para ver POST body
```

**Si promoción surtida no se abre:**
```
→ Verificar: promotion.type === 'BUY_GET_FREE'
→ Verificar: promotion.requiresAssortmentSelection === true
→ Check que productos tienen active: true
```

═══════════════════════════════════════════════════════════════════════════════

## 📝 NOTAS FINALES

✅ **Todas las 7 características están implementadas en frontend**
✅ **El proyecto compila sin errores**
✅ **Archivos están organizados según patrón existente**
✅ **Servicios y componentes reutilizan código existente**
✅ **Validaciones están en ambos lados (frontend + backend esperado)**

**Próximo paso:** Sincronizar con backend y ejecutar pruebas integradas.

═══════════════════════════════════════════════════════════════════════════════

