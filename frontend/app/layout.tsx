import type { Metadata } from 'next';
import { Space_Grotesk } from 'next/font/google';
import Link from 'next/link';
import type { ReactNode } from 'react';
import './globals.css';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Ally · Can a blind person actually finish the task?',
  description: 'Ally drives a website with nothing but the accessibility tree and a keyboard, and reports the exact step where it gave up.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={spaceGrotesk.variable}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>

        {/* Top Neo-brutalist Marquee Ticker Banner */}
        <div className="ticker-banner" role="region" aria-label="Announcement">
          <div className="ticker-track">
            <div className="ticker-content">
              <span>★ CAN A BLIND PERSON BUY THE TICKET?</span>
              <span>★ ZERO SCREENSHOTS · KEYBOARD ONLY</span>
              <span>★ 95.9% OF SITES FAIL WCAG</span>
              <span>★ AUDIT TASK OUTCOMES, NOT JUST LINT RULES</span>
              <span>★ MAPPING THE WALL DIRECT TO JSX SOURCE</span>
              <span>★ CAN A BLIND PERSON BUY THE TICKET?</span>
              <span>★ ZERO SCREENSHOTS · KEYBOARD ONLY</span>
              <span>★ 95.9% OF SITES FAIL WCAG</span>
              <span>★ AUDIT TASK OUTCOMES, NOT JUST LINT RULES</span>
              <span>★ MAPPING THE WALL DIRECT TO JSX SOURCE</span>
            </div>
            <div className="ticker-content" aria-hidden="true">
              <span>★ CAN A BLIND PERSON BUY THE TICKET?</span>
              <span>★ ZERO SCREENSHOTS · KEYBOARD ONLY</span>
              <span>★ 95.9% OF SITES FAIL WCAG</span>
              <span>★ AUDIT TASK OUTCOMES, NOT JUST LINT RULES</span>
              <span>★ MAPPING THE WALL DIRECT TO JSX SOURCE</span>
              <span>★ CAN A BLIND PERSON BUY THE TICKET?</span>
              <span>★ ZERO SCREENSHOTS · KEYBOARD ONLY</span>
              <span>★ 95.9% OF SITES FAIL WCAG</span>
              <span>★ AUDIT TASK OUTCOMES, NOT JUST LINT RULES</span>
              <span>★ MAPPING THE WALL DIRECT TO JSX SOURCE</span>
            </div>
          </div>
        </div>

        {/* Neo-brutalist Header */}
        <header className="site-header">
          <Link href="/" className="brand">
            <span className="brand-mark" aria-hidden="true">
              A
            </span>
            <span className="brand-name">ALLY</span>
          </Link>

          <nav aria-label="Primary">
            <ul className="nav">
              <li>
                <Link href="/">NEW RUN</Link>
              </li>
              <li>
                <Link href="/#how">HOW IT WORKS</Link>
              </li>
              <li>
                <Link href="/#gap">THE GAP</Link>
              </li>
              <li>
                <Link href="/#recent">RECENT RUNS</Link>
              </li>
            </ul>
          </nav>

          <div className="header-actions">
            <Link href="/#test" className="button button-header">
              TEST A SITE
            </Link>
          </div>
        </header>

        <main id="main" tabIndex={-1}>
          {children}
        </main>

        <footer className="site-footer">
          <div className="footer-inner">
            <div className="footer-brand">
              <span className="brand-mark brand-mark-sm" aria-hidden="true">
                A
              </span>
              <strong>ALLY PLATFORM</strong>
            </div>
            <p>Ally tests with the accessibility tree and the keyboard only. It never sees the page.</p>
            <div className="footer-badge">100% KEYBOARD SIMULATION · ZERO SCREENSHOTS</div>
          </div>
        </footer>
      </body>
    </html>
  );
}
