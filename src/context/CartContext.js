import React, { createContext, useContext, useReducer, useEffect } from 'react';

const CartContext = createContext();

const CART_STORAGE_KEY = 'vitalexa_client_cart';

const initialState = {
    items: [],
    isOpen: false,
};

const cartReducer = (state, action) => {
    switch (action.type) {
        case 'ADD_ITEM': {
            const { product, quantity } = action.payload;
            const existingItemIndex = state.items.findIndex(item => item.product.id === product.id);

            let newItems;
            if (existingItemIndex >= 0) {
                newItems = [...state.items];
                newItems[existingItemIndex] = {
                    ...newItems[existingItemIndex],
                    quantity: newItems[existingItemIndex].quantity + quantity
                };
            } else {
                newItems = [...state.items, { product, quantity }];
            }
            return { ...state, items: newItems, isOpen: true };
        }

        case 'UPDATE_QUANTITY': {
            const { productId, quantity } = action.payload;
            if (quantity <= 0) {
                return {
                    ...state,
                    items: state.items.filter(item => item.product.id !== productId)
                };
            }
            return {
                ...state,
                items: state.items.map(item =>
                    item.product.id === productId ? { ...item, quantity } : item
                )
            };
        }

        case 'REMOVE_ITEM': {
            return {
                ...state,
                items: state.items.filter(item => item.product.id !== action.payload)
            };
        }

        case 'CLEAR_CART':
            return { ...state, items: [] };

        case 'TOGGLE_CART':
            return { ...state, isOpen: !state.isOpen };

        case 'SET_CART_OPEN':
            return { ...state, isOpen: action.payload };

        case 'LOAD_CART':
            return { ...state, items: action.payload };

        default:
            return state;
    }
};

export const CartProvider = ({ children }) => {
    const [state, dispatch] = useReducer(cartReducer, initialState);

    // Load cart from local storage on mount
    useEffect(() => {
        const savedCart = localStorage.getItem(CART_STORAGE_KEY);
        if (savedCart) {
            try {
                const parsedCart = JSON.parse(savedCart);
                dispatch({ type: 'LOAD_CART', payload: parsedCart });
            } catch (e) {
                console.error('Error loading cart from storage', e);
            }
        }
    }, []);

    // Save cart to local storage on change
    useEffect(() => {
        localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(state.items));
    }, [state.items]);

    const addToCart = (product, quantity = 1) => {
        dispatch({ type: 'ADD_ITEM', payload: { product, quantity } });
    };

    const updateQuantity = (productId, quantity) => {
        dispatch({ type: 'UPDATE_QUANTITY', payload: { productId, quantity } });
    };

    const removeFromCart = (productId) => {
        dispatch({ type: 'REMOVE_ITEM', payload: productId });
    };

    const clearCart = () => {
        dispatch({ type: 'CLEAR_CART' });
    };

    const toggleCart = () => {
        dispatch({ type: 'TOGGLE_CART' });
    };

    const cartTotal = state.items.reduce((total, item) => {
        return total + (item.product.precio * item.quantity);
    }, 0);

    const cartCount = state.items.reduce((count, item) => count + item.quantity, 0);

    return (
        <CartContext.Provider value={{
            cart: state.items,
            isCartOpen: state.isOpen,
            addToCart,
            updateQuantity,
            removeFromCart,
            clearCart,
            toggleCart,
            cartTotal,
            cartCount
        }}>
            {children}
        </CartContext.Provider>
    );
};

export const useCart = () => {
    const context = useContext(CartContext);
    if (!context) {
        throw new Error('useCart must be used within a CartProvider');
    }
    return context;
};
