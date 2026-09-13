'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCart } from '@/components/cart';
import { findProduct, formatPrice } from '@/lib/products';

// The checkout itself is accessible. The planted blockers are all upstream of
// it, so a run that reaches this page has already got past them.
export default function CheckoutPage() {
  const { items, clearCart } = useCart();
  const router = useRouter();

  if (items.length === 0) {
    return (
      <main className="page narrow">
        <h1>Checkout</h1>
        <p>Your cart is empty. Add something before checking out.</p>
        <Link href="/">Continue shopping</Link>
      </main>
    );
  }

  const total = items.reduce((sum, id) => sum + (findProduct(id)?.price ?? 0), 0);

  return (
    <main className="page narrow">
      <h1>Checkout</h1>
      <p>
        {items.length} {items.length === 1 ? 'item' : 'items'}, total {formatPrice(total)}
      </p>
      <form
        className="checkout-form"
        onSubmit={(event) => {
          event.preventDefault();
          clearCart();
          router.push('/checkout/confirmation');
        }}
      >
        <label htmlFor="full-name">Full name</label>
        <input id="full-name" name="fullName" autoComplete="name" defaultValue="Sam Rivera" required />
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" defaultValue="sam@example.com" required />
        <label htmlFor="address">Delivery address</label>
        <input id="address" name="address" autoComplete="street-address" defaultValue="12 Harbour Road" required />
        <button type="submit" className="primary">
          Place order
        </button>
      </form>
    </main>
  );
}
