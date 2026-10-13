'use client';

import React, { useState } from 'react';
import { Check, Mic, Monitor, Settings } from 'lucide-react';
import { ThemeType, TargetShape, Difficulty, SoundPresetType, ClientRole } from '@/types';
import { VoiceManager } from '@/core/audio/VoiceManager';
import { DEMO_FX_LEVEL } from '@/core/audio/SoundManager';
import { DIFFICULTY_HINT, DIFFICULTY_NAME, ROLE_NAME, SHAPE_NAME, THEME_NAME } from '@/constants/labels';
import { Button, ModalShell, Segmented, Slider } from '@/components/ui/kit';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTheme: ThemeType;
  currentShape: TargetShape;
  currentDifficulty: Difficulty;
  onSelectTheme: (theme: ThemeType) => void;
  onSelectShape: (shape: TargetShape) => void;
  onSelectDifficulty: (diff: Difficulty) => void;
  serverHost: string;
  onUpdateServerHost: (host: string) => void;
  sensitivity: number;
  onUpdateSensitivity: (val: number) => void;
  soundPreset: SoundPresetType;
  onSelectSoundPreset: (preset: SoundPresetType) => void;
  soundVolume: number;
  onUpdateSoundVolume: (vol: number) => void;
  voiceEnabled: boolean;
  onToggleVoice: (enabled: boolean) => void;
  voiceVolume: number;
  onUpdateVoiceVolume: (vol: number) => void;
  clientRole?: ClientRole;
  onSelectRole?: (role: ClientRole) => void;
  /** 관전 TV 소리를 꺼 둠 (미리 듣기도 들리지 않음을 알림) */
  soundMuted?: boolean;
}

const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];
const THEMES: ThemeType[] = ['cyber', 'space', 'city'];
const SHAPES: TargetShape[] = ['drone', 'sphere', 'cube', 'disc'];

const SOUND_OPTIONS: { value: SoundPresetType; label: string; hint: string }[] = [
  { value: 'laser', label: 'SF 레이저', hint: '미래형 광선 소리' },
  { value: 'kinetic', label: '실탄', hint: '묵직한 총소리' },
  { value: 'retro', label: '8비트', hint: '오락실 게임 소리' },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line pt-5 first:border-t-0 first:pt-0">
      <h3 className="mb-4 text-[13px] font-bold tracking-wide text-fg-3">{title}</h3>
      <div className="flex flex-col gap-5">{children}</div>
    </section>
  );
}

function Field({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[14px] font-semibold text-fg">{label}</span>
      {children}
      {note && <p className="text-[13px] leading-relaxed text-fg-3">{note}</p>}
    </div>
  );
}

