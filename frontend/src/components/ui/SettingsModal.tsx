'use client';

import React, { useState } from 'react';
import { ThemeType, TargetShape, Difficulty, SoundPresetType } from '@/types';
import { VoiceManager } from '@/core/audio/VoiceManager';
import { SoundManager } from '@/core/audio/SoundManager';
import {
  Sliders,
  X,
  Layers,
  Box,
  Volume2,
  Mic,
  Crosshair,
  Server,
  Check,
  Zap,
} from 'lucide-react';

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
}

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
}) => {
  const [hostInput, setHostInput] = useState(serverHost);

  if (!isOpen) return null;

  const handleSaveHost = () => {
    onUpdateServerHost(hostInput.trim());
  };

  const handleTestSound = (preset: SoundPresetType) => {
    onSelectSoundPreset(preset);
    SoundManager.getInstance().setPreset(preset);
    SoundManager.getInstance().playFire();
  };

  const handleTestVoice = () => {
    VoiceManager.getInstance().speak('GAME_START');
  };

  return (
    <div className="modal-backdrop">
      <div className="hud-panel hud-corners p-5 md:p-6 w-full max-w-xl flex flex-col gap-4 border-cyan-500/30 max-h-[92vh] overflow-y-auto">
        {/* 헤더 */}
        <div className="flex justify-between items-center border-b border-cyan-500/20 pb-3">
          <div className="flex flex-col">
            <span className="text-[10px] text-cyan-400 font-mono tracking-widest flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-cyan-400" strokeWidth={1.75} />
              <span>// 시스템 환경 설정</span>
            </span>
            <h2 className="cyber-title text-xl text-white">사격장 가상 환경 및 오디오 제어</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-cyan-400 transition-colors p-1"
            title="닫기"
          >
            <X className="w-5 h-5" strokeWidth={1.75} />
          </button>
        </div>

        {/* 1. 가상 공간 테마 선택 */}
        <div className="flex flex-col gap-1.5 font-mono text-xs">
          <div className="text-[11px] text-gray-400 tracking-wider flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-cyan-400" strokeWidth={1.5} />
            <span>01 // 경기장 가상 테마 선택</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'cyber', name: '사이버 아레나', desc: '네온 그리드 매트릭스' },
              { id: 'space', name: '심우주 성운', desc: '우주 배경 및 성운' },
              { id: 'city', name: '네온 시티', desc: '미래 도시 스카이라인' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => onSelectTheme(t.id as ThemeType)}
                className={`p-2 rounded-sm border text-left transition-all cursor-pointer ${
                  currentTheme === t.id
                    ? 'border-cyan-400 bg-cyan-950/30 text-cyan-300'
                    : 'border-slate-800 bg-slate-950/20 text-gray-400 hover:border-slate-600'
                }`}
              >
                <div className="font-bold text-[11px] font-mono">{t.name}</div>
                <div className="text-[9px] text-gray-400 mt-0.5">{t.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* 2. 3D 표적 형태 선택 */}
        <div className="flex flex-col gap-1.5 font-mono text-xs">
          <div className="text-[11px] text-gray-400 tracking-wider flex items-center gap-1.5">
            <Box className="w-3.5 h-3.5 text-pink-400" strokeWidth={1.5} />
            <span>02 // 3D 표적 기체 형태</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[
              { id: 'drone', name: '드론', code: '전술 헥사 드론' },
              { id: 'sphere', name: '구체', code: '에너지 코어' },
              { id: 'cube', name: '큐브', code: '큐브 모듈' },
              { id: 'disc', name: '디스크', code: '비행 디스크' },
            ].map((s) => (
              <button
                key={s.id}
                onClick={() => onSelectShape(s.id as TargetShape)}
                className={`py-2 px-1.5 rounded-sm border text-center transition-all cursor-pointer ${
                  currentShape === s.id
                    ? 'border-pink-500 bg-pink-950/30 text-pink-300'
                    : 'border-slate-800 bg-slate-950/20 text-gray-400 hover:border-slate-600'
                }`}
              >
                <div className="font-bold text-[11px] font-mono">{s.name}</div>
                <div className="text-[9px] text-gray-400 mt-0.5">{s.code}</div>
              </button>
            ))}
          </div>
        </div>

        {/* 3. 효과음 프리셋 및 볼륨 */}
        <div className="flex flex-col gap-2 border-t border-slate-800/80 pt-3 font-mono text-xs">
          <div className="flex justify-between items-center">
            <span className="text-[11px] text-gray-400 tracking-wider flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5 text-cyan-400" strokeWidth={1.5} />
              <span>03 // 사격 효과음 프리셋</span>
            </span>
            <span className="text-[11px] text-cyan-400 font-bold">
              볼륨: {Math.round(soundVolume * 100)}%
            </span>
          </div>
          
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'laser', name: 'SF 레이저', desc: '플라즈마 광선 발사음' },
              { id: 'kinetic', name: '실탄 총기', desc: '화약 격발 격타음' },
              { id: 'retro', name: '8비트 레트로', desc: '아케이드 칩튠 사운드' },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => handleTestSound(p.id as SoundPresetType)}
                className={`p-2 rounded-sm border text-left transition-all cursor-pointer ${
                  soundPreset === p.id
                    ? 'border-cyan-400 bg-cyan-950/30 text-cyan-300'
                    : 'border-slate-800 bg-slate-950/20 text-gray-400 hover:border-slate-600'
                }`}
              >
                <div className="font-bold text-[11px]">{p.name}</div>
                <div className="text-[9px] text-gray-400 mt-0.5">{p.desc}</div>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 pt-1">
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={soundVolume}
              onChange={(e) => onUpdateSoundVolume(parseFloat(e.target.value))}
              className="accent-cyan-400 cursor-pointer flex-1"
            />
          </div>
        </div>

        {/* 4. 한국어 음성 브리핑 */}
        <div className="flex flex-col gap-2 border-t border-slate-800/80 pt-3 font-mono text-xs">
          <div className="flex justify-between items-center">
            <span className="text-[11px] text-gray-400 tracking-wider flex items-center gap-1.5">
              <Mic className="w-3.5 h-3.5 text-purple-400" strokeWidth={1.5} />
              <span>04 // 한국어 전술 음성 안내 (TTS)</span>
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleTestVoice}
                className="text-[10px] border border-purple-500/40 px-2 py-0.5 text-purple-300 hover:border-purple-400 rounded-sm"
              >
                음성 테스트
              </button>
              <button
                onClick={() => onToggleVoice(!voiceEnabled)}
                className={`text-[10px] px-2 py-0.5 border rounded-sm font-bold ${
                  voiceEnabled
                    ? 'bg-green-950/40 text-green-400 border-green-500'
                    : 'bg-red-950/40 text-red-400 border-red-500'
                }`}
              >
                {voiceEnabled ? '활성화됨' : '음소거'}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={voiceVolume}
              disabled={!voiceEnabled}
              onChange={(e) => onUpdateVoiceVolume(parseFloat(e.target.value))}
              className="accent-purple-400 cursor-pointer flex-1 disabled:opacity-40"
            />
            <span className="text-[10px] text-purple-300 font-bold w-8 text-right">
              {Math.round(voiceVolume * 100)}%
            </span>
          </div>
        </div>

        {/* 5. 난이도 및 조준 감도 & 릴레이 IP */}
        <div className="grid grid-cols-2 gap-3 border-t border-slate-800/80 pt-3 font-mono text-xs">
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-[11px] text-gray-400 items-center">
              <span className="flex items-center gap-1">
                <Crosshair className="w-3 h-3 text-cyan-400" strokeWidth={1.5} />
                <span>조준 감도</span>
              </span>
              <span className="text-cyan-400 font-bold">{sensitivity.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="2.5"
              step="0.1"
              value={sensitivity}
              onChange={(e) => onUpdateSensitivity(parseFloat(e.target.value))}
              className="accent-cyan-400 cursor-pointer"
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-gray-400 flex items-center gap-1">
              <Server className="w-3 h-3 text-cyan-400" strokeWidth={1.5} />
              <span>릴레이 서버 호스트</span>
            </span>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={hostInput}
                onChange={(e) => setHostInput(e.target.value)}
                placeholder="localhost"
                className="bg-slate-950/60 border border-slate-700 px-2 py-1 text-xs text-white font-mono w-full focus:outline-none focus:border-cyan-400 rounded-sm"
              />
              <button
                onClick={handleSaveHost}
                className="hud-btn text-[10px] py-1 px-2"
              >
                저장
              </button>
            </div>
          </div>
        </div>

        {/* 닫기 버튼 */}
        <div className="pt-2 border-t border-slate-800/80">
          <button
            onClick={onClose}
            className="hud-btn hud-btn-primary w-full py-2 text-xs gap-1.5"
          >
            <Check className="w-4 h-4" strokeWidth={2} />
            <span>설정 저장 및 사격장 복귀</span>
          </button>
        </div>
      </div>
    </div>
  );
};
