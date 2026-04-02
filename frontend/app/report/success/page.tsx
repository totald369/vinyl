import Link from "next/link";
import CheckLottie from "@/components/CheckLottie";
import { SITE_BRAND_KO } from "@/lib/seoBrand";

export default function ReportSuccessPage() {
  return (
    <main className="mx-auto flex h-screen max-w-md flex-col overflow-hidden bg-white">
      <header className="flex h-14 w-full shrink-0 items-center justify-end bg-white px-2">
        <Link href="/" className="flex size-12 items-center justify-center" aria-label="닫기">
          <img src="/Img/Icon/close_32.svg" alt="" width={32} height={32} className="size-8" />
        </Link>
      </header>

      <section className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 text-center">
        <CheckLottie className="h-[150px] w-[161px]" />
        <div className="mt-4 flex flex-col items-center gap-1">
          <h1 className="text-[20px] font-bold leading-[1.5] text-[#171717]">제보가 등록되었습니다.</h1>
          <p className="text-[16px] font-normal leading-[1.5] text-[#666666]">
            제보해주신 내용은 확인 과정을 거쳐 <br />
            2~3일 내에 업데이트됩니다.
          </p>
        </div>
      </section>

      <div className="w-full shrink-0 px-4 pb-2">
        <Link
          href="/"
          className="flex h-12 w-full items-center justify-center rounded-[8px] bg-[#171717] text-center text-[16px] font-bold leading-[1.5] text-[#d4fe1c]"
        >
          {SITE_BRAND_KO} 홈으로
        </Link>
      </div>

      <p className="pb-1 text-center text-[12px] text-[#999999]">{SITE_BRAND_KO}</p>

      <div className="h-[33px] w-full shrink-0 bg-white pb-[env(safe-area-inset-bottom,0px)]">
        <div className="relative mx-auto h-full w-[135px]">
          <span className="absolute bottom-2 left-1/2 h-[5px] w-[135px] -translate-x-1/2 rounded-[100px] bg-[#222222]" />
        </div>
      </div>
    </main>
  );
}
