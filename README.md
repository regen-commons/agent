# Regen Commons Agent

A Claude-powered Telegram bot for the RegenCommons community. Lives in the `Regen Commons | Steward Council` Telegram group, replies in the `Agent` topic, and posts notifications when applications or seeds are submitted via the website.

## What it does today

| Feature | Status | Where |
|---|---|---|
| Conversational replies in the Agent topic | ✅ Works | Telegram group, `Agent` topic only |
| Application submission notifications | ✅ Works | Posts to Agent topic when someone submits `join.html` |
| Seed submission notifications | ✅ Works | Posts to Agent topic when someone submits a seed |
| Per-chat conversation memory | ✅ Works | Last 20 messages stored in Redis |
| Skills system (filesystem-based prompts) | ✅ Works | `skills/*/SKILL.md` auto-loaded into system prompt |
| Notion query tools (`notion_search`, `notion_get_page`) | ⚠️ Code shipped, not yet validated end-to-end | Requires `NOTION_TOKEN` + integration shared with target pages |

## What it does not do (yet)

- DM access — DMs are silently ignored. Bot only operates inside the configured group's `Agent` topic.
- Writing to Notion (only reads).
- Long-running tasks (>60s). Vercel function timeout caps it.
- Auto-detecting form fields — the website's webhook code calls `/api/notify` with the right shape.

## Architecture

This project is one of two repos that work together:

```
┌──────────────────────────┐         ┌──────────────────────────────┐
│  regen-commons-site      │         │  regen-commons-agent (this)  │
│  (the prototype)         │         │                              │
│                          │ webhook │                              │
│  POST /api/seeds  ──────────────►  │  POST /api/notify            │
│  POST /api/apply  ──────────────►  │       │                      │
│      │                   │         │       ▼                      │
│      ▼                   │         │  Telegram group              │
│  Notion (creates page)   │         │  Agent topic                 │
└──────────────────────────┘         │       ▲                      │
                                     │       │                      │
[Telegram user in group]──webhook───►│  POST /api/telegram          │
                                     │       │                      │
                                     │       ▼                      │
                                     │  Claude API ───► reply       │
                                     │       ↕                      │
                                     │  Upstash Redis               │
                                     │  (conversation memory)       │
                                     └──────────────────────────────┘
```

