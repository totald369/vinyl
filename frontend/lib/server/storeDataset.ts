import fs from "fs";
import path from "path";

import type { RawStoreRow } from "@/lib/storeData";
import { mergeStoreSources } from "@/lib/storeData";
import type { RawReportRow } from "@/lib/reportStores";

const DATA_DIR = path.join(process.cwd(), "public", "data");

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

/** 서버 전용: 병합된 전체 매장(캐시). API에서 필터링만 수행합니다. */
export function getMergedStores() {
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
    gyeonggiSiheungTrashRows
  );
  return cached;
}
