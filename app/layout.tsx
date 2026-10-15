import type { Metadata } from "next";
import "./account.css";

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
      <body className="antialiased">{children}</body>
    </html>
  );
}
