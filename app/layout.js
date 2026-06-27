import { Geist, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
});

export const metadata = {
  title: "LedgerLock — Audit Ledger Console",
  description:
    "Tamper-evident audit ledger console for compliance officers. Hash-chained events verified against WORM checkpoints.",
};

export const viewport = {
  themeColor: "#0B0C0E",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${plexMono.variable} h-full bg-canvas antialiased`}
    >
      <body className="h-full bg-canvas font-sans text-primary">{children}</body>
    </html>
  );
}
