import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hamptons Lettings — Voice Assistant",
  description:
    "Browse Hamptons rental properties and talk to an AI lettings agent about any listing.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
