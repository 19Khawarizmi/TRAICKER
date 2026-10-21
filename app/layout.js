import { Figtree } from "next/font/google";
import { themeInitScript } from "@/components/themeScript";
import "./globals.css";

// Satu font untuk semua teks (judul, isi, angka). Angka memakai tabular-nums supaya tetap rata.
const sans = Figtree({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata = {
  title: "Traicker",
  description: "Tracker tugas internal untuk klien dan proyek berjalan.",
};

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F6F5F1" },
    { media: "(prefers-color-scheme: dark)", color: "#171717" },
  ],
};

export default function RootLayout({ children }) {
  return (
    // data-theme dipasang oleh script sebelum hydration, jadi atributnya memang bisa berbeda dari HTML server.
    <html lang="id" className={sans.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
