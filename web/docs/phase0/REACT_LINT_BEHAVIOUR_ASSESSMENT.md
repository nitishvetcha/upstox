# React lint assessment: saved-picks/page.tsx and OpsPanel.tsx

Status: **assessment only. Neither component has been changed.** Waiting for owner review and approval.

## 1. saved-picks/page.tsx

- **Exact error:** `react-hooks/set-state-in-effect` at line 33: `useEffect(() => { load(); }, []);`
- **Rule meaning:** calling `setState` synchronously inside an effect can cause extra renders. `load()` calls `setLoading`, `setPicks` and `setError` after an awaited fetch, but the rule flags the call site.
- **Current behaviour:** on mount, the page fetches `/api/saved-picks`. It redirects to login on 401, updates the list, or shows the error text "Could not load saved picks...". Loading state is cleared in `finally`.
- **Proposed fix (smallest safe):** keep the fetch, but start it through a helper defined outside the effect and call it from the effect with a cancellation flag:
  ```
  useEffect(() => {
    let cancelled = false;
    (async () => { /* same body as load, with setState guarded by !cancelled */ })();
    return () => { cancelled = true; };
  }, []);
  ```
  Alternatively, a `useSyncExternalStore`-free pattern with a `reload` counter. The first is preferred.
- **User-facing impact:** none intended. Behaviour on mount, 401 redirect, error text and loading state stay the same. A navigation away mid-fetch no longer updates an unmounted component.
- **Required tests:** existing `a11yLabels.test.ts` (keeps the error wording). Add: (a) mounted fetch populates the list; (b) 401 redirects; (c) unmount before response does not set state; (d) error text appears on a bad response.

## 2. OpsPanel.tsx

- **Exact error:** `react-hooks/purity` at line 51: `const hours = (Date.now() - t) / 3_600_000;` inside render.
- **Rule meaning:** `Date.now()` in render makes output depend on when React re-renders, not on props alone.
- **Current behaviour:** the "Last stock collection" line shows the hours since the last stored run. Under 24 hours is grey. Over 24 hours shows "STALE (stored run, not current prices)" in amber. The value is computed each render.
- **Proposed fix (smallest safe):** take `now` from the parent as a prop, or keep a `now` state updated once per minute with `setInterval` inside an effect. The second keeps the display current without an extra prop. Owner to choose.
- **User-facing impact:** with a per-minute `now`, the age label updates on its own every minute instead of only when something else re-renders. The 24-hour STALE threshold and wording are unchanged.
- **Required tests:** (a) under 24 hours shows hours and grey class; (b) over 24 hours shows STALE wording; (c) no collection run shows "no collection run recorded"; (d) age updates after the interval tick (fake timers).

## 3. Decision requested

1. Approve the saved-picks fix (cancellation pattern).
2. Choose the OpsPanel option: a `now` prop from the parent, or a minute ticker inside the panel.
3. Approve the listed tests before the change is made.
