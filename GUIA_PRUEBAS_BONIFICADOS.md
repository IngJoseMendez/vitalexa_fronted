# 🧪 GUÍA RÁPIDA DE PRUEBAS - Órdenes Solo Bonificadas

## ⚡ Inicio Rápido

### Prerequisitos
- Backend actualizado con soporte para órdenes solo bonificadas
- Frontend compilado sin errores
- Usuario con rol Admin o Vendedor

---

## 🎯 PRUEBA 1: Admin - Orden Solo Bonificadas (2 min)

### Pasos:
1. Login como **Admin**
2. Ir a **"Nueva Venta"**
3. Seleccionar:
   - ✅ **Vendedor** (obligatorio)
   - ✅ **Cliente** (o marcar "Sin Cliente")
4. Hacer clic en el botón **🎁 "Bonificados"** (debe resaltarse)
5. Buscar y agregar **2-3 productos** al carrito bonificado
6. Verificar que:
   - ✅ Los productos aparecen en la sección "Bonificados"
   - ✅ El precio muestra $0.00
   - ✅ El botón "Finalizar Venta" está **habilitado**
7. Hacer clic en **"Finalizar Venta"**

### ✅ Resultado Esperado:
```
✅ Mensaje: "¡Venta registrada exitosamente!"
✅ Se crea una orden con solo bonificados
✅ El carrito se limpia automáticamente
```

---

## 🎯 PRUEBA 2: Vendedor - Orden Solo Bonificadas (2 min)

### Pasos:
1. Login como **Vendedor**
2. Ir a **"Nueva Venta"**
3. Seleccionar:
   - ✅ **Cliente** (o marcar "Venta sin cliente")
4. Hacer clic en el botón **🎁 "Bonificados"**
5. Agregar **2-3 productos** al carrito bonificado
6. Verificar que el botón "Finalizar Venta" está **habilitado**
7. Hacer clic en **"Finalizar Venta"**

### ✅ Resultado Esperado:
```
✅ Mensaje: "¡Venta registrada exitosamente!"
✅ Orden creada y visible en el historial
✅ Carrito limpiado
```

---

## 🎯 PRUEBA 3: Editar Orden Existente (3 min)

### Pasos:
1. Login como **Admin**
2. Ir a **"Ventas"** → Seleccionar una orden
3. Hacer clic en **"Editar Orden"** (ícono de lápiz)
4. **Eliminar todos** los productos regulares
5. Activar modo **"Bonificados"** (toggle en el modal)
6. Agregar **1-2 productos bonificados**
7. Hacer clic en **"Guardar Cambios"**

### ✅ Resultado Esperado:
```
✅ Mensaje: "Orden actualizada exitosamente"
✅ La orden ahora solo tiene bonificados
✅ Total de la orden: $0.00
```

---

## 🎯 PRUEBA 4: Validación de Carrito Vacío (1 min)

### Pasos:
1. Ir a **"Nueva Venta"**
2. Seleccionar vendedor/cliente
3. **NO agregar productos** (carrito vacío)
4. Hacer clic en **"Finalizar Venta"**

### ✅ Resultado Esperado:
```
⚠️ Mensaje: "Agrega productos, promociones o bonificados al carrito"
❌ La orden NO se crea
```

---

## 🎯 PRUEBA 5: Orden Mixta (2 min)

### Pasos:
1. Ir a **"Nueva Venta"**
2. Agregar **2 productos regulares** (modo normal)
3. Activar **"Bonificados"**
4. Agregar **2 productos bonificados**
5. Verificar en el carrito:
   - ✅ Sección "Productos" con precio normal
   - ✅ Sección "Bonificados" con $0.00
6. Hacer clic en **"Finalizar Venta"**

### ✅ Resultado Esperado:
```
✅ Orden creada con ambos tipos de productos
✅ Total = suma de productos regulares (bonificados no cuentan)
```

---

## 📊 VERIFICACIÓN EN BASE DE DATOS

### Consulta SQL (Opcional):
```sql
-- Verificar órdenes solo con bonificados
SELECT 
    o.id,
    o.invoice_number,
    o.total_value,
    COUNT(DISTINCT oi.id) as regular_items,
    COUNT(DISTINCT obi.id) as bonified_items
FROM ordenes o
LEFT JOIN orden_items oi ON o.id = oi.orden_id
LEFT JOIN orden_bonified_items obi ON o.id = obi.orden_id
WHERE o.created_at >= CURRENT_DATE
GROUP BY o.id, o.invoice_number, o.total_value
HAVING COUNT(DISTINCT oi.id) = 0 AND COUNT(DISTINCT obi.id) > 0;
```

### ✅ Resultado Esperado:
- **regular_items:** 0
- **bonified_items:** > 0
- **total_value:** 0.00

---

## 🐛 TROUBLESHOOTING

### Problema 1: Botón "Finalizar Venta" Deshabilitado
**Causa:** Carrito vacío o validación incorrecta  
**Solución:**
1. Verificar que hay productos en el carrito bonificado
2. Revisar console del navegador (F12) por errores
3. Verificar que el estado `bonifiedCart` se actualiza

### Problema 2: Error "Debe agregar al menos un producto"
**Causa:** Backend no actualizado  
**Solución:**
1. Verificar que el backend está en la versión correcta
2. Revisar logs del servidor
3. Confirmar que `OrderServiceImpl.createOrder()` fue actualizado

### Problema 3: Total de Orden Incorrecto
**Causa:** Bonificados sumando al total  
**Solución:**
1. Verificar que `isBonified = true` en los items
2. Revisar cálculo en `calculateTotal()`
3. Confirmar que backend no suma bonificados al total

---

## 📝 CHECKLIST DE PRUEBAS

- [ ] **Prueba 1:** Admin - Orden solo bonificados
- [ ] **Prueba 2:** Vendedor - Orden solo bonificados
- [ ] **Prueba 3:** Editar orden existente
- [ ] **Prueba 4:** Validación carrito vacío
- [ ] **Prueba 5:** Orden mixta (regular + bonificados)
- [ ] **Verificar:** Orden aparece en historial
- [ ] **Verificar:** Total = $0.00 para solo bonificados
- [ ] **Verificar:** Factura se genera correctamente
- [ ] **Verificar:** No hay errores en consola

---

## 🎉 CRITERIOS DE ÉXITO

### ✅ La actualización es exitosa si:
1. Se pueden crear órdenes con **solo bonificados**
2. El botón "Finalizar Venta" se **habilita** correctamente
3. El mensaje de validación menciona **"bonificados"**
4. Las órdenes aparecen en el **historial**
5. El total es **$0.00** para órdenes solo bonificadas
6. **No hay errores** en consola del navegador
7. **No hay errores** en logs del backend

---

## ⏱️ TIEMPO TOTAL ESTIMADO
**15-20 minutos** para completar todas las pruebas

---

**Última Actualización:** 2026-02-13  
**Autor:** Sistema de Actualización Frontend  
**Versión:** 1.0

