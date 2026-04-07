/** Microsoft Clarity 프로젝트 ID. 미설정 시 아래 기본값 사용. 빈 문자열이면 Clarity 비활성화 */
const CLARITY_DEFAULT_PROJECT_ID = "w7qu8cqpfa";

export function getClarityProjectId(): string | null {
  const raw =
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID : undefined;

  if (raw === undefined) {
    return CLARITY_DEFAULT_PROJECT_ID;
  }

  const trimmed = raw.trim();
  if (trimmed === "") {
    return null;
  }

  if (!/^[a-z0-9]+$/i.test(trimmed)) {
    if (typeof console !== "undefined") {
      console.warn("[Clarity] NEXT_PUBLIC_CLARITY_PROJECT_ID 형식이 올바르지 않습니다:", raw);
    }
    return null;
  }

  return trimmed;
}

export const CLARITY_PROJECT_ID: string | null = getClarityProjectId();
