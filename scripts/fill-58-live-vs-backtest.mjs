import { readFileSync, writeFileSync } from "node:fs";

const L = JSON.parse(readFileSync("research/live-catches.json", "utf8"));
const v = L.versusBacktest;

const claims = {
  "the live sample is finally large enough to mean something": L.excludingDelistings.n > 100,
  "live runs below the backtest": v.shortfallPp < 0,
  "but still well above a random hour": v.liveLiftVsBaseline > 3,
  "delistings are a small share, not the whole story": L.delistingDriven.sharePct < 10,
  "and removing them lowers the record rather than raising it":
    L.excludingDelistings.hitRatePct < L.overall.hitRatePct,
  "most alerts still do nothing": v.livePct < 50,
  "pending alerts are excluded, not counted as wins": L.pending > 0,
};
const bad = Object.entries(claims).filter(([, ok]) => !ok);
if (bad.length) { console.error("ABORT:"); for (const [c] of bad) console.error("  x " + c); process.exit(1); }

const f2 = (v2) => Number(v2).toFixed(2);

const text = `Backtest hứa cảnh báo volume theo giờ của tôi chạm +10% trong 12 tiếng ${f2(v.backtestTouchPct)}% số lần.

Máy đã chạy thật. ${L.settled} cảnh báo đóng cửa sổ. Điểm số:

**${f2(v.livePct)}%** trên ${L.excludingDelistings.n} lệnh sạch.

Thấp hơn backtest ${f2(Math.abs(v.shortfallPp))} điểm. Đúng như mọi backtest: chạy thật luôn kém hơn chạy trên giấy.

Nhưng vẫn gấp **${f2(v.liveLiftVsBaseline)} lần** một giờ ngẫu nhiên (${f2(v.baselineTouchPct)}%). Edge có thật, chỉ nhỏ hơn tờ quảng cáo.

Ba điều đi kèm con số đó.

**Một.** ${L.pending} cảnh báo còn mở và **không được tính**. Vị thế chưa hết khung giờ không phải chiến thắng.

**Hai.** Tôi bỏ ${L.delistingDriven.count} cảnh báo sinh từ tin gỡ niêm yết — chỉ ${f2(L.delistingDriven.sharePct)}% tổng số nhưng bơm mạnh nhất bảng. Bỏ chúng làm điểm **giảm** từ ${f2(L.overall.hitRatePct)}% xuống ${f2(v.livePct)}%. Vẫn bỏ: thanh lý cưỡng bức là cách dễ nhất chế ra volume, và nói ít nhất về nhu cầu.

**Ba, quan trọng nhất:** hơn ba phần tư số cảnh báo **không chạm mục tiêu**. Đó là hình dạng thật của một edge nhỏ. Ai bán cho bạn tỷ lệ thắng bảy trên mười đang bán thứ khác.

Quan điểm: CHỜ. Tôi thích ${f2(v.livePct)}% đo trên tiền thật hơn ${f2(v.backtestTouchPct)}% đo trên quá khứ.

Bạn đã đối chiếu backtest của mình với kết quả chạy thật chưa?

Nghiên cứu giáo dục, không phải lời khuyên đầu tư.

$BTC #TradingSignals #Backtesting #WriteToEarn`;

writeFileSync("drafts/58-live-vs-backtest.txt", text);
console.log("claims:", Object.keys(claims).length, "| words:", text.trim().split(/\s+/).length);
