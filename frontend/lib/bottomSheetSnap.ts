/**
 * 바텀시트 3단 스냅 (translateY 기준: 0 = 최대 펼침, max = 접힘 peek)
 */

export type BottomSheetSnap = "expanded" | "half" | "collapsed";

/** collapsed ↔ expanded 사이 half 위치 (0~1, maxTy 에 곱함) */
export const BOTTOM_SHEET_HALF_RATIO = 0.5;

export type SnapGeometry = {
  maxTy: number;
  /** 스냅 지점 translateY, 오름차순 [expanded, half, collapsed] */
  points: [number, number, number];
};

export function getBottomSheetSnapGeometry(maxTy: number): SnapGeometry {
  const safeMax = Math.max(0, maxTy);
  let half = Math.round(safeMax * BOTTOM_SHEET_HALF_RATIO);
  if (safeMax >= 3) {
    half = Math.max(1, Math.min(safeMax - 1, half));
  } else {
    half = Math.floor(safeMax / 2);
  }
  return {
    maxTy: safeMax,
    points: [0, half, safeMax]
  };
}

export function snapToTy(snap: BottomSheetSnap, geom: SnapGeometry): number {
  const { points } = geom;
  switch (snap) {
    case "expanded":
      return points[0];
    case "half":
      return points[1];
    case "collapsed":
      return points[2];
    default:
      return points[2];
  }
}

export function tyToSnap(ty: number, geom: SnapGeometry): BottomSheetSnap {
  const { points } = geom;
  let best: BottomSheetSnap = "collapsed";
  let bestD = Infinity;
  const labels: BottomSheetSnap[] = ["expanded", "half", "collapsed"];
  for (let i = 0; i < 3; i++) {
    const d = Math.abs(ty - points[i]);
    if (d < bestD) {
      bestD = d;
      best = labels[i];
    }
  }
  return best;
}

const VY_STRONG = 0.5;
const VY_WEAK = 0.28;

/** 탭과 구분하기 위한 최소 제스처 (이동 또는 이 이상의 속도면 스냅 로직 사용) */
export const BOTTOM_SHEET_TAP_VELOCITY_MAX = 0.22;

/**
 * 손을 뗀 위치(hardTy)와 속도(vy: px/ms, 양수=손가락이 아래로)로 목표 translateY 결정
 */
export function resolveSnapTyFromRelease(
  hardTy: number,
  vy: number,
  geom: SnapGeometry,
  hasMeaningfulDrag: boolean
): number {
  const { points } = geom;
  const [p0, , p2] = points;
  const EPS = 4;

  if (!hasMeaningfulDrag) {
    return nearestPoint(hardTy, points);
  }

  if (vy < -VY_STRONG) {
    const moreOpen = points.filter((p) => p < hardTy - EPS);
    return moreOpen.length ? Math.max(...moreOpen) : p0;
  }
  if (vy > VY_STRONG) {
    const moreClosed = points.filter((p) => p > hardTy + EPS);
    return moreClosed.length ? Math.min(...moreClosed) : p2;
  }

  if (vy < -VY_WEAK) {
    const moreOpen = points.filter((p) => p < hardTy - EPS);
    if (moreOpen.length) return Math.max(...moreOpen);
  } else if (vy > VY_WEAK) {
    const moreClosed = points.filter((p) => p > hardTy + EPS);
    if (moreClosed.length) return Math.min(...moreClosed);
  }

  return nearestPoint(hardTy, points);
}

function nearestPoint(y: number, points: readonly number[]): number {
  let best = points[0];
  let bestD = Math.abs(y - best);
  for (const p of points) {
    const d = Math.abs(y - p);
    if (d < bestD) {
      best = p;
      bestD = d;
    }
  }
  return best;
}

export function tyToSnapExact(targetTy: number, geom: SnapGeometry): BottomSheetSnap {
  const { points } = geom;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(targetTy - points[i]) < 2) {
      return (["expanded", "half", "collapsed"] as const)[i];
    }
  }
  return tyToSnap(targetTy, geom);
}

/** 핸들 탭 시 collapsed → half → expanded → collapsed */
export function cycleBottomSheetSnap(current: BottomSheetSnap): BottomSheetSnap {
  if (current === "collapsed") return "half";
  if (current === "half") return "expanded";
  return "collapsed";
}
