# 🧪 GUÍA DE PRUEBAS - 7 CARACTERÍSTICAS IMPLEMENTADAS

## Cómo Probar Cada Característica

---

## 1️⃣ ASSORTMENT PROMOTIONS (Mix & Match)

### Prerequisitos:
- Backend debe tener promoción con `type: BUY_GET_FREE`, `buyQuantity: 40`, `freeQuantity: 15`
- Productos activos disponibles en catálogo

### Pasos de Prueba:

```
1. Login como VENDEDOR
2. Ir a "Nueva Venta"
3. Ver catálogo de promociones (sección CATALOGO DE PROMOCIONES)
4. Clicker en promoción de tipo surtido "Compra 40, Lleva 15"
5. Se abre Modal: "Seleccionar Productos Surtidos"
6. Buscar productos (ej: "papa")
7. Seleccionar 40 productos (puede ser combo: 20 papa limón + 20 papa pollo)
8. El contador debe mostrar: "Total seleccionado: 40"
9. Botón "Completar" debe estar HABILITADO
10. Clicker "Completar"
11. Productos se agregan al carrito
12. Cada item debe incluir: productId, cantidad, relatedPromotionId
13. Finalizando la venta → Orden creada exitosamente
```

### Validar en DevTools:
- Abrir Network → Filtrar "orders"
- Verificar payload incluye `relatedPromotionId` para cada item
- Buscar en Request Body: `"relatedPromotionId": "UUID-PROMOCION"`

---

## 2️⃣ FIXED PROMOTIONS CONSTRAINTS (Mismo Producto)

### Prerequisitos:
- Estar como ADMIN/OWNER

### Pasos de Prueba:

```
1. Login como ADMIN
2. Ir a "Promociones"
3. Clicker "Nueva Promoción"
4. Tipo: Seleccionar "Concreta (Fija)"
5. Producto Principal: Seleccionar "Papa Limón" (por ej)
6. Agregar Regalo: Seleccionar el MISMO producto "Papa Limón"
7. Cantidad Regalo: 1
8. Botón "Crear Promoción": Debe estar HABILITADO
9. Guardar promoción
10. ✅ Promoción creada sin errores (antes esto no era posible)
```

### Validar:
- La promoción aparece en lista: "Compra 10 Papa Limón, Lleva 1 Papa Limón"
- No debe haber mensaje de error: "El producto principal no puede ser igual al de regalo"

---

## 3️⃣ FREIGHT OPTION (Flete)

### Prerequisitos:
- Estar como ADMIN/OWNER

### Pasos de Prueba:

```
1. Login como ADMIN
2. Ir a "Nueva Venta" (debe estar disponible en Admin Dashboard)
3. Buscar productos y agregarlos al carrito
4. Bajar hasta "Notas" section
5. BAJO de Notas, debe haber checkbox: "Incluir Flete en Orden"
   ❌ Si eres VENDEDOR: NO verás este checkbox (correcto)
   ✅ Si eres ADMIN/OWNER: Verás el checkbox
6. Marcar checkbox
7. Clicker "Finalizar Venta"
8. Orden creada
```

### Validar en DevTools:
- Network → Buscar request POST /admin/orders
- En payload, verificar: `"includeFreight": true`

### Validar Sin Flete:
```
1. Repetir pasos pero SIN marcar checkbox
2. En payload, verificar: `"includeFreight": false`
```

---

## 4️⃣ CLIENT VALIDATION (Espacios Permitidos)

### Pasos de Prueba:

```
1. Login como ADMIN
2. Ir a "Clientes"
3. Clicker "Nuevo Cliente"
4. Formulario de creación se abre
5. Campo "Nombre de Establecimiento": 
   Ingresar "Mi Tienda con Espacios" ✅ DEBE funcionar
6. Campo "Administrador": 
   Ingresar "Juan Carlos López" ✅ DEBE funcionar
7. Campo "Representante Legal": 
   Ingresar "María García Pérez" ✅ DEBE funcionar
8. Campo "Dirección": 
   Ingresar "Cra 7 # 34-20 Apto 201" ✅ DEBE funcionar
9. Otros campos requeridos
10. Clicker "Crear Cliente"
11. Cliente creado exitosamente ✅
```

### Validar:
- Nombres con espacios aceptados
- Direcciones con caracteres especiales aceptadas
- NO debe haber validación que forbidea espacios

---

## 5️⃣ ORDER ANNULLING (Anular Orden)

### Prerequisitos:
- Estar como ADMIN/OWNER
- Tener una orden existente (no ANULADA, no CANCELADA)

### Pasos de Prueba:

```
1. Login como ADMIN
2. Ir a "Órdenes"
3. Clicker en una orden (cualquier status)
4. Modal se abre con detalles
5. En el header del modal, debe haber botón ROJO: "Anular Venta"
   ❌ Si es VENDEDOR: NO verás este botón (correcto)
   ❌ Si orden ya está ANULADA: Botón deshabilitado (correcto)
6. Clicker "Anular Venta"
7. Se abre NUEVO MODAL: "Anular Orden"
   - Banner amarillo: "Advertencia: Al anular esta orden..."
   - Textarea: "Motivo de Anulación"
8. Intentar clicker "Anular Orden" SIN escribir motivo
   → Toast: "Debes ingresar un motivo de anulación" ❌
9. Escribir motivo: "Cliente cambió de idea"
10. Clicker "Anular Orden"
11. Loading spinner en botón
12. Toast: "Orden anulada correctamente" ✅
13. Modal cierra
14. Volver a la orden
15. Status debe ser: "ANULADA" ✅
16. Badge color GRIS/ROJO (diferente a otros status)
```

