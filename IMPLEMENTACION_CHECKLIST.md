// IMPLEMENTACIÓN DE 7 CARACTERÍSTICAS - CHECKLIST

✅ 1. ASSORTMENT PROMOTIONS (Mix & Match)
   - AssortmentSelectionModal.js: Ya soporta promociones surtidas
   - OrderManagementModal.js: Ya soporta selección de productos surtidos
   - VendedorDashboard.js: Soporta agregar promociones surtidas al carrito
   
✅ 2. FIXED PROMOTIONS CONSTRAINTS
   - PromotionFormModal.js: Sin validación que previene mainProduct === freeProduct
   - Se permite crear promociones con el mismo producto en ambos campos
   
✅ 3. FREIGHT OPTION (Flete)
   - VendedorDashboard.js: Agregado checkbox "Incluir Flete" (solo Admin/Owner)
   - NuevaVentaPanel: Campo visible solo si isAdminOrOwner = true
   - handleSubmitOrder: Incluye 'includeFreight' en payload
   - Endpoint: POST /admin/orders o /vendedor/orders con includeFreight flag
   
✅ 4. CLIENT VALIDATION (Relaxed)
   - AdminClientsPanel.js: Campos aceptan espacios (sin regex restrictivo)
   - Validación relajada en: nombre, administrador, representanteLegal, dirección
   
✅ 5. ORDER ANNULLING
   - src/utils/types.js: Agregado status 'ANULADA' a OrdenStatus
   - OrderAnnulationModal.js: Nuevo modal para motivo de anulación
   - OrderAnnulationModal.css: Estilos para modal
   - OrderManagementModal.js: Botón "Anular Venta" usa modal en lugar de prompt
   - orderService.js: Método annulOrder(id, reason) → POST /admin/orders/{id}/annul
   
✅ 6. ADMIN CREATING ORDERS AS SELLER
   - VendedorDashboard.js: Dropdown "Asignar Vendedor" (Admin/Owner)
   - NuevaVentaPanel: Agrupa vendedor asignado si isAdminOrOwner
   - handleSubmitOrder: Usa /admin/orders endpoint si es Admin/Owner
   - orderService.js: Métodos para createAdminOrder y getVendedores
   - Vendedor requerido en validación cuando es Admin/Owner
   
✅ 7. ADMIN CREATING CLIENTS FOR SELLERS
   - AdminClientsPanel.js: Ya tiene dropdown "Asignar a Vendedor"
   - FormModal: Ya incluye vendedorId en payload
   - clientService.js: Método createAdminClient(data) → POST /admin/clients
   - orderService.js: Método getVendedores() → GET /admin/clients/vendedores

========== NUEVOS ARCHIVOS CREADOS ==========
1. src/api/orderService.js - Servicios para órdenes (crear, anular, vendedores)
2. src/api/clientService.js - Servicios para clientes (crear admin, obtener vendedores)
3. src/components/modals/OrderAnnulationModal.js - Modal para anular órdenes
4. src/components/modals/OrderAnnulationModal.css - Estilos del modal
5. src/components/VendorSelectionDropdown.js - Dropdown reutilizable para vendedores

========== ARCHIVOS MODIFICADOS ==========
1. src/utils/types.js - Agregado status ANULADA
2. src/components/modals/OrderManagementModal.js - Integración de modal de anulación
3. src/pages/VendedorDashboard.js - Flete, vendedor asignado, endpoint Admin
4. AdminClientsPanel.js - Ya tiene estructura de vendedor asignado

========== API ENDPOINTS ESPERADOS ==========
- POST /admin/orders - Crear orden como Admin (incluye sellerId, includeFreight)
- POST /vendedor/orders - Crear orden como Vendedor (incluye includeFreight)
- POST /admin/orders/{id}/annul - Anular orden
- GET /admin/clients/vendedores - Obtener lista de vendedores
- GET /admin/promotions/{id} - Obtener detalles de promoción
- PATCH /admin/orders/{id}/status - Cambiar estado de orden
- GET /admin/orders/{id}/invoice/pdf - Descargar factura

========== VALIDACIONES EN FRONTEND ==========
- Admin/Owner debe asignar vendedor al crear orden
- Flete solo disponible para Admin/Owner
- Checkbox "Venta sin cliente" debe estar explícitamente marcado
- Modal de anulación requiere motivo no vacío
- Clientes aceptan espacios en todos los campos excepto NIT

