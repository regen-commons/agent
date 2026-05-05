export default function Home() {
  return (
    <main style={{ padding: 32, fontFamily: "system-ui, sans-serif", maxWidth: 640 }}>
      <h1>Regen Commons Agent</h1>
      <p>This is a webhook endpoint, not a website.</p>
      <p>
        Webhook URL: <code>/api/telegram</code>
      </p>
      <p>
        To wire it up, point your bot's webhook here via Telegram&apos;s{" "}
        <code>setWebhook</code> API. See <code>README.md</code>.
      </p>
    </main>
  );
}