### Validar en DevTools:
- Network → Buscar POST /admin/orders/{id}/annul
- Query params: `reason=Cliente%20cambió%20de%20idea`
- Response: Status 200 OK, orden actualizada

---

## 6️⃣ ADMIN CREATING ORDERS AS SELLER

### Prerequisitos:
- Backend debe tener múltiples VENDEDORES en sistema
- Endpoint GET /admin/clients/vendedores funcionando

### Pasos de Prueba:

```
1. Login como ADMIN
2. Ir a "Nueva Venta"
3. En sección de CARRITO, bajar hasta "Notas"
4. BAJO de Notas, debe haber NUEVO DROPDOWN: "Asignar Vendedor"
   ❌ Si eres VENDEDOR: NO verás este dropdown (correcto)
   ✅ Si eres ADMIN: Verás el dropdown
5. Clicker en dropdown
6. Debe cargar lista de vendedores (ej: "juan", "maria", "carlos")
7. Seleccionar vendedor "juan"
8. Agregar productos al carrito
9. Intentar clicker "Finalizar Venta" SIN seleccionar vendedor
   → Toast: "Debe asignar un vendedor para crear esta orden" ❌
10. Seleccionar vendedor nuevamente
11. Clicker "Finalizar Venta"
12. Orden creada exitosamente ✅
```

### Validar en DevTools:
- Network → POST /admin/orders
- En payload, verificar:
  ```json
  "sellerId": "UUID-DEL-VENDEDOR-SELECCIONADO"
  ```

### Verificar Asignación en Backend:
- Loguear como VENDEDOR "juan"
- Ir a "Mis Ventas"
- Debe aparecer la orden creada por Admin (si la asignación funcionó)

---

## 7️⃣ ADMIN CREATING CLIENTS FOR SELLERS

### Prerequisitos:
- Backend debe tener múltiples VENDEDORES

### Pasos de Prueba:

```
1. Login como ADMIN
2. Ir a "Clientes"
3. Clicker "Nuevo Cliente"
4. Modal de creación se abre
5. En el TOP del formulario, debe haber INFO BOX:
   "Asignación de Vendedor: El cliente será asignado al vendedor..."
6. Dropdown "Asignar a Vendedor": Debe estar PRESENTE
7. Clicker en dropdown
8. Lista de vendedores debe cargar: "juan", "maria", "carlos"
9. Seleccionar vendedor "juan"
10. Llenar resto de formulario (datos cliente)
11. Intentar guardar SIN seleccionar vendedor
    → Toast: "Debe seleccionar un vendedor para asignar el cliente" ❌
12. Seleccionar vendedor nuevamente
13. Clicker "Crear Cliente"
14. Cliente creado exitosamente ✅
```

### Validar en DevTools:
- Network → POST /admin/clients
- En payload, verificar:
  ```json
  "vendedorId": "UUID-DEL-VENDEDOR",
  "nombre": "Mi Tienda",
  "nit": "123456"
  ```

### Verificar Asignación en Backend:
- Loguear como VENDEDOR "juan"
- Ir a "Clientes"
- Debe aparecer el cliente recién creado (si la asignación funcionó)
- Loguear como VENDEDOR "maria"
- El cliente NO debe aparecer (correcto)

---

## 📋 CHECKLIST DE VALIDACIÓN RÁPIDA

```
✅ ASSORTMENT: ¿Se puede seleccionar 40 productos surtidos?
✅ FIXED PROMO: ¿Se puede crear promoción con mismo producto?
✅ FLETE: ¿Aparece checkbox solo para Admin/Owner?
✅ CLIENT: ¿Se aceptan espacios en nombres?
✅ ANNUL: ¿Se abre modal al anular con motivo?
✅ ADMIN ORDERS: ¿Aparece dropdown vendedor para Admin?
✅ ADMIN CLIENTS: ¿Aparece dropdown vendedor al crear cliente?
```

---

## 🔧 TROUBLESHOOTING

### Problema: Dropdown vendedores vacío
**Solución:** Verificar que endpoint `GET /admin/clients/vendedores` retorna datos

### Problema: Modal surtido no abre
**Solución:** Verificar que promoción tiene `type: BUY_GET_FREE` en backend

### Problema: Botón "Anular Venta" no aparece
**Solución:** Verificar que usuario es ADMIN/OWNER y orden no está ya ANULADA

### Problema: Checkbox flete no aparece
**Solución:** Verificar que usuario tiene rol `ROLE_ADMIN` o `ROLE_OWNER`

### Problema: Toast no aparece
**Solución:** Verificar que ToastContainer está en App.js (ya está)

---

## 📊 MATRIZ DE PRUEBAS POR ROL

| Característica | Vendedor | Admin | Owner | 
|---|---|---|---|
| Assortment Modal | ✅ Sí | ✅ Sí | ✅ Sí |
| Fixed Promo Create | ❌ No | ✅ Sí | ✅ Sí |
| Flete Checkbox | ❌ No | ✅ Sí | ✅ Sí |
| Anular Orden | ❌ No | ✅ Sí | ✅ Sí |
| Asignar Vendedor Orden | ❌ No | ✅ Sí | ✅ Sí |
| Asignar Vendedor Cliente | ❌ No | ✅ Sí | ✅ Sí |
| Crear Clientes | ✅ Sí | ✅ Sí | ✅ Sí |

---

## 🎯 NEXT STEPS

1. **Ejecutar todas las pruebas** en el orden indicado
2. **Documentar cualquier issue** encontrado
3. **Verificar endpoints backend** retornan los datos esperados
4. **Hacer testing cross-browser** (Chrome, Firefox, Safari)
5. **Hacer testing en mobile** (responsive design)

---

**Última actualización:** 28 de Enero, 2026  
**Versión Testing Guide:** v1.0

