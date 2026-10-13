'use client';

import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Bot,
  Crosshair,
  GraduationCap,
  Headset,
  Info,
  MousePointerClick,
  RotateCcw,
  Settings,
  Swords,
  Trophy,
  TriangleAlert,
  Tv,
  Users,
  Zap,
} from 'lucide-react';
import { ThemeType, TargetShape, Difficulty, ClientRole, ConnectionIssue } from '@/types';
import {
  DIFFICULTY_HINT,
  DIFFICULTY_NAME,
  KEYWORDS_1PT,
  KEYWORDS_2PT,
  KEYWORDS_MINUS,
  ROLE_NAME,
  ROLE_SHORT,
  SHAPE_NAME,
  THEME_NAME,
} from '@/constants/labels';
import { Button, ButtonLink, Kbd, Panel, Pill, Segmented, Stat, cx } from '@/components/ui/kit';
import { Logo } from '@/components/ui/hud/broadcast/Logo';

export type MenuStep = 'welcome' | 'intro' | 'guide';

const STEPS: { id: MenuStep; label: string }[] = [
  { id: 'welcome', label: '게임 소개' },
  { id: 'intro', label: '대결 규칙' },
  { id: 'guide', label: '조작 방법' },
];

interface MainMenuModalProps {
  isOpen: boolean;
  onStart: () => void;
  onEnterVR: () => void;
  onJoinAsSpectator?: () => void;
  onOpenSettings: () => void;
  onOpenLeaderboard?: () => void;
  currentTheme: ThemeType;
  currentShape: TargetShape;
  currentDifficulty: Difficulty;
  onSelectDifficulty?: (diff: Difficulty) => void;
  highScore: number;
  clientRole?: ClientRole;
  versusMode?: 'VERSUS_PVP' | 'VERSUS_AI';
  isP1Connected?: boolean;
  isP2Connected?: boolean;
  /** 역할 자리 관련 연결 문제 (다른 기기가 사용 중 등) */
  connectionIssue?: ConnectionIssue | null;
  /** 머리글 아래 전체 너비 알림 (친구 대결 준비 띠) */
  notice?: React.ReactNode;
}

/**
 * 메인 메뉴(로비): 3단계 안내(게임 소개 → 대결 규칙 → 조작 방법)와
 * 어느 단계에서나 누를 수 있는 시작 버튼(VR · PC · 관전)
 */
