import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

const HISTORY_LIMIT = 20;

export type Msg = { role: "user" | "assistant"; content: string };

function key(chatId: number): string {
  return `chat:${chatId}:history`;
}

export async function loadHistory(chatId: number): Promise<Msg[]> {
  const raw = await redis.lrange<Msg>(key(chatId), 0, HISTORY_LIMIT - 1);
  return raw.reverse();
}

export async function appendHistory(chatId: number, msg: Msg): Promise<void> {
  await redis.lpush(key(chatId), msg);
  await redis.ltrim(key(chatId), 0, HISTORY_LIMIT - 1);
}

export async function clearHistory(chatId: number): Promise<void> {
  await redis.del(key(chatId));
}

export async function seenUpdate(updateId: number): Promise<boolean> {
  const result = await redis.set(`update:${updateId}`, 1, {
    nx: true,
    ex: 300,
  });
  return result === null;
}
