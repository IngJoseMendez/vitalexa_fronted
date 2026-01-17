# 🎨 Guía Visual - Nueva Venta Premium Design 2026

## Flujo Visual Completo

### 📱 Mobile (480px - 640px)

```
┌─────────────────────────────┐
│ 🛒 Nueva Venta              │
├─────────────────────────────┤
│                             │
│  [🔍 Buscar productos...]   │
│                             │
│  ┌─────────────────────────┐│
│  │ [Filtrar por etiqueta]  ││
│  └─────────────────────────┘│
│                             │
│  Productos Grid (2 columns):│
│  ┌──────┐  ┌──────┐        │
│  │ IMG  │  │ IMG  │        │
│  │[🛒2]│  │ [+]  │        │
│  │Prod1 │  │Prod2 │        │
│  │$15   │  │$20   │        │
│  │█████▌│  │███▌  │        │
│  │ Stock │  │ Stock │        │
│  │[+Add] │  │[+Add] │        │
│  └──────┘  └──────┘        │
│                             │
│  ┌─────────────────────────┐│
│  │  🛒 Carrito             ││
│  ├─────────────────────────┤│
│  │ [👤 Selecciona Cliente]││
│  │ [✓] Venta sin cliente  ││
│  │ [📝 Notas...]          ││
│  ├─────────────────────────┤│
│  │ [Prod1] $15   - 1 +  ✕ ││
│  │ [Prod2] $20   - 2 +  ✕ ││
│  │ [Prod3] $30   - 1 +  ✕ ││
│  ├─────────────────────────┤│
│  │ Total: $85             ││
│  │ [✓ Finalizar Venta]    ││
│  └─────────────────────────┘│
└─────────────────────────────┘
```

---

### 💻 Desktop (1200px+)

```
┌────────────────────────────────────────────────────────────────┐
│ 🛒 Nueva Venta                                                  │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌─────────────────────────────────────┐  ┌──────────────────┐│
│  │ Productos Disponibles               │  │ 🛒 Carrito      ││
│  ├─────────────────────────────────────┤  ├──────────────────┤│
│  │ [🔍 Buscar...]  [Filtrar etiquetas] │  │ [👤 Cliente    ]││
│  ├─────────────────────────────────────┤  │ [✓] Sin cliente││
│  │                                     │  │ [📝 Notas...]  ││
│  │ Grid 4 columnas:                    │  ├──────────────────┤│
│  │ ┌────────┐ ┌────────┐              │  │ Items (scroll)  ││
│  │ │  IMG   │ │  IMG   │              │  │ ┌──────────────┐││
│  │ │ [🛒2]  │ │ [+]    │              │  │ │Prod1   $15 │││
│  │ │ Prod1  │ │ Prod2  │              │  │ │[−][1][+][✕]│││
│  │ │ $15.00 │ │ $20.00 │              │  │ │Subtotal $15│││
│  │ │█████▌  │ │ ███▌   │              │  │ ├──────────────┤││
│  │ │ 5/10   │ │  8/10  │              │  │ │Prod2   $20 │││
│  │ │ Stock  │ │ Stock  │              │  │ │[−][2][+][✕]│││
│  │ │[+Add]  │ │[+Add]  │              │  │ │Subtotal $40│││
│  │ └────────┘ └────────┘              │  │ ├──────────────┤││
│  │ ┌────────┐ ┌────────┐              │  │ │Prod3   $30 │││
│  │ │  IMG   │ │  IMG   │              │  │ │[−][1][+][✕]│││
│  │ │ [+]    │ │ [+]    │              │  │ │Subtotal $30│││
│  │ │ Prod3  │ │ Prod4  │              │  │ └──────────────┘││
│  │ │ $30.00 │ │ $25.00 │              │  ├──────────────────┤│
│  │ │███▌    │ │████▌   │              │  │ Total:   $85.00 ││
│  │ │ 2/10   │ │  6/10  │              │  │ [✓ Finalizar V] ││
│  │ │ Stock  │ │ Stock  │              │  └──────────────────┘│
│  │ │[+Add]  │ │[+Add]  │              │                      │
│  │ └────────┘ └────────┘              │                      │
│  │                                    │                      │
│  └────────────────────────────────────┘                      │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## 🎨 Componentes Visuales Detallados

### 1. Tarjeta de Producto - Estados

```
ESTADO NORMAL:
┌─────────────────┐
│  [IMAGEN 200px] │  ← Padding: 1.5rem
│                 │     Background: #f8fafc
│ ┌─────────────┐ │
│ │ Producto    │ │
│ │ $15.00      │ │
│ │ █████▌      │ │  ← Stock bar
│ │ 8/10 stock  │ │
│ │ [+ Agregar] │ │
│ └─────────────┘ │
└─────────────────┘
Shadow: 0 4px 12px rgba(0,0,0,0.06)


