import { timingSafeEqual, createHash } from "node:crypto";

export function isSchedulerRequest(req: Request, token: string | undefined = process.env.SCHEDULER_TOKEN): boolean {
  const supplied = req.headers.get("x-scheduler-token") ?? "";
  if (!token || !supplied) return false;
  const digest = (v: string) => createHash("sha256").update(v).digest();
  return timingSafeEqual(digest(token), digest(supplied));
}
