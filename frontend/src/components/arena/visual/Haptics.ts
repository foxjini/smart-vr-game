/**
 * Quest 컨트롤러 진동.
 * 총을 든 손의 컨트롤러에서만 울리고, VR 중이 아니면 아무것도 하지 않음 (엔진이 판단).
 */
export type HapticPattern = 'fire' | 'hit' | 'hitBonus' | 'empty' | 'reloadDone' | 'warning' | 'victory';

/** [시작 지연 ms, 세기 0~1, 길이 ms] */
const PATTERNS: Record<HapticPattern, Array<[number, number, number]>> = {
  fire: [[0, 0.22, 22]],
  hit: [[0, 0.55, 45]],
  hitBonus: [
    [0, 0.85, 70],
    [110, 0.55, 45],
  ],
  empty: [[0, 0.12, 16]],
  reloadDone: [
    [0, 0.35, 30],
    [90, 0.35, 30],
  ],
  warning: [[0, 0.5, 90]],
  victory: [
    [0, 0.7, 90],
    [170, 0.7, 90],
    [340, 1.0, 180],
  ],
};

type PulseActuator = { pulse?: (value: number, duration: number) => Promise<boolean> };
type EffectActuator = {
  playEffect?: (type: string, params: { duration: number; strongMagnitude: number; weakMagnitude: number }) => Promise<unknown>;
};
type HapticGamepad = Gamepad & { hapticActuators?: PulseActuator[]; vibrationActuator?: EffectActuator | null };

export class Haptics {
  private timers = new Set<ReturnType<typeof setTimeout>>();

  play(source: XRInputSource | undefined | null, pattern: HapticPattern) {
    const pad = source?.gamepad as HapticGamepad | undefined;
    if (!pad) return;
    for (const [delay, value, duration] of PATTERNS[pattern]) {
      if (delay === 0) {
        this.pulse(pad, value, duration);
      } else {
        const timer = setTimeout(() => {
          this.timers.delete(timer);
          this.pulse(pad, value, duration);
        }, delay);
        this.timers.add(timer);
      }
    }
  }

  private pulse(pad: HapticGamepad, value: number, duration: number) {
    try {
      const actuator = pad.hapticActuators?.[0];
      if (actuator?.pulse) {
        actuator.pulse(value, duration).catch(() => {});
        return;
      }
      pad.vibrationActuator?.playEffect?.('dual-rumble', { duration, strongMagnitude: value, weakMagnitude: value * 0.6 })?.catch(() => {});
    } catch {
      // 진동을 지원하지 않는 컨트롤러는 무시
    }
  }

  dispose() {
    this.timers.forEach((t) => clearTimeout(t));
    this.timers.clear();
  }
}
