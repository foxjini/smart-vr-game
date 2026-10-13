import { SoundPresetType } from '@/types';
import { isAudioAllowed } from './audioUnlock';

/** 관전 화면 대기용 AI 시연에서 사격·명중 소리를 내는 크기 (효과음 크기에 곱함) */
export const DEMO_FX_LEVEL = 0.3;

/**
 * Web Audio API 기반 절차적 사운드 생성기 (v2.0)
 * 3가지 사운드 테마(SF 레이저 / 실탄 총기 / 8비트 아케이드) 및 마스터 볼륨 조절 지원.
 * 효과음 → fxBus → masterGain → 스피커. 시연 중에는 fxBus를 줄여 작게 내고, 설정 창 미리 듣기는 masterGain으로 바로 보냄
 */
export class SoundManager {
  private static instance: SoundManager;
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private fxBus: GainNode | null = null;
  public isMuted: boolean = false;
  public masterVolume: number = 0.8; // 0.0 ~ 1.0
  public currentPreset: SoundPresetType = 'laser';
  /** 관전 화면 대기용 AI 시연 중 (사격·명중은 작게, 10초 경고음·종료 팡파르는 내지 않음) */
  public demoMode = false;
  /** 미리 듣기 중: 시연 중이어도 원래 크기로 들려줌 */
  private toMaster = false;

  private constructor() {}

  public static getInstance(): SoundManager {
    if (!SoundManager.instance) {
      SoundManager.instance = new SoundManager();
    }
    return SoundManager.instance;
  }

