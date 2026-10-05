import { VoiceEventType } from '@/types';

/**
 * 한국어 오퍼레이터 음성 안내 시스템 (VoiceManager v2.0 - 내장 고음질 오디오 엔진)
 * Quest 2 및 모든 기기에서 OS 언어/TTS 탑재 여부와 무관하게 100% 무조건 한국어 음성 재생 보장
 * SF 무전기 비프음(Radio Chirp) + 스튜디오 한국어 오디오 파일(MP3) + 볼륨 제어
 */
export class VoiceManager {
  private static instance: VoiceManager;
  public isVoiceEnabled: boolean = true;
  public voiceVolume: number = 1.0;
  private audioCtx: AudioContext | null = null;
  private lastSpokenTime: number = 0;
  private audioCache: Map<VoiceEventType, HTMLAudioElement> = new Map();
  private currentAudio: HTMLAudioElement | null = null;

  private voiceFiles: Record<VoiceEventType, string> = {
    GAME_START: '/audio/voices/game_start.mp3?v=female2',
    AMMO_EMPTY: '/audio/voices/ammo_empty.mp3?v=female2',
    RELOAD_DONE: '/audio/voices/reload_done.mp3?v=female2',
    COMBO_STREAK: '/audio/voices/combo_streak.mp3?v=female2',
    TIME_WARN_10S: '/audio/voices/time_warn_10s.mp3?v=female2',
    GAME_OVER: '/audio/voices/game_over.mp3?v=female2',
    HIGH_SCORE: '/audio/voices/high_score.mp3?v=female2',
    CHALLENGER_JOINED: '/audio/voices/game_start.mp3?v=female2',
    P1_LEAD: '/audio/voices/combo_streak.mp3?v=female2',
    P2_LEAD: '/audio/voices/combo_streak.mp3?v=female2',
    VICTORY: '/audio/voices/high_score.mp3?v=female2',
    DEFEAT: '/audio/voices/game_over.mp3?v=female2',
  };

  private constructor() {
    if (typeof window !== 'undefined') {
      this.preloadAudios();
    }
  }

  public static getInstance(): VoiceManager {
    if (!VoiceManager.instance) {
      VoiceManager.instance = new VoiceManager();
    }
    return VoiceManager.instance;
  }

  private preloadAudios() {
    if (typeof window === 'undefined') return;
    Object.entries(this.voiceFiles).forEach(([key, url]) => {
      try {
        const audio = new Audio(url);
        audio.preload = 'auto';
        this.audioCache.set(key as VoiceEventType, audio);
      } catch (e) {
        console.warn('Failed to preload voice audio:', key, e);
      }
    });
  }

  private initAudioContext() {
    if (!this.audioCtx && typeof window !== 'undefined') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.audioCtx = new AudioCtx();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  /** SF 군사 무전기 통신 비프음 (Radio Chirp: 치익- 삐빅) */
  private playRadioChirp() {
    this.initAudioContext();
    if (!this.audioCtx) return;

    const now = this.audioCtx.currentTime;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(2400, now);
    osc.frequency.setValueAtTime(1800, now + 0.04);
    osc.frequency.setValueAtTime(2800, now + 0.08);

    gain.gain.setValueAtTime(0.14 * this.voiceVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(this.audioCtx.destination);

    osc.start(now);
    osc.stop(now + 0.12);
  }

  /** 한국어 음성 안내 멘트 재생 (내장 MP3 파일 기반으로 100% 호환) */
  public speak(event: VoiceEventType) {
    if (!this.isVoiceEnabled) return;
    if (typeof window === 'undefined') return;

    // 너무 잦은 음성 겹침 방지 (최소 0.6초 간격)
    const now = Date.now();
    if (now - this.lastSpokenTime < 600 && event !== 'AMMO_EMPTY') {
      return;
    }
    this.lastSpokenTime = now;

    // 1. 무전기 신호음 재생
    this.playRadioChirp();

    // 2. 기존 진행 중인 음성 정지
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
      } catch {
        // ignore
      }
    }

    // 3. 내장 한국어 오디오 파일 재생
    const url = this.voiceFiles[event];
    if (!url) return;

    setTimeout(() => {
      try {
        let audio = this.audioCache.get(event);
        if (!audio) {
          audio = new Audio(url);
          this.audioCache.set(event, audio);
        }

        audio.volume = Math.max(0, Math.min(1, this.voiceVolume));
        audio.currentTime = 0;
        this.currentAudio = audio;

        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            console.warn('Audio playback error (Autoplay blocked):', err);
          });
        }
      } catch (e) {
        console.error('Failed to play voice audio:', e);
      }
    }, 100); // 무전기 비프음(0.1초) 직후 음성 재생
  }

  public getVoiceStatus(): { isSupported: boolean; hasKorean: boolean; voiceName: string; count: number } {
    return {
      isSupported: true,
      hasKorean: true,
      voiceName: '밝고 경쾌한 여성 오퍼레이터 (SunHi Neural)',
      count: 7,
    };
  }

  public setEnabled(enabled: boolean) {
    this.isVoiceEnabled = enabled;
    if (!enabled && this.currentAudio) {
      try {
        this.currentAudio.pause();
      } catch {
        // ignore
      }
    }
  }

  public setVolume(volume: number) {
    this.voiceVolume = Math.max(0, Math.min(1, volume));
    if (this.currentAudio) {
      this.currentAudio.volume = this.voiceVolume;
    }
  }
}
