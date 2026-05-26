export type ActivityType =
  | "USER_REPORT_REFLECTED"
  | "STORE_INFO_UPDATED"
  | "REGION_DATA_ADDED";

export interface ActivityItem {
  id: string;
  type: ActivityType;
  createdAt: string;
  affectedRegions?: string[];
  affectedCount?: number;
  count?: number;
}

export type ActivityMessagePart = { text: string; bold?: boolean };

/** 오늘 기준 최근 N일 activity 만 패널에 노출 */
export const ACTIVITY_VISIBLE_DAYS = 14;
const MAX_VISIBLE = 3;

export function formatActivityPanelDate(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split("-");
  if (!y || !m || !d) return "";
  return `(${y}.${m}.${d})`;
}

/** `YYYY-MM-DD` 를 로컬 자정으로 파싱 — `new Date("YYYY-MM-DD")` UTC 해석으로 인한 필터 오차 방지 */
export function parseActivityLocalDate(isoDate: string): Date | null {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map((part) => Number(part));
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

export function buildActivityMessageParts(item: ActivityItem): ActivityMessagePart[] {
  switch (item.type) {
    case "USER_REPORT_REFLECTED": {
      const n = item.count ?? 1;
      if (n === 1) {
        return [
          { text: "사용자 제보", bold: true },
          { text: "가 1건 반영되었어요." }
        ];
      }
      return [
        { text: "사용자 제보 ", bold: true },
        { text: `${n}건이 반영되었어요.` }
      ];
    }
    case "STORE_INFO_UPDATED": {
      const regions = item.affectedRegions ?? [];
      const count = item.affectedCount ?? 1;
      if (regions.length <= 1) {
        const region = regions[0] ?? "해당 지역";
        return [
          { text: region, bold: true },
          { text: ` 판매처 정보 ${count}건 수정되었어요.` }
        ];
      }
      const first = regions[0];
      const other = regions.length - 1;
      return [
        { text: `${first} 외 ${other}지역`, bold: true },
        { text: " 정보가 수정되었어요." }
      ];
    }
    case "REGION_DATA_ADDED": {
      const regions = item.affectedRegions ?? [];
      if (regions.length === 2) {
        return [
          { text: `${regions[0]}·${regions[1]}`, bold: true },
          { text: " 판매 데이터가 추가되었어요." }
        ];
      }
      if (regions.length <= 1) {
        const region = regions[0] ?? "신규 지역";
        return [
          { text: region, bold: true },
          { text: " 판매 데이터가 추가되었어요." }
        ];
      }
      const first = regions[0];
      const other = regions.length - 1;
      return [
        { text: `${first} 외 ${other}지역 `, bold: true },
        { text: "데이터가 추가되었어요." }
      ];
    }
    default:
      return [{ text: "서비스 정보가 업데이트되었어요." }];
  }
}

export function getActivityIconSrc(type: ActivityType): string {
  switch (type) {
    case "USER_REPORT_REFLECTED":
      return "/Img/Icon/message_16.svg";
    case "STORE_INFO_UPDATED":
      return "/Img/Icon/edit_16.svg";
    case "REGION_DATA_ADDED":
      return "/Img/Icon/region_update_16.svg";
    default:
      return "/Img/Icon/info_24.svg";
  }
}

export function selectVisibleActivities(items: ActivityItem[], now = new Date()): ActivityItem[] {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - ACTIVITY_VISIBLE_DAYS);
  cutoff.setHours(0, 0, 0, 0);

  return items
    .filter((item) => {
      const d = parseActivityLocalDate(item.createdAt);
      return d != null && d >= cutoff;
    })
    .sort((a, b) => {
      const da = parseActivityLocalDate(a.createdAt)?.getTime() ?? 0;
      const db = parseActivityLocalDate(b.createdAt)?.getTime() ?? 0;
      return db - da;
    })
    .slice(0, MAX_VISIBLE);
}

export function getPanelReferenceDate(items: ActivityItem[]): string | null {
  if (items.length === 0) return null;
  return items[0].createdAt.slice(0, 10);
}
