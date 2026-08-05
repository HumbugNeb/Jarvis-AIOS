import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "JARVIS AIOS",
  description: "Voice-controlled AI operating system",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
