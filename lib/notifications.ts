import { z } from "zod";

export const notificationSchema = z.object({
  type: z.enum(["application", "seed", "contact"]),
  text: z.string().max(10000).optional(),
  url: z.string().max(1000).url().refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  }).optional(),
  data: z.record(z.unknown()).optional(),
});
export type NotifyBody = z.infer<typeof notificationSchema>;
const headings = {
  application: "📋 New application",
  seed: "🌱 New seed submitted",
  contact: "✉️ New contact message",
};
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}
function linkLabel(body: NotifyBody): string {
  if (body.type === "contact") return "Open message in council dashboard";
  const url = new URL(body.url!);
  if (url.pathname === "/council" || url.pathname === "/admin") return "Open council dashboard";
  if (/(^|\.)notion\.(so|site)$/.test(url.hostname)) return "View in Notion";
  return "Open submission";
}
export function formatNotification(body: NotifyBody): string {
  const content = body.text || (body.data ? Object.entries(body.data)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())}: ${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join("\n") : "(no details provided)");
  // Bound UTF-16 length conservatively, preserving Unicode and the record link.
  const excerpt = content.length > 2800
    ? content.slice(0, 2800).replace(/[\uD800-\uDBFF]$/, "") + "…"
    : content;
  const link = body.url ? `\n\n<a href="${escapeHtml(body.url)}">${linkLabel(body)}</a>` : "";
  return `${headings[body.type]}\n\n${escapeHtml(excerpt)}${link}`;
}
