import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { CartDialog } from '@/components/CartDialog';
import { CartProvider } from '@/components/cart';
import { Header } from '@/components/Header';
import './globals.css';

export const metadata: Metadata = {
  title: 'Summer Sale · Linen & Salt',
  description: 'A deliberately inaccessible storefront used to test Ally.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <CartProvider>
          {/* Deliberate noise: content outside any landmark, low contrast. */}
          <div className="promo-bar">Free shipping on orders over $50</div>
          <Header />
          {children}
          <footer className="site-footer">
            <p>© 2026 Linen &amp; Salt</p>
            <a href="#">Shipping</a>
            <a href="#">Returns</a>
          </footer>
          <CartDialog />
        </CartProvider>
      </body>
    </html>
  );
}
