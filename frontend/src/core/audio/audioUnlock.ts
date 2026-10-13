/**
 * 브라우저 자동 재생 정책에 따른 "소리를 낼 수 있는지" 상태.
 * 브라우저는 화면을 한 번도 누르지 않은 페이지의 소리를 막음. 관전 TV처럼 주소만 열어 두는 화면은
 * 누군가 한 번 클릭(또는 키 입력)해야 소리가 나므로, 그 상태를 화면에 알리고 첫 조작에서 소리를 켬.
 * 크롬을 --autoplay-policy=no-user-gesture-required 옵션으로 켜면 클릭 없이도 'allowed'가 됨.
 *
 * - 'unknown': 아직 확인 전 (안내를 띄우지 않음)
 * - 'locked': 소리가 막혀 있음 (클릭하면 풀림)
 * - 'allowed': 소리를 낼 수 있음 (한 번 풀리면 되돌아가지 않음)
 */
export type AudioStatus = 'unknown' | 'locked' | 'allowed';

/** 사용자 조작으로 인정되는 입력. 터치는 손을 뗄 때(touchend·pointerup)에야 인정됨 */
const GESTURE_EVENTS = ['pointerdown', 'mousedown', 'pointerup', 'touchend', 'keydown', 'click'] as const;

/** 0.1초 무음 WAV (8kHz·8비트·모노). 소리가 막혀 있는지 재생해 보는 데만 씀 */
const SILENT_WAV = (() => {
  const samples = 800;
  const bytes = new Uint8Array(44 + samples);
  const view = new DataView(bytes.buffer);
  const text = (at: number, s: string) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // 모노
  view.setUint32(24, 8000, true);
  view.setUint32(28, 8000, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  text(36, 'data');
  view.setUint32(40, samples, true);
  bytes.fill(128, 44); // 8비트 무음은 128
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return `data:audio/wav;base64,${typeof btoa === 'function' ? btoa(binary) : ''}`;
})();

let status: AudioStatus = 'unknown';
let unlockedAt = -Infinity;
let probe: Promise<void> | null = null;
const subscribers = new Set<() => void>();

function setStatus(next: AudioStatus) {
  if (status === 'allowed' || status === next) return;
  status = next;
  subscribers.forEach((fn) => fn());
}

/** 이 페이지에서 사용자가 한 번이라도 클릭·키 입력을 했는지 (지원하지 않는 옛 브라우저는 했다고 봄) */
function hasBeenActivated(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  return !ua || ua.hasBeenActive;
}

/** 지금 소리를 내도 되는지. 아니면 AudioContext를 만들지 않음 (만들면 브라우저 경고가 남고 어차피 소리가 나지 않음) */
export function isAudioAllowed(): boolean {
  return status === 'allowed' || hasBeenActivated();
}

export function getAudioStatus(): AudioStatus {
  return status;
}

export function subscribeAudioStatus(fn: () => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

/** 방금(ms 안에) 클릭·키 입력으로 소리가 풀렸는지. 같은 클릭이 소리 버튼을 눌러 바로 꺼 버리지 않게 할 때 씀 */
export function unlockedRecently(ms = 600): boolean {
  return typeof performance !== 'undefined' && performance.now() - unlockedAt < ms;
}

/**
 * 클릭 없이도 소리를 낼 수 있는지 한 번 확인 (AudioContext는 만들지 않음).
 * 이미 조작한 페이지면 바로 'allowed', 아니면 무음을 재생해 보고 막히면 'locked'
 */
export function probeAutoplay(): Promise<void> {
  if (probe) return probe;
  probe = (async () => {
    if (typeof window === 'undefined') return;
    if (hasBeenActivated()) {
      setStatus('allowed');
      return;
    }
    const policy = (navigator as Navigator & { getAutoplayPolicy?: (type: string) => string }).getAutoplayPolicy;
    if (typeof policy === 'function') {
      try {
        setStatus(policy.call(navigator, 'audiocontext') === 'allowed' ? 'allowed' : 'locked');
        return;
      } catch {
        // 지원하지 않는 형식이면 아래처럼 직접 재생해 봄
      }
    }
    const el = new Audio(SILENT_WAV);
    el.volume = 1;
    // 막혀 있으면 브라우저가 바로 거부함. 허락된 경우는 첫 화면을 그리느라 바쁜 PC에서 몇 초 걸릴 수 있어 넉넉히 기다리고,
    // 그보다 늦게 성공해도 그때 'allowed'로 바꿈
    const attempt = el.play().then(
      () => {
        el.pause();
        setStatus('allowed');
      },
      () => {}
    );
    await Promise.race([attempt, new Promise((resolve) => setTimeout(resolve, 8000))]);
    if (status !== 'allowed') setStatus(hasBeenActivated() ? 'allowed' : 'locked');
  })();
  return probe;
}

/**
 * 첫 클릭·키 입력에서 소리를 켬. onGesture는 그 입력 안에서 불림 (AudioContext를 그 안에서 만들어야 하는 브라우저 대비).
 * 브라우저가 사용자 조작으로 인정한 입력일 때만 처리하고 리스너를 지움. 돌려준 함수로 미리 지울 수 있음 (StrictMode 재마운트)
 */
export function installAudioUnlock(onGesture: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => {
    const ua = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
    if (ua && !ua.isActive) return;
    remove();
    if (status !== 'allowed') unlockedAt = performance.now();
    setStatus('allowed');
    onGesture();
  };
  const remove = () => GESTURE_EVENTS.forEach((type) => window.removeEventListener(type, handler, true));
  GESTURE_EVENTS.forEach((type) => window.addEventListener(type, handler, true));
  return remove;
}
