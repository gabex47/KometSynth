import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "SynthNet — Internal developer network",
  description: "A secure, private workspace for development, network, and security utilities.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#050505",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