/** 환경설정: 경기 · 소리 · 조작 · 이 기기 */
export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  currentTheme,
  currentShape,
  currentDifficulty,
  onSelectTheme,
  onSelectShape,
  onSelectDifficulty,
  serverHost,
  onUpdateServerHost,
  sensitivity,
  onUpdateSensitivity,
  soundPreset,
  onSelectSoundPreset,
  soundVolume,
  onUpdateSoundVolume,
  voiceEnabled,
  onToggleVoice,
  voiceVolume,
  onUpdateVoiceVolume,
  clientRole = 'P1',
  onSelectRole,
  soundMuted = false,
}) => {
  const [hostInput, setHostInput] = useState(serverHost);
  const [hostSaved, setHostSaved] = useState(false);

  if (!isOpen) return null;

  const handleSaveHost = () => {
    onUpdateServerHost(hostInput.trim());
    setHostSaved(true);
  };

  // 고르면 효과음을 한 번 들려줌 (엔진이 소리 설정을 바꾸며 미리 듣기 소리를 냄)
  const handleTestSound = (preset: SoundPresetType) => {
    onSelectSoundPreset(preset);
  };

  return (
    <ModalShell
      layer="settings"
      size="lg"
      accent="p1"
      eyebrow="환경설정"
      icon={Settings}
      title="게임 설정"
      onClose={onClose}
      footer={
        <div className="flex justify-end">
          <Button variant="primary" size="lg" icon={Check} onClick={onClose}>
            설정 완료
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <Section title="경기">
          <Field label="난이도" note="표적 속도·크기와 AI 라이벌의 실력이 함께 바뀌어요. 친구와 대결하면 경기를 시작한 쪽의 난이도로 맞춰져요.">
            <Segmented
              label="난이도"
              value={currentDifficulty}
              onChange={onSelectDifficulty}
              options={DIFFICULTIES.map((d) => ({ value: d, label: DIFFICULTY_NAME[d], hint: DIFFICULTY_HINT[d] }))}
            />
          </Field>
          <Field label="경기장 테마" note="이 기기 화면에만 적용돼요.">
            <Segmented label="경기장 테마" value={currentTheme} onChange={onSelectTheme} options={THEMES.map((t) => ({ value: t, label: THEME_NAME[t] }))} />
          </Field>
          <Field label="표적 모양">
            <Segmented label="표적 모양" value={currentShape} onChange={onSelectShape} options={SHAPES.map((s) => ({ value: s, label: SHAPE_NAME[s] }))} />
          </Field>
        </Section>

        <Section title="소리">
          <Field label="사격 효과음" note="고르면 바로 들려줘요.">
            <Segmented label="사격 효과음" value={soundPreset} onChange={handleTestSound} options={SOUND_OPTIONS} />
          </Field>
          <Slider label="효과음 크기" value={soundVolume} min={0} max={1} step={0.05} onChange={onUpdateSoundVolume} format={(v) => `${Math.round(v * 100)}%`} />
          <Field label="음성 안내">
            <div className="flex items-center gap-2">
              <Segmented
                label="음성 안내"
                value={voiceEnabled ? 'on' : 'off'}
                onChange={(v) => onToggleVoice(v === 'on')}
                options={[
                  { value: 'on', label: '켜기' },
                  { value: 'off', label: '끄기' },
                ]}
                className="w-56"
              />
              <Button variant="secondary" icon={Mic} disabled={!voiceEnabled} onClick={() => VoiceManager.getInstance().speak('GAME_START', { force: true })}>
                들어 보기
              </Button>
            </div>
          </Field>
          <Slider
            label="음성 크기"
            value={voiceVolume}
            min={0}
            max={1}
            step={0.05}
            disabled={!voiceEnabled}
            onChange={onUpdateVoiceVolume}
            format={(v) => `${Math.round(v * 100)}%`}
          />
          <p className="text-[13px] leading-relaxed text-fg-3">
            소리 설정은 이 기기에 저장돼요.
            {clientRole === 'SPECTATOR' && ` 대기 화면의 AI 시연은 효과음 크기의 ${Math.round(DEMO_FX_LEVEL * 100)}%로 작게 나요.`}
          </p>
          {soundMuted && (
            <p className="text-[13px] font-semibold leading-relaxed text-warn">
              TV 소리를 꺼 두어 미리 듣기도 들리지 않아요. 오른쪽 위 [소리 켜기] 버튼이나 M 키로 켜세요.
            </p>
          )}
        </Section>

        <Section title="조작 (PC)">
          <Slider label="조준 감도" value={sensitivity} min={0.5} max={2.5} step={0.1} onChange={onUpdateSensitivity} format={(v) => `${v.toFixed(1)}배`} />
        </Section>

        <Section title="이 기기">
          <Field
            label="기기 역할 고정"
            note={`지금: ${ROLE_NAME[clientRole]}. 고른 역할은 이 브라우저에 저장되어 헤드셋이 잠들었다 깨거나 새로고침해도 바뀌지 않아요.`}
          >
            <Segmented
              label="기기 역할"
              value={clientRole}
              onChange={(r) => onSelectRole?.(r)}
              options={[
                { value: 'P1', label: '1P', hint: '플레이어 1 · 시안' },
                { value: 'P2', label: '2P', hint: '플레이어 2 · 마젠타' },
                { value: 'SPECTATOR', label: '관전', hint: 'TV·모니터 중계' },
              ]}
            />
          </Field>
          <Field label="릴레이 서버 주소" note="게임 서버를 켠 PC의 주소예요. 보통은 바꿀 필요가 없어요.">
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <Monitor className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" aria-hidden="true" />
                <input
                  type="text"
                  value={hostInput}
                  onChange={(e) => {
                    setHostInput(e.target.value);
                    setHostSaved(false);
                  }}
                  placeholder="localhost"
                  aria-label="릴레이 서버 주소"
                  className="hud-interactive h-11 w-full rounded-lg border border-line-strong bg-ink/70 pl-9 pr-3 font-num text-[16px] text-fg outline-none transition-colors placeholder:text-fg-3 focus:border-p1"
                />
              </div>
              <Button variant="secondary" icon={hostSaved ? Check : undefined} onClick={handleSaveHost}>
                {hostSaved ? '저장됨' : '저장'}
              </Button>
            </div>
          </Field>
        </Section>
      </div>
    </ModalShell>
  );
};
