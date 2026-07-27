import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/app/providers";

export const metadata: Metadata = {
  title: "GrandFood 가족·이용자 앱",
  description: "GrandFood 급식 지원 이용자와 가족 보호자를 위한 앱",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased font-sans">
      <body className="min-h-full bg-[#2a1c15] font-sans">
        <Providers>
          <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background text-foreground sm:my-6 sm:min-h-[calc(100vh-3rem)] sm:rounded-[2rem] sm:shadow-2xl sm:ring-1 sm:ring-black/10 overflow-hidden">
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
