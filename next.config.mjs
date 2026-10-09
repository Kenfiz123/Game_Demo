/** @type {import('next').NextConfig} */
const nextConfig = {
  // Isolated production smoke tests can run alongside the development server.
  distDir: process.env.XPERIENCE_BUILD_DIR || ".next",
};
export default nextConfig;
