import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/shell/AppShell";
import { ChunkLoadRecovery } from "@/components/shell/ChunkLoadRecovery";

const fontSans = Inter({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
  // Avoid Chrome’s “preloaded but not used within a few seconds” noise: fonts
  // are applied via CSS variables and `font-family`; preload heuristics often
  // misfire. `display: "swap"` still keeps text visible while they load.
  preload: false,
});

const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "NeuroVis — EEG Dashboard",
  description:
    "Real-time neurofeedback & EEG analysis for Muse and OpenBCI devices.",
};

export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${fontSans.variable} ${fontMono.variable}`}
      suppressHydrationWarning
    >
      <body
        className="bg-app min-h-screen font-sans text-zinc-200 antialiased"
        suppressHydrationWarning
      >
        <ChunkLoadRecovery />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
