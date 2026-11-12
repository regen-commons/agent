# Agent review — 11 November 2026

The notification service can remain small. Its next useful role is to point
stewards toward website work and help people discover public Weave opportunities.
It should gain private project access only after an explicit identity and access
contract connects Telegram users to Weave accounts.

This review inspected the local agent code and the current website main branch,
plus the Funding Commons checkout’s platform plan and matching implementation.
It did not inspect hosted credentials, production logs, recent conversations or
live Notion tool results. The Funding Commons planning files include work from
another session; they were read as evidence and left untouched.

## Implemented in this change

- Notification links identify council/dashboard destinations instead of saying
  Notion for every URL. Legacy Notion links retain an accurate label.
- The `contact` event posts a short notice and a private council message link.
  Sender email and message body stay in the website’s Supabase inbox.
- Notification requests validate types, HTTPS links, destinations’ URL syntax,
  configuration numbers and body size. Submitted content and HTML attributes are
  escaped. Long notification excerpts retain the link to the complete record.
- Telegram requests have an eight-second timeout and require a confirmed
  `{ ok: true }` response. Logs no longer print the raw Telegram rejection body.
- The installed Anthropic SDK has no `finalMessage()` tool-runner method. The
  reply path now uses `runUntilDone()`. Its Zod helper also converts with Zod v4
  while the checked-in root import supplies v3 schemas. The tools now use the
  SDK’s JSON Schema helper, preserving argument validation without upgrading
  dependencies. A synthetic SDK regression reproduced the failure and passes
  after the fix. See the [SDK helper reference](https://github.com/anthropics/anthropic-sdk-typescript/blob/main/helpers.md).

## Remaining findings, in priority order

1. **Require the Telegram webhook secret.** `app/api/telegram/route.ts` only
   checks the header when the environment variable exists. If it is missing,
   arbitrary requests can reach Redis and, with matching group/topic IDs, the
   conversational handler. Fail closed before parsing or claiming an update.
   The group/topic gate is useful but is not webhook authentication.
2. **Track processing separately from completion.** `seenUpdate()` claims an
   update before parsing/routing and before model generation or delivery. A
   failed reply still returns HTTP 200; a retry within five minutes is discarded.
   Use a short processing lease and a completed receipt, with explicit recovery
   for uncertain Telegram sends. Add concurrent-update and failed-send tests.
3. **Bound the conversational path.** Notification posts are bounded in this
   change; model/tool calls and ordinary generated replies still need a total
   deadline, a tool-iteration limit and Telegram-length handling. Notion reads
   retrieve only the first 100 top-level blocks, so a partial page can look
   complete. Return an explicit truncation marker and page URL.
4. **Review the dependency findings before release.** The locked install’s npm
   audit reported six high and one critical finding across seven packages,
   including direct dependencies Next and Zod. This is an audit result, not proof
   that every advisory is reachable in this deployment. Review applicable
   advisories and make a separate tested dependency update; no upgrades were
   bundled into this change.
5. **Update the knowledge boundary.** The runtime skills still frame Notion as
   the Regen Commons reference source. Current membership, content and contact
   records belong to Supabase and the council UI; the agent has no such read tool.
   Document that limit, retain Notion for its actual reference material, and add
   tools only against reviewed public or user-authorized projections.
6. **Check the Redis configuration contract.** The README names `KV_REST_API_URL`
   and `KV_REST_API_TOKEN`, while the installed client’s build warnings name
   `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. Verify the production
   mapping before relying on the written setup instructions. Local builds use no
   live credentials; the warnings alone do not establish a production outage.
7. **Serialize shared-topic conversation updates.** History is keyed by chat,
   and load/append/generate steps can interleave between different council
   speakers. Decide whether shared topic context is intended, then serialize
   turns or scope memory by topic/user. Define retention and a clear command
   description before adding private project information.

## Proposed Weave additions

Start with public discovery, then add steward operations only where they have a
clear authorization boundary. These are recommendations, not implemented tools.

| Addition | Useful behavior | Required boundary and proof |
| --- | --- | --- |
| Public opportunity search | Find relevant funders, return source links, dates and reasons | Use the existing catalog/matching contract; distinguish potential fit from eligibility; test stale and unknown evidence |
| Public partner discovery | Find explicitly shared needs/offers and explain possible connections | Use public projections only; distinguish owner-confirmed entries from inferred project evidence; withdrawn/private entries must disappear |
| Council attention summary | Link to pending membership requests, contact messages and delivery problems | A reviewed server endpoint may return counts and dashboard links; it must not return original answers or correspondence to the model by default |
| Requested deadline or freshness digest | Summarize relevant opportunity changes for the council | Agree audience, frequency, source freshness and notification identity first; avoid unsolicited per-match alerts |
| Account-specific project help | Explain saved matches and suggest edits to a person’s initiative | Requires verified Telegram-to-Weave identity, per-request authorization and an explicit share/review step before writes; a Telegram handle alone grants no access |

A practical next slice is public opportunity search with evidence links. It adds
value without giving the bot a service-role key or making it an approval system.
For private workflows, link to the existing authenticated app until the access
contract is agreed. No matching rules, Weave schema or Weave application code
were changed here.

## Verification and release

`npm test` passes all six synthetic tests, `npm run typecheck` passes and
`npm run build` completes with the existing locked dependencies in an isolated
Node 22 container. Build output warns about absent Redis credentials, as expected
in this credential-free check. Synthetic tests cover notification schema/formatting and the installed SDK reply
path without contacting Telegram, Notion, Redis or Anthropic. A successful local
build does not establish hosted environment or real delivery.

Release order: agent notification update, website contact migration, website
update, then one authorized synthetic contact through the hosted page. Verify the
council message and Telegram link and remove the synthetic correspondence. Keep
the form off the live site until those pieces are ready together.

## Authorized release — 11 November 2026

Commit `d6f201a1be1c286f94ee1ac4f80fe28a6a67d0d2` on
`codex/contact-notifications` is deployed as production
`dpl_C1C4p6xM6bwXse12YbMsHCyB8NS1`, READY. The existing
`regen-commons-agent.vercel.app` alias resolves to it. No production credentials
or destination settings were changed. `main` remains unchanged.

The website’s authorized live test saved one synthetic contact at 5:34 p.m. PST.
Its worker received the agent’s success response and recorded Sent after the
Telegram API acknowledged the post. The authenticated council browser showed
the same record and delivery state. The group UI was not independently read.
An unauthenticated `/api/notify` request returned 401, and deployment-scoped
error/fatal logs were empty during the immediate verification window.

The website’s `docs/contact-messages.md` records its applied migration, exact
website commit/deployment, synthetic record and rollback targets. This release
does not resolve the remaining review items above or add private Weave tools.
