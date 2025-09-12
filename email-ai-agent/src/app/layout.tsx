import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Email Agent",
  description: "AI-powered email automation using Claude and Microsoft Graph",
  keywords: ["AI", "email", "automation", "Claude", "Microsoft Graph"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body className="antialiased bg-gray-50">
        {children}
      </body>
    </html>
  );
}