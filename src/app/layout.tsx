import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/app/providers";
import { AccessibilityFrame } from "@/components/app/accessibility-frame";

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
    <html lang="ko" className="h-dvh antialiased font-sans">
      <body className="h-full bg-[#2a1c15] font-sans">
        <Providers>
          <AccessibilityFrame>{children}</AccessibilityFrame>
        </Providers>
      </body>
    </html>
  );
}