ESTADO HOVER:
┌─────────────────┐  ↑ translateY(-12px)
│  [IMAGEN 200px] │  × scale(1.02)
│   ↑ Scale(1.12) │  Shadow: 0 24px 48px rgba(0,0,0,0.12)
│ ┌─────────────┐ │
│ │ Producto    │ │
│ │ $15.00      │ │
│ │ █████▌      │ │
│ │ 8/10 stock  │ │
│ │ [+ Agregar] │ │
│ └─────────────┘ │
└─────────────────┘
Border: 1px solid rgba(99, 102, 241, 0.3)
Top line: Gradient animation


EN CARRITO:
┌─────────────────┐
│  [IMAGEN 200px] │
│  ┌───────────┐  │
│  │ 🛒  │  2   │  │ ← Badge con cantidad
│  │ (Gradient)  │  │    Pulsa cada 2s
│  └───────────┘  │
│ ┌─────────────┐ │
│ │ Producto    │ │
│ │ $15.00      │ │
│ │ ██████████  │ │  ← Stock = 8, Cart = 2
│ │ 8/10 stock  │ │     Disponible = 6
│ │ [+ Agregar] │ │
│ └─────────────┘ │
└─────────────────┘
```

---

### 2. Stock Indicator - Animación

```
NORMAL STATE:
└───────────────────────────────┘
│ ████████████░░░░░░░░░░░░░░░░ │
└───────────────────────────────┘
  ▲ Shimmer effect animando
  Width: (8/10) * 100 = 80%
  Color: #10b981 (Green)

ÁMBAR STATE (10-30%):
└───────────────────────────────┘
│ ███░░░░░░░░░░░░░░░░░░░░░░░░ │
└───────────────────────────────┘
  Width: (3/10) * 100 = 30%
  Color: Transition to #f59e0b

ROJO STATE (<10%):
└───────────────────────────────┘
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
└───────────────────────────────┘
  Width: (1/10) * 100 = 10%
  Color: #ef4444 (Red)
```

---

### 3. Badge de Cantidad - Animación

```
ESTADO BASE:
    ┌─────┐
    │ 🛒 2 │  ← Circular badge
    │(44px)│   Gradient indigo→purple
    └─────┘   White border 3px
    Scale: 1

ANIMACIÓN (50% = 2s):
    ┌─────┐
    │ 🛒 2 │  ← Levemente agrandado
    │(44px)│   
    └─────┘   
    Scale: 1.05
    
Shadow: 0 6px 20px rgba(99, 102, 241, 0.5)
```

---

### 4. Botón Agregar - Efecto Ripple

```
ESTADO INICIAL:
┌─────────────────────────┐
│  [+ Agregar]            │
│  Gradient: Indigo→Purple│
│  Shadow: 0 6px 20px     │
└─────────────────────────┘

HOVER - INICIO RIPPLE:
┌─────────────────────────┐
│  [+ Agregar]            │
│  ○ (punto center)       │
│  Expanding circle       │
│  Opacity: 0.2           │
└─────────────────────────┘
Transform: translateY(-3px)
Shadow: 0 12px 30px

HOVER - RIPPLE COMPLETADO:
┌─────────────────────────┐
│  [+ Agregar]            │ ← Ripple
│   ◯◯◯◯◯◯◯◯◯◯◯          │    cubrió
│  ◯[+ Agregar]◯          │    todo
│   ◯◯◯◯◯◯◯◯◯◯◯          │
└─────────────────────────┘
Animation: 0.6s ease-out
```

---

### 5. Search Input - Focus State

```
REPOSO:
┌──────────────────────────────┐
│ 🔍 [Buscar productos...]    │
│ 1px solid rgba(226,232,240)  │
│ Shadow: 0 2px 8px subtle    │
└──────────────────────────────┘

FOCUS:
┌──────────────────────────────┐
│ 🔍 [|Escribiendo...]         │
│ 1px solid #6366f1 (indigo)   │
│ Anillo: 0 0 0 3px rgba(...)  │
│ Transform: translateY(-1px)  │
│ Shadow: 0 2px 8px + anillo   │
└──────────────────────────────┘
Background: white (contraste)
```

---

### 6. Carrito - Layout y Animaciones

```
┌──────────────────────────┐
│ 🛒 Carrito               │ ← Título con
│ ▌ (Accent line izq)      │    línea gradient
├──────────────────────────┤
│                          │
│ [👤 Cliente]             │ ← Selects con
│ [✓] Sin cliente          │   labels en caps
│ [📝 Notas...]            │
│                          │
│ ┌────────────────────┐   │ ← Scrollable
│ │ Item 1     $15  -1+✕│   │   con scroll
│ │ Item 2     $20  -2+✕│   │   personalizado
│ │ Item 3     $30  -1+✕│   │
│ └────────────────────┘   │
│                          │
│ ┌────────────────────┐   │ ← Total card
│ │ Total:    $85.00   │   │   con gradient
│ └────────────────────┘   │
│                          │
│ [✓ Finalizar Venta]      │ ← CTA principal
│ (Gradient + shine effect)│
│                          │
└──────────────────────────┘
```

---

### 7. Cart Item - Micro-interaction

```
ESTADO NORMAL:
┌──────────────────────────┐
│ Producto          $15.00 │
│ [−][1][+][✕]             │
│ Subtotal: $15.00         │
└──────────────────────────┘
Shadow: 0 2px 8px
Border: 1px rgba(226,232,240,0.6)

