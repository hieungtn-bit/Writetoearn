import { readFileSync, writeFileSync } from "node:fs";

const J = JSON.parse(readFileSync("research/icp-vs-avax.json", "utf8"));
const B = JSON.parse(readFileSync("research/breakout-signal.json", "utf8"));
const I = J.pairs.ICP, A = J.pairs.AVAX, c = J.contrasts;

const claims = {
  "the base claim is correct under one rule": I.base.widthPct < A.base.widthPct,
  "and ICP sits closer to its own base top": I.base.fromBaseTopPct > A.base.fromBaseTopPct,
  "the liquidity gap is a size gap, not a quality gap":
    Math.abs(c.volumeToMarketCapRatio - 1) < 0.15,
  "AVAX really is larger and busier in level":
    A.marketCapUsd > I.marketCapUsd && A.globalVolume24hUsd > I.globalVolume24hUsd,
  "ICP is further from its all-time high": I.fromAthPct < A.fromAthPct,
  "and needs a far larger multiple to reclaim it":
    I.multipleToReclaimAth > A.multipleToReclaimAth * 5,
  "overhead supply separates them more than the base does":
    Math.abs(c.underwaterGapPp) > Math.abs(c.baseWidthGapPp) * 5,
  "participation is moving in opposite directions":
    I.volumeTrendPct > 0 && A.volumeTrendPct < 0,
  "compression stays indistinguishable from random":
    Math.abs(B.conditions.compressed.normalised.sigmas) < 0.5,
};
const bad = Object.entries(claims).filter(([, ok]) => !ok);
if (bad.length) { console.error("ABORT:"); for (const [c2] of bad) console.error("  x " + c2); process.exit(1); }

const f1 = (v) => Number(v).toFixed(1);
const f2 = (v) => Number(v).toFixed(2);
const f0 = (v) => Math.round(v);

const text = `Có người gửi tôi bản so sánh $ICP với $AVAX, kết luận ICP có nền sạch hơn. Tôi đo lại bằng cùng một thước cho cả hai.

Họ đúng. Nền ICP rộng ${f2(I.base.widthPct)}%, AVAX ${f2(A.base.widthPct)}%. ICP cách đỉnh nền ${f2(Math.abs(I.base.fromBaseTopPct))}%, AVAX ${f2(Math.abs(A.base.fromBaseTopPct))}%. Chặt hơn và gần hơn.

Nhưng bản so sánh bỏ sót con số lớn nhất bảng: **ICP đang cách đỉnh lịch sử ${f1(Math.abs(I.fromAthPct))}%**. AVAX ${f1(Math.abs(A.fromAthPct))}%.

Để về lại đỉnh cũ, AVAX cần ${f0(A.multipleToReclaimAth)} lần. ICP cần **${f0(I.multipleToReclaimAth)} lần**. Hai con số đó không cùng một loại.

Và "AVAX thanh khoản tốt hơn" đúng về mức, sai về ý nghĩa. AVAX khớp $${f1(A.globalVolume24hUsd / 1e6)} triệu so với $${f1(I.globalVolume24hUsd / 1e6)} triệu. Nhưng tính theo phần trăm vốn hoá: ${f2(A.volumeToMarketCapPct)}% với ${f2(I.volumeToMarketCapPct)}%. Tỷ lệ ${f2(c.volumeToMarketCapRatio)}. Lợi thế thanh khoản của AVAX là lợi thế **kích cỡ**, không phải chất lượng.

Khoảng cách thật sự tách hai đồng này chẳng ai nhắc: **hàng kẹt trên đầu**. ICP ${f1(I.underwaterPct)}% khối lượng tháng nằm trên giá. AVAX ${f1(A.underwaterPct)}%. Chênh ${f1(Math.abs(c.underwaterGapPp))} điểm — gấp nhiều lần chênh lệch bề rộng nền.

Xu hướng khối lượng cũng ngược nhau: ICP ${f1(I.volumeTrendPct)}%, AVAX ${f1(A.volumeTrendPct)}%.

Quan điểm: CHỜ. Tôi đo nén biên độ trên 43,088 pair-day: ${f2(B.conditions.compressed.normalised.liftVsBaseline)}x, ${f2(B.conditions.compressed.normalised.sigmas)} sigma. Nền đẹp mô tả quá khứ, không dự báo gì.

Bạn chọn nền sạch hay ít hàng kẹt?

Nghiên cứu giáo dục, không phải lời khuyên đầu tư.

#Altcoins #MarketAnalysis #WriteToEarn`;

writeFileSync("drafts/60-icp-avax.txt", text);
console.log("claims:", Object.keys(claims).length, "| words:", text.trim().split(/\s+/).length);
