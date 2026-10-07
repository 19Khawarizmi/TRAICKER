import "./globals.css";

export const metadata = {
  title: "Task Tracker — Up+Above",
  description: "Tracker tugas internal Up+Above untuk klien dan proyek berjalan.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
