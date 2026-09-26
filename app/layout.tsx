import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DriveData Assist | Seu workspace de análises",
  description:
    "Explore seus dados e transforme perguntas em dashboards no seu workspace DriveData.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
