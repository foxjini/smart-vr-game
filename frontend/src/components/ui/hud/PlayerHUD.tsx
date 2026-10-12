'use client';

import React from 'react';
import { Bot, Eye, RotateCcw, Swords, TriangleAlert, Users } from 'lucide-react';
import { ClientRole, ConnectionIssue, Difficulty, GameStats, SystemStatus, VersusMatchStats } from '@/types';
import { DIFFICULTY_NAME, ROLE_NAME, ROLE_SHORT } from '@/constants/labels';
import { Kbd, Panel, Pill, cx } from '@/components/ui/kit';
import { aiSlotOf, localSlotOf } from '@/components/ui/matchInfo';
import { ScoreBug } from './ScoreBug';
import { OperatorControls } from './OperatorControls';

export interface PlayerHUDProps {
  stats: GameStats;
  systemStatus: SystemStatus;
  versusStats?: VersusMatchStats;
  clientRole: ClientRole;
  difficulty: Difficulty;
  isWsConnected: boolean;
  connectionIssue: ConnectionIssue | null;
  isPlaying: boolean;
  isPaused: boolean;
  isP1Connected: boolean;
  isP2Connected: boolean;
  isVRSupported: boolean;
  onStartGame: () => void;
  onPauseGame: () => void;
  onAbortGame?: () => void;
  onOpenSettings: () => void;
  onOpenLeaderboard: () => void;
  onEnterVR: () => void;
}

/** 연결 상태 문구 (자리 문제 > 정상 > 오프라인 순) */
export function connectionText(isWsConnected: boolean, issue: ConnectionIssue | null): { text: string; tone: 'ok' | 'warn' | 'danger' } {
  if (issue === 'slot_busy') return { text: '이 역할은 다른 기기가 사용 중 · 자리가 비면 자동 접속', tone: 'danger' };
  if (issue === 'replaced') return { text: '같은 역할로 새로 접속되어 연결 해제됨', tone: 'danger' };
  if (isWsConnected) return { text: '서버 연결됨', tone: 'ok' };
  return { text: '서버 오프라인 · 혼자 연습', tone: 'warn' };
}

/** 플레이어(1P·2P) PC·Quest 2D 화면 HUD */
export function PlayerHUD({
  stats,
  systemStatus,
  versusStats,
  clientRole,
  difficulty,
  isWsConnected,
  connectionIssue,
  isPlaying,
  isPaused,
  isP1Connected,
  isP2Connected,
  isVRSupported,
  onStartGame,
  onPauseGame,
  onAbortGame,
  onOpenSettings,
  onOpenLeaderboard,
  onEnterVR,
}: PlayerHUDProps) {
  const localSlot = localSlotOf(clientRole) ?? 1;
  const aiSlot = aiSlotOf(versusStats?.mode, isP1Connected, isP2Connected, clientRole);
  const conn = connectionText(isWsConnected, connectionIssue);
  const isPvP = aiSlot === null;
  const p1Score = versusStats ? versusStats.p1Score : stats.score;
  const p2Score = versusStats ? versusStats.p2Score : 0;
  const spectators = systemStatus.spectator_count ?? 0;

  return (
    <div className="hud-layer">
      {/* 위: 상태 · 점수판 · 조작 버튼 */}
      <header className="relative flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Pill tone={localSlot === 1 ? 'p1' : 'p2'} size="lg" title={ROLE_NAME[clientRole]}>
            <span className="font-num text-[17px] font-bold">{ROLE_SHORT[clientRole]}</span>
            <span className={cx('ml-1.5 font-semibold text-fg', isPlaying ? 'hidden xl:inline' : 'hidden md:inline')}>
              {ROLE_NAME[clientRole]}
            </span>
          </Pill>
          <Pill tone={conn.tone} dot pulse={conn.tone === 'ok'} size="lg" title={conn.text} className="max-w-[min(440px,40vw)]">
            <span className={cx(isPlaying && conn.tone === 'ok' && 'hidden xl:inline')}>{conn.text}</span>
          </Pill>
          <span className={cx(isPlaying ? 'hidden 2xl:inline-flex' : 'inline-flex')}>
            {isPvP ? (
              <Pill tone="p2" icon={Users} size="lg">
                친구와 1:1
              </Pill>
            ) : (
              <Pill tone="ai" icon={Bot} size="lg">
                AI 라이벌 · {DIFFICULTY_NAME[difficulty]}
              </Pill>
            )}
          </span>
          {spectators > 0 && (
            <span className={cx(isPlaying ? 'hidden 2xl:inline-flex' : 'inline-flex')}>
              <Pill icon={Eye} size="lg" title="연결된 관전(TV 중계) 화면 수">
                중계 화면 {spectators}
              </Pill>
            </span>
          )}
        </div>

        <OperatorControls
          mode="player"
          matchRunning={isPlaying}
          isPaused={isPaused}
          canStart={!isPlaying}
          isVRSupported={isVRSupported}
          onStartGame={onStartGame}
          onPauseGame={onPauseGame}
          onAbortGame={onAbortGame}
          onOpenSettings={onOpenSettings}
          onOpenLeaderboard={onOpenLeaderboard}
          onEnterVR={onEnterVR}
          className="shrink-0"
        />

        {isPlaying && (
          <div className="absolute left-1/2 top-0 -translate-x-1/2">
            <ScoreBug
              variant="compact"
              p1Score={p1Score}
              p2Score={p2Score}
              timeRemaining={stats.timeRemaining}
              isPaused={isPaused}
              aiSlot={aiSlot}
              difficulty={difficulty}
              localSlot={localSlot}
            />
          </div>
        )}
      </header>

      {/* 가운데: 경기 전 안내 */}
      {!isPlaying && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
          {connectionIssue ? (
            <Panel accent="danger" solid className="max-w-lg px-7 py-6 text-center">
              <TriangleAlert className="mx-auto mb-3 size-8 text-danger" strokeWidth={2} aria-hidden="true" />
              <p className="text-[20px] font-bold text-fg">
                {connectionIssue === 'slot_busy' ? '이 역할은 다른 기기가 사용 중이에요' : '같은 역할로 새로 접속되어 연결이 끊겼어요'}
              </p>
              <p className="mt-2 text-[15px] leading-relaxed text-fg-2">
                {connectionIssue === 'slot_busy'
                  ? '자리가 비면 자동으로 접속합니다. 다른 역할로 바꾸려면 환경설정 → 기기 역할에서 고르세요.'
                  : '이 화면을 새로고침하면 다시 접속합니다.'}
              </p>
            </Panel>
          ) : (
            <Panel accent={localSlot === 1 ? 'p1' : 'p2'} solid className="px-8 py-6 text-center">
              <p className="text-[22px] font-bold text-fg">준비되면 시작!</p>
              <p className="mt-3 flex flex-wrap items-center justify-center gap-2 text-[15px] text-fg-2">
                <Kbd>트리거</Kbd>
                <span>·</span>
                <Kbd>Space</Kbd>
                <span>·</span>
                <Kbd>클릭</Kbd>
                <span>으로 경기를 시작해요</span>
              </p>
              <p className="mt-2 flex items-center justify-center gap-1.5 text-[14px] text-fg-3">
                {isPvP ? <Swords className="size-4" aria-hidden="true" /> : <Bot className="size-4" aria-hidden="true" />}
                {isPvP ? '친구와 1:1 대결' : `AI 라이벌(${DIFFICULTY_NAME[difficulty]})과 대결`}
              </p>
            </Panel>
          )}
        </div>
      )}

      {/* 아래: 조작 안내 · 탄약 */}
      {isPlaying && (
        <footer className="flex items-end justify-between gap-4">
          <Panel className="hidden max-w-[520px] px-4 py-3 md:block">
            <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-fg-2">
              <li className="flex items-center gap-1.5">
                <Kbd>마우스</Kbd> 조준
              </li>
              <li className="flex items-center gap-1.5">
                <Kbd>클릭</Kbd>
                <Kbd>Space</Kbd> 발사
              </li>
              <li className="flex items-center gap-1.5">
                <Kbd>우클릭</Kbd>
                <Kbd>R</Kbd> 재장전
              </li>
              <li className="flex items-center gap-1.5">
                <Kbd>ESC</Kbd> 중단
              </li>
            </ul>
          </Panel>
          <AmmoPanel stats={stats} slot={localSlot} />
        </footer>
      )}
    </div>
  );
}

