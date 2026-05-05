import fs from "node:fs";
import path from "node:path";

const SKILLS_DIR = path.join(process.cwd(), "skills");

let cache: string | null = null;

export function loadSkills(): string {
  if (cache !== null) return cache;
  if (!fs.existsSync(SKILLS_DIR)) {
    cache = "";
    return cache;
  }

  const sections: string[] = [];
  for (const entry of fs.readdirSync(SKILLS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillFile = path.join(SKILLS_DIR, entry.name, "SKILL.md");
    if (fs.existsSync(skillFile)) {
      const content = fs.readFileSync(skillFile, "utf-8");
      sections.push(`<skill name="${entry.name}">\n${content}\n</skill>`);
    }
  }
  cache = sections.join("\n\n");
  return cache;
}
