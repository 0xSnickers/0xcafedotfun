import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import DebugPanel from "../components/DebugPanel";

export const metadata: Metadata = {
  title: "0xcafe.fun",
  description: "Create and trade meme tokens with vanity addresses",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={` antialiased`}>
        <Providers>
          {children}
          <DebugPanel />
        </Providers>
      </body>
    </html>
  );
}
