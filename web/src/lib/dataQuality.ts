import type { DataSource, SourceInfo } from "./types.ts";

const SOURCE_RANK: Record<DataSource, number> = {
  LIVE: 0,
  END_OF_DAY: 1,
  STALE: 2,
  MOCK: 3,
  UNAVAILABLE: 4,
};

/** The public recommendation source must reflect the worst mandatory dependency. */
export function aggregateRequiredSource(sources: Iterable<SourceInfo>): DataSource {
  let worst: DataSource = "LIVE";
  for (const info of sources) {
    if (SOURCE_RANK[info.source] > SOURCE_RANK[worst]) worst = info.source;
  }
  return worst;
}