export const MainMenuModal: React.FC<MainMenuModalProps> = ({
  isOpen,
  onStart,
  onEnterVR,
  onJoinAsSpectator,
  onOpenSettings,
  onOpenLeaderboard,
  currentTheme,
  currentShape,
  currentDifficulty,
  onSelectDifficulty,
  highScore,
  clientRole = 'P1',
  versusMode = 'VERSUS_AI',
  isP1Connected = false,
  isP2Connected = false,
  connectionIssue = null,
  notice,
}) => {
  const [step, setStep] = useState<MenuStep>('welcome');

  if (!isOpen) return null;

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const next = STEPS[stepIndex + 1];
  const prev = STEPS[stepIndex - 1];
  const isSpectator = clientRole === 'SPECTATOR';
  const mySlot: 1 | 2 = clientRole === 'P2' ? 2 : 1;
  const rivalConnected = mySlot === 1 ? isP2Connected : isP1Connected;
  const isPvPReady = versusMode === 'VERSUS_PVP' || rivalConnected;

  return (
    <div className="modal-backdrop z-[100] bg-[radial-gradient(ellipse_at_center,rgb(7_11_20/0.62)_0%,rgb(7_11_20/0.92)_70%)]">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="메인 메뉴"
        className="relative flex max-h-[min(94vh,960px)] w-full max-w-[1200px] flex-col overflow-hidden rounded-2xl border border-line-strong bg-panel/94 shadow-panel animate-fade-in motion-reduce:animate-none"
      >
        <span className="pointer-events-none absolute inset-x-16 top-0 h-px bg-linear-to-r from-transparent via-p1 to-transparent" aria-hidden="true" />

        {/* 머리: 로고 · 학교 · 보조 메뉴 */}
        <header className="flex items-center justify-between gap-3 border-b border-line px-6 py-3.5 short:py-2">
          <div className="flex min-w-0 items-center gap-4">
            <Logo className="text-[24px]" />
            <span className="hidden h-6 w-px bg-line-strong md:block" aria-hidden="true" />
            <span className="hidden items-center gap-2 truncate text-[20px] font-bold text-gold md:flex">
              <GraduationCap className="size-6 shrink-0" aria-hidden="true" />
              인천전자마이스터고 정보통신과
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <ButtonLink href="/manual.html" target="_blank" rel="noopener noreferrer" variant="ghost" size="sm" icon={BookOpen}>
              도움말
            </ButtonLink>
            {onOpenLeaderboard && (
              <Button variant="ghost" size="sm" icon={Trophy} onClick={onOpenLeaderboard}>
                순위표
              </Button>
            )}
            <Button variant="ghost" size="sm" icon={Settings} onClick={onOpenSettings}>
              환경설정
            </Button>
          </div>
        </header>

        {connectionIssue && (
          <div role="alert" className="flex items-center gap-2.5 border-b border-danger/40 bg-danger/12 px-6 py-2.5 text-[15px] font-semibold text-[#fecaca]">
            <TriangleAlert className="size-5 shrink-0 text-danger" aria-hidden="true" />
            {connectionIssue === 'slot_busy'
              ? '이 역할은 다른 기기가 사용 중 · 자리가 비면 자동으로 접속합니다'
              : '같은 역할로 새로 접속되어 연결 해제됨 · 새로고침하세요'}
          </div>
        )}

        {notice}

        {/* 상태 · 단계 탭 */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-ink/30 px-6 py-3 short:py-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Pill tone={isSpectator ? 'gold' : mySlot === 1 ? 'p1' : 'p2'} size="lg">
              <span className="font-num font-bold">{ROLE_SHORT[clientRole]}</span>
              <span className="ml-1.5 text-fg">{ROLE_NAME[clientRole]}</span>
            </Pill>
            {!isSpectator &&
              (isPvPReady ? (
                <Pill tone="ok" icon={Users} size="lg">
                  친구와 1:1 대결
                </Pill>
              ) : (
                <Pill tone="ai" icon={Bot} size="lg">
                  AI 라이벌과 대결 · {DIFFICULTY_NAME[currentDifficulty]}
                </Pill>
              ))}
          </div>
          <div role="tablist" aria-label="안내 단계" className="hud-interactive flex items-center gap-1 rounded-xl border border-line bg-ink/55 p-1">
            {STEPS.map((s, i) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={step === s.id}
                onClick={(e) => {
                  setStep(s.id);
                  if (e.detail > 0) e.currentTarget.blur();
                }}
                className={cx(
                  'flex h-9 cursor-pointer items-center gap-2 rounded-lg px-3 text-[14px] font-semibold transition-colors',
                  step === s.id ? 'bg-raised text-fg ring-1 ring-p1/70' : 'text-fg-2 hover:bg-white/6 hover:text-fg'
                )}
              >
                <span
                  className={cx(
                    'flex size-5 items-center justify-center rounded-full font-num text-[13px] font-bold',
                    step === s.id ? 'bg-p1 text-ink' : 'bg-white/10 text-fg-2'
                  )}
                >
                  {i + 1}
                </span>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* 본문 */}
        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-6 py-6 short:py-4">
          {step === 'welcome' && (
            <WelcomeStep
              mySlot={mySlot}
              isSpectator={isSpectator}
              rivalConnected={rivalConnected}
              isPvPReady={isPvPReady}
              highScore={highScore}
              difficulty={currentDifficulty}
              theme={currentTheme}
              shape={currentShape}
            />
          )}
          {step === 'intro' && <RulesStep difficulty={currentDifficulty} onSelectDifficulty={onSelectDifficulty} />}
          {step === 'guide' && <ControlsStep />}
        </div>

        {/* 아래: 단계 이동 · 시작 버튼 */}
        <footer className="flex flex-wrap items-center gap-3 border-t border-line bg-ink/50 px-6 py-4 short:py-2.5">
          <div className="flex items-center gap-2">
            <Button variant="ghost" icon={ArrowLeft} disabled={!prev} onClick={() => prev && setStep(prev.id)} aria-label="이전 단계">
              이전
            </Button>
            <Button
              variant="secondary"
              disabled={!next}
              onClick={() => next && setStep(next.id)}
              trailing={<ArrowRight className="size-[18px]" aria-hidden="true" />}
              aria-label="다음 단계"
            >
              {next ? `다음: ${next.label}` : '마지막 단계'}
            </Button>
          </div>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {isSpectator ? (
              <Button variant="primary" size="xl" icon={Tv} onClick={onJoinAsSpectator}>
                관전 화면 시작
              </Button>
            ) : (
              <>
                {onJoinAsSpectator && (
                  <Button variant="ghost" icon={Tv} onClick={onJoinAsSpectator} title="이 기기를 관전(TV 중계) 화면으로 바꿔요">
                    관전 화면으로
                  </Button>
                )}
                <Button variant="secondary" size="lg" icon={MousePointerClick} onClick={onStart} title="마우스와 키보드로 플레이">
                  PC로 플레이
                </Button>
                <Button variant="vr" size="xl" icon={Headset} onClick={onEnterVR}>
                  VR 배틀 시작
                </Button>
              </>
            )}
          </div>
        </footer>
      </section>
    </div>
  );
};

function Feature({ icon: Icon, title, desc, tone }: { icon: typeof Crosshair; title: string; desc: string; tone: 'p1' | 'p2' | 'gold' }) {
  const color = tone === 'p1' ? 'text-p1' : tone === 'p2' ? 'text-p2' : 'text-gold';
  return (
    <li className="rounded-xl border border-line bg-ink/40 p-4 short:p-3">
      <Icon className={cx('size-7 short:size-6', color)} strokeWidth={1.8} aria-hidden="true" />
      <p className="mt-3 text-[17px] font-bold text-fg short:mt-2">{title}</p>
      <p className="mt-1 text-[14px] leading-relaxed text-fg-2">{desc}</p>
    </li>
  );
}

/** 메뉴의 자리 한 줄: 이 기기 / 입장(접속함) / AI가 맡아요 */
function SlotLine({ slot, label, state }: { slot: 1 | 2; label: string; state: 'me' | 'joined' | 'ai' }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line bg-ink/40 px-3 py-2.5">
      <span className={cx('h-7 w-1 rounded-full', slot === 1 ? 'bg-p1' : 'bg-p2')} aria-hidden="true" />
      <span className={cx('font-num text-[18px] font-bold', slot === 1 ? 'text-p1' : 'text-p2')}>{slot}P</span>
      <span className="truncate text-[15px] font-semibold text-fg">{label}</span>
      <span className="ml-auto">
        {state === 'me' ? (
          <Pill tone="neutral" size="sm">
            이 기기
          </Pill>
        ) : state === 'joined' ? (
          <Pill tone="ok" dot size="sm">
            입장
          </Pill>
        ) : (
          <Pill tone="ai" icon={Bot} size="sm">
            AI가 맡아요
          </Pill>
        )}
      </span>
    </div>
  );
}

function WelcomeStep({
  mySlot,
  isSpectator,
  rivalConnected,
  isPvPReady,
  highScore,
  difficulty,
  theme,
  shape,
}: {
  mySlot: 1 | 2;
  isSpectator: boolean;
  rivalConnected: boolean;
  isPvPReady: boolean;
  highScore: number;
  difficulty: Difficulty;
  theme: ThemeType;
  shape: TargetShape;
}) {
  const rivalSlot: 1 | 2 = mySlot === 1 ? 2 : 1;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <div>
        <p className="text-[15px] font-semibold text-p1">Meta Quest 2</p>
        <h1 className="mt-2 text-[40px] font-black leading-[1.1] tracking-tight text-fg md:text-[52px] short:mt-1 short:text-[34px]">1:1 VR 사격 배틀</h1>
        <p className="mt-3 text-[18px] font-medium leading-relaxed text-fg-2 md:text-[20px] short:mt-1.5 short:text-[16px]">
          친구와 함께 Meta Quest 2를 쓰고 즐기는 60초 레이저 사격 대결
        </p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-3 short:mt-4">
          <Feature icon={Crosshair} tone="p1" title="내 손으로 조준" desc="컨트롤러를 겨누는 곳으로 레이저가 나가요" />
          <Feature icon={Swords} tone="gold" title="점수 줄다리기" desc="같은 표적은 먼저 맞힌 사람이 점수를 가져가요" />
          <Feature icon={Bot} tone="p2" title="혼자 와도 OK" desc="친구가 없으면 AI 라이벌이 상대해 줘요" />
        </ul>
      </div>
      <Panel solid className="p-5">
        <p className="text-[13px] font-bold tracking-wide text-fg-3">이번 경기</p>
        {isSpectator ? (
          <p className="mt-3 text-[15px] leading-relaxed text-fg-2">
            이 기기는 관전 화면이에요. 아래 <b className="text-fg">관전 화면 시작</b>을 누르면 TV 중계 화면으로 바뀌어요.
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            <SlotLine slot={1} label={mySlot === 1 || rivalConnected ? ROLE_NAME.P1 : 'AI 라이벌'} state={mySlot === 1 ? 'me' : rivalConnected ? 'joined' : 'ai'} />
            <SlotLine slot={2} label={mySlot === 2 || rivalConnected ? ROLE_NAME.P2 : 'AI 라이벌'} state={mySlot === 2 ? 'me' : rivalConnected ? 'joined' : 'ai'} />
          </div>
        )}
        {!isSpectator && (
          <p className="mt-3 text-[13px] leading-relaxed text-fg-3">
            {isPvPReady
              ? '두 사람 모두 입장했어요. 둘 다 시작을 누르면 경기가 시작돼요. 한 명만 누르면 15초 뒤에 시작해요.'
              : `${rivalSlot}P 자리가 비어 있어 AI 라이벌과 대결해요. 친구가 접속하면 1:1 대결로 바뀌어요.`}
          </p>
        )}
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4">
          <Stat label="이 기기 최고 기록" value={highScore > 0 ? highScore : '-'} unit={highScore > 0 ? '점' : undefined} valueClassName="text-gold" />
          <Stat label="난이도" value={DIFFICULTY_NAME[difficulty]} numeric={false} />
        </div>
        <p className="mt-4 text-[13px] text-fg-3">
          경기장 {THEME_NAME[theme]} · 표적 {SHAPE_NAME[shape]}
        </p>
      </Panel>
    </div>
  );
}

