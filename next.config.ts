import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Azure Static Web Apps는 정적 파일만 서빙하므로 SSR 없이 완전한 정적 HTML로 빌드한다.
  // 이 앱엔 API 라우트/미들웨어/next/image가 없어서 static export와 호환된다.
  output: "export",
  // 개발 중 휴대폰(같은 Wi-Fi의 LAN IP)에서 접속할 때 HMR이 막히지 않도록 허용.
  allowedDevOrigins: ["192.168.35.17"],
};

export default nextConfig;
