import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Email Agent",
  description: "Intelligent email automation powered by Claude AI",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0 }}>
        {children}
      </body>
    </html>
  );
}