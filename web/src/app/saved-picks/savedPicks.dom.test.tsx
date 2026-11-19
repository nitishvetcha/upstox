// Component tests for the saved-picks page, rendered with React DOM in jsdom. Run with: npm run test:dom
import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM, VirtualConsole } from "jsdom";

const navErrors: string[] = [];
const vc = new VirtualConsole();
vc.on("jsdomError", (e: Error) => navErrors.push(e.message));
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/saved-picks", virtualConsole: vc });
const g = globalThis as unknown as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
g.HTMLElement = dom.window.HTMLElement;
g.Node = dom.window.Node;
g.IS_REACT_ACT_ENVIRONMENT = true;

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { default: SavedPicksPage } = await import("./page.tsx");
const act = (React as unknown as { act: (f: () => Promise<void>) => Promise<void> }).act;

const pause = () => new Promise((r) => setTimeout(r, 0));
const pick = {
  id: "p1", savedAt: "2026-11-13T05:00:00.000Z", instrument: "NIFTY 22000 CE", instrumentType: "OPTION", direction: "LONG",
  entry: 100, stopLoss: 80, targets: [140], source: "RESEARCH", note: "", validation: "NOT VALIDATED", statusLabel: "Saved",
};

function fetchReply(body: unknown, status = 200) {
  return async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function mount() {
  const container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(SavedPicksPage)); });
  return { container, root };
}

async function settle() {
  await act(async () => { await pause(); await pause(); });
}

test("initial mount shows the loading state before the response arrives", async () => {
  g.fetch = () => new Promise(() => {}); // never resolves
  const { container, root } = await mount();
  assert.match(container.textContent ?? "", /Loading saved picks/);
  await act(async () => root.unmount());
});

test("successful response renders the saved picks and no error", async () => {
  g.fetch = fetchReply({ picks: [pick] });
  const { container, root } = await mount();
  await settle();
  assert.match(container.textContent ?? "", /NIFTY 22000 CE/);
  assert.equal(container.querySelector("[role=alert]"), null);
  assert.match(container.textContent ?? "", /Showing 1 of 1 saved picks/);
  await act(async () => root.unmount());
});

test("empty response shows the empty-state message", async () => {
  g.fetch = fetchReply({ picks: [] });
  const { container, root } = await mount();
  await settle();
  assert.match(container.textContent ?? "", /No saved picks yet\./);
  await act(async () => root.unmount());
});

test("401 response redirects to login with the return path (navigation attempted, no picks shown)", async () => {
  navErrors.length = 0;
  g.fetch = fetchReply({ error: "unauthorized" }, 401);
  const { container, root } = await mount();
  await settle();
  assert.ok(navErrors.some((m) => /navigation/i.test(m)), "a navigation to the login page was attempted");
  assert.doesNotMatch(container.textContent ?? "", /NIFTY 22000 CE/);
  await act(async () => root.unmount());
});

test("a non-OK or malformed response shows the exact error message", async () => {
  g.fetch = fetchReply({ oops: true }, 500);
  const { container, root } = await mount();
  await settle();
  const alert = container.querySelector("[role=alert]");
  assert.ok(alert, "error alert is shown");
  assert.equal(alert?.textContent, "Could not load saved picks. The list may be out of date; retry.");
  await act(async () => root.unmount());
});

test("a network failure shows the same error message", async () => {
  g.fetch = async () => { throw new TypeError("network down"); };
  const { container, root } = await mount();
  await settle();
  assert.match(container.querySelector("[role=alert]")?.textContent ?? "", /Could not load saved picks/);
  await act(async () => root.unmount());
});

test("unmount before the response cancels the load: no state is applied and nothing throws", async () => {
  const errors: unknown[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => { errors.push(args); };
  let release: (v: Response) => void = () => {};
  g.fetch = () => new Promise<Response>((resolve) => { release = resolve; });
  try {
    const { container, root } = await mount();
    await act(async () => root.unmount());
    release(new Response(JSON.stringify({ picks: [pick] }), { status: 200, headers: { "Content-Type": "application/json" } }));
    await settle();
    assert.equal(container.childNodes.length, 0, "unmounted tree is not repopulated");
    assert.equal(errors.length, 0, "no React warning or error after unmount");
  } finally {
    console.error = originalError;
  }
});

test("a fresh mount after a failed load recovers the list", async () => {
  g.fetch = fetchReply({ oops: true }, 500);
  const first = await mount();
  await settle();
  assert.ok(first.container.querySelector("[role=alert]"));
  assert.ok(clickButton(first.container, /^Retry$/), "a Retry button is shown in the error state");
  await act(async () => first.root.unmount());
  g.fetch = fetchReply({ picks: [pick] });
  const second = await mount();
  await settle();
  assert.match(second.container.textContent ?? "", /NIFTY 22000 CE/, "reloading recovers the list");
  await act(async () => second.root.unmount());
});

function clickButton(container: HTMLElement, label: RegExp): HTMLButtonElement | null {
  const buttons = Array.from(container.querySelectorAll("button")) as HTMLButtonElement[];
  return buttons.find((b) => label.test(b.textContent ?? "")) ?? null;
}
async function click(el: HTMLElement) {
  await act(async () => { el.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true })); });
}

