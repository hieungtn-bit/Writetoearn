/**
 * Post 62 — what "wait for confirmation" costs when the stop does not move with
 * the entry.
 *
 * The ICP plan is the specimen, not the subject. The subject is a piece of
 * advice almost every trading account repeats, which is measurable and which
 * measures badly under one common shape: entry above resistance, stop below the
 * base. Waiting raises the entry and leaves the stop where it was, so the risk
 * leg grows and the reward leg shrinks — and the break-even win rate moves from
 * something ordinary to something the pair has never sustained.
 *
 * Every figure traces to research/icp-grok-check.json, refreshed minutes before
 * this ran. The claims block below is the gate: if the tape stops supporting a
 * sentence, the script refuses to write the file rather than quietly publishing
 * a stale one.
 */

import { readFileSync, writeFileSync } from "node:fs";

const J = JSON.parse(readFileSync("research/icp-grok-check.json", "utf8"));
const B = JSON.parse(readFileSync("research/breakout-signal.json", "utf8"));

const r30 = J.rangePosition.find((r) => r.days === 30);
const r90 = J.rangePosition.find((r) => r.days === 90);
const c30 = J.correlations.find((c) => c.days === 30);
const trig = J.geometry.trigger, spot = J.geometry.spot;
const tp1 = J.baseRates.ladder[0].byHorizon.find((b) => b.horizonDays === 30);
const tp2 = J.baseRates.ladder[1].byHorizon.find((b) => b.horizonDays === 30);
const tp3 = J.baseRates.ladder[2].byHorizon.find((b) => b.horizonDays === 30);
const spot30 = J.baseRates.spotLadder[0].byHorizon.find((b) => b.horizonDays === 30);
const cond = J.baseRates.triggered.find((t) => t.horizonDays === 30);
const w = J.weeklyRange;

const claims = {
  "price is high in its own month, not near the bottom": r30.positionPct > 70,
  "though it is genuinely low on the quarter": r90.positionPct < 25,
  "volume expanded rather than stayed weak":
    J.volume.zScoreCompleted > 0 && J.volume.last3dVsPrior10dPct > 25,
  "the claimed resistance sits above the actual 30-day high":
    J.resistance.claimedAboveHigh30dPct > 0,
  "correlation to BTC really is middling": c30.r > 0.4 && c30.r < 0.7,
  "waiting inverts the reward-to-risk": spot.targets[0].rr > 2 && trig.targets[0].rr < 1,
  "and pushes the break-even win rate above a coin flip":
    trig.breakevenWinRatePct > 50 && spot.breakevenWinRatePct < 35,
  "the historical hit rate falls short of that break-even":
    tp1.upPct < trig.breakevenWinRatePct,
  "and the sample behind it is large": tp1.n > 900,
  "the far targets are rarer still": tp3.upPct < tp2.upPct && tp2.upPct < tp1.upPct,
  "both entries carry negative expectancy":
    J.expectancyR30d.trigger < 0 && J.expectancyR30d.spot < 0,
  "the stop is narrower than an ordinary week": J.stopVsMovement.triggerStopOverMedianWeek < 1,
  "the breakout-only sample is too small to conclude anything": cond.effectiveN < 2,
  "compression stays indistinguishable from random":
    Math.abs(B.conditions.compressed.normalised.sigmas) < 0.5,
};
const bad = Object.entries(claims).filter(([, ok]) => !ok);
if (bad.length) { console.error("ABORT:"); for (const [c] of bad) console.error("  x " + c); process.exit(1); }

const f1 = (v) => Number(v).toFixed(1);
const f2 = (v) => Number(v).toFixed(2);
const f3 = (v) => Number(v).toFixed(3);
const f0 = (v) => Math.round(Number(v)).toLocaleString("en-US");

/**
 * One row of the two-column comparison.
 *
 * Padded here rather than by hand in the template because the values are
 * live — a price crossing 10, or a percentage losing a digit, silently breaks
 * hand-aligned columns and the post ships looking careless.
 */
const row = (label, a, b) => label.padEnd(11) + String(a).padStart(14) + String(b).padStart(14);