HOVER:
┌──────────────────────────┐  ↑ Levanta
│ Producto          $15.00 │  Shadow aumenta
│ [−][1][+][✕]             │  Border color
│ Subtotal: $15.00         │  cambió a indigo
└──────────────────────────┘
Shadow: 0 4px 12px rgba(99,102,241,0.1)
Border: rgba(99,102,241,0.2)
Transform: none (solo shadow)

CONTROLES AL HACER HOVER:
┌─────────┐
│ [−] [+] │  ← Con hover
│  ▐ 1 ▌  │    Fondo #f1f5f9
│         │    Buttons:
└─────────┘    - White bg
               - Hover: indigo
               - Transform: scale(1.1)
```

---

## 📊 Transiciones y Timing

### Valores Principales:

```css
/* Cubic Bezier para suavidad 2026 */
cubic-bezier(0.175, 0.885, 0.32, 1.275)
   ↑          ↑
   Bounce     Smooth
   deceleration

/* Duraciones */
0.2s - Hover rápido (button)
0.3s - Input focus
0.4s - Stock bar fill
0.5s - Shine effect
0.6s - Ripple button
1s   - Progress animation
2s   - Pulse/shimmer infinito

/* Delays */
0ms  - Inmediato (buttons)
100ms - Cascada suave (items)
200ms - Focus visible
```

---

## 🎯 Color Guide

```
Primary Brand:
  Indigo: #6366f1
  Purple: #7c3aed

Status Colors:
  Success:  #10b981 (Green)
  Warning:  #f59e0b (Amber)
  Danger:   #ef4444 (Red)

Neutral:
  White:    #ffffff
  Text:     #1f2937 (Dark gray)
  Muted:    #9ca3af (Light gray)
  Border:   #e5e7eb
  
Backgrounds:
  Primary:  #ffffff
  Secondary: #f8fafc (Very light blue)
  Hover:    #f1f5f9 (Light blue)

Shadows:
  Subtle:   0 2px 8px rgba(0,0,0,0.04)
  Soft:     0 4px 12px rgba(0,0,0,0.06)
  Medium:   0 8px 24px rgba(0,0,0,0.08)
  Prominent: 0 24px 48px rgba(0,0,0,0.12)
```

---

## 📐 Spacing System (Base 8px)

```
xs:  0.5rem  = 4px   (buttons padding min)
sm:  0.75rem = 6px   (form gaps)
md:  1rem    = 8px   (standard)
lg:  1.5rem  = 12px  (section padding)
xl:  2rem    = 16px  (major spacing)
xxl: 2.5rem  = 20px  (large gaps)

Product Card Padding: 1.25rem (10px) - cómodo
Button Padding: 0.95rem - no cramped
Modal Padding: 1.75rem - spacious
```

---

## ✨ Animación Completa - Timeline

```
User Action: Agregar al carrito

0ms    │ Click button
       │ ::before pseudo circles start expanding (0px → 300px)
       │ Button background brightens slightly
       │
100ms  │ Ripple effect completo
       │ Product card indica adición (flash subtle)
       │
150ms  │ Cart badge aparece (scale: 0.8 → 1)
       │ Pulse animation comienza
       │
200ms  │ Stock bar actualiza width (animación 0.5s)
       │ Badge pulsa suavemente
       │
300ms  │ Todo estabilizado
       │ Badge pulsando 2s loop
       │ Stock bar shimmer continuando
```

---

## 📱 Touch Targets Spec

```
Desktop (min 32px):
- Botones: 44px × 44px
- Links: 32px × 32px
- Icons: 24px × 24px

Mobile (min 44px):
- Botones: 48px × 48px
- Input altura: 44px
- List items: 48px altura mín
- Controls: 36px × 36px

Spacing between touch targets: 8px mín
```

---

## 🚀 Performance Metrics

```
Animaciones (GPU):
- transform (translateY, scale) ✅ Fast
- opacity ✅ Fast
- box-shadow ⚠️ Expensive (avoid large)
- width (stock bar) ⚠️ Reflow

Recomendación:
- Animar transform/opacity
- Evitar animaciones de tamaño grandes
- Usar will-change para GPU aceleración
```

---

Resultado: **Un diseño moderno, interactivo y completamente responsivo que proporciona excelente UX en todos los dispositivos.**
