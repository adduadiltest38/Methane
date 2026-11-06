import type { Metadata, Viewport } from "next";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import Footer from "@/components/Footer";
import Header from "@/components/Header";

export const metadata: Metadata = {
  title: "FlareWatch — satellite-detected gas flares & thermal anomalies",
  description:
    "Educational map of satellite-detected gas flares and persistent industrial heat sources in the Middle East, from NASA FIRMS VIIRS data.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0b0d12" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex h-dvh flex-col antialiased">
        <Header />
        <main className="relative min-h-0 flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
