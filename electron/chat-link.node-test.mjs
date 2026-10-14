// #2383: a chat link opened from outside the app must reach the page; every
// other ripobot:// link stays with its own handler.
import assert from "node:assert/strict";
import test from "node:test";

import { chatLinkFrom, chatLinkFromCommandLine } from "./chat-link.mjs";

const THREAD_LINK = "ripobot://thread/2633ea27-cc9d-4690-97bf-aca853eca4c6?bot=1f72ec75-821b-44a5-a7a3-93ff64276c7d";
const BOT_LINK = "ripobot://bot/1f72ec75-821b-44a5-a7a3-93ff64276c7d";

test("recognizes the links Copy link and a dashboard make", () => {
  assert.equal(chatLinkFrom(THREAD_LINK), THREAD_LINK);
  assert.equal(chatLinkFrom(BOT_LINK), BOT_LINK);
  assert.equal(chatLinkFrom(` ${BOT_LINK}\n`), BOT_LINK);
  assert.equal(chatLinkFrom("RipoBot://Bot/abc"), "RipoBot://Bot/abc");
});

test("leaves every other link to its own handler", () => {
  for (const other of [
    "ripobot://cloud",
    "ripobot://organization",
    "ripobot://install?url=https://github.com/a/b/team.md",
    "ripobot://threads/abc",
    "ripobot://bots/abc",
    "https://example.com/ripobot://bot/abc",
    `ripobot://bot/${"x".repeat(1024)}`,
    undefined,
    42,
  ]) assert.equal(chatLinkFrom(other), null);
});

test("finds the link among a second launch's arguments", () => {
  assert.equal(chatLinkFromCommandLine(["/usr/bin/ripobot", "--no-sandbox", THREAD_LINK]), THREAD_LINK);
  assert.equal(chatLinkFromCommandLine(["/usr/bin/ripobot", "--no-sandbox", BOT_LINK]), BOT_LINK);
  assert.equal(chatLinkFromCommandLine(["/usr/bin/ripobot", "ripobot://cloud"]), null);
});
