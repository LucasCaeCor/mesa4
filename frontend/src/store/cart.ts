import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartItem } from "../types";

type CartState = {
  items: CartItem[];
  open: boolean;
  addItem: (item: Omit<CartItem, "key">) => void;
  removeItem: (key: string) => void;
  changeQuantity: (key: string, quantity: number) => void;
  clear: () => void;
  setOpen: (open: boolean) => void;
};

export const useCart = create<CartState>()(persist((set) => ({
  items: [],
  open: false,
  addItem: (item) => set((state) => ({ items: [...state.items, { ...item, key: crypto.randomUUID() }], open: true })),
  removeItem: (key) => set((state) => ({ items: state.items.filter((item) => item.key !== key) })),
  changeQuantity: (key, quantity) => set((state) => ({ items: state.items.map((item) => item.key === key ? { ...item, quantity: Math.max(1, quantity) } : item) })),
  clear: () => set({ items: [] }),
  setOpen: (open) => set({ open }),
}), { name: "mesa4.cart", partialize: (state) => ({ items: state.items }) }));
