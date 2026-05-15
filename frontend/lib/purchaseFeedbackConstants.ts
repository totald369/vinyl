/** 최근 구매 피드백 집계 기간(일) */
export const PURCHASE_FEEDBACK_PERIOD_DAYS = 3;

/** 동일 기기·동일 매장 재참여 제한(시간) */
export const PURCHASE_FEEDBACK_LIMIT_HOURS = 24;

export const PURCHASE_FEEDBACK_LS_PREFIX = "trashbagmap_purchase_feedback_";

export function purchaseFeedbackStorageKey(storeId: string): string {
  return `${PURCHASE_FEEDBACK_LS_PREFIX}${storeId}`;
}

export const PURCHASE_FEEDBACK_DEVICE_KEY = "trashbagmap_device_key";
