import { NextRequest, NextResponse } from "next/server";
import { sendMessage } from "@/lib/telegram";
import { notificationSchema, formatNotification } from "@/lib/notifications";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const expected = process.env.NOTIFY_WEBHOOK_SECRET;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "Notify endpoint not configured" },
      { status: 500 },
    );
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let input: unknown;
  try {
    const raw = await req.text();
    if (Buffer.byteLength(raw) > 32768) return NextResponse.json({ ok: false, error: "Body too large" }, { status: 413 });
    input = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = notificationSchema.safeParse(input);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid notification" }, { status: 400 });
  const body = parsed.data;

  const chatIdRaw = process.env.TELEGRAM_GROUP_CHAT_ID;
  const threadIdRaw = process.env.TELEGRAM_NOTIFICATION_THREAD_ID;
  if (!chatIdRaw || !Number.isSafeInteger(Number(chatIdRaw)) || Number(chatIdRaw) === 0 ||
      (threadIdRaw !== undefined && (!Number.isSafeInteger(Number(threadIdRaw)) || Number(threadIdRaw) <= 0))) {
    return NextResponse.json(
      { ok: false, error: "TELEGRAM_GROUP_CHAT_ID not configured" },
      { status: 500 },
    );
  }

  const text = formatNotification(body);

  try {
    await sendMessage(Number(chatIdRaw), text, {
      parseMode: "HTML",
      ...(threadIdRaw ? { messageThreadId: Number(threadIdRaw) } : {}),
    });
  } catch (err) {
    console.error("notification_send_failed");
    return NextResponse.json(
      { ok: false, error: "Failed to send notification" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
