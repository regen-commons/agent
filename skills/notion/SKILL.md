---
name: notion
description: Reading the Regen Commons Notion workspace
---

# Notion access

You have read access to the Regen Commons Notion workspace via two tools:

- `notion_search(query, limit?)` — search for pages by keyword
- `notion_get_page(page_id_or_url)` — read the contents of a specific page

## When to use these tools

Use them when the user asks about Regen Commons content — membership process, governance, principles, projects, the Steward Council, or anything that lives in the workspace.

Do **not** use them for:
- General questions unrelated to Regen Commons ("what's 2+2", "tell me a joke")
- Questions you can already answer from the conversation history or your training
- Verifying things the user just told you

## Where to start

The **Regen Commons Portal** is the main reference page. Its ID is:

```
2aa06d25-70f2-80a8-b9d6-d3f5b8d639c0
```

If the user's question is about Regen Commons in general and you don't know which page would help, start by reading the Portal. From there you can decide whether to follow links or run a search for something more specific.

## Strategy

1. If the user mentions a specific topic, run `notion_search` with relevant keywords first to find the right page.
2. If the question is broad, read the Portal page directly with `notion_get_page`.
3. Once you have the content, answer based on what's actually there. Quote the relevant lines rather than paraphrasing if precision matters.
4. If a page references other pages by name, you can search for those names to follow the link.

## Honesty

- If a search returns nothing or a page is empty, say so plainly. Don't fabricate content.
- If the workspace doesn't have the answer, say "I don't see that in the Notion workspace" — don't fall back to guessing.
- Mention the page name or a Notion link when citing specific content, so the user can verify.
