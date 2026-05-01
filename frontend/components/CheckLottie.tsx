"use client";

/**
 * 변경 전: lottie-react 정적 import로 성공 화면 초기 청크 팽창.
 * 변경 후: next/dynamic(ssr:false)로 청크 분리 — 제출 완료 라우트 LCP·TTI 개선.
 */
import dynamic from "next/dynamic";
import animationData from "@/Img/Check.json";

type Props = {
  className?: string;
};

const LottieLazy = dynamic(() => import("lottie-react").then((m) => m.default), {
  ssr: false,
  loading: () => <div className="h-[150px] w-[161px]" aria-hidden />
});

export default function CheckLottie({ className }: Props) {
  return (
    <LottieLazy className={className} animationData={animationData} loop={false} autoplay />
  );
}
