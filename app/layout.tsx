import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FactChecker — Fact-check with context",
  description: "Review the claims in text, audio, video, and URLs.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
