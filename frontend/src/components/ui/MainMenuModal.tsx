'use client';

import React from 'react';
import { ThemeType, TargetShape, Difficulty, ClientRole } from '@/types';
import { CyberCrosshair } from './CyberCrosshair';
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
  Crosshair,
  Zap,
  RotateCcw,
  Sparkles,
} from 'lucide-react';

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
}) => {
  if (!isOpen) return null;

  const getThemeKorean = (t: ThemeType) => {
    switch (t) {
      case 'cyber': return '사이버 아레나';
      case 'space': return '심우주 성운';
      case 'city': return '네온 시티';
      default: return t;
    }
  };

  const getShapeKorean = (s: TargetShape) => {
    switch (s) {
      case 'drone': return '전술 드론';
      case 'sphere': return '에너지 구체';
      case 'cube': return '네온 큐브';
      case 'disc': return '비행 디스크';
      default: return s;
    }
  };

  const getRoleKorean = (r: ClientRole) => {
    switch (r) {
      case 'P1': return '플레이어 1 (시안)';
      case 'P2': return '플레이어 2 (마젠타)';
      case 'SPECTATOR': return '경기 관람자';
      default: return r;
    }
  };

  return (
    <div className="modal-backdrop">
      {/* 화면 정중앙 1px 초슬림 HUD 조준선 */}
      <CyberCrosshair opacity={0.65} />

      {/* 메인 콕핏 HUD 셸 컨테이너 */}
      <div className="relative w-full max-w-6xl mx-auto flex flex-col justify-between min-h-[82vh] p-4 md:p-6 pointer-events-auto">
        
        {/* =================================================================== */}
        {/* 1. 상단 글로벌 HUD 텔레메트리 헤더 */}
        {/* =================================================================== */}
        <header className="w-full flex flex-col md:flex-row items-center justify-between border-b border-cyan-500/20 pb-3 gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 font-mono text-[11px] text-cyan-400 font-bold tracking-wider px-2 py-0.5 border border-cyan-500/30 rounded-sm bg-cyan-950/20">
              <Activity className="w-3.5 h-3.5 text-cyan-400 animate-pulse" strokeWidth={2} />
              <span>시스템 링크 // 정상</span>
            </div>
            <div className="text-gray-600 text-[10px] font-mono hidden sm:inline">|</div>
            <div className="text-[11px] font-mono text-gray-400 tracking-wider">
              전술 프로토콜 <span className="text-slate-200">v2.06</span>
            </div>
            <div className="text-gray-600 text-[10px] font-mono hidden sm:inline">|</div>
            <div className="text-[11px] font-mono text-cyan-300 tracking-wider">
              배정 역할: <span className="text-cyan-400 font-bold">[{getRoleKorean(clientRole)}]</span>
            </div>
          </div>

          <div className="flex flex-col items-center md:items-end">
            <h1 className="cyber-title text-xl md:text-2xl text-white tracking-widest flex items-center gap-2">
              <span className="text-cyan-400">CYBER STRIKE</span>
              <span className="text-gray-300 font-light text-base md:text-lg">// VR 사격 아레나</span>
            </h1>
            <div className="text-[10px] tracking-wider text-gray-400">
              1:1 실시간 전술 대결 &bull; Quest 2 6DoF 모션 슈팅 시뮬레이터
            </div>
          </div>
        </header>

        {/* =================================================================== */}
        {/* 2. 중앙 레이아웃: 좌/우 분할 투명 HUD 윙 패널 */}
        {/* =================================================================== */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 my-auto py-4 items-stretch">
          
          {/* [좌측 HUD 패널] 환경 사양 & 조작 가이드 */}
          <div className="lg:col-span-4 hud-panel hud-corners p-5 flex flex-col justify-between gap-4 font-mono text-xs">
            {/* 섹션 라벨 */}
            <div className="flex justify-between items-center border-b border-cyan-500/20 pb-2">
              <div className="flex items-center gap-1.5 text-[11px] tracking-wider text-cyan-400 font-bold">
                <Target className="w-3.5 h-3.5 text-cyan-400" strokeWidth={1.75} />
                <span>// 01. 경기장 텔레메트리</span>
              </div>
              <span className="text-[10px] text-gray-400">구역: 제7섹터</span>
            </div>

            {/* 환경 매트릭스 */}
            <div className="space-y-2">
              <div className="text-[11px] text-gray-400 tracking-wider">전장 환경 사양</div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-2 border border-slate-700/50 bg-slate-950/25 rounded-sm">
                  <div className="text-[10px] text-gray-400">공간 테마</div>
                  <div className="text-cyan-300 font-bold tracking-wide mt-0.5">{getThemeKorean(currentTheme)}</div>
                </div>
                <div className="p-2 border border-slate-700/50 bg-slate-950/25 rounded-sm">
                  <div className="text-[10px] text-gray-400">표적 기체</div>
                  <div className="text-pink-400 font-bold tracking-wide mt-0.5">{getShapeKorean(currentShape)}</div>
                </div>
              </div>
            </div>

            {/* 조작 프로토콜 (Lucide 아이콘 적용) */}
            <div className="space-y-2">
              <div className="text-[11px] text-gray-400 tracking-wider">전투 조작 가이드</div>
              <div className="space-y-1.5 text-[11px]">
                <div className="flex justify-between items-center p-1.5 border border-slate-800/80 bg-slate-950/20">
                  <span className="text-gray-300 flex items-center gap-1.5">
                    <Headset className="w-3.5 h-3.5 text-cyan-400" strokeWidth={1.5} />
                    <span>6DoF 모션 조준</span>
                  </span>
                  <span className="text-cyan-400 font-medium">Quest 2 컨트롤러</span>
                </div>
                <div className="flex justify-between items-center p-1.5 border border-slate-800/80 bg-slate-950/20">
                  <span className="text-gray-300 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-yellow-400" strokeWidth={1.5} />
                    <span>펄스 레이저 발사</span>
                  </span>
                  <span className="text-yellow-400 font-medium">트리거 / 스페이스</span>
                </div>
                <div className="flex justify-between items-center p-1.5 border border-slate-800/80 bg-slate-950/20">
                  <span className="text-gray-300 flex items-center gap-1.5">
                    <RotateCcw className="w-3.5 h-3.5 text-green-400" strokeWidth={1.5} />
                    <span>탄약 셀 재장전</span>
                  </span>
                  <span className="text-green-400 font-medium">그립 / R 키</span>
                </div>
                <div className="flex justify-between items-center p-1.5 border border-slate-800/80 bg-slate-950/20">
                  <span className="text-gray-300 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-pink-400" strokeWidth={1.5} />
                    <span>1:1 경쟁 대결</span>
                  </span>
                  <span className="text-pink-400 font-medium">AI 라이벌 실시간 동기화</span>
                </div>
              </div>
            </div>

            {/* 하단 시스템 상태 */}
            <div className="pt-2 border-t border-slate-800/60 flex justify-between text-[10px] text-gray-400">
              <span>지연율: 8ms</span>
              <span>주사율: 90Hz</span>
              <span>상태: 무장 완료</span>
            </div>
          </div>

          {/* [중앙 투명 뷰포트] 3D 공간과 조준선 투과 영역 */}
          <div className="hidden lg:flex lg:col-span-4 flex-col items-center justify-between p-2 pointer-events-none">
            <div className="text-[10px] tracking-wider text-cyan-400/80 border-b border-cyan-500/20 px-3 py-1 flex items-center gap-1">
              <Crosshair className="w-3 h-3 text-cyan-400" strokeWidth={1.5} />
              <span>타겟 조준 광학계 // 중앙 정렬</span>
            </div>
            
            {/* 정밀 마커 텍스트 */}
            <div className="text-center text-[11px] text-slate-300/90 bg-slate-950/40 px-3.5 py-1.5 border border-slate-800/50 rounded-sm">
              VR 트리거를 당기거나 시작 버튼을 눌러 출격하세요
            </div>

            <div className="text-[10px] tracking-wider text-slate-400">
              시야각: 110&deg; &bull; 스테레오 XR
            </div>
          </div>

          {/* [우측 HUD 패널] AI 대결 난이도 설정 & 전적 */}
          <div className="lg:col-span-4 hud-panel hud-corners p-5 flex flex-col justify-between gap-4 font-mono text-xs">
            {/* 섹션 라벨 */}
            <div className="flex justify-between items-center border-b border-cyan-500/20 pb-2">
              <div className="flex items-center gap-1.5 text-[11px] tracking-wider text-cyan-400 font-bold">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" strokeWidth={1.75} />
                <span>// 02. 대결 프로토콜 선택</span>
              </div>
              <span className="text-[10px] text-yellow-400 font-bold">
                현재: [{currentDifficulty.toUpperCase()}]
              </span>
            </div>

            {/* AI 난이도 선택 리스트 */}
            <div className="space-y-2">
              <div className="text-[11px] text-gray-400 tracking-wider">AI 라이벌 가변 난이도</div>
              <div className="space-y-2">
                {(['easy', 'normal', 'hard'] as Difficulty[]).map((diff) => {
                  const isSelected = currentDifficulty === diff;
                  const data = {
                    easy: {
                      title: '1단계 // 정찰 모드 (입문)',
                      desc: '반응 1.10초 • 명중률 ~30% • 조준 흔들림',
                    },
                    normal: {
                      title: '2단계 // 전술 모드 (표준/추천)',
                      desc: '반응 0.75초 • 명중률 ~50% • 밸런스 조정 (승리 가능)',
                    },
                    hard: {
                      title: '3단계 // 에이펙스 모드 (프로)',
                      desc: '반응 0.30초 • 명중률 ~75% • 프로 선도 사격',
                    },
                  }[diff];

                  return (
                    <button
                      key={diff}
                      type="button"
                      onClick={() => onSelectDifficulty?.(diff)}
                      className={`w-full text-left p-2.5 rounded-sm border transition-all cursor-pointer ${
                        isSelected
                          ? 'border-cyan-400 bg-cyan-950/25 text-white'
                          : 'border-slate-800/80 bg-slate-950/20 text-gray-400 hover:border-slate-600 hover:text-gray-200'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <span className={`text-[11px] font-bold tracking-wide ${isSelected ? 'text-cyan-300' : ''}`}>
                          {data.title}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 border flex items-center gap-1 ${
                          isSelected ? 'border-cyan-500/60 text-cyan-300 bg-cyan-950/60 font-bold' : 'border-slate-800 text-gray-400'
                        }`}>
                          {isSelected && <Check className="w-2.5 h-2.5 text-cyan-400" strokeWidth={2.5} />}
                          <span>{isSelected ? '선택됨' : '선택'}</span>
                        </span>
                      </div>
                      <div className="text-[10px] text-gray-400 mt-1">{data.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 전적 및 매뉴얼 바 */}
            <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px]">
              <div className="text-yellow-400 font-bold flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5 text-yellow-400" strokeWidth={1.75} />
                <span className="text-gray-400 text-[10px]">최고 기록:</span>
                <span>{highScore > 0 ? `${highScore.toLocaleString()} PTS` : '기록 없음'}</span>
              </div>

              <div className="flex items-center gap-3 text-[11px]">
                {onOpenLeaderboard && (
                  <button
                    onClick={onOpenLeaderboard}
                    className="text-cyan-400 hover:text-cyan-300 underline cursor-pointer flex items-center gap-1"
                  >
                    <span>순위표</span>
                  </button>
                )}
                <a
                  href="/manual.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-white underline flex items-center gap-1"
                >
                  <BookOpen className="w-3 h-3" strokeWidth={1.5} />
                  <span>매뉴얼</span>
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* =================================================================== */}
        {/* 3. 하단 액션 독: 1px 초정밀 사이버 HUD 버튼 그룹 */}
        {/* =================================================================== */}
        <footer className="w-full pt-3 border-t border-cyan-500/20 flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* 보조 도구 버튼 */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={onOpenSettings}
              className="hud-btn flex-1 sm:flex-none text-xs gap-1.5"
            >
              <Sliders className="w-3.5 h-3.5 text-cyan-400" strokeWidth={1.75} />
              <span>환경 설정</span>
            </button>
            <button
              id="modal-spectator-btn"
              onClick={onJoinAsSpectator}
              className="hud-btn flex-1 sm:flex-none text-xs border-amber-500/40 text-amber-300 hover:border-amber-400 gap-1.5"
            >
              <Tv className="w-3.5 h-3.5 text-amber-400" strokeWidth={1.75} />
              <span>관람 중계 모드</span>
            </button>
          </div>

          {/* 메인 출격 버튼 */}
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              id="modal-start-game-btn"
              onClick={onStart}
              className="hud-btn hud-btn-primary flex-1 sm:flex-none text-xs py-2.5 px-5 gap-1.5"
            >
              <Play className="w-3.5 h-3.5" strokeWidth={2} />
              <span>PC 사격 시작</span>
            </button>

            <button
              id="modal-enter-vr-btn"
              onClick={onEnterVR}
              className="hud-btn hud-btn-vr flex-1 sm:flex-none text-xs md:text-sm py-2.5 px-6 border-cyan-400 gap-2"
            >
              <Headset className="w-4 h-4 text-cyan-300" strokeWidth={2} />
              <span>Quest 2 VR 배틀 출격</span>
            </button>
          </div>
        </footer>

      </div>
    </div>
  );
};
