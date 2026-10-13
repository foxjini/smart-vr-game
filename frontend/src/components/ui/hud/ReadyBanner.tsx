'use client';

import React from 'react';
import { Headset, MousePointerClick, X } from 'lucide-react';
import { Button, Panel, StatusDot, cx } from '@/components/ui/kit';
import { useSecondsLeft } from './hooks';

interface ReadyBannerProps {
  /** 이 화면 선수의 자리 */
  mySlot: 1 | 2;
  meReady: boolean;
  rivalReady: boolean;
  /** 한 명만 준비했을 때 자동 시작 예정 시각 (Date.now() 기준 ms, 대기 중이 아니면 0) */
  deadlineAt: number;
  isVRSupported: boolean;
  onEnterVR: () => void;
  onStartPC: () => void;
  onCancel: () => void;
  /** 메뉴·결과 창 안쪽 맨 위에 넣는 띠 (창이 없을 때는 화면 위쪽 가운데에 띄움) */
  inline?: boolean;
}

/**
 * 친구 대결 준비 띠 (선수 화면 위쪽 가운데).
 * 상대가 먼저 준비하면 [VR 배틀 시작]·[PC로 시작]과 자동 시작까지 남은 초를,
 * 내가 먼저 준비하면 상대를 기다리는 중과 [준비 취소]를 보여 줌.
 * 상대 헤드셋은 그 기기에서 직접 버튼을 눌러야 VR에 들어갈 수 있어서 이렇게 서로 기다려 줌.
 * 메뉴·결과 창이 열려 있으면 창 안쪽 맨 위(inline)에 넣어 창 머리글을 가리지 않게 하고,
 * 창이 없으면 화면 위쪽 가운데에 띄움 (순위표·설정 창 z-120 아래)
 */
export function ReadyBanner({ mySlot, meReady, rivalReady, deadlineAt, isVRSupported, onEnterVR, onStartPC, onCancel, inline = false }: ReadyBannerProps) {
  const seconds = useSecondsLeft(deadlineAt);
  const rival = mySlot === 1 ? '2P' : '1P';
  const countdown = deadlineAt > 0 && seconds > 0 ? `${seconds}초 뒤 자동 시작` : '곧 시작';

  let title: string;
  let detail: string;
  if (meReady && rivalReady) {
    title = '둘 다 준비 완료!';
    detail = '곧 시작해요';
  } else if (meReady) {
    title = `${rival}를 기다리는 중`;
    detail = `${rival}가 시작을 누르면 바로 시작해요 · ${countdown}`;
  } else {
    title = `${rival}가 준비했어요!`;
    detail = `시작을 누르면 바로 경기가 시작돼요 · ${countdown}`;
  }

  const callToAction = rivalReady && !meReady;
  const content = (
    <>
      <div className="flex min-w-0 items-center gap-3">
        <StatusDot tone={callToAction ? 'gold' : 'ok'} pulse />
        <div className="min-w-0">
          <p className={cx('text-[18px] font-bold leading-tight', callToAction ? 'text-gold' : 'text-fg')}>{title}</p>
          <p className="mt-0.5 text-[14px] leading-snug text-fg-2">{detail}</p>
        </div>
      </div>
      {!meReady && (
        <div className="ml-auto flex items-center gap-2">
          {isVRSupported && (
            <Button id="btn-ready-vr" variant="vr" size="md" icon={Headset} onClick={onEnterVR}>
              VR 배틀 시작
            </Button>
          )}
          <Button id="btn-ready-pc" variant={isVRSupported ? 'secondary' : 'primary'} size="md" icon={MousePointerClick} onClick={onStartPC}>
            PC로 시작
          </Button>
        </div>
      )}
      {meReady && !rivalReady && (
        <Button id="btn-ready-cancel" className="ml-auto" variant="ghost" size="md" icon={X} onClick={onCancel} title="준비를 취소해요 (ESC)">
          준비 취소
        </Button>
      )}
    </>
  );

  if (inline) {
    return (
      <div
        id="ready-banner"
        role="status"
        aria-live="polite"
        className={cx(
          'hud-interactive flex flex-wrap items-center gap-x-5 gap-y-2 border-b px-6 py-3 short:py-2',
          callToAction ? 'border-gold/35 bg-gold/8' : 'border-ok/30 bg-ok/6'
        )}
      >
        {content}
      </div>
    );
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[115] flex justify-center px-4" role="status" aria-live="polite">
      <Panel
        id="ready-banner"
        interactive
        solid
        accent={callToAction ? 'gold' : mySlot === 1 ? 'p1' : 'p2'}
        className="pointer-events-auto flex max-w-full flex-wrap items-center gap-x-5 gap-y-3 px-5 py-3.5 shadow-[0_12px_40px_rgb(0_0_0/0.55)]"
      >
        {content}
      </Panel>
    </div>
  );
}
