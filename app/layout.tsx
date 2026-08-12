import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tavus Session Aggregator",
  description: "Utterance events and conversation transcripts from Tavus, in one place.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
