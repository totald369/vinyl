import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt =
  "종량제봉투·불연성마대·PP마대(건설마대)·폐기물 스티커 판매처 — 위치 기반 지도";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  let fontData: ArrayBuffer | undefined;
  try {
    const res = await fetch(
      "https://fonts.gstatic.com/s/notosanskr/v36/PbykFmXiEBPT4ITbgNA5CgmG0X7twsZh-v-L.woff"
    );
    if (res.ok) fontData = await res.arrayBuffer();
  } catch {
    fontData = undefined;
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(145deg, #171717 0%, #2a2a2a 55%, #171717 100%)",
          padding: 56,
        }}
      >
        <div
          style={{
            fontSize: 42,
            fontWeight: 800,
            color: "#d4fe1c",
            marginBottom: 28,
            letterSpacing: "-0.02em",
          }}
        >
          trashbagmap
        </div>
        <div
          style={{
            fontSize: 34,
            fontWeight: 700,
            color: "#ffffff",
            textAlign: "center",
            lineHeight: 1.45,
            maxWidth: 1000,
          }}
        >
          종량제봉투 · 불연성마대 · PP마대(건설마대) · 폐기물 스티커
        </div>
        <div
          style={{
            fontSize: 26,
            color: "#b0b0b0",
            marginTop: 32,
            textAlign: "center",
          }}
        >
          내 주변 판매처를 지도·검색으로 찾기
        </div>
      </div>
    ),
    {
      ...size,
      fonts: fontData
        ? [
            {
              name: "Noto Sans KR",
              data: fontData,
              style: "normal",
              weight: 700,
            },
          ]
        : undefined,
    }
  );
}
