"use client";

import { useEffect, useState, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";

function ProgressWatcher() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Route transition finished
    const t1 = setTimeout(() => {
      setProgress(100);
    }, 0);
    const t2 = setTimeout(() => {
      setLoading(false);
      setProgress(0);
    }, 250);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [pathname, searchParams]);

  useEffect(() => {
    const handleStart = () => {
      setLoading(true);
      setProgress(25);
    };
    const handleStop = () => {
      setProgress(100);
      setTimeout(() => {
        setLoading(false);
        setProgress(0);
      }, 250);
    };

    window.addEventListener("app:start-loading", handleStart);
    window.addEventListener("app:stop-loading", handleStop);

    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement)?.closest("a");
      if (!target || !target.href) return;
      try {
        const url = new URL(target.href, window.location.origin);
        if (
          url.origin === window.location.origin &&
          (url.pathname !== window.location.pathname || url.search !== window.location.search) &&
          !target.hasAttribute("download") &&
          target.target !== "_blank"
        ) {
          handleStart();
        }
      } catch {
        /* ignore invalid URLs */
      }
    };

    document.addEventListener("click", handleClick, { capture: true });

    return () => {
      window.removeEventListener("app:start-loading", handleStart);
      window.removeEventListener("app:stop-loading", handleStop);
      document.removeEventListener("click", handleClick, { capture: true });
    };
  }, []);

  useEffect(() => {
    if (!loading) return;
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) return prev;
        const diff = Math.max(1, (90 - prev) / 10);
        return prev + diff;
      });
    }, 150);
    return () => clearInterval(interval);
  }, [loading]);

  if (!loading && progress === 0) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] h-[3px] bg-transparent pointer-events-none">
      <div
        className="h-full bg-gradient-to-r from-sky-500 via-teal-400 to-indigo-500 shadow-[0_0_12px_rgba(56,189,248,0.8)] transition-all duration-200 ease-out"
        style={{
          width: `${progress}%`,
          opacity: progress === 100 ? 0 : 1,
        }}
      />
    </div>
  );
}

export function TopProgressBar() {
  return (
    <Suspense fallback={null}>
      <ProgressWatcher />
    </Suspense>
  );
}
