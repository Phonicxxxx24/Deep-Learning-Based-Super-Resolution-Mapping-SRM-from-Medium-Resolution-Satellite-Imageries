import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "leaflet/dist/leaflet.css";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Beyond Pixels — Sentinel-2 Super-Resolution Platform",
  description:
    "Beyond Pixels: Deep learning based 4×/8× super-resolution mapping for Sentinel-2 satellite imagery using LDSR-S2 diffusion + SEN2SRLite",
  icons: {
    icon: [
      { url: "/beyond-pixels-icon.png", type: "image/png" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    shortcut: "/beyond-pixels-icon.png",
    apple: "/beyond-pixels-icon.png",
  },
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
