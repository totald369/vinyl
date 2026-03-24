import { StoreItem } from "@/lib/types";

export const mockStores: StoreItem[] = [
  {
    id: "1",
    name: "강남행복마트",
    address: "서울 강남구 테헤란로 123",
    lat: 37.5012,
    lng: 127.0396,
    products: ["PAY_AS_YOU_THROW", "WASTE_STICKER"],
    phone: "02-123-4567",
    description: "종량제와 스티커를 판매하는 편의형 매장"
  },
  {
    id: "2",
    name: "역삼그린스토어",
    address: "서울 강남구 역삼로 45",
    lat: 37.4963,
    lng: 127.0357,
    products: ["NON_BURNABLE_BAG", "WASTE_STICKER"],
    phone: "02-222-3333",
    description: "불연성 마대를 중심으로 판매"
  },
  {
    id: "3",
    name: "선릉생활용품",
    address: "서울 강남구 선릉로 88",
    lat: 37.5043,
    lng: 127.0489,
    products: ["PAY_AS_YOU_THROW", "NON_BURNABLE_BAG", "WASTE_STICKER"],
    phone: "02-999-0000",
    description: "3개 품목 모두 구매 가능"
  }
];
