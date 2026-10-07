import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { themeInitScript } from "@/components/themeScript";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-serif", display: "swap" });

export const metadata = {
  title: "Task Tracker",
  description: "Tracker tugas internal untuk klien dan proyek berjalan.",
};

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F6F5F1" },
    { media: "(prefers-color-scheme: dark)", color: "#141413" },
  ],
};

export default function RootLayout({ children }) {
  return (
    // data-theme dipasang oleh script sebelum hydration, jadi atributnya memang bisa berbeda dari HTML server.
    <html lang="id" className={`${sans.variable} ${mono.variable} ${serif.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
