import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "leaflet/dist/leaflet.css";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Avlok — Sentinel-2 Super-Resolution Platform",
  description:
    "Avlok: Deep learning based 4×/8× super-resolution mapping for Sentinel-2 satellite imagery using LDSR-S2 diffusion + SEN2SRLite",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
