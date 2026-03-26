import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "제보 완료",
  robots: { index: false, follow: true },
  alternates: { canonical: "/report/success" }
};

export default function ReportSuccessLayout({ children }: { children: React.ReactNode }) {
  return children;
}
