import { NextRequest, NextResponse } from "next/server";
import { sendMessage } from "@/lib/telegram";

export const runtime = "nodejs";
export const maxDuration = 30;

type NotifyType = "application" | "seed";

type NotifyBody = {
  type: NotifyType;
  text?: string;
  url?: string;
  data?: Record<string, unknown>;
};

const HEADINGS: Record<NotifyType, string> = {
  application: "📋 New application",
  seed: "🌱 New seed submitted",
};

function humanizeKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatData(data: Record<string, unknown>): string {
  return Object.entries(data)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => {
      const label = humanizeKey(k);
      const val = typeof v === "string" ? v : JSON.stringify(v);
      return `${label}: ${val}`;
    })
    .join("\n");
}

function formatNotification(body: NotifyBody): string {
  const heading = HEADINGS[body.type];
  const rawContent = body.text
    ? body.text
    : body.data
      ? formatData(body.data)
      : "(no details provided)";
  const link = body.url
    ? `\n\n<a href="${escapeHtml(body.url)}">View on Notion</a>`
    : "";
  return `${heading}\n\n${escapeHtml(rawContent)}${link}`;
}

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

  let body: NotifyBody;
  try {
    body = (await req.json()) as NotifyBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (body.type !== "application" && body.type !== "seed") {
    return NextResponse.json(
      { ok: false, error: "Invalid type — must be 'application' or 'seed'" },
      { status: 400 },
    );
  }

  const chatIdRaw = process.env.TELEGRAM_GROUP_CHAT_ID;
  const threadIdRaw = process.env.TELEGRAM_NOTIFICATION_THREAD_ID;
  if (!chatIdRaw) {
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
    console.error("Notify error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to send notification" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
