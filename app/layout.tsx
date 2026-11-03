import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KULT Market District v7 — Run Your AI Agency",
  description: "Direct an agent team through market replay, daily decisions and a continuing agency career.",
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
