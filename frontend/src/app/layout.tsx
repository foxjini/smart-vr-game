import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "사이버 스트라이크 : 1:1 VR 미래 사격 배틀 | 인천전자마이스터고 정보통신과",
  description: "인천전자마이스터고등학교 정보통신과 프로젝트 작품전시회 - 친구와 함께 즐기는 Meta Quest 2 1:1 실시간 레이저 사격 배틀 e-스포츠",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
      </head>
      <body>{children}</body>
    </html>
  );
}
