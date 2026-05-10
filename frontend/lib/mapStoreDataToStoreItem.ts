import type { StoreData } from "@/lib/storeData";
import { normalizeProvinceAbbrevForDisplay } from "@/lib/koreaProvinceAliases";
import type { FilterType, StoreItem } from "@/lib/types";

/** 매장 목록 UI( StoreList / StoreCard )용 */
export function mapStoreDataToStoreItem(sd: StoreData): StoreItem {
  const products: FilterType[] = [];
  if (sd.hasTrashBag) products.push("PAY_AS_YOU_THROW");
  if (sd.hasSpecialBag) products.push("NON_BURNABLE_BAG");
  if (sd.hasLargeWasteSticker) products.push("WASTE_STICKER");
  const road = normalizeProvinceAbbrevForDisplay(
    typeof sd.roadAddress === "string" ? sd.roadAddress.trim() : ""
  );
  const addr = normalizeProvinceAbbrevForDisplay(
    typeof sd.address === "string" ? sd.address.trim() : ""
  );
  const address = road || addr || sd.name.trim() || "주소 미등록";

  return {
    id: sd.id,
    name: sd.name,
    address,
    lat: sd.lat,
    lng: sd.lng,
    phone: sd.phone?.trim(),
    products
  };
}
