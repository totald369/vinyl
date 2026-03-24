import StoreList from "@/components/StoreList";
import { mockStores } from "@/lib/mock";

export default function StoresPage() {
  return (
    <main className="mx-auto max-w-md space-y-4 p-4">
      <header className="pt-2">
        <h1 className="text-xl font-bold">판매처 목록</h1>
        <p className="text-sm text-slate-600">지도에서 확인한 판매처를 목록으로 볼 수 있어요.</p>
      </header>
      <StoreList contentState={mockStores.length ? "ready" : "empty"} stores={mockStores} />
    </main>
  );
}
