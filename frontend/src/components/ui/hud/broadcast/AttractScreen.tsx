'use client';

import React from 'react';
import { Bot, Crosshair, GraduationCap, Headset, Play, Trophy } from 'lucide-react';
import { Difficulty } from '@/types';
import { DIFFICULTY_NAME, KEYWORDS_1PT, KEYWORDS_2PT, KEYWORDS_MINUS } from '@/constants/labels';
import { Kbd, Panel, Pill, cx } from '@/components/ui/kit';
import { MatchResultSummary, NO_READY, ReadyInfo, slotName, winnerHeadline } from '@/components/ui/matchInfo';
import { useSecondsLeft } from '../hooks';
import { Logo } from './Logo';

interface AttractScreenProps {
  isDemo: boolean;
  isP1Connected: boolean;
  isP2Connected: boolean;
  difficulty: Difficulty;
  recentMatches: MatchResultSummary[];
  /** 경기 전 준비 상태 (친구 대결은 두 선수가 모두 준비되면 시작) */
  readyInfo?: ReadyInfo;
}

/**
 * 관전 모니터 대기 화면 (1920×1080 기준).
 * 뒤에서 AI 시연이 돌아가는 동안 게임 소개 · 하는 방법 · 표적 점수 · 다음 도전자 · 최근 경기를 보여 줌
 */
export function AttractScreen({ isDemo, isP1Connected, isP2Connected, difficulty, recentMatches, readyInfo = NO_READY }: AttractScreenProps) {
  return (
    <div className="absolute inset-0 animate-fade-in motion-reduce:animate-none">
      {/* 글자가 잘 보이도록 왼쪽·아래를 어둡게 */}
      <div className="absolute inset-0 bg-linear-to-r from-ink/94 via-ink/72 to-ink/30" />
      <div className="absolute inset-x-0 bottom-0 h-[260px] bg-linear-to-t from-ink/92 to-transparent" />

      {/* 왼쪽: 소개 */}
      <div className="absolute left-[112px] top-[96px] w-[1000px]">
        <Pill tone="gold" icon={GraduationCap} size="xl">
          인천전자마이스터고 정보통신과 · 프로젝트 작품전시회
        </Pill>
        <div className="mt-9">
          <Logo size="xl" className="text-[156px]" />
        </div>
        <p className="mt-7 text-[46px] font-extrabold leading-tight text-fg">친구와 함께하는 1:1 VR 사격 배틀</p>
        <p className="mt-3 text-[28px] leading-snug text-fg-2">60초 동안 날아다니는 드론을 더 많이 맞히면 승리!</p>

        <ol className="mt-12 grid grid-cols-3 gap-5">
          <Step n="01" icon={Headset} title="헤드셋 쓰기" desc="Quest 2를 쓰고 컨트롤러를 손에 잡아요" />
          <Step n="02" icon={Crosshair} title="조준하고 발사" desc="트리거(방아쇠)를 당겨 드론을 맞혀요" />
          <Step n="03" icon={Trophy} title="점수 겨루기" desc="같은 표적은 먼저 맞힌 사람이 점수를 가져가요" />
        </ol>
      </div>

      {/* 오른쪽: 다음 경기 · 표적 점수 · 최근 경기 (최근 경기 3개까지 아래쪽 'AI 시연 중' 표시와 겹치지 않는 높이) */}
      <div className="absolute right-[112px] top-[96px] flex w-[600px] flex-col gap-5">
        <NextMatchPanel isP1Connected={isP1Connected} isP2Connected={isP2Connected} difficulty={difficulty} readyInfo={readyInfo} />
        <PointsPanel />
        <RecentPanel matches={recentMatches} />
      </div>

      {/* 아래: 시작 방법 한 줄 */}
      <div className="absolute inset-x-[112px] bottom-[64px] flex items-center justify-between gap-8">
        <p className="flex items-center gap-3 text-[28px] font-semibold text-fg">
          <span>Quest 2를 쓰고</span>
          <Kbd size="xl">트리거</Kbd>
          <span>를 당기면 경기가 시작돼요</span>
        </p>
        {isDemo && (
          <Pill icon={Play} size="xl">
            AI 시연 중
          </Pill>
        )}
      </div>
    </div>
  );
}

function Step({ n, icon: Icon, title, desc }: { n: string; icon: typeof Headset; title: string; desc: string }) {
  return (
    <li>
      <Panel className="h-full px-7 py-6">
        <div className="flex items-center justify-between">
          <span className="font-num text-[44px] font-bold leading-none text-p1/90">{n}</span>
          <Icon className="size-10 text-fg-2" strokeWidth={1.6} aria-hidden="true" />
        </div>
        <p className="mt-5 text-[30px] font-bold leading-tight text-fg">{title}</p>
        <p className="mt-2 text-[21px] leading-snug text-fg-2">{desc}</p>
      </Panel>
    </li>
  );
}

/** 자리 표시: 준비 완료 / 입장(접속, 아직 준비 전) / AI가 대신해요 / 빈 자리 */
function SlotRow({ slot, connected, ready, aiFill }: { slot: 1 | 2; connected: boolean; ready: boolean; aiFill: boolean }) {
  return (
    <div className="flex items-center gap-4">
      <span className={cx('h-12 w-1.5 rounded-full', slot === 1 ? 'bg-p1 shadow-glow-p1' : 'bg-p2 shadow-glow-p2')} />
      <span className={cx('font-num text-[30px] font-bold', slot === 1 ? 'text-p1' : 'text-p2')}>{slot}P</span>
      <span className="text-[24px] font-semibold text-fg">{slotName(slot, null)}</span>
      <span className="ml-auto">
        {connected && ready ? (
          <Pill tone="ok" dot pulse size="xl">
            준비 완료
          </Pill>
        ) : connected ? (
          <Pill tone={slot === 1 ? 'p1' : 'p2'} dot size="xl">
            입장
          </Pill>
        ) : aiFill ? (
          <Pill tone="ai" icon={Bot} size="xl">
            AI가 대신해요
          </Pill>
        ) : (
          <Pill size="xl">빈 자리</Pill>
        )}
      </span>
    </div>
  );
}

