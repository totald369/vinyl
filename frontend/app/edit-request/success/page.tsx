import Link from "next/link";

export default function EditRequestSuccessPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-between bg-bg-canvas p-4">
      <div />
      <section className="text-center">
        <div className="mx-auto mb-5 h-24 w-24 rounded-full bg-success-50" />
        <h1 className="text-title-lg text-text-primary">수정요청이 등록되었습니다.</h1>
        <p className="mt-2 text-body-sm text-text-secondary">
          요청주신 내용은 확인 과정을 거쳐 2~3일 내에 업데이트됩니다.
        </p>
      </section>
      <Link href="/" className="mb-6 rounded-xl bg-brand-500 px-4 py-3 text-center text-body-sm text-text-inverse shadow-elevation-2">
        홈으로
      </Link>
    </main>
  );
}
