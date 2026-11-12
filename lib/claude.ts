import Anthropic from "@anthropic-ai/sdk";
import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import { loadSkills } from "./skills";
import { searchNotion, readNotionPage } from "./notion";
import type { Msg } from "./memory";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 2000;

function systemPrompt(): string {
  const base =
    "You are a helpful assistant on Telegram. Keep responses conversational and concise — Telegram is a chat app read on phones, not a doc editor. Avoid markdown formatting (asterisks, headers) since they render as raw characters. Write in short paragraphs.";
  const skills = loadSkills();
  return skills ? `${base}\n\n## Skills\n\n${skills}` : base;
}

const notionSearch = betaTool({
  name: "notion_search",
  description:
    "Search the Regen Commons Notion workspace for pages and databases matching a query. Returns titles, IDs, and URLs. Use this first when the user asks about Regen Commons content and you don't already know which page to read.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search terms from the user's question" },
      limit: { type: "integer", minimum: 1, maximum: 25, description: "Maximum results, default 10" },
    },
    required: ["query"],
    additionalProperties: false,
  },
  run: async ({ query, limit }) => {
    const results = await searchNotion(query, limit ?? 10);
    if (results.length === 0) return "No matching pages found.";
    return results
      .map((r) => `- ${r.title} (${r.kind}) — id: ${r.id} — ${r.url}`)
      .join("\n");
  },
});

const notionGetPage = betaTool({
  name: "notion_get_page",
  description:
    "Read the contents of a Notion page by its ID or URL. Use this to retrieve the actual text the user is asking about. Returns top-level page content as plain text.",
  inputSchema: {
    type: "object",
    properties: {
      page_id_or_url: { type: "string", description: "Notion page ID or full Notion URL" },
    },
    required: ["page_id_or_url"],
    additionalProperties: false,
  },
  run: async ({ page_id_or_url }) => {
    const text = await readNotionPage(page_id_or_url);
    return text || "(page is empty or has no readable top-level content)";
  },
});

export async function generateReply(history: Msg[], client = new Anthropic()): Promise<string> {
  const baseParams = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [
      {
        type: "text" as const,
        text: systemPrompt(),
        cache_control: { type: "ephemeral" as const },
      },
    ],
    thinking: { type: "adaptive" as const },
    output_config: { effort: "medium" as const },
    messages: history.map((m) => ({ role: m.role, content: m.content })),
  };

  if (!process.env.NOTION_TOKEN) {
    const response = await client.messages.create(baseParams);
    const textBlock = response.content.find(
      (b): b is Anthropic.TextBlock => b.type === "text",
    );
    return textBlock?.text ?? "(no response)";
  }

  const runner = client.beta.messages.toolRunner({
    ...baseParams,
    tools: [notionSearch, notionGetPage],
  });
  const finalMessage = await runner.runUntilDone();
  const textBlock = finalMessage.content.find(
    (b): b is Anthropic.Beta.BetaTextBlock => b.type === "text",
  );
  return textBlock?.text ?? "(no response)";
}
