/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The dev-tools badge would sit in our own accessibility tree during a dogfood run.
  devIndicators: false,
  poweredByHeader: false,
};

export default nextConfig;
