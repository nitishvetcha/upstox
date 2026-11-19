// Client-side helper: where to send a user whose request was refused for lack of a session.
// The return destination is validated by the same rules as the server (same-origin paths only).
import { safeNextPath } from "./redirectSafety.ts";

export function loginUrlFor(currentPathWithQuery: string): string {
  return "/login?next=" + encodeURIComponent(safeNextPath(currentPathWithQuery));
}
