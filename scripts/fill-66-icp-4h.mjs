/**
 * Post 66 — a 4-hour levels note, checked in three layers.
 *
 * The layers matter because they fail differently. Descriptions of now are
 * lookups. Descriptions of what happened are counts dressed as observations.
 * And underneath both sits an assumption nobody quotes a number for: that a
 * support level carries information at all.
 *
 * That third layer came back POSITIVE, which is the first time anything in this
 * series has. It would be easy to lead with it and easy to oversell it, so the
 * post does neither: the edge is reported with both its naive significance and
 * its de-overlapped significance side by side, and the de-overlapped figure —
 * under one sigma — is the one the conclusion is written against.
 *
 * Reporting a result that cuts against the channel's own scepticism is the
 * whole point of measuring rather than arguing, so it is carried in full.
 *
 * Every figure traces to research/icp-4h-check.json.
 */

import { readFileSync, writeFileSync } from "node:fs";

const J = JSON.parse(readFileSync("research/icp-4h-check.json", "utf8"));
const n = J.now, r = J.range, z = J.zones, t = J.trade;
const s1 = J.support.find((s) => s.nearPct === 1.0);
const tp1 = t.targets[0], tp2 = t.targets[1];
const at = (g, bars) => g.byHorizon.find((b) => b.horizonBars === bars);

const claims = {
  "price has left the band the note quotes": !n.priceInsideClaimedBand,
  "the box is narrower than what actually traded": r.actualWidthPct > r.claimedWidthPct,
  "and a third of the candles closed outside it": r.closesOutsidePct > 25,
  "the box is barely two ordinary days wide": r.widthInDailyAtr < 3,
  "the resistance called repeatedly rejected was never reached": z.resistNear.visits === 0,
  "nor was the support said to be under test": z.supportNear.visits === 0,
  "the main support failed more often than it held":
    z.supportMain.visits > 20 && z.supportMain.brokeThroughDown > z.supportMain.visits / 2,
  "while the deepest zone held every time":
    z.supportDeep.visits > 5 && z.supportDeep.brokeThroughDown === 0,
  "support does beat the baseline": s1.edgePp > 5,
  "but not once the overlap is removed": Math.abs(s1.sigmasDeOverlapped) < 2,
  "though it would look convincing if it were not": Math.abs(s1.sigmasNaive) > 2.5,
  "the proposed stop is narrower than a single ordinary day": t.stopInDailyAtr < 1,
  "and every cell of the proposed trade loses":
    t.targets.every((g) => g.byHorizon.every((b) => b.expectancyR < 0)),
  "the volume reading in the note is accurate": Math.abs(n.volumeZScoreCompleted) < 1,
  "but price is above the long moving average, not under it": n.price > n.sma200,
};
const bad = Object.entries(claims).filter(([, ok]) => !ok);
if (bad.length) { console.error("ABORT:"); for (const [c] of bad) console.error("  x " + c); process.exit(1); }

const f1 = (v) => Number(v).toFixed(1);
const f2 = (v) => Number(v).toFixed(2);
const f3 = (v) => Number(v).toFixed(3);
const f4 = (v) => Number(v).toFixed(4);
const f0 = (v) => Math.round(Number(v)).toLocaleString("en-US");

const row = (a, b, c, d) =>
  (String(a).padEnd(15) + String(b).padStart(9) + String(c).padStart(12) + String(d).padStart(14)).trimEnd();

