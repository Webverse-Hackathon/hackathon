'use client';

/**
 * PLANTED BLOCKER 1 — unlabelled control. Do not fix it here.
 *
 * The add-to-cart control is a <div onClick> holding only an icon: no
 * accessible name, no role, and no way to reach it with the keyboard. The
 * product image has no alt text either.
 *
 * What a sighted user sees: a product photo with a round "+" button.
 * What a screen-reader user gets: nothing that adds an item to the cart.
 * What axe reports: image-alt on the image, and nothing about the div.
 *
 * The card element deliberately starts at line 41, column 7. The source
 * mapper tests and docs/07-SOURCE-MAPPING-AND-PATCH.md refer to
 * components/ProductCard.tsx:41:7. Keep it there if you edit this file.
 *
 * The fixed version lives in fixtures/fixed-shop.
 * See fixtures/broken-shop/README.md.
 */

import { formatPrice, type Product } from '@/lib/products';
import { useCart } from './cart';
import { PlusIcon } from './PlusIcon';

interface ProductCardProps {
  product: Product;
}

// Deliberately broken: see the header comment.
// Keep the card element at line 41.
//
//
//
//
export function ProductCard({ product }: ProductCardProps) {
  const { addToCart } = useCart();

  return (
    <li>
      <div className="card">
        <img src={product.image} />
         <button className="add" onClick={() => addToCart(product.id)} aria-label={`Add ${product.name} to cart`}>
           <PlusIcon />
         </button>
        <p className="product-name">{product.name}</p>
        <p className="product-price">{formatPrice(product.price)}</p>
      </div>
    </li>
  );
}
