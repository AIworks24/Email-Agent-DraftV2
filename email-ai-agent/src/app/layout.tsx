import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Email Agent",
  description: "Email automation tool",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}