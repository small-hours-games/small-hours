// Sends a Discord webhook notification when a new game room is created.
// No-ops silently if DISCORD_WEBHOOK_URL is not set.

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const DOMAIN = process.env.DOMAIN || 'localhost:3001';

export async function notifyRoomCreated(roomCode) {
  if (!WEBHOOK_URL) return;

  const hostUrl = `https://${DOMAIN}/host/${roomCode}`;
  const playerUrl = `https://${DOMAIN}/player/${roomCode}`;

  const payload = {
    content: `🎮 New game room **${roomCode}** is open — join at ${playerUrl}`,
    embeds: [
      {
        color: 0x5865f2,
        fields: [
          { name: 'Host display', value: `[Open](${hostUrl})`, inline: true },
          { name: 'Players join at', value: playerUrl, inline: true },
        ],
        footer: { text: 'Small Hours' },
        timestamp: new Date().toISOString(),
      },
    ],
  };

  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.warn(`[discord] webhook failed: ${res.status}`);
    }
  } catch (err) {
    console.warn(`[discord] webhook error: ${err.message}`);
  }
}