test("Retry button appears only in the error state, and a successful retry shows the list and clears the error", async () => {
  let calls = 0;
  g.fetch = async () => { calls++; return calls === 1 ? new Response("{}", { status: 500 }) : new Response(JSON.stringify({ picks: [pick] }), { status: 200, headers: { "Content-Type": "application/json" } }); };
  const { container, root } = await mount();
  await settle();
  assert.ok(container.querySelector("[role=alert]"), "error is shown");
  const retry = clickButton(container, /^Retry$/);
  assert.ok(retry, "Retry button is shown in the error state");
  await click(retry!);
  await settle();
  assert.equal(container.querySelector("[role=alert]"), null, "error cleared after a successful retry");
  assert.match(container.textContent ?? "", /NIFTY 22000 CE/);
  assert.equal(calls, 2, "exactly one retry request");
  await act(async () => root.unmount());
});

test("repeated clicks while a retry is in flight send only one request", async () => {
  let calls = 0;
  let release: (r: Response) => void = () => {};
  g.fetch = () => { calls++; if (calls === 1) return Promise.resolve(new Response("{}", { status: 500 })); return new Promise<Response>((res) => { release = res; }); };
  const { container, root } = await mount();
  await settle();
  const retry = clickButton(container, /^Retry$/)!;
  await click(retry);
  await click(clickButton(container, /Retry|Loading/) ?? retry);
  await click(clickButton(container, /Retry|Loading/) ?? retry);
  release(new Response(JSON.stringify({ picks: [pick] }), { status: 200, headers: { "Content-Type": "application/json" } }));
  await settle();
  assert.equal(calls, 2, "one initial request and one retry request only");
  await act(async () => root.unmount());
});

test("while a retry is loading, the Retry button is disabled and the loading row is shown", async () => {
  let calls = 0;
  g.fetch = () => { calls++; if (calls === 1) return Promise.resolve(new Response("{}", { status: 500 })); return new Promise<Response>(() => {}); };
  const { container, root } = await mount();
  await settle();
  await click(clickButton(container, /^Retry$/)!);
  await settle();
  assert.match(container.textContent ?? "", /Loading saved picks/);
  const btn = clickButton(container, /Retry/);
  assert.ok(btn === null || btn.disabled, "button disabled while loading");
  await act(async () => root.unmount());
});

test("a failed retry keeps the error message and the Retry button", async () => {
  g.fetch = async () => new Response("{}", { status: 500 });
  const { container, root } = await mount();
  await settle();
  await click(clickButton(container, /^Retry$/)!);
  await settle();
  assert.equal(container.querySelector("[role=alert]")?.textContent, "Could not load saved picks. The list may be out of date; retry.");
  assert.ok(clickButton(container, /^Retry$/), "Retry is still available");
  await act(async () => root.unmount());
});

test("401 on retry still redirects to login (navigation attempted)", async () => {
  navErrors.length = 0;
  let calls = 0;
  g.fetch = async () => { calls++; return calls === 1 ? new Response("{}", { status: 500 }) : new Response("{}", { status: 401 }); };
  const { container, root } = await mount();
  await settle();
  await click(clickButton(container, /^Retry$/)!);
  await settle();
  assert.ok(navErrors.some((m) => /navigation/i.test(m)), "redirect to login was attempted on retry");
  assert.doesNotMatch(container.textContent ?? "", /NIFTY 22000 CE/);
  await act(async () => root.unmount());
});

test("clicking Delete issues DELETE request with pick id and reloads", async () => {
  let deleteRequested = false;
  let deleteUrl = "";
  let deleteMethod = "";
  let listCalls = 0;

  g.fetch = async (url: string | URL, init?: RequestInit) => {
    const urlStr = String(url);
    if (init?.method === "DELETE") {
      deleteRequested = true;
      deleteUrl = urlStr;
      deleteMethod = init.method;
      return new Response(JSON.stringify({ deleted: "p1" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    listCalls++;
    const picks = deleteRequested ? [] : [pick];
    return new Response(JSON.stringify({ picks }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const { container, root } = await mount();
  await settle();
  assert.match(container.textContent ?? "", /NIFTY 22000 CE/);

  const deleteBtn = clickButton(container, /Delete/);
  assert.ok(deleteBtn, "Delete button is present on the pick row");
  await click(deleteBtn!);
  await settle();

  assert.ok(deleteRequested, "DELETE request was triggered");
  assert.equal(deleteMethod, "DELETE");
  assert.match(deleteUrl, /\/api\/saved-picks\?id=p1/);
  assert.match(container.textContent ?? "", /No saved picks yet\./, "empty state displayed after deletion");
  await act(async () => root.unmount());
});

test("a failed Delete displays explicit error message", async () => {
  g.fetch = async (url: string | URL, init?: RequestInit) => {
    if (init?.method === "DELETE") {
      return new Response(JSON.stringify({ error: "failed" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ picks: [pick] }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const { container, root } = await mount();
  await settle();

  const deleteBtn = clickButton(container, /Delete/);
  assert.ok(deleteBtn);
  await click(deleteBtn!);
  await settle();

  const alert = container.querySelector("[role=alert]");
  assert.ok(alert, "error alert is shown");
  assert.match(alert?.textContent ?? "", /Could not delete the pick/);
  assert.match(container.textContent ?? "", /NIFTY 22000 CE/, "pick remains visible after failed delete");
  await act(async () => root.unmount());
});
