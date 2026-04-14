import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PyPoker — No Limit Hold'em vs Bots",
  description:
    "Play Texas Hold'em against configurable AI bots. Powered by PyPokerEngine.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans antialiased min-h-dvh">{children}</body>
    </html>
  );
}
