/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingIncludes: {
    "/api/telegram": ["./skills/**/*"],
  },
};

export default nextConfig;
