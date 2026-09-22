/**
 * Volume at price, built properly.
 *
 * The overhead figure this desk publishes — what share of recent turnover sits
 * above the current price — was computed from daily bars, charging each whole
 * bar to one side by its typical price. A day that traded through the current
 * price contributed all of its volume or none of it.
 *
 * Measured against a real profile across twelve names, that proxy is not
 * biased but it is noisy, and the noise has structure: where price sits
 * outside the recent range the two agree closely (INJ 83.8 vs 83.5, XRP 94.6
 * vs 95.8), and where price sits in the thick of the distribution they diverge
 * most (ETH 55.1 vs 65.9, BTC 78.8 vs 88.9). The published number was least
 * reliable exactly where it mattered most.
 *
 * So the profile is built from hourly bars instead, with each bar's turnover
 * spread across the price bins its range covers, weighted by how much of each
 * bin the bar actually spans. Spreading evenly across a bar is an
 * approximation too — an hour does not trade uniformly across its range — but
 * it is a far finer one, and it is how a profile is built without tick data.
 */

/** Price bins across the whole hourly range. 200 is fine detail at any price. */
export const DEFAULT_BINS = 200;

/** Share of volume enclosed by the value area, by convention. */
export const VALUE_AREA_SHARE = 0.70;

/**
 * @param {{high:number,low:number,close:number,quoteVolume:number}[]} hourly
 *   Hourly candles, oldest first, already trimmed to the window.
 * @param {number} price Current price.
 * @returns {{pocPrice:number, valueAreaLow:number, valueAreaHigh:number,
 *   overheadPct:number, totalQuoteVolume:number, binWidth:number}|null}
 */
export function volumeProfile(hourly, price, { bins: binCount = DEFAULT_BINS } = {}) {
  if (!hourly?.length) return null;

  const lo = Math.min(...hourly.map((c) => c.low));
  const hi = Math.max(...hourly.map((c) => c.high));
  if (!(hi > lo)) return null;

  const width = (hi - lo) / binCount;
  const bins = new Array(binCount).fill(0);

  for (const c of hourly) {
    const span = c.high - c.low;
    if (span <= 0) {
      // A flat hour still traded; it all belongs to the bin holding its price.
      bins[Math.min(binCount - 1, Math.max(0, Math.floor((c.close - lo) / width)))] += c.quoteVolume;
      continue;
    }
    const first = Math.max(0, Math.floor((c.low - lo) / width));
    const last = Math.min(binCount - 1, Math.floor((c.high - lo) / width));
    for (let i = first; i <= last; i++) {
      const overlap = Math.min(c.high, lo + (i + 1) * width) - Math.max(c.low, lo + i * width);
      if (overlap > 0) bins[i] += c.quoteVolume * (overlap / span);
    }
  }

  const total = bins.reduce((s, v) => s + v, 0);
  if (total <= 0) return null;

  let poc = 0;
  for (let i = 1; i < binCount; i++) if (bins[i] > bins[poc]) poc = i;

  // Grow outward from the point of control, always taking the richer
  // neighbour, until the value area share is enclosed.
  let lower = poc, upper = poc, acc = bins[poc];
  while (acc < total * VALUE_AREA_SHARE && (lower > 0 || upper < binCount - 1)) {
    const below = lower > 0 ? bins[lower - 1] : -1;
    const above = upper < binCount - 1 ? bins[upper + 1] : -1;
    if (above >= below) { upper += 1; acc += bins[upper]; } else { lower -= 1; acc += bins[lower]; }
  }

  let overhead = 0;
  for (let i = 0; i < binCount; i++) if (lo + (i + 0.5) * width > price) overhead += bins[i];

  return {
    pocPrice: lo + (poc + 0.5) * width,
    valueAreaLow: lo + lower * width,
    valueAreaHigh: lo + (upper + 1) * width,
    overheadPct: (overhead / total) * 100,
    totalQuoteVolume: total,
    binWidth: width,
  };
}
