import type { Metadata } from "next";
import { AntdRegistry } from '@ant-design/nextjs-registry';
import "./globals.css";
import { Providers } from '@/app/providers';
import DebugPanel from "../components/DebugPanel";

export const metadata: Metadata = {
  title: "0xcafe.fun | Onchain Meme Launch Protocol",
  description: "Create, trade and graduate meme tokens with transparent bonding curve pricing.",
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
        <AntdRegistry>
          <Providers>
            {children}
            <DebugPanel />
          </Providers>
        </AntdRegistry>
      </body>
    </html>
  );
}
