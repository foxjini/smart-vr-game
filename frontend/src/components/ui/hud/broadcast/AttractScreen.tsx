'use client';

import React from 'react';
import { Bot, Crosshair, GraduationCap, Headset, Play, Trophy } from 'lucide-react';
import { Difficulty } from '@/types';
import { DIFFICULTY_NAME, KEYWORDS_1PT, KEYWORDS_2PT } from '@/constants/labels';
import { Kbd, Panel, Pill, cx } from '@/components/ui/kit';
import { MatchResultSummary, slotName, winnerHeadline } from '@/components/ui/matchInfo';
import { Logo } from './Logo';

interface AttractScreenProps {
  isDemo: boolean;
  isP1Connected: boolean;
  isP2Connected: boolean;
  difficulty: Difficulty;
  recentMatches: MatchResultSummary[];
}

/**
 * 관전 모니터 대기 화면 (1920×1080 기준).
 * 뒤에서 AI 시연이 돌아가는 동안 게임 소개 · 하는 방법 · 표적 점수 · 다음 도전자 · 최근 경기를 보여 줌
 */
export function AttractScreen({ isDemo, isP1Connected, isP2Connected, difficulty, recentMatches }: AttractScreenProps) {
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

      {/* 오른쪽: 다음 경기 · 표적 점수 · 최근 경기 */}
      <div className="absolute right-[112px] top-[96px] flex w-[600px] flex-col gap-6">
        <NextMatchPanel isP1Connected={isP1Connected} isP2Connected={isP2Connected} difficulty={difficulty} />
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

function SlotRow({ slot, connected, aiFill }: { slot: 1 | 2; connected: boolean; aiFill: boolean }) {
  return (
    <div className="flex items-center gap-4">
      <span className={cx('h-12 w-1.5 rounded-full', slot === 1 ? 'bg-p1 shadow-glow-p1' : 'bg-p2 shadow-glow-p2')} />
      <span className={cx('font-num text-[30px] font-bold', slot === 1 ? 'text-p1' : 'text-p2')}>{slot}P</span>
      <span className="text-[24px] font-semibold text-fg">{slotName(slot, null)}</span>
      <span className="ml-auto">
        {connected ? (
          <Pill tone="ok" dot pulse size="xl">
            준비 완료
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

function NextMatchPanel({ isP1Connected, isP2Connected, difficulty }: { isP1Connected: boolean; isP2Connected: boolean; difficulty: Difficulty }) {
  const both = isP1Connected && isP2Connected;
  const one = isP1Connected !== isP2Connected;
  return (
    <Panel accent="p1" solid className="px-8 py-7">
      <p className="text-[20px] font-semibold text-p1">다음 경기</p>
      <p className="mt-1 text-[32px] font-bold leading-tight text-fg">
        {both ? '1P · 2P 준비 완료!' : one ? '도전자 입장!' : '도전자를 기다리는 중'}
      </p>
      <div className="mt-6 flex flex-col gap-4">
        <SlotRow slot={1} connected={isP1Connected} aiFill={one && !isP1Connected} />
        <SlotRow slot={2} connected={isP2Connected} aiFill={one && !isP2Connected} />
      </div>
      <p className="mt-5 text-[20px] leading-snug text-fg-2">
        {one ? `빈 자리는 AI 라이벌(${DIFFICULTY_NAME[difficulty]})이 맡아요` : '혼자 와도 AI 라이벌과 대결할 수 있어요'}
      </p>
    </Panel>
  );
}

function PointsPanel() {
  return (
    <Panel accent="gold" solid className="px-8 py-7">
      <p className="text-[20px] font-semibold text-gold">표적 점수</p>
      <div className="mt-4 flex items-center gap-4">
        <span className="w-[76px] shrink-0 rounded-lg bg-gold py-1.5 text-center font-num text-[28px] font-bold text-ink">2점</span>
        <span className="flex flex-wrap gap-2.5">
          {KEYWORDS_2PT.map((k) => (
            <Keyword key={k} word={k} gold />
          ))}
        </span>
      </div>
      <div className="mt-3.5 flex items-center gap-4">
        <span className="w-[76px] shrink-0 rounded-lg bg-raised py-1.5 text-center font-num text-[28px] font-bold text-fg">1점</span>
        <span className="flex flex-wrap gap-2.5">
          {KEYWORDS_1PT.map((k) => (
            <Keyword key={k} word={k} />
          ))}
        </span>
      </div>
    </Panel>
  );
}

function Keyword({ word, gold }: { word: string; gold?: boolean }) {
  return (
    <span
      className={cx(
        'rounded-lg border px-3.5 py-1 text-[26px] font-extrabold leading-snug',
        gold ? 'border-gold/70 bg-gold/15 text-gold' : 'border-line-strong bg-ink/60 text-fg'
      )}
    >
      {word}
    </span>
  );
}

function RecentPanel({ matches }: { matches: MatchResultSummary[] }) {
  const list = matches.slice(0, 3);
  return (
    <Panel solid className="px-8 py-7">
      <p className="text-[20px] font-semibold text-fg-2">최근 경기</p>
      {list.length === 0 ? (
        <p className="mt-3 text-[22px] text-fg-3">오늘의 첫 경기를 기다리고 있어요</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
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
