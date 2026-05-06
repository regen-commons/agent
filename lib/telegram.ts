const TELEGRAM_API = "https://api.telegram.org";

function token(): string {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  return t;
}

export type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    message_thread_id?: number;
    from?: { id: number; first_name?: string; username?: string };
    chat: { id: number; type: string };
    date: number;
    text?: string;
  };
};

type SendOpts = {
  messageThreadId?: number;
  parseMode?: "HTML" | "MarkdownV2";
};

export async function sendMessage(
  chatId: number,
  text: string,
  opts: SendOpts = {},
): Promise<void> {
  const body: Record<string, unknown> = { chat_id: chatId, text };
  if (opts.messageThreadId !== undefined) {
    body.message_thread_id = opts.messageThreadId;
  }
  if (opts.parseMode) {
    body.parse_mode = opts.parseMode;
  }
  const res = await fetch(`${TELEGRAM_API}/bot${token()}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Telegram sendMessage failed (${res.status}): ${errBody}`);
  }
}

export async function sendChatAction(
  chatId: number,
  action: "typing" = "typing",
  opts: SendOpts = {},
): Promise<void> {
  const body: Record<string, unknown> = { chat_id: chatId, action };
  if (opts.messageThreadId !== undefined) {
    body.message_thread_id = opts.messageThreadId;
  }
  await fetch(`${TELEGRAM_API}/bot${token()}/sendChatAction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => {});
}
