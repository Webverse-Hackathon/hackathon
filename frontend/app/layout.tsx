import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ally · Can a blind person actually finish the task?',
  description: 'Ally drives a website with nothing but the accessibility tree and a keyboard, and reports the exact step where it gave up.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <header className="site-header">
          <Link href="/" className="brand">
            <span className="brand-mark" aria-hidden="true">
              A
            </span>
            Ally
          </Link>
          <nav aria-label="Primary">
            <ul className="nav">
              <li>
                <Link href="/">New run</Link>
              </li>
              <li>
                <Link href="/#how">How it works</Link>
              </li>
            </ul>
          </nav>
        </header>
        <main id="main" tabIndex={-1}>
          {children}
        </main>
        <footer className="site-footer">
          <p>Ally tests with the accessibility tree and the keyboard only. It never sees the page.</p>
        </footer>
      </body>
    </html>
  );
}
