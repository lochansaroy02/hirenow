import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HireNow",
  description: "Local bulk hiring outreach sender with saved contacts, resume attachments, and Gmail SMTP.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
