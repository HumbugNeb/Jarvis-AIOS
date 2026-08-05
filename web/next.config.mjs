/** @type {import('next').NextConfig} */
const nextConfig = {
  // The camera effect acquires/plays a media stream; React's dev double-invoke
  // interrupts play() and races getUserMedia. Single-invoke keeps the camera clean.
  reactStrictMode: false,
};

export default nextConfig;