const text = `Có người gửi tôi bản phân tích 4H của $ICP — vùng hỗ trợ, vùng kháng cự, kịch bản tăng giảm. Loại bài ai cũng đọc mỗi ngày.

Tôi tách nó làm ba lớp, vì ba lớp đó hỏng theo ba kiểu khác nhau.

LỚP MỘT: MÔ TẢ HIỆN TẠI

Chỉ là tra cứu. Khớp hoặc không khớp.

Bản phân tích viết giá đang ở ${f2(J.note.priceBand[0])}–${f2(J.note.priceBand[1])}. Giá thật lúc tôi đo: **${f3(n.price)}**. Đã ra khỏi vùng đó, đi lên.

RSI 4H họ nói "khoảng ${J.note.rsiBand[0]}–${J.note.rsiBand[1]} tùy phiên". Tôi đo ${f1(n.rsi14)}. Sát trên mép.

Cái họ nói **đúng** là khối lượng: *"chưa có đột biến rõ ràng."* Z-score khối lượng 4H ${f2(n.volumeZScoreCompleted)}, sáu nến gần nhất chỉ hơn hai tư nến trước đó ${f1(n.volume6barsVsPrior24Pct)}%. Chính xác.

Cái họ nói **sai** là đường trung bình: *"MA dài hơn vẫn còn áp lực từ trên xuống."* Trên 4H, SMA200 ở ${f4(n.sma200)}. Giá ${f3(n.price)} đang nằm **trên** nó, không phải dưới.

LỚP HAI: CÁI HỘP

Họ viết ICP đang nén trong ${f2(r.claimed[0])}–${f2(r.claimed[1])}, rộng ${f2(r.claimedWidthPct)}%.

Tôi đo ${f0(r.bars)} nến 4H gần nhất — khoảng mười ngày. Biên thật: **${f4(r.actualLow)} đến ${f4(r.actualHigh)}**, rộng ${f2(r.actualWidthPct)}%.

Và đây mới là con số đáng nhìn: **${f1(r.closesOutsidePct)}% số nến đóng cửa NGOÀI cái hộp đó.**

Một phần ba. Một cái hộp mà một phần ba số nến đóng cửa bên ngoài thì không phải cái hộp — đó là một đường kẻ vẽ quanh chỗ giá tình cờ hay đi qua.

Còn chữ "nén"? Hộp đó rộng ${f2(r.claimedWidthPct)}%. Một ngày bình thường của ICP đi ${f2(n.atrDailyPct)}%. Tức cả cái vùng "nén dài hạn" ấy bằng **${f2(r.widthInDailyAtr)} ngày giao dịch bình thường**.

Hai ngày rưỡi không phải sự tĩnh lặng. Đó là hai ngày rưỡi.

LỚP HAI RƯỠI: ĐẾM THAY VÌ TẢ

"Đã được giữ khá tốt." "Liên tục bị từ chối." Nghe như quan sát, thực ra là **phép đếm**. Nên tôi đếm.

Trong cửa sổ đo được (bỏ ${z.supportMain.lookaheadBars} nến cuối vì chưa có kết quả để chấm):

\`\`\`
${row("vùng", "lần chạm", "sau cao hơn", "thủng xuống")}
${row(`${f2(J.note.supportNear[0])}–${f2(J.note.supportNear[1])}`, f0(z.supportNear.visits), "—", "—")}
${row(`${f2(J.note.supportMain[0])}–${f2(J.note.supportMain[1])}`, f0(z.supportMain.visits), f0(z.supportMain.higherAfter), f0(z.supportMain.brokeThroughDown))}
${row(`${f2(J.note.supportDeep[0])}–${f2(J.note.supportDeep[1])}`, f0(z.supportDeep.visits), f0(z.supportDeep.higherAfter), f0(z.supportDeep.brokeThroughDown))}
${row(`${f2(J.note.resistNear[0])}–${f2(J.note.resistNear[1])}`, f0(z.resistNear.visits), "—", "—")}
${row(`${f2(J.note.resistNext[0])}–${f2(J.note.resistNext[1])}`, f0(z.resistNext.visits), "—", "—")}
\`\`\`

Vùng kháng cự ${f2(J.note.resistNear[0])}–${f2(J.note.resistNear[1])} được mô tả là *"liên tục bị từ chối"*. Số lần giá chạm nó trong cửa sổ đo được: **${f0(z.resistNear.visits)}**. Không có lần từ chối nào để mà liên tục — giá chỉ mới lên tới đó trong vài nến cuối, và ngay lúc này nó đang đứng **trong** vùng ấy.

Vùng ${f2(J.note.supportNear[0])}–${f2(J.note.supportNear[1])} được mô tả là *"đang được test"*. Số lần chạm: **${f0(z.supportNear.visits)}**. Giá ở ${f3(n.price)}, cách xa phía trên.

Vùng họ gọi là hỗ trợ chính ${f2(J.note.supportMain[0])}–${f2(J.note.supportMain[1])}: chạm ${f0(z.supportMain.visits)} lần, và **${f0(z.supportMain.brokeThroughDown)} lần sau đó giá đóng cửa xuyên xuống dưới**. Hơn một nửa. Đó là vùng hay gãy, không phải vùng hay giữ.

Vùng duy nhất giữ hoàn hảo là ${f2(J.note.supportDeep[0])}–${f2(J.note.supportDeep[1])}: ${f0(z.supportDeep.visits)} lần chạm, ${f0(z.supportDeep.higherAfter)} lần sau đó cao hơn, ${f0(z.supportDeep.brokeThroughDown)} lần thủng. Và đó là vùng họ xếp hạng **thấp nhất**.

LỚP BA: HỖ TRỢ CÓ THẬT KHÔNG

Đây là câu hỏi nằm dưới tất cả những câu trên, và gần như không ai đưa số cho nó.

Tôi định nghĩa "test hỗ trợ" bằng máy: giá nằm trong ${f1(s1.nearPct)}% của đáy ${s1.lookbackBars} nến trước đó. Rồi hỏi: ${s1.lookaheadBars} nến sau, giá cao hơn hay thấp hơn? Và — phần quan trọng nhất — **so với một nến bất kỳ thì sao?**

Một tỷ lệ bật lên 59% chẳng nói gì nếu thị trường vốn đi lên 59% số lần.

\`\`\`
${row("sau khi test hỗ trợ", `${f1(s1.bouncePct)}%`, "", "")}
${row("nến bất kỳ", `${f1(s1.baselineUpPct)}%`, "", "")}
${row("chênh lệch", `+${f1(s1.edgePp)}`, "điểm", "")}
\`\`\`

**Hỗ trợ thắng nền.** ${f1(s1.edgePp)} điểm phần trăm, trên ${f0(s1.tests)} lần test.

Tôi phải nói thẳng: đây là thứ đầu tiên trong nhiều tuần đo đạc mà tôi thấy ra **dương**. Tôi đã đo nén biên độ — không có gì. Giờ trong ngày — không có gì. Hướng đi trong ngày — không có gì. Cái này thì có.

Nhưng chưa xong.

${f0(s1.tests)} lần test đó **chồng lấn nhau** — cùng chia nhau những cây nến giống nhau. Nếu coi chúng độc lập thì kết quả ra **${f2(s1.sigmasNaive)} sigma**, nghe rất thuyết phục. Trừ chồng lấn đi thì còn khoảng ${f1(s1.effectiveTests)} lần thật sự độc lập, và cùng chênh lệch đó chỉ còn **${f2(s1.sigmasDeOverlapped)} sigma**.

Dưới một sigma là chưa chứng minh được gì.

Tôi để cả hai con số ở đây thay vì chọn cái đẹp hơn, vì chính chỗ này là nơi phần lớn backtest chết: in ra ${f2(s1.sigmasNaive)}, không in ${f2(s1.sigmasDeOverlapped)}, rồi gọi đồng xu là lợi thế.

Kết luận trung thực: **hỗ trợ có vẻ mang một chút thông tin, và tôi chưa chứng minh được điều đó.** Đủ để tôi tiếp tục đo. Chưa đủ để tôi đặt tiền.

CÒN CÁI KÈO HỌ ĐỀ XUẤT

*"Mua phản ứng tại hỗ trợ ${f2(J.note.supportMain[1])}–${f2(J.note.supportNear[0])} với stop chặt dưới ${f2(J.note.supportMain[0])}."*

\`\`\`
${row("vào", f3(t.entry), "", "")}
${row("cắt lỗ", f3(t.stop), `${f2(t.riskPct)}%`, "")}
${row("= ATR ngày", f2(t.stopInDailyAtr), "lần", "")}
\`\`\`

Chữ "chặt" đúng theo nghĩa đen: cái stop đó bằng **${f2(t.stopInDailyAtr)} lần** một biên độ ngày bình thường của ICP. Chưa tới một ngày.

Đi từng nến trên ${f0(at(tp1, 30).n)} cửa sổ 4H:

\`\`\`
${row("", "trúng", "dính stop", "kỳ vọng")}
${row(`TP ${f2(tp1.target)} · 2 ngày`, `${f1(at(tp1, 12).upPct)}%`, `${f1(at(tp1, 12).downPct)}%`, `${f3(at(tp1, 12).expectancyR)}R`)}
${row(`TP ${f2(tp1.target)} · 5 ngày`, `${f1(at(tp1, 30).upPct)}%`, `${f1(at(tp1, 30).downPct)}%`, `${f3(at(tp1, 30).expectancyR)}R`)}
${row(`TP ${f2(tp2.target)} · 2 ngày`, `${f1(at(tp2, 12).upPct)}%`, `${f1(at(tp2, 12).downPct)}%`, `${f3(at(tp2, 12).expectancyR)}R`)}
${row(`TP ${f2(tp2.target)} · 5 ngày`, `${f1(at(tp2, 30).upPct)}%`, `${f1(at(tp2, 30).downPct)}%`, `${f3(at(tp2, 30).expectancyR)}R`)}
\`\`\`

Bốn ô, bốn số âm. Tỷ lệ được–mất ${f2(tp1.rr)} và ${f2(tp2.rr)} trông ổn, nhưng nhân với tỷ lệ trúng thì không ô nào trả nổi.

Và tôi đã thấy đúng hình dạng này hôm qua ở XLM: stop dưới một biên độ ngày thì gần như chắc chắn bị quét, bất kể mục tiêu đặt ở đâu. Hai lần chưa thành quy tắc — nhưng cơ chế thì rõ, và nó dễ kiểm: **chia khoảng cách stop cho ATR ngày.** Dưới 1 thì bạn đang trả tiền cho tiếng ồn.

CHỖ TÔI MÙ

Funding và open interest Binance bị chặn địa lý từ máy này. Dữ liệu thanh lý thật thì các nguồn đều từ chối nếu không có API trả phí. Không có dữ liệu miễn phí tại thời điểm này.

Phần đếm vùng bỏ ${z.supportMain.lookaheadBars} nến cuối, vì chúng chưa có kết quả để chấm. Đó chính là lý do vùng ${f2(J.note.resistNear[0])}–${f2(J.note.resistNear[1])} hiện ${f0(z.resistNear.visits)} lần chạm dù giá đang ở trong đó lúc này. Tôi nói ra để bạn không phải đoán.

Quan điểm: **CHỜ**. Giá đang trên cả SMA10, SMA20, SMA50 và SMA200 khung 4H — cấu trúc ngắn hạn nghiêng lên thật, và bản phân tích cảm nhận đúng hướng đó. Nhưng các mốc cụ thể trong đó không mô tả cái đã xảy ra, và cái kèo kèm theo âm ở cả bốn cách đo. Cảm nhận đúng hướng với kế hoạch sai hình học vẫn là kế hoạch sai.

Lần tới đọc một bản "vùng hỗ trợ – kháng cự", thử hỏi đúng một câu: **giá đã chạm vùng đó bao nhiêu lần, và bao nhiêu lần nó giữ?** Câu đó biến một bức tranh thành một phép đếm, và phép đếm thì không tranh cãi được.

Bạn có bao giờ đếm thử chưa?

Nghiên cứu giáo dục, không phải lời khuyên đầu tư. Tự chịu trách nhiệm.

#TechnicalAnalysis #RiskManagement #Altcoins`;

writeFileSync("drafts/66-icp-4h.txt", text);
console.log("claims:", Object.keys(claims).length, "| words:", text.trim().split(/\s+/).length);
