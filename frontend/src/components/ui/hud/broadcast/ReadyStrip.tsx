'use client';

import React from 'react';
import { Panel, StatusDot } from '@/components/ui/kit';
import { ReadyInfo } from '@/components/ui/matchInfo';
import { useSecondsLeft } from '../hooks';

interface ReadyStripProps {
  readyInfo: ReadyInfo;
  isP1Connected: boolean;
  isP2Connected: boolean;
}

/**
 * 관전 TV 위쪽 가운데 준비 띠 (대기 화면·결과 화면 모두, 1920×1080 무대 기준).
 * 친구 대결에서 한 선수가 먼저 준비하면 누가 준비했고 몇 초 뒤 시작하는지 보여 줌
 */
export function ReadyStrip({ readyInfo, isP1Connected, isP2Connected }: ReadyStripProps) {
  const seconds = useSecondsLeft(readyInfo.deadlineAt);
  const p1 = isP1Connected && readyInfo.p1;
  const p2 = isP2Connected && readyInfo.p2;
  if (!readyInfo.supported || !isP1Connected || !isP2Connected || (!p1 && !p2)) return null;
  const who = p1 && p2 ? '1P · 2P' : p1 ? '1P' : '2P';
  const waiting = p1 && p2 ? null : p1 ? '2P' : '1P';
  const time = readyInfo.deadlineAt > 0 && seconds > 0 ? `${seconds}초 뒤 시작` : '곧 시작';
  return (
    <div className="absolute left-1/2 top-7 -translate-x-1/2" role="status" aria-live="polite">
      <Panel id="spectator-ready-strip" solid accent="gold" className="flex items-center gap-4 whitespace-nowrap px-8 py-4">
        <StatusDot tone="ok" pulse />
        <span className="text-[30px] font-bold text-fg">{who} 준비 완료</span>
        {waiting && <span className="text-[26px] text-fg-2">· {waiting}를 기다리는 중</span>}
        <span className="font-num text-[30px] font-bold text-gold">{time}</span>
      </Panel>
    </div>
  );
}