  private initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.masterVolume, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);
        this.fxBus = this.ctx.createGain();
        this.fxBus.gain.setValueAtTime(this.fxLevel, this.ctx.currentTime);
        this.fxBus.connect(this.masterGain);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  /** 지금 효과음에 곱하는 크기 (시연 중이면 DEMO_FX_LEVEL) */
  public get fxLevel(): number {
    return this.demoMode ? DEMO_FX_LEVEL : 1;
  }

  /**
   * 효과음 하나를 낼 준비. 음소거이거나 브라우저가 아직 소리를 허락하지 않았으면(화면을 한 번도 누르지 않음)
   * AudioContext를 만들지 않고 null (만들면 브라우저 경고가 남고 어차피 소리가 나지 않음)
   */
  private begin(): { ctx: AudioContext; out: AudioNode } | null {
    if (this.isMuted || !isAudioAllowed()) return null;
    this.initContext();
    if (!this.ctx || !this.masterGain || !this.fxBus) return null;
    return { ctx: this.ctx, out: this.toMaster ? this.masterGain : this.fxBus };
  }

  /** 사용자 조작(클릭·키) 안에서 불러 소리를 켬 (조작 안에서 만든 AudioContext만 소리를 내는 브라우저 대비) */
  public unlock() {
    this.initContext();
  }

  /** 효과음 종류만 바꿈 (소리는 내지 않음. 들려주려면 previewFire) */
  public setPreset(preset: SoundPresetType) {
    this.currentPreset = preset;
  }

  /** 설정 창에서 고른 효과음 종류를 들려줌 (시연 중이어도 원래 크기) */
  public previewFire() {
    this.toMaster = true;
    try {
      this.playFire();
    } finally {
      this.toMaster = false;
    }
  }

  public setMasterVolume(vol: number) {
    this.masterVolume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.masterVolume, this.ctx.currentTime);
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(muted ? 0 : this.masterVolume, this.ctx.currentTime);
    }
  }

  /** 관전 화면 대기용 AI 시연: 사격·명중은 효과음 크기의 DEMO_FX_LEVEL로, 10초 경고음·종료 팡파르는 내지 않음 */
  public setDemoMode(on: boolean) {
    this.demoMode = on;
    if (this.fxBus && this.ctx) {
      const t = this.ctx.currentTime;
      this.fxBus.gain.cancelScheduledValues(t);
      this.fxBus.gain.setValueAtTime(this.fxLevel, t);
    }
  }

  // ==========================================
  // 1. 발사음 (Fire Sound)
  // ==========================================
  public playFire() {
    const a = this.begin();
    if (!a) return;
    const { ctx, out } = a;
    const now = ctx.currentTime;

    if (this.currentPreset === 'laser') {
      // [1] SF 레이저: 지수 하강 톱니파 스윕
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(110, now + 0.16);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

      osc.connect(gain);
      gain.connect(out);
      osc.start(now);
      osc.stop(now + 0.16);

    } else if (this.currentPreset === 'kinetic') {
      // [2] 실탄 총기: 폭발 노이즈 스파이크 + 저음 서브 킥
      // 노이즈 버퍼 (화약 폭발음)
      const bufferSize = ctx.sampleRate * 0.12;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.2));
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1800, now);
      filter.Q.setValueAtTime(1.5, now);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.45, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(out);
      noise.start(now);

      // 저음 펀치
      const subOsc = ctx.createOscillator();
      const subGain = ctx.createGain();
      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(220, now);
      subOsc.frequency.exponentialRampToValueAtTime(45, now + 0.14);
      subGain.gain.setValueAtTime(0.5, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

      subOsc.connect(subGain);
      subGain.connect(out);
      subOsc.start(now);
      subOsc.stop(now + 0.14);

    } else if (this.currentPreset === 'retro') {
      // [3] 레트로 아케이드: 8비트 사각파 뿅!
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(880, now + 0.04);
      osc.frequency.setValueAtTime(1320, now + 0.08);

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      osc.connect(gain);
      gain.connect(out);
      osc.start(now);
      osc.stop(now + 0.15);
    }
  }

  // ==========================================
  // 2. 명중 파괴음 (Hit Sound)
  // ==========================================
  public playHit() {
    const a = this.begin();
    if (!a) return;
    const { ctx, out } = a;
    const now = ctx.currentTime;

    if (this.currentPreset === 'laser') {
      // [1] SF 레이저: 노이즈 폭발 + 성공 챠임
      const bufferSize = ctx.sampleRate * 0.22;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1200, now);
      filter.frequency.exponentialRampToValueAtTime(80, now + 0.22);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(out);
      noise.start(now);

      // 성공 챠임
      const bell = ctx.createOscillator();
      const bellGain = ctx.createGain();
      bell.type = 'sine';
      bell.frequency.setValueAtTime(1760, now);
      bell.frequency.exponentialRampToValueAtTime(880, now + 0.15);
      bellGain.gain.setValueAtTime(0.18, now);
      bellGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      bell.connect(bellGain);
      bellGain.connect(out);
      bell.start(now);
      bell.stop(now + 0.15);

    } else if (this.currentPreset === 'kinetic') {
      // [2] 실탄 총기: 철판 피격 메탈릭 '팅-!' + 파쇄음
      const ping = ctx.createOscillator();
      const pingGain = ctx.createGain();
      ping.type = 'triangle';
      ping.frequency.setValueAtTime(2400, now);
      ping.frequency.exponentialRampToValueAtTime(600, now + 0.18);
      pingGain.gain.setValueAtTime(0.45, now);
      pingGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      ping.connect(pingGain);
      pingGain.connect(out);
      ping.start(now);
      ping.stop(now + 0.18);

    } else if (this.currentPreset === 'retro') {
      // [3] 레트로 아케이드: 8비트 점수 획득 딩동! (523Hz -> 784Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'square';
      osc1.frequency.setValueAtTime(523.25, now); // C5
      osc1.frequency.setValueAtTime(783.99, now + 0.08); // G5
      gain1.gain.setValueAtTime(0.3, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc1.connect(gain1);
      gain1.connect(out);
      osc1.start(now);
      osc1.stop(now + 0.2);
    }
  }

  // ==========================================
  // 2-1. 감점 표적 명중음 (기계·전기): 명중음과 반대로 낮게 내려가는 '삐-빅' 경고음
  // ==========================================
  public playMinus() {
    const a = this.begin();
    if (!a) return;
    const { ctx, out } = a;
    const now = ctx.currentTime;
    const type: OscillatorType = this.currentPreset === 'retro' ? 'square' : 'sawtooth';
    // 두 음을 이어서: 330Hz → 196Hz (한 음마다 아래로 살짝 미끄러짐)
    [
      [0, 330],
      [0.11, 196],
    ].forEach(([at, freq]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now + at);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.85, now + at + 0.1);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.setValueAtTime(0.16, now + at);
      gain.gain.exponentialRampToValueAtTime(0.001, now + at + 0.1);
      osc.connect(gain);
      gain.connect(out);
      osc.start(now + at);
      osc.stop(now + at + 0.1);
    });
  }

  // ==========================================
  // 3. 탄약 소진 (Empty Sound)
  // ==========================================
  public playEmpty() {
    const a = this.begin();
    if (!a) return;
    const { ctx, out } = a;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = this.currentPreset === 'retro' ? 'square' : 'triangle';
    osc.frequency.setValueAtTime(this.currentPreset === 'kinetic' ? 800 : 1400, now);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  // ==========================================
  // 4. 재장전 (Reload Sound)
  // ==========================================
  public playReload() {
    const a = this.begin();
    if (!a) return;
    const { ctx, out } = a;
    const now = ctx.currentTime;

    if (this.currentPreset === 'retro') {
      // 8비트 아케이드 아르페지오 파워업 챠임
      const notes = [392, 523, 659, 784];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, now + idx * 0.06);
        gain.gain.setValueAtTime(0.18, now + idx * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.12);
        osc.connect(gain);
        gain.connect(out);
        osc.start(now + idx * 0.06);
        osc.stop(now + idx * 0.06 + 0.12);
      });
      return;
    }

    // 1단 클릭 (탄창 분리)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'square';
    osc1.frequency.setValueAtTime(this.currentPreset === 'kinetic' ? 220 : 320, now);
    gain1.gain.setValueAtTime(0.25, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc1.connect(gain1);
    gain1.connect(out);
    osc1.start(now);
    osc1.stop(now + 0.09);

    // 2단 락킹 (탄창 결합 찰칵)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(this.currentPreset === 'kinetic' ? 500 : 650, now + 0.3);
    osc2.frequency.exponentialRampToValueAtTime(this.currentPreset === 'kinetic' ? 750 : 900, now + 0.38);
    gain2.gain.setValueAtTime(0.3, now + 0.3);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
    osc2.connect(gain2);
    gain2.connect(out);
    osc2.start(now + 0.3);
    osc2.stop(now + 0.42);
  }

  // ==========================================
  // 5. 라운드 종료 팡파르
  // ==========================================
  public playGameOver() {
    if (this.demoMode) return;
    const a = this.begin();
    if (!a) return;
    const { ctx, out } = a;
    const now = ctx.currentTime;
    const freqs = [440, 554, 659, 880];
    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = this.currentPreset === 'retro' ? 'square' : 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.12);
      gain.gain.setValueAtTime(0.25, now + idx * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.38);
      osc.connect(gain);
      gain.connect(out);
      osc.start(now + idx * 0.12);
      osc.stop(now + idx * 0.12 + 0.38);
    });
  }

  // ==========================================
  // 6. 10초 전 긴급 경보 사이렌 (Emergency Siren)
  // ==========================================
  public play10sWarningSiren() {
    if (this.demoMode) return;
    const a = this.begin();
    if (!a) return;
    const { ctx, out } = a;
    const now = ctx.currentTime;
    // 3회 고음 비프 경보음 (삐- 삐- 삐-)
    [0, 0.18, 0.36].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(950, now + offset);
      osc.frequency.exponentialRampToValueAtTime(1400, now + offset + 0.12);
      gain.gain.setValueAtTime(0.35, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.14);
      osc.connect(gain);
      gain.connect(out);
      osc.start(now + offset);
      osc.stop(now + offset + 0.14);
    });
  }
}
