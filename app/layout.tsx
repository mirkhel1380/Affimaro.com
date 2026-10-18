import type { Metadata } from "next";
import {emailSignIn} from '../lib/auth-mode';
import "./account.css";
import "./start.css";

export const metadata: Metadata = {
  title: "Affimaro — Your partner workspace",
  description: "Your Affimaro account, business programs and affiliate partnerships. A product of Highlink.",
  icons: {
    icon: "/demo/favicon.svg",
    shortcut: "/demo/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>{emailSignIn&&<><link rel="manifest" href="/manifest.webmanifest"/><link rel="apple-touch-icon" href="/app-icons/apple-touch-icon.png"/><meta name="theme-color" content="#153b32"/><meta name="mobile-web-app-capable" content="yes"/><meta name="apple-mobile-web-app-capable" content="yes"/><meta name="apple-mobile-web-app-title" content="Affimaro"/></>}</head>
      <body className="antialiased">{children}{emailSignIn&&<script src="/install-app.js" defer/>}</body>
    </html>
  );
}
