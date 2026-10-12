import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 개발 모드(npm run dev)에서 Quest 헤드셋·관람 PC가 개발 PC의 사설 IP로 접속할 수 있도록 허용.
  // 목록에 없는 주소로 접속하면 Next.js가 개발용 리소스(HMR 등)를 차단하므로,
  // 전시장 공유기에서 IP가 바뀌어도 동작하도록 사설망 대역 전체를 허용함
  allowedDevOrigins: [
    'localhost',
    '127.0.0.1',
    '192.168.*.*',
    '10.*.*.*',
    '172.*.*.*',
  ],
  // 전시장에서는 npm run dev로 띄우므로, 관전 중계 화면에 Next.js 개발 표시가 뜨지 않도록 숨김
  // (컴파일·런타임 오류는 계속 표시됨)
  devIndicators: false,
};

export default nextConfig;
