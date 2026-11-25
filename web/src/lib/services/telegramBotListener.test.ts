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
      callback_query: { id: "cq_4", from: { id: 1008179235 }, data: "track:NIFTY_24200_CE" },
    });
    await telegramBotListener.processUpdate({
      update_id: 105,
      callback_query: { id: "cq_5", from: { id: 1008179235 }, data: "track:BANKNIFTY_51500_CE" },
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

    assert.equal(listTrackedPicks(true, 1008179235).length, 0);
  });

  it("isolates tracked picks between different users in private chats", async () => {
    // User A (1111) tracks NIFTY
    await telegramBotListener.processUpdate({
      update_id: 110,
      callback_query: {
        id: "cq_userA",
        from: { id: 1111, first_name: "Alice" },
        message: { message_id: 501, chat: { id: -5143464220 } }, // clicked in group
        data: "track:NIFTY_24300_CE",
      },
    });

    // User B (2222) tracks BANKNIFTY
    await telegramBotListener.processUpdate({
      update_id: 111,
      callback_query: {
        id: "cq_userB",
        from: { id: 2222, first_name: "Bob" },
        message: { message_id: 502, chat: { id: -5143464220 } }, // clicked in group
        data: "track:BANKNIFTY_52000_PE",
      },
    });

    // Total picks in system = 2
    assert.equal(listTrackedPicks(true).length, 2);

    // User A only sees their own pick
    const userAPicks = listTrackedPicks(true, 1111);
    assert.equal(userAPicks.length, 1);
    assert.equal(userAPicks[0].underlying, "NIFTY");
    assert.equal(userAPicks[0].savedByChatId, 1111);

    // User B only sees their own pick
    const userBPicks = listTrackedPicks(true, 2222);
    assert.equal(userBPicks.length, 1);
    assert.equal(userBPicks[0].underlying, "BANKNIFTY");
    assert.equal(userBPicks[0].savedByChatId, 2222);

    // If User A runs /clear in their private DM, User B's pick remains safe!
    await telegramBotListener.processUpdate({
      update_id: 112,
      message: {
        message_id: 503,
        chat: { id: 1111 },
        text: "/clear",
      },
    });

    assert.equal(listTrackedPicks(true, 1111).length, 0);
    assert.equal(listTrackedPicks(true, 2222).length, 1); // User B's pick untouched!
  });

  it("handles self-contained colon-delimited track: callback with exact entry, stop, and targets", async () => {
    await telegramBotListener.processUpdate({
      update_id: 107,
      callback_query: {
        id: "cq_7",
        from: { id: 1008179235, first_name: "Admin" },
        message: { message_id: 400, chat: { id: -5143464220 } },
        data: "track:NIFTY:24200:CE:145:115:195:240",
      },
    });

    const active = listTrackedPicks(true);
    assert.equal(active.length, 1);
    assert.equal(active[0].underlying, "NIFTY");
    assert.equal(active[0].strike, 24200);
    assert.equal(active[0].optionType, "CE");
    assert.equal(active[0].entry, 145);
    assert.equal(active[0].stop, 115);
    assert.equal(active[0].target1, 195);
    assert.equal(active[0].target2, 240);
  });

  it("handles group commands with bot username suffix like /clear@Upstox_analyzer_bot", async () => {
    await telegramBotListener.processUpdate({
      update_id: 108,
      callback_query: {
        id: "cq_8",
        from: { id: 1 },
        data: "track:BANKNIFTY:52400:PE:320:250:420:510",
      },
    });
    assert.equal(listTrackedPicks(true).length, 1);

    await telegramBotListener.processUpdate({
      update_id: 109,
      message: {
        message_id: 401,
        chat: { id: -5143464220 },
        text: "/clear@Upstox_analyzer_bot",
      },
    });

    assert.equal(listTrackedPicks(true).length, 0);
  });
});
