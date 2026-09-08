import type { Metadata } from "next";
import "./globals.css";
import "./super-mapper.css";
import { panelMode } from "./admin-auth";

export function generateMetadata(): Metadata {
  const superPanel = panelMode() === "super";
  return {
    title: superPanel ? "Rekixo Super Admin" : "AR 3D Vision Project",
    description: superPanel
      ? "Rekixo client and project management."
      : "Interactive project and plot visualization.",
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  };
}

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