function RulesStep({ difficulty, onSelectDifficulty }: { difficulty: Difficulty; onSelectDifficulty?: (d: Difficulty) => void }) {
  const rules = [
    { title: '60초 타임어택', desc: '날아다니는 드론 표적을 60초 동안 맞혀요' },
    { title: '먼저 맞힌 사람이 점수', desc: '같은 표적은 먼저 맞힌 사람만 점수를 얻어요' },
    { title: '점수 줄다리기', desc: '화면 위 막대가 앞선 사람 쪽으로 밀려요. 끝났을 때 점수가 높으면 승리!' },
  ];
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel solid className="p-5">
        <p className="text-[13px] font-bold tracking-wide text-fg-3">대결 규칙</p>
        <ol className="mt-3 flex flex-col gap-3">
          {rules.map((r, i) => (
            <li key={r.title} className="flex gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-p1/15 font-num text-[15px] font-bold text-p1">{i + 1}</span>
              <span>
                <span className="block text-[16px] font-bold text-fg">{r.title}</span>
                <span className="block text-[14px] leading-relaxed text-fg-2">{r.desc}</span>
              </span>
            </li>
          ))}
        </ol>
        <div className="mt-5 rounded-xl border border-gold/35 bg-gold/6 p-4">
          <p className="text-[14px] font-bold text-gold">표적 점수 · 정보통신과 핵심 단어</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-gold px-2 py-0.5 font-num text-[15px] font-bold text-ink">2점</span>
            {KEYWORDS_2PT.map((k) => (
              <span key={k} className="rounded-md border border-gold/60 bg-gold/12 px-2.5 py-0.5 text-[17px] font-extrabold text-gold">
                {k}
              </span>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-raised px-2 py-0.5 font-num text-[15px] font-bold text-fg">1점</span>
            {KEYWORDS_1PT.map((k) => (
              <span key={k} className="rounded-md border border-line-strong bg-ink/50 px-2.5 py-0.5 text-[17px] font-bold text-fg">
                {k}
              </span>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-danger px-2 py-0.5 font-num text-[15px] font-bold text-ink">-1점</span>
            {KEYWORDS_MINUS.map((k) => (
              <span key={k} className="rounded-md border border-danger/60 bg-danger/12 px-2.5 py-0.5 text-[17px] font-extrabold text-danger">
                {k}
              </span>
            ))}
            <span className="text-[13px] font-semibold text-fg-2">맞히면 1점 깎여요</span>
          </div>
        </div>
      </Panel>
      <Panel solid className="p-5">
        <p className="text-[13px] font-bold tracking-wide text-fg-3">난이도</p>
        <p className="mt-2 text-[14px] leading-relaxed text-fg-2">표적의 속도·크기와 AI 라이벌의 실력이 함께 바뀌어요.</p>
        <Segmented
          vertical
          label="난이도"
          className="mt-3"
          value={difficulty}
          onChange={(d) => onSelectDifficulty?.(d)}
          options={(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => ({ value: d, label: DIFFICULTY_NAME[d], hint: DIFFICULTY_HINT[d] }))}
        />
      </Panel>
    </div>
  );
}

function ControlCard({ icon: Icon, title, vr, pc, note }: { icon: typeof Crosshair; title: string; vr: string; pc: string; note?: string }) {
  return (
    <Panel solid className="p-5">
      <div className="flex items-center gap-2.5">
        <span className="flex size-10 items-center justify-center rounded-lg bg-p1/12">
          <Icon className="size-5 text-p1" strokeWidth={2} aria-hidden="true" />
        </span>
        <p className="text-[19px] font-bold text-fg">{title}</p>
      </div>
      <dl className="mt-4 flex flex-col gap-2.5 text-[14px]">
        <div className="flex items-center justify-between gap-2 rounded-lg bg-ink/45 px-3 py-2">
          <dt className="flex items-center gap-1.5 text-fg-3">
            <Headset className="size-4" aria-hidden="true" />
            Quest 2
          </dt>
          <dd className="text-right font-semibold text-fg">{vr}</dd>
        </div>
        <div className="flex items-center justify-between gap-2 rounded-lg bg-ink/45 px-3 py-2">
          <dt className="flex items-center gap-1.5 text-fg-3">
            <MousePointerClick className="size-4" aria-hidden="true" />
            PC
          </dt>
          <dd className="text-right font-semibold text-fg">{pc}</dd>
        </div>
      </dl>
      {note && <p className="mt-3 text-[13px] text-fg-3">{note}</p>}
    </Panel>
  );
}

function ControlsStep() {
  return (
    <div>
      <div className="grid gap-4 md:grid-cols-3">
        <ControlCard icon={Crosshair} title="조준" vr="컨트롤러로 겨누기" pc="마우스 움직이기" />
        <ControlCard icon={Zap} title="발사" vr="트리거 (검지 방아쇠)" pc="클릭 · Space" />
        <ControlCard icon={RotateCcw} title="재장전" vr="그립 (옆면 버튼)" pc="우클릭 · R" note="10발을 다 쏘면 재장전해요" />
      </div>
      <p className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-ink/40 px-4 py-3 text-[14px] leading-relaxed text-fg-2">
        <Info className="size-4 shrink-0 text-p1" aria-hidden="true" />
        <span>VR에서 나가려면</span>
        <Kbd>A</Kbd>
        <span>또는</span>
        <Kbd>B</Kbd>
        <span>버튼을 1초 넘게 누르세요. 경기 중이 아니면 한 번만 눌러도 나가요.</span>
      </p>
    </div>
  );
}