function NextMatchPanel({
  isP1Connected,
  isP2Connected,
  difficulty,
  readyInfo,
}: {
  isP1Connected: boolean;
  isP2Connected: boolean;
  difficulty: Difficulty;
  readyInfo: ReadyInfo;
}) {
  const both = isP1Connected && isP2Connected;
  const one = isP1Connected !== isP2Connected;
  const p1Ready = isP1Connected && readyInfo.p1;
  const p2Ready = isP2Connected && readyInfo.p2;
  const seconds = useSecondsLeft(readyInfo.deadlineAt);
  const headline = both
    ? p1Ready && p2Ready
      ? '곧 시작!'
      : p1Ready || p2Ready
        ? `${p1Ready ? '1P' : '2P'} 준비 완료!`
        : '1P · 2P 입장!'
    : one
      ? '도전자 입장!'
      : '도전자를 기다리는 중';
  const footer = both
    ? readyInfo.deadlineAt > 0 && seconds > 0
      ? `${seconds}초 뒤 시작해요 · 둘 다 준비하면 바로 시작`
      : '둘 다 시작을 누르면 경기가 시작돼요'
    : one
      ? `빈 자리는 AI 라이벌(${DIFFICULTY_NAME[difficulty]})이 맡아요`
      : '혼자 와도 AI 라이벌과 대결할 수 있어요';
  return (
    <Panel accent="p1" solid className="px-8 py-6">
      <p className="text-[20px] font-semibold text-p1">다음 경기</p>
      <p className="mt-1 text-[32px] font-bold leading-tight text-fg">
        {headline}
      </p>
      <div className="mt-5 flex flex-col gap-4">
        <SlotRow slot={1} connected={isP1Connected} ready={p1Ready} aiFill={one && !isP1Connected} />
        <SlotRow slot={2} connected={isP2Connected} ready={p2Ready} aiFill={one && !isP2Connected} />
      </div>
      <p className="mt-4 text-[20px] leading-snug text-fg-2">
        {footer}
      </p>
    </Panel>
  );
}

function PointsPanel() {
  return (
    <Panel accent="gold" solid className="px-8 py-6">
      <p className="text-[20px] font-semibold text-gold">표적 점수</p>
      <div className="mt-3 flex items-center gap-4">
        <span className="w-[76px] shrink-0 rounded-lg bg-gold py-1 text-center font-num text-[28px] font-bold text-ink">2점</span>
        <span className="flex flex-wrap gap-2.5">
          {KEYWORDS_2PT.map((k) => (
            <Keyword key={k} word={k} gold />
          ))}
        </span>
      </div>
      <div className="mt-2.5 flex items-center gap-4">
        <span className="w-[76px] shrink-0 rounded-lg bg-raised py-1 text-center font-num text-[28px] font-bold text-fg">1점</span>
        <span className="flex flex-wrap gap-2.5">
          {KEYWORDS_1PT.map((k) => (
            <Keyword key={k} word={k} />
          ))}
        </span>
      </div>
      <div className="mt-2.5 flex items-center gap-4">
        <span className="w-[76px] shrink-0 rounded-lg bg-danger py-1 text-center font-num text-[28px] font-bold text-ink">-1점</span>
        <span className="flex flex-wrap items-center gap-2.5">
          {KEYWORDS_MINUS.map((k) => (
            <Keyword key={k} word={k} minus />
          ))}
          <span className="ml-1 text-[22px] font-semibold text-fg-2">맞히면 1점 깎여요</span>
        </span>
      </div>
    </Panel>
  );
}

function Keyword({ word, gold, minus }: { word: string; gold?: boolean; minus?: boolean }) {
  return (
    <span
      className={cx(
        'rounded-lg border px-3.5 py-0.5 text-[26px] font-extrabold leading-snug',
        gold ? 'border-gold/70 bg-gold/15 text-gold' : minus ? 'border-danger/70 bg-danger/15 text-danger' : 'border-line-strong bg-ink/60 text-fg'
      )}
    >
      {word}
    </span>
  );
}

function RecentPanel({ matches }: { matches: MatchResultSummary[] }) {
  const list = matches.slice(0, 3);
  return (
    <Panel solid className="px-8 py-6">
      <p className="text-[20px] font-semibold text-fg-2">최근 경기</p>
      {list.length === 0 ? (
        <p className="mt-3 text-[22px] text-fg-3">오늘의 첫 경기를 기다리고 있어요</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {list.map((m) => {
            const time = new Date(m.endedAt);
            const hhmm = `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;
            return (
              <li key={m.endedAt} className="flex items-center gap-4 text-[22px]">
                <span className="w-[64px] font-num text-[20px] text-fg-3">{hhmm}</span>
                <span className="font-num text-[30px] font-bold tabular-nums">
                  <span className="text-p1">{m.p1Score}</span>
                  <span className="mx-2 text-fg-3">:</span>
                  <span className="text-p2">{m.p2Score}</span>
                </span>
                <span
                  className={cx(
                    'ml-auto font-semibold',
                    m.winner === 'P1' ? 'text-p1' : m.winner === 'P2' ? 'text-p2' : 'text-fg-2'
                  )}
                >
                  {winnerHeadline(m.winner, m.aiSlot)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
