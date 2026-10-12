/** 조건부 클래스 이름을 공백으로 이어 붙임 (false·null·undefined는 건너뜀) */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
