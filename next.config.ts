import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "nodemailer", "pdf-parse", "xlsx"],
};

export default nextConfig;