Two separate Vercel projects, two separate GitHub repos, deployed independently:
- [`regen-commons-agent`](https://github.com/regen-commons/regen-commons-agent) — this repo, deployed at `regen-commons-agent.vercel.app`
- [`regen-commons-site`](https://github.com/regen-commons/regen-commons-site) — the public site (locally `RegenCommons/prototype/`), deployed at `regen-commons-site.vercel.app`. Has its own README; relevant files for this integration are `api/apply.js`, `api/seeds.js`, and `api/_lib/notify.js`.

The two projects communicate via HTTP. They share a `NOTIFY_WEBHOOK_SECRET` for auth (must be the same value in both projects).

## Endpoints

This repo exposes two endpoints:

- `POST /api/telegram` — Telegram's webhook delivers user messages here. Validated via `X-Telegram-Bot-Api-Secret-Token` header (`TELEGRAM_WEBHOOK_SECRET`).
- `POST /api/notify` — receives notification webhooks from the site. Validated via `Authorization: Bearer <NOTIFY_WEBHOOK_SECRET>`. Body shape:
  ```json
  {
    "type": "application" | "seed",
    "text"?: "string",
    "url"?: "string",
    "data"?: { ... }
  }
  ```
  Renders a formatted message in the Agent topic with a clickable "View on Notion" link if `url` is provided.

## Repo layout

```
regen-commons-agent/
├── app/
│   ├── api/
│   │   ├── telegram/route.ts   ← chat webhook
│   │   └── notify/route.ts     ← notification webhook
│   ├── layout.tsx
│   └── page.tsx                ← placeholder homepage
├── lib/
│   ├── claude.ts               ← model + system prompt + (conditional) Notion tools
│   ├── telegram.ts             ← sendMessage / sendChatAction (with HTML mode + thread support)
│   ├── memory.ts               ← Redis-backed history + update dedup
│   ├── notion.ts               ← Notion client + search / read helpers
│   └── skills.ts               ← loads skills/*/SKILL.md into the system prompt
├── skills/
│   ├── core/SKILL.md           ← baseline behavior (Telegram-friendly formatting)
│   └── notion/SKILL.md         ← when/how to use Notion tools
├── package.json
├── tsconfig.json
├── next.config.mjs
├── .env.example
└── README.md (this file)
```

## Environment variables

Set all of these in the agent's Vercel project (Settings → Environment Variables). `.env.example` has the same list with comments.

| Var | Purpose | Required |
|---|---|---|
| `ANTHROPIC_API_KEY` | Claude API auth | ✅ |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot API auth (from `@BotFather`) | ✅ |
| `TELEGRAM_WEBHOOK_SECRET` | Validates incoming Telegram webhooks | ✅ |
| `KV_REST_API_URL` | Upstash Redis (auto-injected by Vercel marketplace, **prefix must be `KV`**) | ✅ |
| `KV_REST_API_TOKEN` | Same as above | ✅ |
| `TELEGRAM_GROUP_CHAT_ID` | Negative number, the group's chat ID | ✅ |
| `TELEGRAM_AGENT_THREAD_ID` | The "Agent" topic's `message_thread_id` — bot only replies here | ✅ |
| `TELEGRAM_NOTIFICATION_THREAD_ID` | Where `/api/notify` posts (currently same as Agent) | ✅ |
| `NOTIFY_WEBHOOK_SECRET` | Bearer token the site's webhook must include | ✅ |
| `NOTION_TOKEN` | Notion integration token. If unset, Notion tools are not registered (bot still works, just no Notion access) | ❌ |

The site (`regen-commons-site`) needs the matching counterparts:
- `NOTIFY_URL=https://regen-commons-agent.vercel.app/api/notify`
- `NOTIFY_WEBHOOK_SECRET=<same value as the agent's>`

## Behavior rules

### Chat replies

- **DMs are ignored entirely.** The bot only responds inside the configured group, and only inside the `Agent` topic of that group. This is enforced by `app/api/telegram/route.ts` checking that `chat.id === TELEGRAM_GROUP_CHAT_ID && message_thread_id === TELEGRAM_AGENT_THREAD_ID`.
- Replies preserve the topic's `message_thread_id`, so they stay in-thread.
- Slash commands work in the Agent topic only:
  - `/start` — greeting message
  - `/clear` or `/reset` — wipes conversation memory for that chat

### Notifications

- `/api/notify` requires the Bearer token to match `NOTIFY_WEBHOOK_SECRET`.
- The format is rendered with Telegram HTML parse mode. User-supplied content is HTML-escaped; the Notion URL is wrapped as a `<a>` link rendering as "View on Notion".
- If `url` is omitted, no link is rendered (just the heading + text).

### Memory

- Per-chat (keyed by Telegram `chat.id`), bounded to last 20 messages, stored in Upstash Redis as a Redis list. Older messages drop off automatically.
- Telegram update dedup: every `update_id` is set in Redis with a 5-minute TTL so a Telegram retry can't double-process.

### Skills

- Anything in `skills/<name>/SKILL.md` is auto-loaded into the system prompt at runtime.
- Each skill is wrapped in `<skill name="...">…</skill>` so Claude can recognize them.
- To add a skill: create a folder + `SKILL.md`, push, redeploy. No code changes needed.
- Existing skills:
  - `skills/core/SKILL.md` — baseline behavior (plain text only, short replies)
  - `skills/notion/SKILL.md` — when/how to use Notion tools

### Notion tools (optional)

- If `NOTION_TOKEN` is set, the bot registers two tools and switches to the SDK's tool runner. Otherwise it falls back to plain `messages.create()`.
- Tools available:
  - `notion_search(query, limit?)` — search the workspace
  - `notion_get_page(page_id_or_url)` — read a page's top-level content
- The integration must be shared with each page/database the bot should access. Open the page in Notion → `⋯` → Connections → add your integration.
- The `Regen Commons Portal` page (`2aa06d25-70f2-80a8-b9d6-d3f5b8d639c0`) is referenced in `skills/notion/SKILL.md` as the suggested starting point.

## Telegram setup details

- **Group:** `Regen Commons | Steward Council`
- **Group chat ID:** `-1003425573632`
- **Agent topic ID:** `1147`
- **Bot username:** `@regencommonsagent_bot`
- **Bot must be admin in the group** so it can post to topics.

To get IDs for a new topic, temporarily delete the webhook, send a message in the topic with a mention of the bot (privacy mode is on by default — bot only sees mentions/replies), then `getUpdates`:

```sh
curl "https://api.telegram.org/bot<BOT_TOKEN>/deleteWebhook"
# In Telegram, send: "@regencommonsagent_bot test"  (in the new topic)
curl "https://api.telegram.org/bot<BOT_TOKEN>/getUpdates"
# Look for chat.id and message_thread_id
curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://regen-commons-agent.vercel.app/api/telegram&secret_token=<WEBHOOK_SECRET>"
```

## Setup for new collaborators

To run this locally or deploy a fork:

### 1. Get the secrets

You'll need:
- An Anthropic API key (<https://console.anthropic.com> → API Keys → Create Key, set a $10/mo spend cap)
- A Telegram bot token (DM `@BotFather`, `/newbot`)
- A new random `TELEGRAM_WEBHOOK_SECRET`: `openssl rand -hex 16`
- A new random `NOTIFY_WEBHOOK_SECRET`: `openssl rand -hex 16`
- (Optional) A Notion integration token: <https://www.notion.so/my-integrations>

### 2. Create the Telegram group + Agent topic

Create a Telegram group, enable Topics, create an `Agent` topic. Add `@your_bot_name` as admin.

Find the group's chat ID and the Agent topic's `message_thread_id` (see "Telegram setup details" above).

### 3. Deploy to Vercel

```sh
git clone https://github.com/regen-commons/regen-commons-agent
cd regen-commons-agent
npm install
npm install -g vercel
vercel login
vercel link              # accept defaults to create a new project
```

In the Vercel dashboard:
1. **Storage → Create database → Upstash for Redis** → set prefix to `KV` (critical — auto-populates `KV_REST_API_URL` and `KV_REST_API_TOKEN`).
2. **Settings → Environment Variables** → add every variable from the table above (production at minimum).

Then redeploy: `vercel --prod`

### 4. Register the Telegram webhook

```sh
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<your-vercel-url>/api/telegram&secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

Verify with `curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"`.

### 5. Test

In the Agent topic, mention `@your_bot_name` with a question. Bot should reply within a few seconds.

For notifications, the upstream site needs to POST to `/api/notify` — see `regen-commons-site/api/_lib/notify.js` for the helper.

## Local development

```sh
cp .env.example .env.local
# Fill in values. For Redis, get them from console.upstash.com or use vercel env pull
npm run dev
```

Local server runs on `localhost:3000`. To expose to Telegram, tunnel via [ngrok](https://ngrok.com): `ngrok http 3000`, then `setWebhook` to the ngrok URL.

## Deploying changes

Connected to GitHub auto-deploy. Just:

```sh
git add -A
git commit -m "Describe what changed"
git push
```

Vercel deploys on push (1-2 min). Watch the dashboard or run `vercel logs --follow`.

## Customizing

### Add a skill

```sh
mkdir skills/my-skill
$EDITOR skills/my-skill/SKILL.md
```

```md
---
name: my-skill
description: When and how to do X
---

# My skill

Detailed instructions for Claude. The agent reads this verbatim into its system prompt.
```

Push, deploy. No code changes needed.

### Change the model

Edit `MODEL` in `lib/claude.ts`. Options:
- `claude-haiku-4-5` — fastest, ~3× cheaper, fine for casual chat
- `claude-sonnet-4-6` — current default; balanced
- `claude-opus-4-7` — most capable, ~5× cost of Sonnet

### Change response style

Edit `systemPrompt()` in `lib/claude.ts`, or modify `skills/core/SKILL.md`.

### Change memory length

Edit `HISTORY_LIMIT` in `lib/memory.ts`. Default: 20 messages.

### Change effort / thinking depth

Edit the `output_config.effort` value in `lib/claude.ts`. Options: `low | medium | high`. Higher = more deliberation, more tokens, more latency.

## Operational notes

- **Function timeout** is 60s on Vercel Pro (default), 10s on Hobby. Sonnet 4.6 chat replies are typically <10s. Notion-tool calls add 1-2 model turns and can run 5-10s. If you see timeouts, drop to `claude-haiku-4-5` or upgrade to Pro.
- **Costs at rest**: Vercel free tier covers ~100K requests/mo. Upstash free tier covers 500K Redis commands/day. Anthropic API is pay-per-token, typically <$5/mo for a community-scale bot. Set a Console spend cap.
- **Long tasks**: if a feature would take >60s (deep research, large file processing), use a queue. [Upstash QStash](https://upstash.com/docs/qstash) integrates cleanly — webhook responds "on it…" instantly, queues the work, a separate `/api/worker` route does the long task and posts back via `sendMessage`.
- **Webhook deduplication**: every Telegram `update_id` is tracked in Redis with a 5-min TTL, so a Telegram retry doesn't double-process.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Bot is silent in the Agent topic | New deploy didn't go green; OR `TELEGRAM_AGENT_THREAD_ID` / `TELEGRAM_GROUP_CHAT_ID` env vars not set; OR bot not in the group as admin |
| Bot replies in General instead of the topic it was mentioned in | New code not deployed; replies should preserve `message_thread_id` |
| Bot replies in topics other than Agent | Old code; gating only allows the configured Agent topic |
| `getUpdates` returns 409 | Webhook is set; delete it temporarily (`deleteWebhook`) to use polling, then re-set |
| `/api/notify` returns 401 | `NOTIFY_WEBHOOK_SECRET` mismatch between caller and the agent. Both projects must have the same value. |
| `/api/notify` returns 405 | Trailing slash or whitespace in the caller's `NOTIFY_URL`. The notify helper now `.trim()`s, but check the env var anyway. |
| `/api/notify` returns 500 with "TELEGRAM_GROUP_CHAT_ID not configured" | Env var missing, add it to Vercel and redeploy |
| Notion notification message has no "View on Notion" link | `url` not passed in the body; HTML mode wraps it as a link only when present |
| Bot replies "I can't access Notion" | `NOTION_TOKEN` missing on the agent's project, or the integration isn't shared with the page being asked about; OR new code not deployed |
| Notion API returns `validation_error: "X is not a property that exists"` | The Notion DB schema changed; either add the property back or remove it from the code (e.g., `apply.js` / `seeds.js` in the site repo) |

To inspect what's happening live:

```sh
vercel logs --follow
```

Then trigger the action in question.

## Open issues / roadmap

- **Notion tools haven't been validated end-to-end.** Code is shipped and conditionally registered, but as of last test the bot was responding generically rather than calling the tools. Next debugging step: tail Vercel logs while asking the bot a Notion-specific question, and check whether `notion_search` / `notion_get_page` are being called at all. Most likely culprits: (a) integration not shared with the Portal page in Notion's UI, (b) `NOTION_TOKEN` not set or set to a stale value, (c) the toolRunner is silently dropping tool calls due to SDK version skew.
- **No long-task workaround yet.** First thing >60s breaks; have an Upstash QStash plan ready.
- **No admin-only DM access.** Currently DMs are ignored entirely. If admins need a private channel later, easiest path is a whitelist of `from.id` values that bypass the group gate.

## Project context

- **GitHub org:** `regen-commons` (with hyphen — not the personal `regencommons` account)
- **Maintained by:** Patricia Parkinson (kosmicgarden@proton.me) and steward collaborators
- **Related project:** [`regen-commons-site`](https://github.com/regen-commons/regen-commons-site) (the public website)
- **License:** TBD
