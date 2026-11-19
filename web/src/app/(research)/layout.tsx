import { Sidebar } from "@/components/Sidebar";

// Research shell: static navigation only. Pages in this group read local research files and make no broker calls.
export default function ResearchLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
        <footer className="border-t border-zinc-800 px-4 py-2 text-[11px] text-zinc-500">
          Charts: TradingView Lightweight Charts™ (Apache-2.0), © TradingView. Recommendation-only research tool; you make every trading decision.
        </footer>
      </div>
    </div>
  );
}
