'use client';

import React, { useState } from 'react';
import { ThemeType, TargetShape, Difficulty, ClientRole } from '@/types';
import { useParallaxTilt } from '@/hooks/useParallaxTilt';
import {
  Activity,
  Sliders,
  Tv,
  Play,
  Headset,
  Trophy,
  BookOpen,
  Check,
  Shield,
  Target,
  Zap,
  RotateCcw,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Swords,
  Radio,
  GraduationCap,
  Flame,
} from 'lucide-react';

export type MenuStep = 'welcome' | 'intro' | 'guide';

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
  isP2Connected?: boolean;
}

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
  isP2Connected = false,
}) => {
  const [currentStep, setCurrentStep] = useState<MenuStep>('welcome');

  const { ref: tiltRef, tiltStyle, onMouseMove, onMouseLeave } = useParallaxTilt<HTMLDivElement>({
    maxTilt: 3.0,
    perspective: 1400,
    scale: 1.005,
  });

  if (!isOpen) return null;

  const getThemeKorean = (t: ThemeType) => {
    switch (t) {
      case 'cyber': return '사이버 미래 도시';
      case 'space': return '심우주 은하계';
      case 'city': return '네온 메트로폴리스';
      default: return t;
    }
  };

  const getShapeKorean = (s: TargetShape) => {
    switch (s) {
      case 'drone': return '전술 비행 드론';
      case 'sphere': return '에너지 코어 구체';
      case 'cube': return '네온 큐브 블록';
      case 'disc': return '초고속 비행 디스크';
      default: return s;
    }
  };

  const getRoleKorean = (r: ClientRole) => {
    switch (r) {
      case 'P1': return '선수 1 (1P 청록)';
      case 'P2': return '선수 2 (2P 핑크)';
      case 'SPECTATOR': return '방송 관람객';
      default: return r;
    }
  };

  const isPvPReady = versusMode === 'VERSUS_PVP' || isP2Connected;

  return (
    <div className="modal-backdrop glass-scanlines">
      {/* 메인 콕핏 모달 컨테이너 (3D Parallax Tilt + Obsidian Glass + 4-Corner Brackets) */}
      <div
        ref={tiltRef}
        style={tiltStyle}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        className="cyber-glass obsidian-card hud-bracket-box-all bracket-cyan boot-frame hologram-scanlines hologram-dots relative w-full max-w-5xl mx-auto flex flex-col justify-between min-h-[76vh] max-h-[92vh] p-5 md:p-7 pointer-events-auto overflow-hidden border border-cyan-400/40 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.85),0_0_30px_rgba(0,240,255,0.15)]"
      >
        
        {/* =================================================================== */}
        {/* 1. 상단 글로벌 HUD 헤더 (학교 및 학과 브랜딩 & 정밀 텔레메트리 바) */}
        {/* =================================================================== */}
        <header className="w-full flex flex-col gap-3 border-b border-cyan-500/20 pb-3">
          {/* 최상단 학교 & 학과 공식 타이틀 바 */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {/* 인천전자마이스터고 정보통신과 엠블럼 */}
              <div className="flex items-center gap-1.5 px-3 py-1 rounded border border-yellow-400/50 bg-yellow-950/40 text-yellow-300 font-bold text-xs sm:text-sm shadow-md shadow-yellow-900/30">
                <GraduationCap className="w-4 h-4 text-yellow-400" />
                <span className="tracking-wide text-white">인천전자마이스터고</span>
                <span className="text-gray-500">|</span>
                <span className="text-cyan-300 font-extrabold">정보통신과</span>
              </div>

              {/* 시스템 링크 및 역할 배정 */}
              <div className="flex items-center gap-1.5 font-mono text-cyan-400 px-2 py-0.5 border border-cyan-500/30 rounded bg-cyan-950/30">
                <Activity className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                <span>[{getRoleKorean(clientRole)}]</span>
              </div>

              {/* 1:1 PvP 매칭 상태 */}
              <div>
                {isPvPReady ? (
                  <span className="text-emerald-400 font-bold flex items-center gap-1 font-mono text-[11px] px-2 py-0.5 border border-emerald-500/30 rounded bg-emerald-950/20">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    [1:1 친구 대결 준비완료]
                  </span>
                ) : (
                  <span className="text-amber-400 font-bold flex items-center gap-1 font-mono text-[11px] px-2 py-0.5 border border-amber-500/30 rounded bg-amber-950/20">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    [AI 로봇 대결 대기중]
                  </span>
                )}
              </div>
            </div>

            {/* 우측 보조 메뉴 & 가상 텔레메트리 스탬프 */}
            <div className="flex items-center gap-3 self-end sm:self-auto text-xs font-mono">
              <div className="hidden lg:flex items-center gap-2.5 text-[10px] font-mono text-slate-400 border border-cyan-500/25 px-2.5 py-0.5 rounded bg-black/40">
                <span className="hud-data-stamp">SYS: <b>NOMINAL</b></span>
                <span className="text-gray-600">|</span>
                <span className="hud-data-stamp">CORE_HZ: <b>90.0</b></span>
                <span className="text-gray-600">|</span>
                <span className="hud-data-stamp">LATENCY: <b>&lt;12ms</b></span>
              </div>
              <a
                href="/manual.html"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-white underline flex items-center gap-1"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>도움말</span>
              </a>
              <button
                onClick={onOpenSettings}
                className="text-gray-400 hover:text-cyan-300 underline flex items-center gap-1 cursor-pointer"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>환경설정</span>
              </button>
            </div>
          </div>

          {/* 3단계 시퀀스 스텝 인디케이터 바 */}
          <div className="flex items-center justify-center gap-1.5 sm:gap-3 pt-1 text-xs">
            {/* Step 1 버튼 */}
            <button
              onClick={() => setCurrentStep('welcome')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full transition-all cursor-pointer backdrop-blur-md ${
                currentStep === 'welcome'
                  ? 'border border-cyan-400 bg-cyan-500/20 text-cyan-200 font-extrabold shadow-[0_0_12px_rgba(0,240,255,0.35)]'
                  : 'text-gray-400 hover:text-gray-200 border border-slate-700/50 bg-slate-900/30'
              }`}
            >
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${
                currentStep === 'welcome' ? 'bg-cyan-400 text-black font-extrabold' : 'bg-slate-800 text-gray-400'
              }`}>1</span>
              <span>게임 소개 (Welcome)</span>
            </button>

            <span className="text-cyan-500/40">➔</span>

            {/* Step 2 버튼 */}
            <button
              onClick={() => setCurrentStep('intro')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full transition-all cursor-pointer backdrop-blur-md ${
                currentStep === 'intro'
                  ? 'border border-cyan-400 bg-cyan-500/20 text-cyan-200 font-extrabold shadow-[0_0_12px_rgba(0,240,255,0.35)]'
                  : 'text-gray-400 hover:text-gray-200 border border-slate-700/50 bg-slate-900/30'
              }`}
            >
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${
                currentStep === 'intro' ? 'bg-cyan-400 text-black font-extrabold' : 'bg-slate-800 text-gray-400'
              }`}>2</span>
              <span>대결 룰 (Intro)</span>
            </button>

            <span className="text-cyan-500/40">➔</span>

            {/* Step 3 버튼 */}
            <button
              onClick={() => setCurrentStep('guide')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full transition-all cursor-pointer backdrop-blur-md ${
                currentStep === 'guide'
                  ? 'border border-cyan-400 bg-cyan-500/20 text-cyan-200 font-extrabold shadow-[0_0_12px_rgba(0,240,255,0.35)]'
                  : 'text-gray-400 hover:text-gray-200 border border-slate-700/50 bg-slate-900/30'
              }`}
            >
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${
                currentStep === 'guide' ? 'bg-cyan-400 text-black font-extrabold' : 'bg-slate-800 text-gray-400'
              }`}>3</span>
              <span>조작법 & 출격 (Guide)</span>
            </button>
          </div>
        </header>

        {/* =================================================================== */}
        {/* 2. 본문 영역: 현재 스텝에 따른 단일 클린 뷰 */}
        {/* =================================================================== */}
        <div className="my-auto py-4 flex-1 flex flex-col justify-center">

          {/* ----------------------------------------------------------------- */}
          {/* [1단계: Welcome 화면] 중학생 맞춤형 한글 메인 타이틀 & 환영 화면 */}
          {/* ----------------------------------------------------------------- */}
          {currentStep === 'welcome' && (
            <div className="flex flex-col items-center text-center max-w-3xl mx-auto space-y-5 animate-fadeIn">
              {/* 인천전자마이스터고 정보통신과 대형 네온 엠블럼 배너 */}
              <div className="inline-flex items-center gap-2.5 px-6 sm:px-8 py-2 rounded-full border border-cyan-400/80 bg-gradient-to-r from-blue-950/80 via-cyan-950/80 to-blue-950/80 shadow-[0_0_24px_rgba(0,240,255,0.35)] backdrop-blur-md">
                <GraduationCap className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-400 shrink-0" />
                <span className="text-base sm:text-lg md:text-xl font-black tracking-wide text-white">
                  인천전자마이스터고 <span className="text-cyan-300 font-black drop-shadow-[0_0_12px_rgba(0,240,255,0.6)]">정보통신과</span>
                </span>
                <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-400 shrink-0" />
              </div>

              {/* 중학생 맞춤형 메인 한글 게임 제목 */}
              <div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-white leading-tight">
                  <span className="block text-cyan-400 drop-shadow-[0_0_24px_rgba(0,240,255,0.5)]">
                    사이버 스트라이크
                  </span>
                  <span className="block text-xl sm:text-2xl md:text-3xl text-gray-100 font-extrabold mt-1">
                    신나는 1:1 VR 미래 사격 배틀!
                  </span>
                </h1>
                <p className="text-sm md:text-base text-cyan-200/90 mt-2 font-medium">
                  친구와 함께 Meta Quest 2를 쓰고 즐기는 60초 레이저 사격 줄다리기 배틀
                </p>
              </div>

              {/* 3대 특징 쉬운 안내 카드 (Cyber Glass + 4-Corner Brackets) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full text-left text-xs">
                <div className="cyber-glass-p1 hud-bracket-box-all bracket-cyan p-3.5">
                  <div className="flex items-center gap-1.5 text-cyan-300 font-bold mb-1.5">
                    <Target className="w-4 h-4 text-cyan-400" />
                    <span>내 손 그대로 조준!</span>
                  </div>
                  <p className="text-gray-300 text-[11px] leading-relaxed">
                    VR 컨트롤러를 들고 자유롭게 겨누며 움직이는 드론을 격파하세요!
                  </p>
                </div>

                <div className="cyber-glass-spec hud-bracket-box-all bracket-amber p-3.5">
                  <div className="flex items-center gap-1.5 text-yellow-300 font-bold mb-1.5">
                    <Flame className="w-4 h-4 text-yellow-400" />
                    <span>실시간 점수 줄다리기!</span>
                  </div>
                  <p className="text-gray-300 text-[11px] leading-relaxed">
                    친구보다 표적을 먼저 맞추면 상단 점수 게이지가 우리 팀 쪽으로 이동!
                  </p>
                </div>

                <div className="cyber-glass-p2 hud-bracket-box-all bracket-magenta p-3.5">
                  <div className="flex items-center gap-1.5 text-pink-300 font-bold mb-1.5">
                    <Shield className="w-4 h-4 text-pink-400" />
                    <span>혼자 와도 AI 대결!</span>
                  </div>
                  <p className="text-gray-300 text-[11px] leading-relaxed">
                    친구가 없어도 똑똑한 인공지능 로봇이 상대해 주니 걱정 끝!
                  </p>
                </div>
              </div>

              {/* 매칭 상태 안내 배너 (Cyber Glass) */}
              <div className={`w-full p-3.5 rounded-lg border text-left text-xs backdrop-blur-md ${
                isPvPReady
                  ? 'border-emerald-500/60 bg-emerald-950/40 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.2)]'
                  : 'border-cyan-500/40 bg-cyan-950/30 text-cyan-200 shadow-[0_0_15px_rgba(0,240,255,0.15)]'
              }`}>
                <div className="flex items-center justify-between font-bold text-xs">
                  <span className="flex items-center gap-1.5">
                    <Swords className="w-4 h-4 text-cyan-400" />
                    <span>경기장 대결 모드:</span>
                  </span>
                  <span className={isPvPReady ? 'text-emerald-400 font-extrabold' : 'text-amber-300 font-extrabold'}>
                    {isPvPReady ? '● 2인 플레이어 준비 완료 (친구와 1:1 대결 시작!)' : '○ 1인 플레이 (Cyber AI 로봇과 대결)'}
                  </span>
                </div>
              </div>

              {/* 하단 진행 버튼 (Spring Physics & Instant Glitch) */}
              <div className="flex flex-col sm:flex-row items-center gap-3 w-full justify-center pt-1">
                <button
                  onClick={() => setCurrentStep('intro')}
                  className="glass-btn spring-btn glitch-hover w-full sm:w-auto px-8 py-3 text-white font-bold text-sm tracking-wide border-cyan-400 bg-cyan-500/25 hover:bg-cyan-500/35 shadow-[0_0_20px_rgba(0,240,255,0.3)] cursor-pointer"
                >
                  <span>게임 대결 룰 보러가기</span>
                  <ArrowRight className="w-4 h-4 text-cyan-300" />
                </button>
                <button
                  onClick={() => setCurrentStep('guide')}
                  className="glass-btn spring-btn w-full sm:w-auto px-6 py-3 text-gray-300 text-xs border-slate-700/60 bg-slate-900/40 cursor-pointer"
                >
                  <span>조작법 확인 & 바로 출격</span>
                </button>
              </div>
            </div>
          )}

          {/* ----------------------------------------------------------------- */}
          {/* [2단계: 인트로 화면] 중학생 눈높이에 맞춘 대결 룰 & AI 설정 */}
          {/* ----------------------------------------------------------------- */}
          {currentStep === 'intro' && (
            <div className="flex flex-col max-w-4xl mx-auto space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between border-b border-cyan-500/20 pb-2">
                <div className="flex items-center gap-2 text-cyan-400 font-bold text-sm">
                  <Target className="w-4 h-4" />
                  <span>// 02. 게임 대결 룰 & 점수 줄다리기 안내</span>
                </div>
                <span className="text-gray-400 text-xs font-mono">인천전자마이스터고 정보통신과</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {/* 브리핑 카드 1: 대결 규칙 (4-Corner Brackets) */}
                <div className="cyber-glass hud-bracket-box-all bracket-cyan p-4 flex flex-col justify-between gap-3 border-cyan-500/35">
                  <div className="space-y-2.5">
                    <div className="text-cyan-300 font-bold text-sm flex items-center gap-1.5 drop-shadow-[0_0_8px_rgba(0,240,255,0.4)]">
                      <Swords className="w-4 h-4 text-cyan-400" />
                      <span>1:1 점수 줄다리기 배틀 룰</span>
                    </div>
                    <ul className="space-y-2 text-gray-300 leading-relaxed text-[11.5px] list-disc list-inside">
                      <li><b>경기 시간:</b> 정확히 <b>60초 동안</b> 날아다니는 표적을 맞히는 타임어택 경기입니다.</li>
                      <li><b>선착순 타겟 격파:</b> 같은 표적을 친구보다 <b>먼저 맞춘 사람만 점수</b>를 얻습니다!</li>
                      <li><b>점수 줄다리기 HUD:</b> 점수에 따라 실시간으로 상단 게이지가 움직여 승패가 한눈에 보입니다.</li>
                    </ul>

                    {/* 표적 6대 키워드 차등 배점 가이드 박스 */}
                    <div className="mt-2.5 p-3 rounded-lg bg-slate-950/60 border border-cyan-500/30 space-y-2 backdrop-blur-md">
                      <div className="font-bold text-xs text-yellow-300 flex items-center justify-between">
                        <span>🎯 표적 6대 키워드 & 차등 배점 룰</span>
                        <span className="text-[10px] text-cyan-300 font-mono">정보통신과 핵심전공</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div className="cyber-glass-spec hud-bracket-box-all bracket-amber p-2 text-cyan-200">
                          <div className="font-extrabold text-yellow-300 text-xs flex items-center justify-between">
                            <span>★ 2점 표적</span>
                            <span className="text-[10px] text-yellow-300">보너스!</span>
                          </div>
                          <div className="text-white font-black text-sm mt-0.5">정보 • 통신</div>
                        </div>
                        <div className="cyber-glass hud-bracket-box-all bracket-dim p-2 text-gray-300 border-slate-700/60">
                          <div className="font-bold text-gray-400 text-xs flex items-center justify-between">
                            <span>● 1점 표적</span>
                            <span className="text-[10px] text-gray-400">기본</span>
                          </div>
                          <div className="text-white font-bold text-xs mt-0.5">제어 • 회로 • 인공 • 전자</div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="p-2 border border-slate-800 bg-slate-950/40 text-[10px] text-gray-400 font-mono rounded flex justify-between items-center">
                    <span>전장 환경: [{getThemeKorean(currentTheme)}] • 표적: [{getShapeKorean(currentShape)}]</span>
                    <span className="hud-data-stamp">MODE: <b>6DoF_IoT</b></span>
                  </div>
                </div>

                {/* 브리핑 카드 2: AI 난이도 & 매칭 상태 (4-Corner Brackets) */}
                <div className="cyber-glass hud-bracket-box-all bracket-magenta p-4 flex flex-col justify-between gap-3 border-pink-500/35">
                  <div className="space-y-2">
                    <div className="text-pink-400 font-bold text-sm flex items-center gap-1.5 drop-shadow-[0_0_8px_rgba(255,0,85,0.4)]">
                      <Shield className="w-4 h-4 text-pink-400" />
                      <span>혼자 플레이 시 AI 로봇 난이도 선택</span>
                    </div>
                    <p className="text-gray-300 text-[11px] leading-relaxed">
                      친구가 아직 안 들어왔을 때 대결할 인공지능 로봇의 실력을 골라보세요:
                    </p>
                    <div className="space-y-2 pt-1">
                      {(['easy', 'normal', 'hard'] as Difficulty[]).map((diff) => {
                        const isSelected = currentDifficulty === diff;
                        const data = {
                          easy: { title: '1단계 // 초보 모드 (입문)', desc: '반응 느림 • 조준이 조금 흔들려 쉽게 이길 수 있어요' },
                          normal: { title: '2단계 // 일반 모드 (추천)', desc: '적당한 실력 • 사람과 가장 비슷한 추천 밸런스' },
                          hard: { title: '3단계 // 고수 모드 (달인)', desc: '엄청난 반응 속도 • 프로 사격 봇에게 도전해보세요!' },
                        }[diff];
                        return (
                          <button
                            key={diff}
                            onClick={() => onSelectDifficulty?.(diff)}
                            className={`w-full text-left p-2.5 rounded-lg border text-[11px] transition-all cursor-pointer flex justify-between items-center backdrop-blur-md spring-btn ${
                              isSelected
                                ? 'cyber-glass-p1 text-white font-bold shadow-[0_0_15px_rgba(0,240,255,0.3)]'
                                : 'border-slate-800/80 bg-slate-950/40 text-gray-400 hover:border-slate-700'
                            }`}
                          >
                            <div>
                              <span>{data.title}</span>
                              <div className="text-[10px] text-gray-400">{data.desc}</div>
                            </div>
                            {isSelected && <Check className="w-4 h-4 text-cyan-400" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* 하단 진행 버튼 */}
              <div className="flex items-center justify-between pt-3 border-t border-cyan-500/20">
                <button
                  onClick={() => setCurrentStep('welcome')}
                  className="glass-btn spring-btn px-4 py-2 text-gray-300 hover:text-white text-xs border-slate-700/60 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>이전: 게임 소개</span>
                </button>
                <button
                  onClick={() => setCurrentStep('guide')}
                  className="glass-btn spring-btn glitch-hover px-6 py-2.5 text-white font-bold text-xs border-cyan-400 bg-cyan-500/25 hover:bg-cyan-500/35 shadow-[0_0_15px_rgba(0,240,255,0.3)] cursor-pointer"
                >
                  <span>조작법 확인 & 출격 준비 ➔</span>
                </button>
              </div>
            </div>
          )}

          {/* ----------------------------------------------------------------- */}
          {/* [3단계: 게임 안내 화면] 중학생 친화적 3대 조작법 & 최종 출격 */}
          {/* ----------------------------------------------------------------- */}
          {currentStep === 'guide' && (
            <div className="flex flex-col max-w-4xl mx-auto space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between border-b border-cyan-500/20 pb-2">
                <div className="flex items-center gap-2 text-cyan-400 font-bold text-sm">
                  <Zap className="w-4 h-4" />
                  <span>// 03. 조작 방법 & 신나는 VR 배틀 출격!</span>
                </div>
                <div className="text-yellow-400 text-xs flex items-center gap-1 font-mono">
                  <Trophy className="w-3.5 h-3.5" />
                  <span>최고 기록: {highScore > 0 ? `${highScore.toLocaleString()} PTS` : '기록 없음'}</span>
                </div>
              </div>

              {/* 3대 쉬운 조작법 카드 (Cyber-Glass + 4-Corner Brackets) */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className="cyber-glass-p1 hud-bracket-box-all bracket-cyan p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-cyan-300 font-bold text-sm mb-1.5">
                      <Headset className="w-4 h-4 text-cyan-400" />
                      <span>1. 시선과 손으로 조준!</span>
                    </div>
                    <p className="text-gray-300 text-[11.5px] leading-relaxed">
                      VR 헤드셋으로 목표를 바라보고, 오른손 컨트롤러를 들어 올려 레이저 조준선을 표적에 맞춥니다.
                    </p>
                  </div>
                  <div className="mt-3 pt-2 border-t border-cyan-500/30 text-[10px] text-cyan-400 font-bold font-mono">
                    Quest 2 컨트롤러 / PC 마우스
                  </div>
                </div>

                <div className="cyber-glass-spec hud-bracket-box-all bracket-amber p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-yellow-300 font-bold text-sm mb-1.5">
                      <Zap className="w-4 h-4 text-yellow-400" />
                      <span>2. 방아쇠로 레이저 발사!</span>
                    </div>
                    <p className="text-gray-300 text-[11.5px] leading-relaxed">
                      검지 손가락으로 <b>트리거(방아쇠)</b>를 당기면 펄스 레이저가 발사됩니다! 친구보다 먼저 맞추세요.
                    </p>
                  </div>
                  <div className="mt-3 pt-2 border-t border-yellow-500/30 text-[10px] text-yellow-400 font-bold font-mono">
                    트리거(방아쇠) / 스페이스바
                  </div>
                </div>

                <div className="cyber-glass-p2 hud-bracket-box-all bracket-magenta p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-pink-300 font-bold text-sm mb-1.5">
                      <RotateCcw className="w-4 h-4 text-pink-400" />
                      <span>3. 손잡이 쥐어 재장전!</span>
                    </div>
                    <p className="text-gray-300 text-[11.5px] leading-relaxed">
                      총알 10발을 다 쏘면 <b>옆면 손잡이(그립) 버튼</b>을 꾹 쥐어 탄약을 즉시 재장전합니다!
                    </p>
                  </div>
                  <div className="mt-3 pt-2 border-t border-pink-500/30 text-[10px] text-pink-400 font-bold font-mono">
                    그립(옆면 버튼) / R 키
                  </div>
                </div>
              </div>

              {/* 출격 알림 배너 */}
              <div className="cyber-glass hud-bracket-box-all bracket-dim p-3.5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs border-cyan-500/35">
                <div className="flex items-center gap-2 text-gray-200">
                  <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
                  <span>출격 준비 완료! 아래 <b>[Quest 2 VR 배틀 출격]</b> 버튼을 누르면 시작됩니다. (체험 후 <b>그립/메뉴 버튼</b>으로 VR 종료 가능)</span>
                </div>
                {onOpenLeaderboard && (
                  <button
                    onClick={onOpenLeaderboard}
                    className="text-cyan-400 hover:text-cyan-300 underline cursor-pointer shrink-0 font-mono text-xs"
                  >
                    순위표 보기
                  </button>
                )}
              </div>

              {/* 최종 출격 버튼 그룹 (Spring Physics & Instant Glitch) */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-cyan-500/20">
                <button
                  onClick={() => setCurrentStep('intro')}
                  className="glass-btn spring-btn px-4 py-2 text-gray-300 hover:text-white text-xs border-slate-700/60 order-2 sm:order-1 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>이전: 대결 룰</span>
                </button>

                <div className="flex items-center gap-2.5 w-full sm:w-auto order-1 sm:order-2">
                  <button
                    onClick={onJoinAsSpectator}
                    className="glass-btn spring-btn px-4 py-2.5 text-amber-300 border-amber-500/40 hover:border-amber-400 text-xs shadow-[0_0_12px_rgba(255,170,0,0.2)] cursor-pointer"
                  >
                    <Tv className="w-3.5 h-3.5 text-amber-400" />
                    <span>친구 경기 관람하기</span>
                  </button>

                  <button
                    onClick={onStart}
                    className="glass-btn spring-btn px-4 py-2.5 text-gray-200 border-slate-700 bg-slate-900/60 hover:bg-slate-800 text-xs font-bold cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>PC 연습 시작</span>
                  </button>

                  <button
                    onClick={onEnterVR}
                    className="glass-btn spring-btn glitch-hover px-7 py-3 text-white font-black text-xs md:text-sm border-cyan-400 bg-gradient-to-r from-cyan-500/35 via-blue-600/35 to-pink-500/35 hover:from-cyan-500/50 hover:to-pink-500/50 shadow-[0_0_25px_rgba(0,240,255,0.45)] tracking-wide cursor-pointer"
                  >
                    <Headset className="w-4 h-4 text-cyan-300" />
                    <span>Quest 2 VR 배틀 출격!</span>
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* =================================================================== */}
        {/* 3. 하단 테크 풋터 바 (학교명, 학과명 & 정밀 시스템 데이터 스탬프) */}
        {/* =================================================================== */}
        <footer className="w-full pt-2 border-t border-cyan-500/20 flex flex-col sm:flex-row items-center justify-between text-[11px] text-gray-400 gap-1">
          <div className="flex items-center gap-2 text-cyan-300 font-medium">
            <span>인천전자마이스터고등학교 정보통신과</span>
            <span className="text-gray-600">|</span>
            <span className="font-mono text-gray-400">WebXR 6DoF IoT 전술 시뮬레이터</span>
          </div>
          <div className="font-mono text-gray-500 text-[10px] flex items-center gap-3">
            <span className="hud-data-stamp">SEC: <b>ALPHA_01</b></span>
            <span className="text-gray-700">|</span>
            <span>CYBER STRIKE ARENA v2.06</span>
          </div>
        </footer>

      </div>
    </div>
  );
};
