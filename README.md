# Regen Commons Agent

A Claude-powered Telegram bot, hosted on Vercel.

## Architecture

```
[Telegram user] → Telegram → POST /api/telegram → Claude → reply via Telegram
                                    ↕
                              Upstash Redis
                              (per-chat memory + dedup)
```

Stateless per request. Conversation memory lives in Redis, keyed by Telegram `chat_id`. Skills live in `skills/` and are loaded into the system prompt on each invocation.

## Files

```
app/api/telegram/route.ts    — webhook handler
lib/claude.ts                — Claude API call (model, system prompt, thinking)
lib/telegram.ts              — sendMessage / sendChatAction
lib/memory.ts                — Redis-backed conversation history + update dedup
lib/skills.ts                — loads skills/*/SKILL.md into the system prompt
skills/core/SKILL.md         — default behavior guidelines (edit me)
```

---

## Setup

### 1. Get the four secrets

You'll need four things before deploying:

1. **Anthropic API key** — sign up at <https://console.anthropic.com>, create a key.
2. **Telegram bot token** — DM `@BotFather` on Telegram, send `/newbot`, follow the prompts. Save the token (looks like `123456:ABC-DEF...`).
3. **Webhook secret** — invent a random string, ~32 chars. Anything works: `openssl rand -hex 16`. Telegram will echo this back to verify webhook calls.
4. **Upstash Redis** — set up in the Vercel step below.

### 2. Local install

```sh
cd regen-commons-agent
npm install
```

### 3. Deploy to Vercel

The fastest path is the Vercel CLI:

```sh
npm install -g vercel
vercel login
vercel link        # create a new project, point at this directory
vercel deploy      # preview
vercel --prod      # production
```

You'll get a URL like `https://regen-commons-agent-yourname.vercel.app`.

### 4. Add Upstash Redis

In the Vercel dashboard for your project:

1. Go to **Storage** → **Create database** → **Marketplace** → **Upstash for Redis**.
2. Click **Create**, accept defaults, link it to this project.

Vercel auto-injects `KV_REST_API_URL` and `KV_REST_API_TOKEN` env vars. (Despite the `KV_` prefix, they work with the `@upstash/redis` client — `Redis.fromEnv()` reads them.)

### 5. Set the other env vars

In Vercel dashboard → **Settings** → **Environment Variables**, add:

| Name | Value |
|---|---|
| `ANTHROPIC_API_KEY` | from console.anthropic.com |
| `TELEGRAM_BOT_TOKEN` | from @BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | the random string you invented |

Redeploy after adding env vars: `vercel --prod`.

### 6. Register the Telegram webhook

Tell Telegram to send messages to your Vercel URL:

```sh
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<your-vercel-url>/api/telegram&secret_token=<your-webhook-secret>"
```

Replace `<TOKEN>`, `<your-vercel-url>`, and `<your-webhook-secret>`. Should return `{"ok":true,"result":true,"description":"Webhook was set"}`.

To verify:

```sh
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

### 7. Test it

In Telegram, find your bot (search for the username you gave @BotFather), send a message. You should get a reply within a few seconds.

If nothing happens, check Vercel logs: `vercel logs --follow` or in the dashboard.

---

## Local development

For local testing without deploying every change:

```sh
cp .env.example .env.local
# fill in all values, including KV_REST_API_URL/TOKEN from Upstash console
npm run dev
```

The dev server runs on `localhost:3000`. To expose it to Telegram for testing, use [ngrok](https://ngrok.com) or [cloudflared](https://github.com/cloudflare/cloudflared) to tunnel a public URL, then `setWebhook` to that tunnel.

For a faster loop, just push to a Vercel preview deployment and test against that.

---

## Customizing

### Add a skill

Create `skills/my-skill/SKILL.md` with frontmatter and content:

```md
---
name: my-skill
description: When and how to do X
---

# My skill

Instructions for Claude here.
```

It'll be loaded into the system prompt on the next deploy. No code changes needed.

### Change the model

Edit `lib/claude.ts`. Current default: `claude-sonnet-4-6`. Options:

- `claude-haiku-4-5` — fastest, cheapest, fine for simple chat
- `claude-sonnet-4-6` — balanced (current default)
- `claude-opus-4-7` — most capable, ~5× cost of Sonnet

### Change response style

Edit the `base` system prompt in `lib/claude.ts` or modify `skills/core/SKILL.md`.

### Change memory length

Edit `HISTORY_LIMIT` in `lib/memory.ts`. Default: 20 messages (~10 turns).

---

## Operational notes

- **Function timeout** is 60s on Vercel Pro (default), 10s on Hobby. Sonnet 4.6 chat replies are typically <10s. If you see timeouts, drop to `claude-haiku-4-5` or upgrade to Pro.
- **Webhook deduplication**: every Telegram update has an `update_id`. We track seen IDs in Redis with a 5-min TTL, so a Telegram retry doesn't double-process.
- **Costs at rest**: Vercel free tier covers ~100K requests/mo. Upstash free tier covers 500K Redis commands/day. Anthropic API is pay-per-token. For a personal bot, expect <$5/mo total.
- **Long tasks**: if you eventually want the bot to do something that takes >60s (deep research, large file processing), use a queue. Drop in [Upstash QStash](https://upstash.com/docs/qstash) — webhook responds "on it…" instantly, queues the work, a separate `/api/worker` route does the long task and posts the result back via `sendMessage`. ~30 lines of code.

---

## Slash commands

The bot understands two commands out of the box:

- `/start` — greeting
- `/clear` (or `/reset`) — wipes conversation history for the current chat

Add more by editing the slash-command block in `app/api/telegram/route.ts`.
