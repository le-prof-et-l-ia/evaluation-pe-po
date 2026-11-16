import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Le Prof et l'IA",
  description: "Aide à l'évaluation des productions écrites et orales (DELF B1, B2) avec l'IA",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased min-h-screen bg-slate-50 text-slate-900`}>
        {children}
      </body>
    </html>
  );
}
