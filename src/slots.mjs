/**
 * Post formats, one per daily slot.
 *
 * Named, repeatable formats are what build a return habit — readers come back
 * for a show, not for scattered posts. Each format carries the extra
 * instruction that distinguishes it; the shared rules live in the composer's
 * base system prompt.
 *
 * Times are UTC. Cron owns the scheduling, so there is no daemon to keep alive.
 */

export const FORMATS = {
  recap: {
    slot: "00:30 UTC",
    label: "Daily Close Recap + Level Map",
    words: [150, 200],
    instruction: `This is the DAILY CLOSE RECAP, published just after the 00:00 UTC daily candle closed.

Give the day's support and resistance for all four assets — one compact line each, so the post is screenshot-worthy as a reference. Then pick the single asset with the strongest setup and spend a short paragraph on it.

Levels set here are the reference for the rest of the day, so state them precisely.`,
  },

  europe: {
    slot: "07:30 UTC",
    label: "Europe Open Check",
    words: [110, 150],
    instruction: `This is the EUROPE OPEN CHECK — short and fast, European desks are just coming online.

Cover what moved overnight in Asia, whether the levels from the daily recap are holding, and one thing to watch into the session. Keep it tight; this is the shortest post of the day.`,
  },

  positioning: {
    slot: "13:15 UTC",
    label: "Pre-US-Open Positioning",
    words: [180, 220],
    instruction: `This is the PRE-US-OPEN POSITIONING post — the flagship. US equities open at 13:30 UTC and this is the highest-volatility hour in crypto. Readers are deciding whether to take a position right now, so this post has to earn that decision.

Go deepest here. Lead with the asset showing the clearest structure. Use the computed analysis: relative strength across the four, who is leading and who is lagging, range position, volatility regime. Make the reader want to open a chart.`,
  },

  wrap: {
    slot: "20:00 UTC",
    label: "US Close Wrap",
    words: [120, 160],
    instruction: `This is the US CLOSE WRAP.

Report the session result, then what carries overnight into Asia. Say plainly whether the day's levels held or broke — accountability is the point of this slot.`,
  },

  event: {
    slot: "ad hoc",
    label: "Event Trigger",
    words: [110, 160],
    instruction: `This is an EVENT-DRIVEN post, published because something actually happened — a level broke, funding flipped, volatility spiked, or a major headline landed.

Lead with the event itself in the first line. Be specific about what changed and what it means for the level structure. Do not pad it out; if the event is small, the post should be small.`,
  },
};

export function getFormat(name) {
  const format = FORMATS[name];
  if (!format) {
    throw new Error(
      `Unknown format "${name}". Choose one of: ${Object.keys(FORMATS).join(", ")}.`,
    );
  }
  return format;
}

/** Crontab lines for the full daily schedule, for the README and `wte slots`. */
export function crontabLines(repoPath = "/path/to/Writetoearn", node = "/usr/bin/node") {
  const rows = [
    ["30 0", "recap"],
    ["30 7", "europe"],
    ["15 13", "positioning"],
    ["0 20", "wrap"],
  ];
  return rows.map(
    ([when, format]) =>
      `${when} * * * cd ${repoPath} && ${node} bin/wte.mjs auto --format ${format} >> wte.log 2>&1`,
  );
}
