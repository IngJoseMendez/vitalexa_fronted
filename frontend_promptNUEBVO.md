# Frontend Implementation Master Guide

This document outlines **ALL** the required changes for the frontend to support the latest backend operational enhancements.

## 1. Assortment Promotions (Mix & Match)
**Goal:** Support promotions like "Buy any 40 items, get 15 free items".

### Changes Required:

1.  **Promotion Selection Modal:**
    *   When a user clicks on a generic promotion (Type: `BUY_GET_FREE`, `mainProduct: null` or `isAssortment: true`), open the **Assortment Modal**.
    *   Allow the user to select generic products from the catalog until they reach the `buyQuantity` (e.g., 40).
    *   **CRITICAL:** For EACH item selected in this modal, you must send the `relatedPromotionId` in the order payload.

    **Payload Example (OrderItemRequestDTO):**
    ```json
    {
      "productId": "UUID-DE-PAPA-LIMON",
      "cantidad": 10,
      "relatedPromotionId": "UUID-DE-LA-PROMOCION-40+15" // <--- NUEVO CAMPO OBLIGATORIO
    }
    ```

2.  **Order Display (Cart & Invoice):**
    *   The backend will now split the order correctly.
    *   **Product Display:** Show the normal products selected (e.g., "10 Papa Limón", "30 Papa Pollo").
    *   **Gift Display:** The backend will automatically add the free items (e.g., "15 x SURTIDO PROMOCIONAL") with **Price: $0**.
    *   **UI Task:** Ensure items with Price $0 are rendered clearly as "Bonificado" or "Regalo".

## 2. Fixed Promotions Constraints
**Goal:** Allow creating promotions where the Main Product is the same as the Gift Product (e.g., Buy 10 X, Get 1 X).

### Changes Required:
*   **Create Promotion Form:** Remove any frontend validation that prevents selecting the same product for "Buy" and "Get Free". The backend constraint has been removed.

## 3. Freight Option (Flete) -> Admin/Owner Only
**Goal:** Allow Admins to charge freight on specific orders.

### Changes Required:
*   **Order Creation Screen:**
    *   Add a Checkbox: **"Incluir Flete (+Coste)"** (Label generic or specific if you have logic).
    *   **Visibility:** ONLY show this checkbox if the logged-in user has role `ADMIN` or `OWNER`.
*   **Payload:**
    ```json
    {
       "clientId": "...",
       "items": [...],
       "includeFreight": true // <--- NUEVO CAMPO
    }
    ```

## 4. Client Validation (Relaxed)
**Goal:** Allow spaces in names and addresses.

### Changes Required:
*   **Create Client Form:** Remove regex validators that forbid spaces in `nombre`, `direccion`, `administrador`, etc. Only `nit` needs to be strict (unique).

## 5. Order Annulling (Anular Orden)
**Goal:** Allow Admins to soft-delete an order, restoring stock.

### Changes Required:
*   **Order Details View (Admin):**
    *   Add a Danger Button: **"Anular Orden"**.
    *   **Visibility:** ONLY for `ADMIN` or `OWNER`. Only for orders that are NOT already `ANULADA`.
*   **Action:**
    *   Clicking opens a modal asking for **"Motivo de Anulación"** (Textarea).
    *   Confirm -> Calls Endpoint.
*   **Endpoint:**
    *   `POST /api/admin/orders/{id}/annul?reason={motivo}`
*   **Badge:**
    *   Support new status `ANULADA` in the status badge component (Color: Gray or Red).

## 6. Admin Creating Orders as Seller
**Goal:** Admins can attribute a sale to a specific salesperson.

### Changes Required:
*   **Order Creation Screen (Admin View):**
    *   Add a Dropdown: **"Vendedor Asignado"**.
    *   **Data Source:** `GET /api/admin/clients/vendedores`.
    *   **Default:** Current User (Admin).
    *   **Visibility:** ONLY show for `ADMIN` or `OWNER`.
*   **Payload:**
    ```json
    {
       "clientId": "...",
       "items": [...],
       "sellerId": "UUID-DEL-VENDEDOR-SELECCIONADO" // <--- NUEVO CAMPO (Opcional)
    }
    ```

## 7. Admin Creating Clients for Sellers
**Goal:** Admins can create a client and instantly assign it to a seller.

### Changes Required:
*   **Create Client Form (Admin View):**
    *   Add a Dropdown: **"Asignar a Vendedor"**.
    *   **Data Source:** `GET /api/admin/clients/vendedores`.
    *   **Endpoint Switch:**
        *   If Admin is creating: Use `POST /api/admin/clients` with body:
            ```json
            {
               "vendedorId": "UUID-SELECCIONADO",
               "nit": "...",
               "nombre": "...",
               ...
            }
            ```
        *   If Vendedor is creating: Use existing logic (`POST /api/clients/me` or similar).

## Summary of New Endpoints

| Feature | Method | Endpoint | Body/Params | Role |
| :--- | :--- | :--- | :--- | :--- |
| **Listar Vendedores** | `GET` | `/api/admin/clients/vendedores` | - | Admin/Owner |
| **Anular Orden** | `POST` | `/api/admin/orders/{id}/annul` | `?reason=...` | Admin/Owner |
| **Crear Orden (Admin)**| `POST` | `/api/admin/orders` | JSON (incluye `sellerId`) | Admin/Owner |
| **Crear Cliente (Admin)**| `POST` | `/api/admin/clients` | JSON (incluye `vendedorId`) | Admin/Owner |
