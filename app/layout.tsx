import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Casino — Card Game",
  description: "Play our custom Casino card game."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
