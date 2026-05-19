import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rekryteringsassistenten",
  description: "AI-driven kandidatanalys för Teamtailor",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="sv">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
