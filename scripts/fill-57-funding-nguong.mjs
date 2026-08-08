import { readFileSync, writeFileSync } from "node:fs";

const F = JSON.parse(readFileSync("research/funding-distribution.json", "utf8"));
const d = F.distribution;
const t = F.claimedThresholds;

const claims = {
  "the healthy band swallows almost the whole distribution":
    t.healthyHigh.percentileOfLevel - t.healthyLow.percentileOfLevel > 80,
  "the crowding threshold never occurs": t.crowdingWatch.shareAbovePct === 0,
  "the extreme threshold never occurs": t.extreme.shareAbovePct === 0,
  "funding is capped, not merely small": d.p95 === d.max && d.p99 === d.max,
  "the audited reading is around the middle of its own history":
    F.auditedReading.percentile > 40 && F.auditedReading.percentile < 70,
  "high funding really is followed by weaker returns at every horizon":
    t.healthyHigh.forward.h3.differencePp < 0
    && t.healthyHigh.forward.h9.differencePp < 0
    && t.healthyHigh.forward.h21.differencePp < 0,
  "and none of it clears two sigma":
    Math.abs(t.healthyHigh.forward.h9.sigmas) < 2,
  "negative funding is a real minority, not a rarity": d.negativeSharePct > 10,
};
const bad = Object.entries(claims).filter(([, ok]) => !ok);
if (bad.length) { console.error("ABORT:"); for (const [c] of bad) console.error("  x " + c); process.exit(1); }

const f2 = (v) => Number(v).toFixed(2);
const f4 = (v) => Number(v).toFixed(4);

const text = `Bộ ngưỡng funding này được chép khắp nơi: "lành mạnh" ${t.healthyLow.level}% đến ${t.healthyHigh.level}% mỗi 8 tiếng, trên ${t.crowdingWatch.level}% là long đông, trên ${t.extreme.level}% là cực đoan.

Tôi đo trên ${F.distribution.n} kỳ funding $BTC. Hai trong bốn ngưỡng **chưa từng xảy ra một lần nào**.

Funding sàn này bị chặn cứng ở ${f4(d.max)}%. Phân vị 95 bằng phân vị 99 bằng luôn giá trị lớn nhất — dấu hiệu của cái trần, không phải thị trường yên. Nên mốc ${t.crowdingWatch.level}% và ${t.extreme.level}% nằm ngoài vùng chạm tới được.

Dải "lành mạnh" thì ngược lại: trải từ phân vị ${f2(t.healthyLow.percentileOfLevel)} đến ${f2(t.healthyHigh.percentileOfLevel)}. Nó ôm gần trọn phân phối — đang mô tả cái bình thường, không chẩn đoán gì.

Con số hôm nay ai cũng gọi "dương nhẹ" nằm ở **phân vị ${f2(F.auditedReading.percentile)}**.

Phần công bằng: ý đằng sau **đúng hướng**. Funding chạm trần thì lợi suất sau yếu hơn ở cả ba khung — ${f2(t.healthyHigh.forward.h3.differencePp)} điểm sau một ngày, ${f2(t.healthyHigh.forward.h9.differencePp)} sau ba, ${f2(t.healthyHigh.forward.h21.differencePp)} sau bảy. Không con nào vượt hai sigma, và tôi chỉ có ba tháng dữ liệu.

Và ${f2(d.negativeSharePct)}% số kỳ là âm — short trả cho long.

Quan điểm: CHỜ. Ngưỡng không nói nó lấy từ đâu thì không phải phép đo, chỉ là con số nghe có vẻ đúng.

Bạn đang dùng ngưỡng funding nào, và nó đến từ đâu?

Nghiên cứu giáo dục, không phải lời khuyên đầu tư.

#FundingRate #OpenInterest #WriteToEarn`;

writeFileSync("drafts/57-funding-nguong.txt", text);
console.log("claims:", Object.keys(claims).length, "| words:", text.trim().split(/\s+/).length);
