import { VoiceEventType } from '@/types';
import { isAudioAllowed } from './audioUnlock';

/**
 * 한국어 오퍼레이터 음성 안내 시스템 (VoiceManager v2.0 - 내장 고음질 오디오 엔진)
 * Quest 2 및 모든 기기에서 OS 언어/TTS 탑재 여부와 무관하게 100% 무조건 한국어 음성 재생 보장
 * SF 무전기 비프음(Radio Chirp) + 스튜디오 한국어 오디오 파일(MP3) + 볼륨 제어
 */
export class VoiceManager {
  private static instance: VoiceManager;
  public isVoiceEnabled: boolean = true;
  public voiceVolume: number = 1.0;
  /** 관전 TV의 소리 끄기 (켜기·끄기 설정과 따로) */
  public isMuted = false;
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
      this.audioCtx.resume().catch(() => {});
    }
  }

  /** 사용자 조작(클릭·키) 안에서 불러 무전 비프음용 AudioContext를 만들거나 깨움 */
  public unlock() {
    this.initAudioContext();
  }

  /** 지금 음성을 낼 수 있는지: 켜져 있고, 소리를 끄지 않았고, 브라우저가 소리를 허락함(화면을 한 번 누름) */
  private canSpeak(): boolean {
    return this.isVoiceEnabled && !this.isMuted && isAudioAllowed();
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

  /**
   * 한국어 음성 안내 멘트 재생 (내장 MP3 파일 기반으로 100% 호환).
   * force: 설정 창 [들어 보기]처럼 시연 중이어도·방금 다른 안내가 나왔어도 들려줌 (켜기·소리 끄기·브라우저 허락은 그대로 따름)
   */
  public speak(event: VoiceEventType, options: { force?: boolean } = {}) {
    if (typeof window === 'undefined') return;
    // 소리를 낼 수 없으면 무전 비프음용 AudioContext도 만들지 않음 (클릭 전에 만들면 브라우저 경고가 남)
    if (!this.canSpeak()) return;
    const force = options.force === true;
    if (this.suppressed && !force) return;

    // 너무 잦은 음성 겹침 방지 (최소 0.6초 간격)
    const now = Date.now();
    if (!force && now - this.lastSpokenTime < 600 && event !== 'AMMO_EMPTY') {
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
      // 그사이 소리를 끄거나 음성을 껐으면 내지 않음
      if (!this.canSpeak()) return;
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
          playPromise.catch((err: unknown) => {
            // 화면을 한 번도 클릭하지 않은 기기(관전 TV 등)는 브라우저가 소리를 막고(NotAllowedError),
            // 다음 안내가 앞 안내를 끊으면 AbortError가 남: 둘 다 정상이므로 조용히 넘어감
            if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'AbortError')) return;
            console.warn('Audio playback error:', err);
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

  /** 관전 화면 대기용 시연처럼 잠시 안내 음성을 내지 않을 때 (켜기·끄기 설정은 그대로) */
  public suppressed = false;
  public setSuppressed(suppressed: boolean) {
    this.suppressed = suppressed;
  }

  /** 관전 TV의 소리 끄기: 나오던 안내도 멈춤 */
  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (muted && this.currentAudio) {
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
