import Anthropic from "@anthropic-ai/sdk";
import { loadSkills } from "./skills";
import type { Msg } from "./memory";

const client = new Anthropic();

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 2000;

function systemPrompt(): string {
  const base =
    "You are a helpful assistant on Telegram. Keep responses conversational and concise — Telegram is a chat app read on phones, not a doc editor. Avoid markdown formatting (asterisks, headers) since they render as raw characters. Write in short paragraphs.";
  const skills = loadSkills();
  return skills ? `${base}\n\n## Skills\n\n${skills}` : base;
}

export async function generateReply(history: Msg[]): Promise<string> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [
      {
        type: "text",
        text: systemPrompt(),
        cache_control: { type: "ephemeral" },
      },
    ],
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    messages: history.map((m) => ({ role: m.role, content: m.content })),
  });

  const textBlock = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === "text",
  );
  return textBlock?.text ?? "(no response)";
}
