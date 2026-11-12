import assert from "node:assert/strict";
import { test } from "node:test";
import { formatNotification, notificationSchema } from "../lib/notifications";

test("dashboard links no longer claim to open Notion and legacy Notion links retain an accurate label", () => {
  for (const path of ["/council", "/admin"]) {
    const result = formatNotification({ type: "application", text: "New request", url: `https://regencommons.com${path}#applications/id` });
    assert.match(result, /Open council dashboard/);
    assert.doesNotMatch(result, /Notion/);
  }
  assert.match(formatNotification({ type: "seed", url: "https://www.notion.so/example" }), /View in Notion/);
  assert.match(formatNotification({ type: "seed", url: "https://example.test/map" }), /Open submission/);
});
test("contact notifications have their own heading and link to the private message", () => {
  const result = formatNotification({ type: "contact", text: "New message", url: "https://regencommons.com/council#messages/id" });
  assert.match(result, /New contact message/);
  assert.match(result, /Open message in council dashboard/);
  assert.doesNotMatch(result, /Notion/);
});
test("notification schema rejects malformed fields and unsafe links", () => {
  for (const input of [null, [], { type: "other" }, { type: "contact", text: {} }, { type: "contact", data: [] },
    ...["javascript:alert(1)", "http://example.test", "https://user:pass@example.test"].map((url) => ({ type: "contact", url }))]) {
    assert.equal(notificationSchema.safeParse(input).success, false);
  }
});
test("notifications escape HTML text and attributes and keep long messages within Telegram's text limit", () => {
  const result = formatNotification({ type: "contact", text: '<b>hello & "there"</b>', url: 'https://example.test/?q="hello"&a=b' });
  assert.match(result, /&lt;b&gt;hello &amp; &quot;there&quot;&lt;\/b&gt;/);
  assert.match(result, /q=&quot;hello&quot;&amp;a=b/);
  const long = formatNotification({ type: "application", text: "🌱".repeat(10000) });
  assert.ok(long.length < 4096);
  assert.match(long, /…$/);
});

// Exercise the installed SDK, with a synthetic transport and no paid API calls.
test("the Notion-enabled reply path runs the SDK tool runner to completion", async () => {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const { generateReply } = await import("../lib/claude");
  const previous = process.env.NOTION_TOKEN;
  process.env.NOTION_TOKEN = "synthetic-notion-token";
  let calls = 0;
  try {
    const client = new Anthropic({ apiKey: "synthetic-key", fetch: async () => {
      calls++;
      return new Response(JSON.stringify({ id: "msg_synthetic", type: "message", role: "assistant", model: "claude-sonnet-4-6",
        content: [{ type: "text", text: "Synthetic grounded reply" }], stop_reason: "end_turn", stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 } }), { headers: { "content-type": "application/json" } });
    } });
    assert.equal(await generateReply([{ role: "user", content: "Hello" }], client), "Synthetic grounded reply");
    assert.equal(calls, 1);
  } finally {
    if (previous === undefined) delete process.env.NOTION_TOKEN; else process.env.NOTION_TOKEN = previous;
  }
});
