'use client';

import React from 'react';
import { BookOpen, Headset, Pause, Play, Settings, Square, Trophy, Volume2, VolumeX } from 'lucide-react';
import { Button, ButtonLink, IconButton, Kbd, cx } from '@/components/ui/kit';

/** 관전 TV 소리 상태: 켜짐 / 꺼 둠 / 브라우저가 막음(화면을 한 번 눌러야 함) / 확인 전 */
export type TvSoundState = 'on' | 'muted' | 'locked' | 'unknown';

interface OperatorControlsProps {
  mode: 'player' | 'spectator';
  /** 진행 중인 실제 경기가 있음 (관전 데모는 제외) */
  matchRunning: boolean;
  isPaused: boolean;
  /** 경기 시작 버튼 표시 (선수 화면만. 관전 화면은 경기를 시작하지 않아 넘기지 않음) */
  canStart?: boolean;
  isVRSupported: boolean;
  onStartGame?: () => void;
  onPauseGame: () => void;
  onAbortGame?: () => void;
  onOpenSettings: () => void;
  onOpenLeaderboard: () => void;
  onEnterVR?: () => void;
  /** 관전 화면: TV 소리 켜기·끄기 (M 키와 같음) */
  sound?: { state: TvSoundState; onToggle: () => void };
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
  canStart = false,
  isVRSupported,
  onStartGame,
  onPauseGame,
  onAbortGame,
  onOpenSettings,
  onOpenLeaderboard,
  onEnterVR,
  sound,
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
  // 아이콘은 지금 상태(켜짐/꺼짐), 글자는 누르면 할 일
  const soundOff = sound !== undefined && (sound.state === 'muted' || sound.state === 'locked');
  const soundButton = mode === 'spectator' && sound && (
    <Button
      id="btn-sound"
      icon={soundOff ? VolumeX : Volume2}
      size="sm"
      variant={sound.state === 'locked' ? 'gold' : 'secondary'}
      onClick={sound.onToggle}
      aria-label={soundOff ? 'TV 소리 켜기' : 'TV 소리 끄기'}
      title={
        sound.state === 'locked'
          ? '브라우저가 소리를 막고 있어요. 누르면 소리가 켜져요 (M)'
          : soundOff
            ? 'TV 소리를 켜요 (M)'
            : 'TV 소리를 꺼요 (M)'
      }
      labelClassName="hidden xl:inline"
      trailing={
        <span className="hidden 2xl:inline-flex">
          <Kbd size="xs">M</Kbd>
        </span>
      }
    >
      {soundOff ? '소리 켜기' : '소리 끄기'}
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
        {/* 경기 중에도 VR로 들어가 이어서 할 수 있게 (상대가 먼저 시작해 PC 화면으로 경기에 들어온 선수용) */}
        {mode === 'player' && onEnterVR && isVRSupported && (
          <Button
            id="btn-enter-vr"
            icon={Headset}
            size="sm"
            variant="vr"
            onClick={onEnterVR}
            aria-label="VR로 이어서 하기"
            title="Quest VR로 들어가 이 경기를 이어서 해요"
            labelClassName="hidden lg:inline"
          >
            VR로 이어서
          </Button>
        )}
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
        {soundButton}
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

  const showStart = canStart && onStartGame !== undefined;
  const showEnterVR = mode === 'player' && onEnterVR !== undefined;
  return (
    <div className={cx('hud-interactive flex items-center gap-2', className)}>
      {showStart && (
        <Button id="btn-start" icon={Play} size="sm" variant="primary" onClick={onStartGame}>
          경기 시작
        </Button>
      )}
      {showEnterVR && (
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
      {(showStart || showEnterVR) && <span className="mx-0.5 h-6 w-px bg-line-strong" aria-hidden="true" />}
      {soundButton}
      {leaderboard}
      {settings}
      {manual}
    </div>
  );
}
