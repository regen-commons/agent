import { NextRequest, NextResponse } from "next/server";
import {
  sendMessage,
  sendChatAction,
  type TelegramUpdate,
} from "@/lib/telegram";
import {
  loadHistory,
  appendHistory,
  clearHistory,
  seenUpdate,
} from "@/lib/memory";
import { generateReply } from "@/lib/claude";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expectedSecret) {
    const got = req.headers.get("x-telegram-bot-api-secret-token");
    if (got !== expectedSecret) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (await seenUpdate(update.update_id)) {
    return NextResponse.json({ ok: true });
  }

  const message = update.message;
  if (!message?.text || !message.chat) {
    return NextResponse.json({ ok: true });
  }

  const chatId = message.chat.id;
  const text = message.text.trim();

  try {
    if (text === "/start") {
      await sendMessage(
        chatId,
        "Hi! I'm a Claude-powered bot. Just send me a message. /clear resets our conversation.",
      );
      return NextResponse.json({ ok: true });
    }
    if (text === "/clear" || text === "/reset") {
      await clearHistory(chatId);
      await sendMessage(chatId, "Conversation cleared.");
      return NextResponse.json({ ok: true });
    }

    await sendChatAction(chatId, "typing");

    await appendHistory(chatId, { role: "user", content: text });
    const history = await loadHistory(chatId);

    const reply = await generateReply(history);

    await appendHistory(chatId, { role: "assistant", content: reply });
    await sendMessage(chatId, reply);
  } catch (err) {
    console.error("Bot error:", err);
    await sendMessage(
      chatId,
      "Something went wrong on my end. Please try again.",
    ).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
