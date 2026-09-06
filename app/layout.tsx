import type { Metadata } from "next";
import "./globals.css";
import "./login.css";
import { panelMode } from "./admin-auth";

export function generateMetadata():Metadata{const superPanel=panelMode()==="super";return {title:superPanel?"Rekixo Super Admin":"Tiyansh — The Prime Square",description:superPanel?"Rekixo client and project management.":"Commercial plots in Raigarh, Chhattisgarh.",icons:{icon:"/favicon.svg",shortcut:"/favicon.svg"}}}

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
