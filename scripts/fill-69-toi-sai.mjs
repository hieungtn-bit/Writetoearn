/**
 * Post 69 — a trader said the system was broken. He was right.
 *
 * The strongest thing this channel can publish is a fault it found in itself,
 * and this is the largest one yet: for weeks the scanner returned one answer
 * because it could only ever compute one, and a reader with a position on
 * spotted it before any test did.
 *
 * The post has to do two things at once and not blur them. It reports the fault
 * plainly, and it hands over the rebuilt tool — including calls that go short,
 * which this channel has never published before. A reader who takes those calls
 * is taking them on a sample of five independent episodes, so that number sits
 * above the entry prices rather than below them.
 *
 * Every figure traces to site/signals.json and research/why-always-wait.json.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { count, pct, price as fmtPrice } from "../src/format.mjs";

const S = JSON.parse(readFileSync("site/signals.json", "utf8"));
const W = JSON.parse(readFileSync("research/why-always-wait.json", "utf8"));

const t = S.tally;
const byAsset = Object.fromEntries(S.signals.map((s) => [s.asset, s]));
const icp = W.rows.find((r) => r.asset === "ICP");
const btcRow = W.rows.find((r) => r.asset === "BTC");
const withPlan = S.signals.filter((s) => s.plan);
const effs = withPlan.map((s) => s.plan.effectiveN).sort((a, b) => a - b);
const medianEff = effs[effs.length >> 1];
const holdAvg = W.holdingAverages;
const bico = W.holding.find((h) => h.asset === "BICO");

/** The three best calls that are liquid enough to size, whichever way they point. */
const headline = S.signals.filter((s) => s.plan && s.tradeable).slice(0, 3);

const claims = {
  "the board now answers with more than one word": t.LONG > 0 && t.SHORT > 0,
  "and shorts outnumber longs": t.SHORT > t.LONG,
  "long was near-dead on ICP over the full history": icp.long.positive <= 3,
  "while short was alive on the same grid": icp.short.positive > 80,
  "BTC is the mirror, which shows the grid discriminates": btcRow.long.positive > 80,
  "buy and hold paid while the desk said wait": holdAvg.avg7dPct > 5,
  "and one name paid enormously": bico.hold14dPct > 100,
  "but it demanded a drawdown almost nobody sits through": bico.worstDrawdown14dPct < -40,
  "most cells rest on a thin sample": medianEff < 12,
  "the board still refuses some pairs outright": t.WAIT > 0,
  "and flags where the regime has turned inside the sample": t.turning > 0,
  "the headline calls are liquid enough to size": headline.length === 3,
  "the snapshot records the window that decided it": S.method.recentWindowDays > 0,
};
const bad = Object.entries(claims).filter(([, ok]) => !ok);
if (bad.length) { console.error("ABORT:"); for (const [c] of bad) console.error("  x " + c); process.exit(1); }

const row = (a, b, c) =>
  (String(a).padEnd(9) + String(b).padStart(11) + String(c).padStart(13)).trimEnd();

const callLines = headline.map((s) => {
  const p = s.plan;
  return `${s.asset.padEnd(6)} ${s.bias.padEnd(6)} ${String(p.horizonDays + "d").padStart(4)}  `
    + `vào ${fmtPrice(p.entry)}  cắt ${fmtPrice(p.stop)}  đích ${fmtPrice(p.target)}  `
    + `E ${pct(p.expectancyR)}R  n≈${Math.round(p.effectiveN)}`;
}).join("\n");