const text = `Một người gửi tôi bản kế hoạch $ICP do AI viết, hỏi có vào được không. Tôi đo lại toàn bộ. Hai câu mô tả thị trường sai ngược chiều — nhưng đó không phải thứ giết kèo này.

Thứ giết nó là một lời khuyên mà gần như tài khoản nào cũng nhắc lại: **chờ xác nhận rồi hãy vào.**

HAI CÂU SAI TRƯỚC ĐÃ

Bản kế hoạch nói giá "gần đáy range, quanh 2.17–2.20".

ICP đang ở ${f2(J.price)}. Biên 30 ngày chạy từ ${f3(r30.low)} tới ${f3(r30.high)}. Vị trí thật: **${f1(r30.positionPct)}%**. Đó là gần đỉnh tháng, không phải gần đáy.

Trên khung 90 ngày thì đúng là thấp — ${f1(r90.positionPct)}%. Nhưng "gần đáy range" mà không nói khung nào là câu chỉ đúng ở một lookback và sai ở hai cái còn lại.

Câu thứ hai: "volume còn yếu, chưa expand rõ".

Ba ngày gần nhất chạy **cao hơn ${f1(J.volume.last3dVsPrior10dPct)}%** so với mười ngày trước đó. Z-score khối lượng ${f2(J.volume.zScoreCompleted)}. Khối lượng đang nở, không yếu.

Có một câu họ nói đúng: tương quan với BTC "trung bình". Tôi đo r = ${f3(c30.r)} trên 30 ngày. Đúng là trung bình thật.

CÒN ĐÂY MỚI LÀ PHẦN QUAN TRỌNG

Kế hoạch đó viết: *chỉ long khi đóng cửa rõ trên 2.30–2.35, cắt lỗ dưới 2.10–2.13, mục tiêu 2.50 → 2.80 → 3.30.*

Đọc riêng từng câu thì hợp lý. Ghép lại thì hỏng.

Vì **cái stop không đi theo cái entry.** Bạn chờ giá lên cao hơn để vào, nhưng điểm cắt lỗ vẫn nằm nguyên chỗ cũ. Chân rủi ro dài ra, chân lợi nhuận ngắn lại.

Cùng một mức stop ${f2(trig.stop)}, hai cách vào:

\`\`\`
${["", "VÀO NGAY", "CHỜ XÁC NHẬN"].map((s, i) => (i ? s.padStart(14) : s.padEnd(11))).join("")}
${row("vào", f2(spot.entry), f2(trig.entry))}
${row("rủi ro", `${f2(spot.riskPct)}%`, `${f2(trig.riskPct)}%`)}
${row("TP1 2.50", `+${f2(spot.targets[0].rewardPct)}%`, `+${f2(trig.targets[0].rewardPct)}%`)}
${row("R:R", f2(spot.targets[0].rr), f2(trig.targets[0].rr))}
${row("cần thắng", `${f1(spot.breakevenWinRatePct)}%`, `${f1(trig.breakevenWinRatePct)}%`)}
\`\`\`

Dòng cuối là dòng đáng nhìn. Vào ngay: chỉ cần đúng ${f1(spot.breakevenWinRatePct)}% số lần là hoà vốn — tức sai phần lớn số lần vẫn sống. Chờ xác nhận: phải **đúng hơn một nửa số lần** mới hoà.

Chờ đợi không làm kèo an toàn hơn. Nó chuyển kèo từ "sai nhiều vẫn sống" sang "phải đúng thường xuyên".

RỒI THÌ, CÓ ĐÚNG THƯỜNG XUYÊN KHÔNG?

Đây là chỗ đo được thay vì đoán.

Tôi đi ngược ${f0(J.method.candles)} ngày lịch sử ICP, đi **từng nến một**. Từ mỗi ngày, giá chạm mục tiêu trước hay chạm stop trước? Nến nào chạm cả hai trong cùng ngày thì tính về phía stop — vì trong một cây nến ngày không ai biết thứ tự thật, và không nên cho kế hoạch hưởng phần mập mờ.

Với hình dạng "chờ xác nhận" (+${f2(trig.targets[0].rewardPct)}% trước khi −${f2(trig.riskPct)}%), khung 30 ngày:

\`\`\`
chạm TP1 trước    ${f1(tp1.upPct)}%
chạm stop trước   ${f1(tp1.downPct)}%
                  ${f0(tp1.n)} cửa sổ
\`\`\`

${f1(tp1.upPct)}% so với ${f1(trig.breakevenWinRatePct)}% cần có.

Thang mục tiêu còn lại mỏng hơn nữa: chạm 2.80 trước stop ${f1(tp2.upPct)}% số lần, chạm 3.30 trước stop ${f1(tp3.upPct)}%.

Kỳ vọng của cả kế hoạch: **${f2(J.expectancyR30d.trigger)}R.** Âm.

Và để công bằng — cách vào ngay cũng không cứu được. Tỷ lệ chạm +${f2(spot.targets[0].rewardPct)}% trước −${f2(spot.riskPct)}% chỉ là ${f1(spot30.upPct)}%, kỳ vọng ${f2(J.expectancyR30d.spot)}R. Cả hai đều âm. Tôi không bênh cách nào cả — tôi chỉ nói cái nào tệ hơn vì lý do gì.

CÁI STOP CÓ SỐNG NỔI MỘT TUẦN KHÔNG

${w.weeks} tuần hoàn tất của ICP, biên đỉnh–đáy trong tuần:

\`\`\`
p25        ${f2(w.p25Pct)}%
trung vị   ${f2(w.medianPct)}%
p90        ${f2(w.p90Pct)}%
\`\`\`

Stop ${f2(trig.riskPct)}% bằng **${f2(J.stopVsMovement.triggerStopOverMedianWeek)} lần** một tuần trung vị. Giữ lệnh qua tuần thì một tuần hoàn toàn bình thường quét nó, không cần tin tức gì.

BA ĐIỀU TÔI KHÔNG KIỂM ĐƯỢC

Nói thẳng chỗ mình mù, vì đó là phần các bài phân tích hay giấu.

**Một.** Funding và open interest Binance: endpoint futures chặn địa lý từ máy này. Không có số thì tôi không nói.

**Hai.** Dữ liệu thanh lý thật: CoinGlass, Glassnode, CryptoQuant đều từ chối nếu không có API trả phí. Không có dữ liệu miễn phí tại thời điểm này.

**Ba.** Điều kiện "chỉ tính những ngày phá đỉnh 30 ngày" chỉ cho ${cond.n} mẫu, tức khoảng ${f1(cond.effectiveN)} lần độc lập sau khi trừ chồng lấn. Quá ít để kết luận bất cứ điều gì — kể cả kết luận rằng nó vô dụng.

ĐIỀU RÚT RA, KHÔNG DÍNH GÌ TỚI ICP

Bất cứ khi nào bạn đọc một kế hoạch có dạng *"vào khi vượt X, cắt dưới Y"*, hãy làm đúng một phép tính trước khi làm gì khác:

**Khoảng cách từ X xuống Y, so với khoảng cách từ X lên mục tiêu đầu tiên.**

Nếu chân dưới dài hơn chân trên, kế hoạch đó cần bạn đúng thường xuyên — và gần như không kế hoạch nào nói cho bạn biết "thường xuyên" là bao nhiêu. Ở đây là ${f1(trig.breakevenWinRatePct)}%.

Con số đó mất mười giây để tính. Nó lọc được rất nhiều thứ.

Quan điểm: **CHỜ**. Không phải vì ICP xấu — nền 25 ngày rộng ${f2(J.resistance.baseWidthPct)}%, khối lượng đang nở thật, cấu trúc sạch. Mà vì thang giá cụ thể đó, với cái stop cụ thể đó, không trả đủ cho rủi ro nó bắt bạn nhận. Và nén biên độ thì tôi đã đo trên 43,088 pair-day: ${f2(B.conditions.compressed.normalised.liftVsBaseline)}x, ${f2(B.conditions.compressed.normalised.sigmas)} sigma — nền đẹp mô tả quá khứ, không dự báo tương lai.

Một lưu ý cuối về con số tương quan, vì nó hay bị đọc sai: r = ${f2(c30.r)} **không** có nghĩa BTC quyết định hơn một nửa chuyển động. Phải bình phương nó lên — $BTC giải thích khoảng **${f1(c30.r ** 2 * 100)}%** biến động ngày của ICP. Hai phần ba còn lại là chuyện riêng của ICP. Nhưng một phần ba cũng đủ để một phiên BTC xấu xoá sạch mọi thứ trong bảng phía trên.

Lần gần nhất bạn tính tỷ lệ thắng cần có trước khi vào lệnh là khi nào?

Nghiên cứu giáo dục, không phải lời khuyên đầu tư. Tự chịu trách nhiệm.

#ICP #RiskManagement #TradingPlan`;

writeFileSync("drafts/62-cho-xac-nhan.txt", text);
console.log("claims:", Object.keys(claims).length, "| words:", text.trim().split(/\s+/).length);
