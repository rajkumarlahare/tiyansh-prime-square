import type { Metadata } from "next";
import "./globals.css";
import "./login.css";

export const metadata: Metadata = {
  title: "Tiyansh — The Prime Square",
  description: "Commercial plots in Raigarh, Chhattisgarh.",
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
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
