'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

interface CartState {
  items: string[];
  open: boolean;
  addToCart: (productId: string) => void;
  clearCart: () => void;
  setOpen: (open: boolean) => void;
}

const CartContext = createContext<CartState | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  const addToCart = useCallback((productId: string) => {
    setItems((current) => [...current, productId]);
    setOpen(true);
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const value = useMemo(
    () => ({ items, open, addToCart, clearCart, setOpen }),
    [items, open, addToCart, clearCart],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartState {
  const cart = useContext(CartContext);
  if (!cart) throw new Error('useCart must be used inside CartProvider');
  return cart;
}
