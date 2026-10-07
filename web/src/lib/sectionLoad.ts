// Independent section loading: one failing or hanging data source degrades only its own section.
export type SectionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function loadSection<T>(fn: () => Promise<T>, timeoutMs = 20_000): Promise<SectionResult<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const data = await Promise.race([
      fn(),
      new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs / 1000}s`)), timeoutMs))),
    ]);
    if (data === null || data === undefined) return { ok: false, error: "empty response" };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}
