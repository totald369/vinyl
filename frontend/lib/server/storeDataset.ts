import fs from "fs";
import path from "path";

import type { RawStoreRow, StoreData } from "@/lib/storeData";
import { mergeStoreSources } from "@/lib/storeData";
import type { RawReportRow } from "@/lib/reportStores";

const DATA_DIR = path.join(process.cwd(), "public", "data");
const MERGED_CACHE_FILE = path.join(DATA_DIR, "_merged_cache.json");

function readJsonArray<T>(file: string): T[] {
  const full = path.join(DATA_DIR, file);
  try {
    const raw = fs.readFileSync(full, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

let cached: ReturnType<typeof mergeStoreSources> | null = null;

/**
 * 서버 전용: 병합된 전체 매장(캐시). API에서 필터링만 수행합니다.
 *
 * 변경 전: cold start 마다 38개 JSON(45MB) 동기 read + normalize + dedupe(O(n²) per brand) →
 *          서버리스 인스턴스 init 1~수초 소요.
 * 변경 후: 빌드 타임에 `scripts/build-merged-cache.ts` 가 생성한 단일
 *          `public/data/_merged_cache.json` 만 read → init 시간 대폭 단축.
 *          캐시 파일이 없으면(개발/스크립트 환경) 기존 다중 파일 병합으로 폴백.
 * 측정: 첫 요청 TTFB(서버 cold), Vercel function init 시간.
 */
export function getMergedStores() {
  if (cached) return cached;

  try {
    const raw = fs.readFileSync(MERGED_CACHE_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      cached = parsed as StoreData[];
      return cached;
    }
  } catch {
    /* 캐시 미존재 → 폴백 */
  }
  return mergeFromSourcesFallback();
}

function mergeFromSourcesFallback(): StoreData[] {
  if (cached) return cached;

  const mainRows = readJsonArray<RawStoreRow>("stores.sample.json");
  const gunpoRows = readJsonArray<RawStoreRow>("stores.gunpo.json");
  const goyangRows = readJsonArray<RawStoreRow>("stores.goyang.json");
  const goyangStickerRows = readJsonArray<RawStoreRow>("stores.goyang-sticker.json");
  const reportRows = readJsonArray<RawReportRow>("reports_rows.json");
  const guroNoncombustRows = readJsonArray<RawStoreRow>("stores.guro-noncombust.json");
  const gwanakNoncombustRows = readJsonArray<RawStoreRow>("stores.gwanak-noncombust.json");
  const dobongNoncombustRows = readJsonArray<RawStoreRow>("stores.dobong-noncombust.json");
  const bucheonGbmsRows = readJsonArray<RawStoreRow>("stores.bucheon-gbms.json");
  const busanNamguTrashRows = readJsonArray<RawStoreRow>("stores.busan-namgu-trash.json");
  const busanJungguTrashRows = readJsonArray<RawStoreRow>("stores.busan-junggu-trash.json");
  const busanJungguPpRows = readJsonArray<RawStoreRow>("stores.busan-junggu-pp.json");
  const busanDongguTrashRows = readJsonArray<RawStoreRow>("stores.busan-donggu-trash.json");
  const busanDongnaeTrashRows = readJsonArray<RawStoreRow>("stores.busan-dongnae-trash.json");
  const busanGeumjeongTrashRows = readJsonArray<RawStoreRow>("stores.busan-geumjeong-trash.json");
  const busanGeumjeongSpecialRows = readJsonArray<RawStoreRow>("stores.busan-geumjeong-special.json");
  const busanBukguTrashRows = readJsonArray<RawStoreRow>("stores.busan-bukgu-trash.json");
  const busanBukguSpecialRows = readJsonArray<RawStoreRow>("stores.busan-bukgu-special.json");
  const busanSasangTrashRows = readJsonArray<RawStoreRow>("stores.busan-sasang-trash.json");
  const busanSasangSpecialRows = readJsonArray<RawStoreRow>("stores.busan-sasang-special.json");
  const busanHaeundaeTrashRows = readJsonArray<RawStoreRow>("stores.busan-haeundae-trash.json");
  const busanYeongdoTrashRows = readJsonArray<RawStoreRow>("stores.busan-yeongdo-trash.json");
  const gyeonggiGwangjuFindstoreRows = readJsonArray<RawStoreRow>(
    "stores.gyeonggi-gwangju-findstore.json"
  );
  const gwangjuTrashLifeinsightsRows = readJsonArray<RawStoreRow>(
    "stores.gwangju-trash-lifeinsights.json"
  );
  const daeguBukDalTrashRows = readJsonArray<RawStoreRow>(
    "stores.daegu-buk-dalseo-trash.json"
  );
  const incheonMichuholTrashRows = readJsonArray<RawStoreRow>(
    "stores.incheon-michuhol-trash.json"
  );
  const incheonYeonsuTrashStickerRows = readJsonArray<RawStoreRow>(
    "stores.incheon-yeonsu-trash-sticker.json"
  );
  const incheonNamdongTrashRows = readJsonArray<RawStoreRow>(
    "stores.incheon-namdong-trash.json"
  );
  const incheonBupyeongTrashStickerSpecialRows = readJsonArray<RawStoreRow>(
    "stores.incheon-bupyeong-trash-sticker-special.json"
  );
  const incheonGyeyangGbmsRows = readJsonArray<RawStoreRow>(
    "stores.incheon-gyeyang-gbms.json"
  );
  const gyeonggiSiheungTrashRows = readJsonArray<RawStoreRow>(
    "stores.gyeonggi-siheung-trash.json"
  );
  const daejeonDongguTrashRows = readJsonArray<RawStoreRow>(
    "stores.daejeon-donggu-trash.json"
  );
  const daejeonYuseongTrashRows = readJsonArray<RawStoreRow>(
    "stores.daejeon-yuseong-trash.json"
  );
  const daejeonDaedeokTrashRows = readJsonArray<RawStoreRow>(
    "stores.daejeon-daedeok-trash.json"
  );
  const gangwonWonjuTrashRows = readJsonArray<RawStoreRow>(
    "stores.gangwon-wonju-trash.json"
  );
  const gangwonTaebaekTrashRows = readJsonArray<RawStoreRow>(
    "stores.gangwon-taebaek-trash.json"
  );
  const ulsanDongguTrashRows = readJsonArray<RawStoreRow>(
    "stores.ulsan-donggu-trash.json"
  );
  const ulsanBukguTrashRows = readJsonArray<RawStoreRow>(
    "stores.ulsan-bukgu-trash.json"
  );
  const ulsanBukguSpecialRows = readJsonArray<RawStoreRow>(
    "stores.ulsan-bukgu-special.json"
  );
  const ulsanJungguTrashRows = readJsonArray<RawStoreRow>(
    "stores.ulsan-junggu-trash.json"
  );
  const ulsanJungguSpecialRows = readJsonArray<RawStoreRow>(
    "stores.ulsan-junggu-special.json"
  );
  const chungbukChungjuTrashRows = readJsonArray<RawStoreRow>(
    "stores.chungbuk-chungju-trash.json"
  );
  const chungnamTrashRows = readJsonArray<RawStoreRow>("stores.chungnam-trash.json");
  const chungnamGongjuTrashRows = readJsonArray<RawStoreRow>(
    "stores.chungnam-gongju-trash.json"
  );
  const chungnamGongjuSpecialRows = readJsonArray<RawStoreRow>(
    "stores.chungnam-gongju-special.json"
  );
  const chungbukCheongjuTrashRows = readJsonArray<RawStoreRow>(
    "stores.chungbuk-cheongju-trash.json"
  );
  const chungbukJeungpyeongTrashRows = readJsonArray<RawStoreRow>(
    "stores.chungbuk-jeungpyeong-trash.json"
  );
  const seoulYangcheonSpecialRows = readJsonArray<RawStoreRow>(
    "stores.seoul-yangcheon-special.json"
  );

  cached = mergeStoreSources(
    mainRows,
    gunpoRows,
    goyangRows,
    goyangStickerRows,
    reportRows,
    guroNoncombustRows,
    gwanakNoncombustRows,
    dobongNoncombustRows,
    bucheonGbmsRows,
    busanNamguTrashRows,
    busanJungguTrashRows,
    busanJungguPpRows,
    busanDongguTrashRows,
    busanDongnaeTrashRows,
    busanGeumjeongTrashRows,
    busanGeumjeongSpecialRows,
    busanBukguTrashRows,
    busanBukguSpecialRows,
    busanSasangTrashRows,
    busanSasangSpecialRows,
    busanHaeundaeTrashRows,
    busanYeongdoTrashRows,
    gyeonggiGwangjuFindstoreRows,
    gwangjuTrashLifeinsightsRows,
    daeguBukDalTrashRows,
    incheonMichuholTrashRows,
    incheonYeonsuTrashStickerRows,
    incheonNamdongTrashRows,
    incheonBupyeongTrashStickerSpecialRows,
    incheonGyeyangGbmsRows,
    gyeonggiSiheungTrashRows,
    daejeonDongguTrashRows,
    daejeonYuseongTrashRows,
    daejeonDaedeokTrashRows,
    gangwonWonjuTrashRows,
    gangwonTaebaekTrashRows,
    ulsanDongguTrashRows,
    ulsanBukguTrashRows,
    ulsanBukguSpecialRows,
    ulsanJungguTrashRows,
    ulsanJungguSpecialRows,
    chungbukChungjuTrashRows,
    chungnamTrashRows,
    chungnamGongjuTrashRows,
    chungnamGongjuSpecialRows,
    chungbukCheongjuTrashRows,
    chungbukJeungpyeongTrashRows,
    seoulYangcheonSpecialRows
  );
  return cached as StoreData[];
}
