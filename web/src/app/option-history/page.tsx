export const dynamic = "force-dynamic";

import { upstoxHistoricalOptions } from "@/lib/adapters/upstoxHistoricalOptionsAdapter";
import { buildPhase12Report } from "@/lib/historicalOptionsDataset";
import { Card } from "@/components/ui";

// Historical option data: only real provider data is ever charted. When blocked, show why — never a fake chart.
export default async function OptionHistoryPage() {
  const report = buildPhase12Report(await upstoxHistoricalOptions.getAvailability(), [], null);
  const caps = report.providerCapabilityReport.capabilities;
  const blocked = report.phase12Decision !== "REAL_DATA_AVAILABLE";
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-xl font-bold text-zinc-100">Option History</h1>
      {blocked ? (
        <Card className="space-y-3 p-5">
          <h2 className="text-lg font-semibold text-amber-300">Historical Option Data Unavailable</h2>
          <dl className="grid grid-cols-[10rem_1fr] gap-y-1 text-sm">
            <dt className="text-zinc-500">Provider</dt><dd className="text-zinc-200">{report.provider}</dd>
            <dt className="text-zinc-500">Access</dt><dd className="font-mono text-zinc-200">{report.providerCapabilityReport.accessStatus}</dd>
            <dt className="text-zinc-500">Error</dt><dd className="font-mono text-zinc-200">{report.blockerCode ?? "UDAPI1149 (last confirmed)"}</dd>
            <dt className="text-zinc-500">Requirement</dt><dd className="text-zinc-200">Upstox Plus historical expired-instrument access</dd>
            <dt className="text-zinc-500">Alternative</dt><dd className="text-zinc-200">Model-derived (Black-Scholes) option simulation, used by backtests</dd>
          </dl>
          <p className="rounded border border-amber-800 bg-amber-950/40 p-2 text-sm text-amber-200">
            Important: model-derived data is not real historical market data. No historical option chart is shown.
          </p>
          {report.blockerMessage && <p className="text-xs text-zinc-500">{report.blockerMessage}</p>}
        </Card>
      ) : (
        <Card className="p-5 text-sm text-emerald-300">Real historical option data is available ({report.datasetId}).</Card>
      )}
      <Card className="p-4">
        <h2 className="mb-2 text-sm font-semibold text-zinc-200">Provider capability matrix</h2>
        <table className="w-full text-xs">
          <tbody>
            {Object.entries(caps).map(([k, v]) => (
              <tr key={k} className="border-t border-zinc-800">
                <td className="py-1 text-zinc-400">{k}</td>
                <td className={`py-1 font-mono ${v === "AVAILABLE" ? "text-emerald-400" : "text-amber-300"}`}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-zinc-500">The live option chain is a separate feed — see Option Chain. Historical limits do not block live recommendations.</p>
      </Card>
    </div>
  );
}
