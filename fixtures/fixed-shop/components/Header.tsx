'use client';

import Link from 'next/link';
import { useCart } from './cart';

export function Header() {
  const { items, setOpen } = useCart();

  return (
    <header className="site-header">
      <Link href="/" className="logo">
        Linen &amp; Salt
      </Link>
      <nav>
        <ul className="nav-links">
          <li>
            <Link href="/">New in</Link>
          </li>
          <li>
            <Link href="/">Summer sale</Link>
          </li>
          <li>
            <Link href="/">Journal</Link>
          </li>
        </ul>
      </nav>
      <button type="button" className="cart-button" onClick={() => setOpen(true)}>
        Cart ({items.length})
      </button>
    </header>
  );
}
