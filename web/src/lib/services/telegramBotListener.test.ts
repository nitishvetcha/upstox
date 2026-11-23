import { describe, it, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tracked-listener-test-"));
process.env.TRACKED_PICKS_DIR = tempDir;

import { telegramBotListener } from "./telegramBotListener.ts";
import { listTrackedPicks, clearAllTrackedPicks } from "./trackedPicksStore.ts";

describe("telegramBotListener", () => {
  beforeEach(() => {
    clearAllTrackedPicks();
  });

  after(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it("handles track: callback query and stores pick in tracked store", async () => {
    await telegramBotListener.processUpdate({
      update_id: 101,
      callback_query: {
        id: "cq_1",
        from: { id: 1008179235, first_name: "Nitish" },
        message: { message_id: 200, chat: { id: -5143464220 } },
        data: "track:NIFTY_24200_CE",
      },
    });

    const active = listTrackedPicks(true);
    assert.equal(active.length, 1);
    assert.equal(active[0].underlying, "NIFTY");
    assert.equal(active[0].strike, 24200);
    assert.equal(active[0].optionType, "CE");
  });

  it("handles untrack: callback query and removes pick from tracked store", async () => {
    await telegramBotListener.processUpdate({
      update_id: 102,
      callback_query: {
        id: "cq_2",
        from: { id: 1008179235 },
        data: "track:BANKNIFTY_51800_PE",
      },
    });

    assert.equal(listTrackedPicks(true).length, 1);

    await telegramBotListener.processUpdate({
      update_id: 103,
      callback_query: {
        id: "cq_3",
        from: { id: 1008179235 },
        data: "untrack:BANKNIFTY_51800_PE",
      },
    });

    assert.equal(listTrackedPicks(true).length, 0);
  });

  it("handles /clear text command to purge all tracked options", async () => {
    await telegramBotListener.processUpdate({
      update_id: 104,
      callback_query: { id: "cq_4", from: { id: 1 }, data: "track:NIFTY_24200_CE" },
    });
    await telegramBotListener.processUpdate({
      update_id: 105,
      callback_query: { id: "cq_5", from: { id: 1 }, data: "track:BANKNIFTY_51500_CE" },
    });

    assert.equal(listTrackedPicks(true).length, 2);

    await telegramBotListener.processUpdate({
      update_id: 106,
      message: {
        message_id: 301,
        chat: { id: 1008179235 },
        text: "/clear",
      },
    });

    assert.equal(listTrackedPicks(true).length, 0);
  });
});
