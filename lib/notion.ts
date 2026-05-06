import { Client } from "@notionhq/client";

let _client: Client | null = null;
function notion(): Client {
  if (!_client) {
    const auth = process.env.NOTION_TOKEN;
    if (!auth) throw new Error("NOTION_TOKEN is not set");
    _client = new Client({ auth });
  }
  return _client;
}

export const PORTAL_PAGE_ID = "2aa06d25-70f2-80a8-b9d6-d3f5b8d639c0";

export type SearchHit = {
  id: string;
  title: string;
  url: string;
  kind: "page" | "database";
};

function extractTitle(result: unknown): string {
  const r = result as Record<string, unknown>;
  if (r.object === "database") {
    const t = (r.title as Array<{ plain_text?: string }>) || [];
    return t.map((x) => x.plain_text || "").join("") || "(untitled)";
  }
  const props = (r.properties || {}) as Record<
    string,
    { type?: string; title?: Array<{ plain_text?: string }> }
  >;
  const titleProp = Object.values(props).find((p) => p?.type === "title");
  if (titleProp?.title) {
    return (
      titleProp.title.map((x) => x.plain_text || "").join("") || "(untitled)"
    );
  }
  return "(untitled)";
}

export async function searchNotion(
  query: string,
  limit = 10,
): Promise<SearchHit[]> {
  const res = await notion().search({ query, page_size: limit });
  return res.results.map((r) => {
    const item = r as { id: string; object: string; url?: string };
    return {
      id: item.id,
      title: extractTitle(r),
      url: item.url || "",
      kind: item.object === "database" ? "database" : "page",
    };
  });
}

function normalizePageId(idOrUrl: string): string {
  const trimmed = idOrUrl.trim();
  const match = trimmed.match(
    /[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  );
  if (!match) {
    throw new Error(`Could not extract a Notion page ID from: ${idOrUrl}`);
  }
  const raw = match[0].replace(/-/g, "");
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}

function blockToText(block: unknown): string {
  const b = block as { type?: string; [k: string]: unknown };
  const type = b.type;
  if (!type) return "";
  const content = b[type] as
    | { rich_text?: Array<{ plain_text?: string }>; checked?: boolean }
    | undefined;
  if (!content?.rich_text) return "";
  const text = content.rich_text.map((rt) => rt.plain_text || "").join("");
  if (!text) return "";
  if (type === "heading_1") return `\n# ${text}`;
  if (type === "heading_2") return `\n## ${text}`;
  if (type === "heading_3") return `\n### ${text}`;
  if (type === "bulleted_list_item") return `• ${text}`;
  if (type === "numbered_list_item") return `1. ${text}`;
  if (type === "to_do") return `${content.checked ? "[x]" : "[ ]"} ${text}`;
  if (type === "quote") return `> ${text}`;
  if (type === "callout") return `💡 ${text}`;
  if (type === "code") return "```\n" + text + "\n```";
  return text;
}

export async function readNotionPage(idOrUrl: string): Promise<string> {
  const pageId = normalizePageId(idOrUrl);
  const blocks = await notion().blocks.children.list({
    block_id: pageId,
    page_size: 100,
  });
  return blocks.results
    .map(blockToText)
    .filter((t) => t.length > 0)
    .join("\n\n");
}
