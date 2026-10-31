import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "STANAIC · Institutional platform",
  description: "Research, membership, professional learning and institutional operations.",
  robots: { index: false, follow: false },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
