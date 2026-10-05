'use client';

import React from 'react';

interface CyberCrosshairProps {
  opacity?: number;
}

export const CyberCrosshair: React.FC<CyberCrosshairProps> = ({ opacity = 0.65 }) => {
  return (
    <div
      className="hud-center-reticle"
      style={{ opacity, pointerEvents: 'none' }}
      aria-hidden="true"
    >
      <svg
        className="w-full h-full"
        viewBox="0 0 280 280"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* 중앙 정밀 십자선 (1px 초슬림) */}
        <line x1="140" y1="95" x2="140" y2="128" stroke="#00f0ff" strokeWidth="1" strokeOpacity="0.8" />
        <line x1="140" y1="152" x2="140" y2="185" stroke="#00f0ff" strokeWidth="1" strokeOpacity="0.8" />
        <line x1="95" y1="140" x2="128" y2="140" stroke="#00f0ff" strokeWidth="1" strokeOpacity="0.8" />
        <line x1="152" y1="140" x2="185" y2="140" stroke="#00f0ff" strokeWidth="1" strokeOpacity="0.8" />

        {/* 중심 초정밀 타겟 도트 */}
        <circle cx="140" cy="140" r="1.5" fill="#00f0ff" fillOpacity="0.9" />

        {/* 내측 미세 조준 링 */}
        <circle
          cx="140"
          cy="140"
          r="48"
          stroke="#00f0ff"
          strokeWidth="1"
          strokeDasharray="4 6"
          strokeOpacity="0.45"
        />

        {/* 외측 분할 타겟 링 (방위각 4분면 틱) */}
        <path
          d="M 140 60 A 80 80 0 0 1 220 140"
          stroke="#00f0ff"
          strokeWidth="1"
          strokeOpacity="0.3"
          strokeDasharray="2 8"
        />
        <path
          d="M 220 140 A 80 80 0 0 1 140 220"
          stroke="#00f0ff"
          strokeWidth="1"
          strokeOpacity="0.3"
          strokeDasharray="2 8"
        />
        <path
          d="M 140 220 A 80 80 0 0 1 60 140"
          stroke="#00f0ff"
          strokeWidth="1"
          strokeOpacity="0.3"
          strokeDasharray="2 8"
        />
        <path
          d="M 60 140 A 80 80 0 0 1 140 60"
          stroke="#00f0ff"
          strokeWidth="1"
          strokeOpacity="0.3"
          strokeDasharray="2 8"
        />

        {/* 4방위 각도 인덱스 틱 마크 */}
        <line x1="140" y1="52" x2="140" y2="58" stroke="#00f0ff" strokeWidth="1.5" strokeOpacity="0.75" />
        <line x1="140" y1="222" x2="140" y2="228" stroke="#00f0ff" strokeWidth="1.5" strokeOpacity="0.75" />
        <line x1="52" y1="140" x2="58" y2="140" stroke="#00f0ff" strokeWidth="1.5" strokeOpacity="0.75" />
        <line x1="222" y1="140" x2="228" y2="140" stroke="#00f0ff" strokeWidth="1.5" strokeOpacity="0.75" />

        {/* 대각선 45도 정밀 브래킷 */}
        <path d="M 86 86 L 94 86 M 86 86 L 86 94" stroke="#00f0ff" strokeWidth="1" strokeOpacity="0.5" />
        <path d="M 194 86 L 186 86 M 194 86 L 194 94" stroke="#00f0ff" strokeWidth="1" strokeOpacity="0.5" />
        <path d="M 86 194 L 94 194 M 86 194 L 86 186" stroke="#00f0ff" strokeWidth="1" strokeOpacity="0.5" />
        <path d="M 194 194 L 186 194 M 194 194 L 194 186" stroke="#00f0ff" strokeWidth="1" strokeOpacity="0.5" />

        {/* SF 텔레메트리 텍스트 마크 (초소형 8~9px) */}
        <text
          x="140"
          y="44"
          textAnchor="middle"
          fill="#00f0ff"
          fillOpacity="0.75"
          fontSize="8"
          fontFamily="monospace"
          letterSpacing="1.5"
        >
          정밀 광학 조준계 v2.06
        </text>
        <text
          x="42"
          y="143"
          textAnchor="end"
          fill="#94a3b8"
          fillOpacity="0.7"
          fontSize="7"
          fontFamily="monospace"
        >
          방위 000°
        </text>
        <text
          x="238"
          y="143"
          textAnchor="start"
          fill="#94a3b8"
          fillOpacity="0.7"
          fontSize="7"
          fontFamily="monospace"
        >
          고도 +00°
        </text>
        <text
          x="140"
          y="244"
          textAnchor="middle"
          fill="#94a3b8"
          fillOpacity="0.65"
          fontSize="7"
          fontFamily="monospace"
          letterSpacing="1"
        >
          [ 6DoF 조준 고정 ]
        </text>
      </svg>
    </div>
  );
};
