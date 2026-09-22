/**
 * Post 64 — the arbitrage bot story, measured instead of reasoned about.
 *
 * Every rebuttal to a "$68 to $750k with a bot" story says the same true,
 * unfalsifiable things: latency is hard, fees eat the edge, professionals get
 * there first. This post replaces all of it with one measurement taken on the
 * machine under discussion — an ordinary host, the same public endpoints a
 * retail bot would use — because the argument only becomes checkable when the
 * spread is a number.
 *
 * The post states no market view, so it carries no bias line and is checked
 * with --no-call. Attaching a direction to a piece about execution costs would
 * be inventing a call to satisfy a template.
 *
 * Every figure traces to research/arb-reality.json.
 */

import { readFileSync, writeFileSync } from "node:fs";

const J = JSON.parse(readFileSync("research/arb-reality.json", "utf8"));
const s = J.spreads, st = J.story, L = J.latency;
const at = (n) => st.requiredGainPerTradePct.find((r) => r.trades === n);
const floorUsd = Math.max(...J.minNotional.map((m) => m.minNotionalUsd));

const claims = {
  "the sample is real and same-tick": J.method.observations > 250,
  "retail latency lands inside the range the analysis quoted":
    L.binance.medianMs > 50 && L.binance.medianMs < 300 && L.okx.medianMs < 300,
  "gaps between the venues do open": s.positiveBeforeFeesPct > 10,
  "but not one of them survived the fees": s.trulyProfitablePct === 0,
  "the very best gap seen was a fraction of the fee":
    s.executableMaxPct < s.roundTripFeePct / 3,
  "so every round trip loses money": st.bestObservedNetPct < 0,
  "even a hundred thousand perfect trades would need a far larger spread":
    at(100_000).timesLargerThanBestObserved > 3,
  "the median executable gap is not merely thin, it is absent":
    s.executableMedianPct <= 0,
  "and the largest gap seen barely reaches the bottom of the range they quoted":
    s.executableMaxPct < J.audited.quotedSpreadRangePct[1] / 3,
  "the capital clears the venue's order floor with room to spare":
    st.startUsd > floorUsd * 5,
  "the multiple in the story is four figures": st.multiple > 1000,
};
const bad = Object.entries(claims).filter(([, ok]) => !ok);
if (bad.length) { console.error("ABORT:"); for (const [c] of bad) console.error("  x " + c); process.exit(1); }

const f1 = (v) => Number(v).toFixed(1);
const f2 = (v) => Number(v).toFixed(2);
const f3 = (v) => Number(v).toFixed(3);
const f4 = (v) => Number(v).toFixed(4);
const f0 = (v) => Math.round(Number(v)).toLocaleString("en-US");

const feeOverBest = s.feeOverBestObservedX;

const row = (a, b, c) =>
  (String(a).padEnd(24) + String(b).padStart(12) + String(c).padStart(16)).trimEnd();

