import assert from "node:assert/strict";
import { test } from "node:test";
import { sendMessage } from "../lib/telegram";

test("Telegram delivery requires an acknowledged API result and preserves the topic", async () => {
  const original = globalThis.fetch;
  const previous = process.env.TELEGRAM_BOT_TOKEN;
  process.env.TELEGRAM_BOT_TOKEN = "synthetic-token";
  try {
    for (const outcome of ["sent", "rejected", "unconfirmed"]) {
      globalThis.fetch = async (url, options) => {
        assert.match(String(url), /sendMessage$/);
        const body = JSON.parse(String(options?.body));
        assert.equal(body.message_thread_id, 42);
        assert.equal(body.parse_mode, "HTML");
        assert.ok(options?.signal);
        return Response.json(outcome === "sent" ? { ok: true } : { ok: false, description: "Private synthetic provider text" }, { status: outcome === "rejected" ? 400 : 200 });
      };
      const send = () => sendMessage(-100123, "Synthetic notice", { parseMode: "HTML", messageThreadId: 42 });
      if (outcome === "sent") await send();
      else await assert.rejects(send, (error: Error) => /Telegram sendMessage failed/.test(error.message) && !/Private synthetic/.test(error.message));
    }
  } finally {
    globalThis.fetch = original;
    if (previous === undefined) delete process.env.TELEGRAM_BOT_TOKEN; else process.env.TELEGRAM_BOT_TOKEN = previous;
  }
});
