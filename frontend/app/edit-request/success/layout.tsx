import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "수정 요청 완료",
  robots: { index: false, follow: true },
  alternates: { canonical: "/edit-request/success" }
};

export default function EditRequestSuccessLayout({ children }: { children: React.ReactNode }) {
  return children;
}
