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
  title: {
    default: "LedgerLock - Tamper-evident audit trail",
    template: "%s · LedgerLock",
  },
  description:
    "Append-only audit logs with SHA-256 hash chains and WORM checkpoints on Amazon DynamoDB. Built for HIPAA, SOC2, and SEC-regulated SaaS.",
  icons: {
    icon: [{ url: "/logo-icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/logo-icon.svg", type: "image/svg+xml" }],
  },
};

export const viewport = {
  themeColor: "#f4f6f8",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${plexMono.variable} h-full bg-canvas antialiased`}
    >
      <body className="h-full bg-canvas font-sans text-primary">
        {children}
      </body>
    </html>
  );
}
