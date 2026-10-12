'use client';

import React from 'react';
import { BookOpen, Headset, Pause, Play, Settings, Square, Trophy } from 'lucide-react';
import { Button, ButtonLink, IconButton, Kbd, cx } from '@/components/ui/kit';

interface OperatorControlsProps {
  mode: 'player' | 'spectator';
  /** 진행 중인 실제 경기가 있음 (관전 데모는 제외) */
  matchRunning: boolean;
  isPaused: boolean;
  /** 경기 시작 버튼 표시 */
  canStart: boolean;
  isVRSupported: boolean;
  onStartGame: () => void;
  onPauseGame: () => void;
  onAbortGame?: () => void;
  onOpenSettings: () => void;
  onOpenLeaderboard: () => void;
  onEnterVR?: () => void;
  className?: string;
}

/**
 * 오른쪽 위 조작 버튼.
 * id(btn-pause 등)는 운영 매뉴얼과 자동 점검이 쓰므로 바꾸지 않음
 */
export function OperatorControls({
  mode,
  matchRunning,
  isPaused,
  canStart,
  isVRSupported,
  onStartGame,
  onPauseGame,
  onAbortGame,
  onOpenSettings,
  onOpenLeaderboard,
  onEnterVR,
  className,
}: OperatorControlsProps) {
  const manual = (
    <ButtonLink
      id="btn-manual"
      href="/manual.html"
      target="_blank"
      rel="noopener noreferrer"
      icon={BookOpen}
      size="sm"
      variant="ghost"
      aria-label="매뉴얼"
      title="운영 매뉴얼 (새 창)"
      labelClassName="hidden 2xl:inline"
    >
      매뉴얼
    </ButtonLink>
  );
  const leaderboard = (
    <Button
      id="btn-leaderboard"
      icon={Trophy}
      size="sm"
      variant="secondary"
      onClick={onOpenLeaderboard}
      aria-label="순위표"
      title="순위표"
      labelClassName="hidden xl:inline"
    >
      순위표
    </Button>
  );
  const settings = (
    <Button
      id="btn-settings"
      icon={Settings}
      size="sm"
      variant="secondary"
      onClick={onOpenSettings}
      aria-label="환경설정"
      title="환경설정"
      labelClassName="hidden xl:inline"
    >
      설정
    </Button>
  );

  if (matchRunning) {
    return (
      <div className={cx('hud-interactive flex items-center gap-2', className)}>
        <Button
          id="btn-pause"
          icon={isPaused ? Play : Pause}
          size="sm"
          variant={isPaused ? 'primary' : 'secondary'}
          onClick={onPauseGame}
          aria-label={isPaused ? '재개' : '일시정지'}
          labelClassName={mode === 'spectator' ? undefined : 'hidden xl:inline'}
        >
          {isPaused ? '재개' : '일시정지'}
        </Button>
        {onAbortGame && (
          <Button
            id="btn-abort"
            icon={Square}
            size="sm"
            variant="danger"
            onClick={onAbortGame}
            aria-label="경기 중단"
            title="경기를 바로 끝내고 처음 화면으로 (ESC)"
            labelClassName={mode === 'spectator' ? undefined : 'hidden xl:inline'}
            trailing={
              <span className="hidden 2xl:inline-flex">
                <Kbd size="xs" tone="danger">
                  ESC
                </Kbd>
              </span>
            }
          >
            경기 중단
          </Button>
        )}
        <span className="mx-0.5 h-6 w-px bg-line-strong" aria-hidden="true" />
        {mode === 'spectator' && leaderboard}
        {mode === 'player' ? (
          <IconButton id="btn-settings" icon={Settings} size="sm" label="환경설정" onClick={onOpenSettings} />
        ) : (
          settings
        )}
        {mode === 'spectator' && manual}
      </div>
    );
  }

  return (
    <div className={cx('hud-interactive flex items-center gap-2', className)}>
      {canStart && (
        <Button id="btn-start" icon={Play} size="sm" variant="primary" onClick={onStartGame}>
          경기 시작
        </Button>
      )}
      {mode === 'player' && onEnterVR && (
        <Button
          id="btn-enter-vr"
          icon={Headset}
          size="sm"
          variant="vr"
          onClick={onEnterVR}
          aria-label="VR 시작"
          title={isVRSupported ? 'Quest VR로 들어가기' : '이 기기는 VR을 지원하지 않아 PC 경기로 시작해요'}
          labelClassName="hidden lg:inline"
        >
          VR 시작
        </Button>
      )}
      <span className="mx-0.5 h-6 w-px bg-line-strong" aria-hidden="true" />
      {leaderboard}
      {settings}
      {manual}
    </div>
  );
}
