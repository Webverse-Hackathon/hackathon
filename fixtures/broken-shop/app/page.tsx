import { Newsletter } from '@/components/Newsletter';
import { ProductCard } from '@/components/ProductCard';
import { products } from '@/lib/products';

export default function HomePage() {
  return (
    <main className="page">
      <h1>Summer Sale</h1>
      <p className="intro">Light layers for long days. Up to 40% off this week only.</p>
      {/* Deliberate noise: low contrast. */}
      <p className="price-note">Prices include VAT. Sale ends Sunday.</p>

      <ul className="grid">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </ul>

      <section className="lookbook">
        <h2>The lookbook</h2>
        {/* Deliberate noise: alt text that is a filename. MEANINGLESS_NAME. */}
        <div className="lookbook-row">
          <img src="/lookbook/look-1.svg" alt="image_04.png" />
          <img src="/lookbook/look-2.svg" alt="image_05.png" />
          <img src="/lookbook/look-3.svg" alt="IMG_2231.jpg" />
        </div>
      </section>

      <Newsletter />
    </main>
  );
}