const text = `Có người gửi tôi bản phân tích kỹ thuật về câu chuyện viral "sinh viên 19 tuổi dùng bot arbitrage biến $${st.startUsd} thành $${f0(st.endUsd)}". Bản phân tích kết luận: không khả thi.

Kết luận đúng. Nhưng nó lập luận bằng chữ — độ trễ cao, phí ăn hết, HFT nhanh hơn. Toàn câu đúng và toàn câu không kiểm được.

Tôi đo thật. Trên đúng loại máy đang bàn tới.

CÁCH ĐO

Hai sàn: Binance spot và OKX spot. Tám cặp. ${J.method.samples} lần lấy giá, mỗi lần cách nhau ${J.method.sampleGapMs / 1000} giây, **hai sàn lấy trong cùng một nhịp** — nếu lấy lệch nhau vài giây thì cái gọi là "chênh lệch" chỉ là thời gian trôi, không phải cơ hội.

Tổng cộng ${f0(J.method.observations)} quan sát.

Và quan trọng nhất: tôi đo **giá khớp được**, không đo điểm giữa. Bạn mua ở giá bán, bán ở giá mua. Điểm giữa là mức giá không ai giao dịch — đó chính là chỗ mọi bảng "cơ hội arbitrage" trông đẹp một cách giả tạo.

ĐỘ TRỄ THẬT TỪ MÁY NÀY

\`\`\`
${row("Binance", `${f0(L.binance.medianMs)} ms`, `p90 ${f0(L.binance.p90Ms)} ms`)}
${row("OKX", `${f0(L.okx.medianMs)} ms`, `p90 ${f0(L.okx.p90Ms)} ms`)}
\`\`\`

Bản phân tích nói bot retail chạy ở 50–300ms. **Đúng.** Con số của tôi nằm gọn trong đó. Một điểm ghi cho họ.

CHÊNH LỆCH GIÁ THẬT

\`\`\`
${row("", "trung vị", "lớn nhất")}
${row("khớp được", `${f4(s.executableMedianPct)}%`, `${f4(s.executableMaxPct)}%`)}
${row("phí khứ hồi", `${f2(s.roundTripFeePct)}%`, "")}
\`\`\`

Đọc lại hai dòng đó.

Khe hở lớn nhất xuất hiện trong ${f0(J.method.observations)} quan sát là **${f4(s.executableMaxPct)}%**. Phí đi hai chân là **${f2(s.roundTripFeePct)}%**.

Phí lớn hơn cơ hội tốt nhất **${f1(feeOverBest)} lần**.

CON SỐ TRẢ LỜI TẤT CẢ

\`\`\`
${row("có khe hở dương", `${f1(s.positiveBeforeFeesPct)}%`, "trước phí")}
${row("thực sự có lãi", `${f1(s.trulyProfitablePct)}%`, "sau phí")}
\`\`\`

Khe hở **có** mở ra — ${f1(s.positiveBeforeFeesPct)}% số lần, hai sàn lệch nhau thật. Đó là phần khiến người ta tin.

Số lần lệch đủ để trả phí: **không một lần nào.** Không phải ít. Là zero trên ${f0(J.method.observations)}.

Lệnh khứ hồi tốt nhất tôi quan sát được vẫn lỗ **${f3(Math.abs(st.bestObservedNetPct))}%**.

VÀ ĐÂY LÀ CHỖ CÂU CHUYỆN SỤP

$${st.startUsd} thành $${f0(st.endUsd)} là **${f0(st.multiple)} lần**.

Giả sử điều không thể: mọi lệnh đều thắng, không lệnh nào lỗ, lãi cộng dồn toàn bộ, không rút một đồng.

\`\`\`
${row("số lệnh thắng liên tục", "cần spread", "so với mức lớn nhất")}
${row(f0(at(100).trades), `${f3(at(100).requiredGrossSpreadPct)}%`, `${f0(at(100).timesLargerThanBestObserved)}x`)}
${row(f0(at(1_000).trades), `${f3(at(1_000).requiredGrossSpreadPct)}%`, `${f0(at(1_000).timesLargerThanBestObserved)}x`)}
${row(f0(at(10_000).trades), `${f3(at(10_000).requiredGrossSpreadPct)}%`, `${f0(at(10_000).timesLargerThanBestObserved)}x`)}
${row(f0(at(100_000).trades), `${f3(at(100_000).requiredGrossSpreadPct)}%`, `${f0(at(100_000).timesLargerThanBestObserved)}x`)}
\`\`\`

Chạy càng nhiều lệnh, mỗi lệnh càng cần ít. Nhưng nó không bao giờ xuống dưới **${f2(s.roundTripFeePct)}%**, vì đó là phí — bạn trả trước khi có bất kỳ đồng lãi nào.

Nghĩa là: **không có số lệnh nào làm câu chuyện này chạy được.** Không phải khó. Là không tồn tại. Mỗi vòng đều làm tài khoản nhỏ đi, mà một dãy số nhân với số nhỏ hơn 1 thì không bao giờ nở ra ${f0(st.multiple)} lần.

Đó là lý do tôi thích đo hơn là tranh luận. Tranh luận về độ trễ thì còn cãi được. Phép nhân thì không.

HAI CHỖ BẢN PHÂN TÍCH KIA CHƯA CHÍNH XÁC

Họ đúng ở kết luận. Nhưng hai chi tiết lệch, và cả hai đều lệch theo hướng **quá tử tế với câu chuyện**.

**Một.** Họ mô tả spread arbitrage nằm trong dải ${f2(J.audited.quotedSpreadRangePct[0])}–${f2(J.audited.quotedSpreadRangePct[1])}%. Tôi đo được trung vị **${f4(s.executableMedianPct)}%** — tức phần lớn thời gian không có khe hở khớp được nào cả, chứ không phải có mà nhỏ. Khe hở lớn nhất trong toàn bộ ${f0(J.method.observations)} quan sát chỉ vừa chạm tới **đáy** dải họ đưa ra, và vẫn còn cách đỉnh dải đó rất xa. Thị trường chặt hơn nhiều so với cả người đang phản biện nó tưởng.

**Hai.** Họ lo vốn $${st.startUsd} không đủ vượt lệnh tối thiểu. Tôi kiểm: mức tối thiểu trên Binance cho các cặp này là $${floorUsd}. Vốn đó vượt sàn thoải mái. Rào cản thật không nằm ở kích thước lệnh — nó nằm ở phí, và cái đó thì bao nhiêu vốn cũng không thoát.

Còn "quét 50+ thị trường là vấn đề băng thông"? Tôi lấy cả tám cặp bằng **một** request mỗi sàn. Quét không đắt. Quét không tìm thấy gì mới là vấn đề.

CHỖ TÔI KHÔNG KIỂM ĐƯỢC

Tôi lấy giá qua REST mỗi ${J.method.sampleGapMs / 1000} giây. Bot thật dùng WebSocket và thấy nhiều nhịp hơn — nên **tôi không đo được khe hở tồn tại bao lâu**, và không loại trừ có những khe hở chớp nhoáng lọt giữa hai lần lấy của tôi.

Nhưng bot đó vẫn trả đúng ${f2(s.roundTripFeePct)}% phí và vẫn nhìn đúng hai sổ lệnh này. Thấy nhiều nhịp hơn không làm phí nhỏ đi.

Arbitrage CEX–DEX, thị trường dự đoán, chi phí gas: **không có dữ liệu miễn phí tại thời điểm này**, tôi không nói gì về chúng.

ĐIỀU THẬT SỰ ĐÁNG NHỚ

Arbitrage có thật. Nó là nghề của những người đặt máy chủ trong chính trung tâm dữ liệu của sàn, ăn phí bậc thấp nhất, và sống bằng vài phần nghìn phần trăm nhân với khối lượng khổng lồ.

Cái không có thật là phiên bản có thể chạy từ phòng ngủ với $${st.startUsd}.

Và cách kiểm một câu chuyện kiểu này không phải là cãi về công nghệ. Là hỏi: **spread bao nhiêu, phí bao nhiêu, đo trên bao nhiêu mẫu?** Ba câu hỏi đó mất mười phút để trả lời bằng dữ liệu công khai, và không câu chuyện viral nào sống sót qua chúng.

Bài này không đưa ra quan điểm mua bán nào. Nó chỉ là một phép trừ.

Bạn đã bao giờ trừ phí ra khỏi một cơ hội trước khi tin nó chưa?

Nghiên cứu giáo dục, không phải lời khuyên đầu tư. Tự chịu trách nhiệm.

$BTC $ETH $SOL

#Arbitrage #TradingBots #RiskManagement`;

writeFileSync("drafts/64-bot-arb.txt", text);
console.log("claims:", Object.keys(claims).length, "| words:", text.trim().split(/\s+/).length);
