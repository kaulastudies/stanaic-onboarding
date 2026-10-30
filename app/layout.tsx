import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "STANAIC · Member onboarding",
  description: "An onboarding module contributed to STANAIC by Rama Chandra.",
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
