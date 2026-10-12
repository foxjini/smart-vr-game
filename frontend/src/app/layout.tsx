import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "사이버 스트라이크 : 1:1 VR 미래 사격 배틀 | 인천전자마이스터고 정보통신과",
  description: "인천전자마이스터고등학교 정보통신과 프로젝트 작품전시회 - 친구와 함께 즐기는 Meta Quest 2 1:1 실시간 레이저 사격 배틀 e-스포츠",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#070b14",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <head>
        {/* 첫 화면부터 정해진 글꼴로 보이도록 폰트를 미리 받음 (public/fonts, 인터넷 불필요) */}
        <link rel="preload" href="/fonts/PretendardVariable.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/rajdhani-latin-700-normal.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  );
}
