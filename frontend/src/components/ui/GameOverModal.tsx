'use client';

import React, { useState } from 'react';
import { ArrowRight, CircleCheck, House, RotateCcw, Settings, Trophy } from 'lucide-react';
import { GameStats, Difficulty, ThemeType, ClientRole } from '@/types';
import { LeaderboardManager } from '@/core/leaderboard/LeaderboardManager';
import { DIFFICULTY_NAME } from '@/constants/labels';
import { Button, CompareRow, ModalShell, Pill, TeamPlate, cx } from '@/components/ui/kit';
import { MatchResultSummary, localSlotOf, slotName, winnerBannerText } from '@/components/ui/matchInfo';

interface GameOverModalProps {
  /** 내 최종 기록 (순위표 등록용) */
  stats: GameStats;
  /** 두 선수 최종 결과 (모든 화면이 같은 내용) */
  result: MatchResultSummary;
  clientRole?: ClientRole;
  highScore: number;
  difficulty: Difficulty;
  theme: ThemeType;
  onRestart: () => void;
  onOpenSettings: () => void;
  onViewLeaderboard: (highlightId?: string) => void;
  onGoToMainMenu?: () => void;
}

/** 플레이어 결과창: 승패 · 두 선수 기록 비교 · 순위표 등록 · 다시 하기 */
export const GameOverModal: React.FC<GameOverModalProps> = ({
  stats,
  result,
  clientRole = 'P1',
  highScore,
  difficulty,
  theme,
  onRestart,
  onOpenSettings,
  onViewLeaderboard,
  onGoToMainMenu,
}) => {
  const [playerName, setPlayerName] = useState(clientRole === 'P2' ? '플레이어_02' : '플레이어_01');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [savedEntryId, setSavedEntryId] = useState<string | undefined>();

  const mySlot = localSlotOf(clientRole) ?? 1;
  const winSlot = result.winner === 'P1' ? 1 : result.winner === 'P2' ? 2 : null;
  const outcome: 'win' | 'lose' | 'draw' = winSlot === null ? 'draw' : winSlot === mySlot ? 'win' : 'lose';
  const isNewRecord = stats.score > 0 && stats.score >= highScore;
  const isTopTen = stats.score > 0 && LeaderboardManager.getInstance().isTopTen(stats.score);
  const aiLabel = DIFFICULTY_NAME[difficulty];

  const handleSubmitScore = (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim() || isSubmitted) return;

    const newEntry = LeaderboardManager.getInstance().addEntry({
      playerName: playerName.trim(),
      score: stats.score,
      accuracy: stats.accuracy,
      maxCombo: stats.maxCombo,
      difficulty,
      theme,
    });

    setIsSubmitted(true);
    setSavedEntryId(newEntry.id);
  };

  const title =
    outcome === 'win' ? (
      <span className={mySlot === 1 ? 'text-p1' : 'text-p2'}>승리!</span>
    ) : outcome === 'draw' ? (
      <span className="text-gold">무승부</span>
    ) : (
      <span className="text-fg">아쉬운 패배</span>
    );

  return (
    <ModalShell
      layer="result"
      size="lg"
      accent={outcome === 'win' ? (mySlot === 1 ? 'p1' : 'p2') : outcome === 'draw' ? 'gold' : 'none'}
      eyebrow="경기 결과"
      icon={Trophy}
      title={title}
      headerAside={
        <Pill tone={winSlot === 1 ? 'p1' : winSlot === 2 ? 'p2' : 'gold'} size="lg" className="max-w-[340px]">
          {winnerBannerText(result.winner, result.aiSlot)}
        </Pill>
      }
      footer={
        <div className="flex flex-wrap items-center gap-2">
          {onGoToMainMenu && (
            <Button icon={House} variant="secondary" onClick={onGoToMainMenu}>
              메인 메뉴
            </Button>
          )}
          <Button icon={Settings} variant="ghost" onClick={onOpenSettings}>
            환경설정
          </Button>
          <Button icon={RotateCcw} variant="primary" size="lg" className="ml-auto" onClick={onRestart} trailing={<ArrowRight className="size-5" aria-hidden="true" />}>
            재경기 시작
          </Button>
        </div>
      }
    >
      {/* 두 선수 점수 */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
        <TeamPlate
          slot={1}
          size="broadcast"
          name={slotName(1, result.aiSlot)}
          score={result.p1Score}
          isAI={result.aiSlot === 1}
          aiLabel={aiLabel}
          isMe={mySlot === 1}
          isWinner={winSlot === 1}
          className="rounded-xl border border-line"
        />
        <span className="font-display text-[22px] font-bold text-fg-3">VS</span>
        <TeamPlate
          slot={2}
          size="broadcast"
          name={slotName(2, result.aiSlot)}
          score={result.p2Score}
          isAI={result.aiSlot === 2}
          aiLabel={aiLabel}
          isMe={mySlot === 2}
          isWinner={winSlot === 2}
          className="rounded-xl border border-line"
        />
      </div>

      {/* 기록 비교 */}
      <div className="mt-5 flex flex-col gap-3 rounded-xl border border-line bg-ink/40 px-4 py-4">
        <CompareRow label="명중" left={result.p1Hits} right={result.p2Hits} />
        <CompareRow label="명중률" left={result.p1Accuracy} right={result.p2Accuracy} unit="%" />
        <CompareRow label="최고 연속" left={result.p1MaxCombo} right={result.p2MaxCombo} />
      </div>

      {/* 순위표 등록 */}
      <div className={cx('mt-5 rounded-xl border px-5 py-4', isSubmitted ? 'border-ok/40 bg-ok/8' : 'border-line-strong bg-raised/60')}>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[16px] font-bold text-fg">순위표에 이름 남기기</p>
          <span className="text-[14px] text-fg-3">내 점수 {stats.score}점</span>
          <span className="ml-auto flex gap-1.5">
            {isNewRecord && (
              <Pill tone="p1" size="sm">
                최고 기록!
              </Pill>
            )}
            {isTopTen && (
              <Pill tone="gold" size="sm">
                TOP 10 가능
              </Pill>
            )}
          </span>
        </div>

        {!isSubmitted ? (
          <form onSubmit={handleSubmitScore} className="mt-3 flex gap-2">
            <input
              type="text"
              maxLength={15}
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="호출 부호 입력 (최대 15자)"
              aria-label="순위표에 남길 이름"
              className="hud-interactive h-12 min-w-0 flex-1 rounded-lg border border-line-strong bg-ink/70 px-4 text-[17px] text-fg outline-none transition-colors placeholder:text-fg-3 focus:border-p1"
            />
            <Button type="submit" variant="primary" size="lg">
              기록 등록
            </Button>
          </form>
        ) : (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-[16px] font-semibold text-ok">
              <CircleCheck className="size-5" aria-hidden="true" />
              등록 완료! 순위표에 기록됐어요
            </span>
            <Button variant="gold" icon={Trophy} onClick={() => onViewLeaderboard(savedEntryId)} trailing={<ArrowRight className="size-4" aria-hidden="true" />}>
              순위표 확인
            </Button>
          </div>
        )}
      </div>
    </ModalShell>
  );
};
