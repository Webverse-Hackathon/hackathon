export interface Product {
  id: string;
  name: string;
  price: number;
  image: string;
}

export const products: Product[] = [
  { id: 'linen-shirt', name: 'Blue linen shirt', price: 48, image: '/products/linen-shirt.svg' },
  { id: 'canvas-tote', name: 'Canvas tote bag', price: 24, image: '/products/canvas-tote.svg' },
  { id: 'sandals', name: 'Leather sandals', price: 65, image: '/products/sandals.svg' },
  { id: 'straw-hat', name: 'Straw sun hat', price: 32, image: '/products/straw-hat.svg' },
  { id: 'striped-tee', name: 'Striped cotton tee', price: 22, image: '/products/striped-tee.svg' },
  { id: 'sunglasses', name: 'Round sunglasses', price: 40, image: '/products/sunglasses.svg' },
];

export function findProduct(id: string): Product | undefined {
  return products.find((product) => product.id === id);
}

export function formatPrice(amount: number): string {
  return `$${amount.toFixed(2)}`;
}