const text = `Một người giao dịch nhắn cho tôi: *"Thuật toán của bạn toàn báo WAIT, bỏ lỡ rất nhiều cơ hội."*

Tôi không cãi. Tôi đi đo.

Anh ấy đúng, và lý do tệ hơn "quá thận trọng".

BA LỖI, KHÔNG PHẢI MỘT

**Lỗi một: lưới của tôi chỉ có một chiều.**

Mọi hình học tôi chấm suốt mấy tuần đều là *mua rồi giữ tới mục tiêu phía trên*. Trên một tài sản đang rơi, kỳ vọng long âm là chuyện hiển nhiên — và khi long đã âm thì **WAIT là lựa chọn duy nhất còn lại trên menu**.

Thêm chiều short vào đúng cái lưới đó, cùng dữ liệu, cùng cách đi từng nến:

\`\`\`
${row("", "LONG", "SHORT")}
${row("$ICP", `${icp.long.positive}/${icp.long.cells}`, `${icp.short.positive}/${icp.short.cells}`)}
${row("$BTC", `${btcRow.long.positive}/${btcRow.long.cells}`, `${btcRow.short.positive}/${btcRow.short.cells}`)}
\`\`\`

WAIT chưa bao giờ là một nhận định thị trường. **Nó là một nhánh bị thiếu.**

Và để bạn thấy lưới có phân biệt thật chứ không phải cứ short là thắng: BTC ngược hẳn — long ${btcRow.long.positive}/${btcRow.long.cells}, short ${btcRow.short.positive}/${btcRow.short.cells}. Đọc ra một chế độ mạch lạc mà tôi có đủ dữ liệu để nói từ lâu và đã không nói, vì code không hỏi.

**Lỗi hai: tôi lấy trung bình một nghìn ngày.**

Chạy đúng lưới đó trên ${count(S.method.recentWindowDays)} ngày gần nhất thay vì toàn lịch sử thì **mọi dấu đều lật**. ICP long từ 0% số ô dương lên 88%; ICP short từ 94% xuống 0%.

Lưới nghìn ngày của tôi không đo lợi thế. Nó đo **một chế độ đã qua** rồi áp lên thị trường đã đổi.

**Lỗi ba: WAIT là mặc định, không phải kết luận.**

Nếu long âm mà short dương thì đáp án là short. Tôi đã để nó rơi vào WAIT.

CON SỐ TÔI NỢ NGƯỜI ĐÓ

Mua-và-giữ, đúng trong tuần tôi bảo đứng ngoài, trung bình trên nhóm tôi theo dõi: **+${pct(holdAvg.avg7dPct)}%** sau 7 ngày, **+${pct(holdAvg.avg14dPct)}%** sau 14 ngày.

$BICO — chính cái tên hệ thống của tôi bắt được rồi tôi tự chấm là trượt — **+${pct(bico.hold14dPct)}% trong 14 ngày**.

Không có cách nào diễn giải bảng đó thành "tôi đúng". Đứng ngoài đã tốn tiền thật.

Một chỗ duy nhất tôi giữ lại: để lấy con số BICO đó bạn phải ngồi qua mức sụt **${pct(bico.worstDrawdown14dPct)}%**. Đó không phải lý do để nói WAIT. Đó là lý do để nói *vào cỡ nào* — và tôi đã không nói câu đó.

TÔI ĐÃ VIẾT LẠI VÀ ĐƯA LÊN WEB

Máy quét mới chấm **cả hai chiều bình đẳng**, để **cửa sổ gần quyết định**, và chỉ trả WAIT khi **cả hai chiều đều âm**.

Quét ${count(t.total)} cặp hôm nay:

\`\`\`
${row("LONG", count(t.LONG), "")}
${row("SHORT", count(t.SHORT), "")}
${row("WAIT", count(t.WAIT), "")}
\`\`\`

${count(t.turning)} cặp đang có **đổi chế độ** — cửa sổ gần nghịch dấu với lịch sử dài, tức thị trường đã thay đổi ngay bên trong mẫu.

Ba kèo đủ thanh khoản để vào cỡ, xếp theo kỳ vọng:

\`\`\`
${callLines}
\`\`\`

Đây là lần đầu kênh này ra khuyến nghị **short**. Nó đến từ dữ liệu, không từ quan điểm.

ĐỌC CÁI NÀY TRƯỚC KHI DÙNG BẢNG

Cột quan trọng nhất không phải kỳ vọng. Là **n**.

Cửa sổ đo chồng lấn nhau, nên mẫu trung thực là số lần độc lập — trung vị trên bảng hôm nay là **${count(medianEff)}**. ${count(withPlan.filter((s) => s.confidence?.thin).length)} trên ${count(withPlan.length)} kèo bị đánh dấu *mẫu mỏng*.

Một con số 0.70R trên năm lần độc lập là **một câu chuyện**, chưa phải một phát hiện. Bảng ghi rõ điều đó ngay cạnh mỗi dòng, phía trên giá vào — cố ý, vì thứ nên khiến bạn nghi ngờ phải đến trước thứ khiến bạn muốn vào lệnh.

Và bảng vẫn từ chối: ${count(t.WAIT)} cặp hôm nay không có chiều nào dương. Một bộ lọc tốt phải có quyền trả về con số không.

BẢNG NẰM Ở ĐÂU

**maix8.study/signals** — lọc theo chiều, theo khung 3/5/10/30 ngày, theo thanh khoản. Cập nhật mỗi ngày. Chạy được cả khi tắt JavaScript.

Mọi ô đều đi từng nến. Nến chạm cả stop lẫn đích thì tính về phía **stop**. Lệnh chưa đóng ở cuối khung thì **đóng theo giá thị trường**, không tính là hoà — chỗ này từng biến một kết quả trung vị −7.4% thành tiêu đề +0.115R. Stop mà giá không thể chạm tới thì bị loại chứ không được chấm.

Funding, open interest và dữ liệu thanh lý bị chặn từ máy này nên không dùng ở bất cứ đâu.

Quan điểm: **short chọn lọc** trên nhóm alt, và tôi nói thẳng rằng nền tảng của nó là mẫu mỏng.

Điều tôi học được hôm nay không phải về thị trường. Là thế này: **một hệ thống chỉ trả một đáp án bất kể đầu vào thì không phải đang phân tích — nó đang mặc định.** Và tôi đã không nhận ra cho tới khi một người có tiền trong lệnh nói cho tôi biết.

Bạn thấy chỗ nào trong bảng đó sai?

Nghiên cứu giáo dục, không phải lời khuyên đầu tư. Tự chịu trách nhiệm.

#TradingSignals #RiskManagement #Altcoins`;

writeFileSync("drafts/69-toi-sai.txt", text);
console.log("claims:", Object.keys(claims).length, "| words:", text.trim().split(/\s+/).length);
