import Link from 'next/link';

export default function ConfirmationPage() {
  return (
    <main className="page narrow">
      <h1>Order confirmed</h1>
      <p role="status">Thank you. Your order has been placed and a receipt is on its way.</p>
      <Link href="/">Back to the shop</Link>
    </main>
  );
}
