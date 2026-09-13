'use client';

// PLANTED BLOCKER 2 — focus not trapped. No role="dialog", no aria-modal, no
// focus management: it appears visually and never enters a keyboard user's world.
import Link from 'next/link';
import { findProduct, formatPrice } from '@/lib/products';
import { useCart } from './cart';

export function CartDialog() {
  const { items, open, setOpen } = useCart();
  return (
    <div className="overlay" hidden={!open}>
      <div className="panel">
        <h2 id="cart-title">Your cart</h2>
        {items.length === 0 ? (
          <p>Your cart is empty.</p>
        ) : (
          <ul className="cart-items">
            {items.map((id, index) => {
              const product = findProduct(id);
              if (!product) return null;
              return (
                <li key={`${id}-${index}`}>
                  {product.name} <span>{formatPrice(product.price)}</span>
                </li>
              );
            })}
          </ul>
        )}
        <div className="panel-actions">
          <button type="button" className="secondary" onClick={() => setOpen(false)}>
            Keep shopping
          </button>
          <Link href="/checkout" className="primary" onClick={() => setOpen(false)}>
            Checkout
          </Link>
        </div>
      </div>
    </div>
  );
}
