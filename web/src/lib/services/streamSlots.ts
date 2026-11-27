export const MAX_LIVE_STREAMS = 5;

let open = 0;

// Returns a release function, or null when every slot is taken. Release is idempotent.
export function acquireStreamSlot(): (() => void) | null {
  if (open >= MAX_LIVE_STREAMS) return null;
  open++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    open--;
  };
}

export function openStreamCount(): number {
  return open;
}
