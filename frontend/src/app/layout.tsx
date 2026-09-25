import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "leaflet/dist/leaflet.css";
import "./globals.css";

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["300", "400", "500", "600", "700", "800"],
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Beyond Pixels — Sentinel-2 Super-Resolution Platform",
  description:
    "Beyond Pixels: Deep learning based 4×/8× super-resolution mapping for Sentinel-2 satellite imagery using Sen2SR-RRDB (Able) + SEN2SRLite spectral fusion",
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
    <html
      lang="en"
      suppressHydrationWarning
      className={`${sans.variable} ${mono.variable}`}
      style={{ background: "#000" }}
    >
      <body
        className={`${sans.className} font-sans`}
        suppressHydrationWarning
        style={{ background: "#000" }}
      >
        {children}
      </body>
    </html>
  );
}
