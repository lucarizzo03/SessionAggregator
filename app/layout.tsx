import type { Metadata } from "next";
import { Sidebar } from "@/components/Sidebar";
import styles from "./layout.module.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Session Aggregator",
  description: "Conversation transcripts and session analysis, in one place.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Bunny Fonts mirrors the Google Fonts catalog and serves
            Instrument Sans, Fraunces, and JetBrains Mono — confirmed by
            curling the endpoint, see DESIGN.md. Cabinet Grotesk is not a
            Google Fonts family, so it loads from Fontshare instead, its
            actual foundry source. */}
        <link rel="preconnect" href="https://fonts.bunny.net" />
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link
          rel="stylesheet"
          href="https://fonts.bunny.net/css?family=instrument-sans:400,500,600|fraunces:400,500|jetbrains-mono:400,500"
        />
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@500,600,700&display=swap"
        />
      </head>
      <body>
        <div className={styles.shell}>
          <Sidebar />
          <main className={styles.main}>{children}</main>
        </div>
      </body>
    </html>
  );
}