/** 탄약 칸 · 명중률 · 콤보 */
function AmmoPanel({ stats, slot }: { stats: GameStats; slot: 1 | 2 }) {
  const empty = !stats.isReloading && stats.ammo <= 0;
  const low = !stats.isReloading && stats.ammo > 0 && stats.ammo <= 2;
  return (
    <Panel accent={slot === 1 ? 'p1' : 'p2'} className="ml-auto w-[300px] px-4 py-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] font-semibold text-fg-2">탄약</span>
        <span
          className={cx(
            'font-num text-[24px] font-bold leading-none tabular-nums',
            stats.isReloading ? 'text-warn' : empty || low ? 'text-danger' : 'text-fg'
          )}
        >
          {stats.isReloading ? '…' : stats.ammo}
          <span className="text-[15px] text-fg-3"> / {stats.maxAmmo}</span>
        </span>
      </div>
      <div className="mt-2 h-7">
        {stats.isReloading ? (
          <div className="flex h-full flex-col justify-center gap-1.5">
            <div className="relative h-2 overflow-hidden rounded-full bg-white/10">
              <div className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-warn animate-reload-sweep motion-reduce:animate-none" />
            </div>
            <span className="flex items-center gap-1 text-[12px] font-semibold text-warn">
              <RotateCcw className="size-3.5" aria-hidden="true" />
              재장전 중…
            </span>
          </div>
        ) : (
          <div className="flex h-full items-stretch gap-[3px]" aria-label={`남은 탄약 ${stats.ammo}발`}>
            {Array.from({ length: stats.maxAmmo }).map((_, i) => (
              <span
                key={i}
                className={cx(
                  'flex-1 rounded-[3px] transition-colors duration-100',
                  i < stats.ammo
                    ? slot === 1
                      ? 'bg-p1 shadow-[0_0_8px_rgb(34_211_238/0.55)]'
                      : 'bg-p2 shadow-[0_0_8px_rgb(255_61_200/0.55)]'
                    : 'bg-white/10'
                )}
              />
            ))}
          </div>
        )}
      </div>
      {empty && <p className="mt-1.5 text-[12px] font-semibold text-danger">탄약 없음 · R·우클릭·그립으로 재장전</p>}
      <div className="mt-2.5 grid grid-cols-3 gap-2 border-t border-line pt-2.5">
        <MiniStat label="명중률" value={`${stats.accuracy}`} unit="%" />
        <MiniStat label="명중" value={`${stats.hits}`} />
        <MiniStat label="콤보" value={stats.combo > 0 ? `x${stats.combo}` : '-'} highlight={stats.combo >= 3} />
      </div>
    </Panel>
  );
}

function MiniStat({ label, value, unit, highlight }: { label: string; value: string; unit?: string; highlight?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[12px] leading-none text-fg-3">{label}</span>
      <span className={cx('font-num text-[20px] font-bold leading-none tabular-nums', highlight ? 'text-gold' : 'text-fg')}>
        {value}
        {unit && <span className="text-[13px] text-fg-2">{unit}</span>}
      </span>
    </div>
  );
}
