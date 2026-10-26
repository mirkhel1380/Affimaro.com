import './identity.css';
import './updates.css';
import './security.css';
import type { Metadata } from "next";
import {emailSignIn} from '../lib/auth-mode';
import "./account.css";
import "./store-platform.css";
import "./start.css";
import "./owner.css";
import "./appearance.css";
import "./analytics.css";
import "./workspace-polish.css";
import "./application-compact.css";
import "./dark-neutral.css";
import "./submission-phone.css";

export const metadata: Metadata = {
  title: "Affimaro — Your partner workspace",
  description: "Your Affimaro account, business programs and affiliate partnerships.",
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
    <html lang="en" suppressHydrationWarning>
      <head><script src="/portal-theme.js?v=3"/><link rel="stylesheet" href="/site-theme.css?v=1"/>{emailSignIn&&<><link rel="manifest" href="/manifest.webmanifest"/><link rel="apple-touch-icon" href="/app-icons/apple-touch-icon.png"/><meta name="theme-color" content="#153b32"/><meta name="mobile-web-app-capable" content="yes"/><meta name="apple-mobile-web-app-capable" content="yes"/><meta name="apple-mobile-web-app-title" content="Affimaro"/></>}</head>
      <body className="antialiased">{children}{emailSignIn&&<script src="/install-app.js" defer/>}</body>
    </html>
  );
}
