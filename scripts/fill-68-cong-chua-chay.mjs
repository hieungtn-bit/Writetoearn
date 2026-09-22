/**
 * Post 68 — a corrected ruleset that was never given numbers to run on.
 *
 * The subject is not the three coins and it is not the pipeline. It is a
 * failure mode that survives every round of improving your rules: a threshold
 * written against a field whose input is a word. "Overhead above 50%
 * disqualifies" is a real gate. Fed the phrase "medium", it is decoration.
 *
 * The diagnosis is clean enough to carry the post on its own. Every field for
 * the two pairs this desk had already measured came back roughly right; every
 * field for the pair nobody had measured came back wrong — and that pair is the
 * one sitting at the top of all three lists.
 *
 * The post gives the ruleset full credit before it takes anything away, because
 * the rules genuinely are the right ones and a reader who thinks this is a
 * takedown will draw the wrong lesson.
 *
 * Every figure traces to research/pipeline-v3-check.json.
 */

import { readFileSync, writeFileSync } from "node:fs";

const J = JSON.parse(readFileSync("research/pipeline-v3-check.json", "utf8"));
const R = JSON.parse(readFileSync("research/icp-full.json", "utf8"));
const by = Object.fromEntries(J.rows.map((r) => [r.asset, r]));
const SUI = by.SUI, ENA = by.ENA, ICP = by.ICP;
const rules = J.rules;

/** The conditional base rate for ICP's current state, from the full study. */
const icpState = R.conditionals
  .find((c) => c.key === "hotVolumeHighInRange").byHorizon
  .find((h) => h.horizonDays === 30);

const claims = {
  "the name ranked first fails the most gates":
    SUI.gatesFailed.length > ENA.gatesFailed.length
    && SUI.gatesFailed.length > ICP.gatesFailed.length,
  "its overhead is past the disqualifying threshold":
    SUI.measured.underwaterPct > rules.overheadUsuallyDisqualifiesAbove,
  "and its volume is falling, not steady": SUI.measured.volumeTrendPct < -20,
  "no name clears every gate": J.rows.every((r) => !r.survivesOwnRules),
  "the multi-cell rule empties the list on its own":
    J.rows.every((r) => r.measured.positiveSharePct < rules.multiCellMinPositiveSharePct),
  "and every median cell loses": J.rows.every((r) => r.measured.medianExpectancyR < 0),
  "ENA has no positive geometry at all": ENA.measured.positiveCells === 0,
  "the pair called high-beta is not the most BTC-dependent one":
    SUI.measured.btcVarianceExplainedPct > ENA.measured.btcVarianceExplainedPct
    && SUI.measured.btcVarianceExplainedPct > ICP.measured.btcVarianceExplainedPct,
  "the fields for the measured pairs came back close":
    Math.abs(ENA.measured.underwaterPct - 35) < 5 && ICP.measured.underwaterPct < 5,
  "and ICP's reclassification was correct": ICP.measured.rangePosition30d > rules.rangePositionCapsEarlyAt,
  "buying that state has historically been worse than random": icpState.edgePp < -20,
  "though not at a sample that proves anything": Math.abs(icpState.sigmasDeOverlapped) < 2,
  "BTC is where the scan says this time": J.btc.insideClaimedBand,
};
const bad = Object.entries(claims).filter(([, ok]) => !ok);
if (bad.length) { console.error("ABORT:"); for (const [c] of bad) console.error("  x " + c); process.exit(1); }

const f1 = (v) => Number(v).toFixed(1);
const f2 = (v) => Number(v).toFixed(2);
const f3 = (v) => Number(v).toFixed(3);
const f0 = (v) => Math.round(Number(v)).toLocaleString("en-US");
const pct = (v) => (Math.abs(Number(v)) < 10 ? Number(v).toFixed(2) : Number(v).toFixed(1));

const row = (a, c, d) =>
  (String(a).padEnd(20) + String(c).padStart(14) + String(d).padStart(13)).trimEnd();

const text = `Có người vừa sửa lại bộ lọc quét altcoin của họ theo đúng những gì tôi đo mấy hôm nay, rồi chạy lại và gửi tôi kết quả để kiểm.

Luật mới của họ, tôi chép nguyên:

\`\`\`
xu hướng khối lượng   phải dương
vị trí biên 30 ngày   trên 85% thì hết Early
hàng kẹt trên giá     trên 35% phạt nặng, trên 50% thường loại
hình học              ưu tiên kỳ vọng dương trên NHIỀU tổ hợp
\`\`\`

**Bốn luật đó đúng hết.** Tôi sẽ không rào trước đón sau chỗ này: đây chính xác là những thứ cần có, và rất ít bảng quét nào chịu viết chúng ra thành ngưỡng cứng.

Rồi tôi áp chúng bằng số thật. Không tên nào qua được — và tên trượt nặng nhất đang đứng số một.

BẢNG CHẤM

\`\`\`
${row("", "$SUI (#1)", "")}
${row("khối lượng", `${f1(SUI.measured.volumeTrendPct)}%`, "trượt")}
${row("hàng kẹt", `${f1(SUI.measured.underwaterPct)}%`, "trượt")}
${row("biên 30 ngày", `${f1(SUI.measured.rangePosition30d)}%`, "đạt")}
${row("ô hình học dương", `${SUI.measured.positiveCells}/${SUI.measured.cellsTried}`, "trượt")}
\`\`\`

Hàng kẹt của SUI: **${f1(SUI.measured.underwaterPct)}%**.

Luật của chính họ nói trên ${f0(rules.overheadUsuallyDisqualifiesAbove)}% thì loại. Bảng của họ ghi trường này là **"trung bình"**.

Khối lượng SUI ${f1(SUI.measured.volumeTrendPct)}%. Bảng ghi **"ổn"**.

Trượt bốn trên năm cổng, đứng hạng nhất cả ba bảng.

VÀ ĐÂY LÀ CHẨN ĐOÁN, KHÔNG PHẢI LỜI CHÊ

Nhìn kỹ chỗ nào đúng chỗ nào sai thì lộ ra một quy luật rất sạch:

\`\`\`
${row("", "bảng ghi", "đo được")}
${row("$ENA hàng kẹt", "cao ~35%", `${f1(ENA.measured.underwaterPct)}%`)}
${row("$ENA beta", "cao 1.5+", f2(ENA.measured.beta))}
${row("$ICP hàng kẹt", "thấp", `${pct(ICP.measured.underwaterPct)}%`)}
${row("$ICP khối lượng", "mạnh", `${f1(ICP.measured.volumeTrendPct)}%`)}
${row("$ICP biên", "rất cao", `${f1(ICP.measured.rangePosition30d)}%`)}
${row("$SUI hàng kẹt", "trung bình", `${f1(SUI.measured.underwaterPct)}%`)}
${row("$SUI khối lượng", "ổn", `${f1(SUI.measured.volumeTrendPct)}%`)}
\`\`\`

**Mọi trường của ENA và ICP đều đúng. Mọi trường của SUI đều sai.**

Lý do không phải vì họ cẩu thả với SUI. Lý do là ENA và ICP **có số** — tôi đã đo và đăng chúng mấy hôm trước, họ lấy về dùng. SUI thì chưa ai đo, nên nó vào bảng bằng **tính từ**.

Và đây là câu tôi muốn bạn mang về:

**Một cái cổng viết "trên 50% thì loại" không làm gì cả khi đầu vào của trường đó là chữ "trung bình".**

Bộ lọc không hỏng. Nó chưa được cấp số để chạy.

Đó là kiểu hỏng sống sót qua mọi vòng cải tiến quy tắc, vì nhìn vào bảng thì thấy có cột, có ngưỡng, có điểm. Chỉ khi thay chữ bằng số thì mới biết cái cổng ấy có bao giờ đóng lại không.

CÁI LUẬT LÀM RỖNG CẢ DANH SÁCH

Luật thứ tư của họ là luật tôi thích nhất: *ưu tiên setup có kỳ vọng dương trên nhiều tổ hợp stop và tỷ lệ được–mất, thay vì khoe một ô tốt nhất.*

Tôi quét ${f0(SUI.measured.cellsTried)} tổ hợp cho mỗi đồng — ${f0(6)} khoảng cách stop tính bằng biên độ ngày của chính nó, ${f0(5)} tỷ lệ được–mất, ${f0(3)} khung thời gian, mỗi ô đi từng nến.

\`\`\`
${row("", "ô dương", "ô trung vị")}
${row("$SUI", `${SUI.measured.positiveCells}/${SUI.measured.cellsTried}`, `${f3(SUI.measured.medianExpectancyR)}R`)}
${row("$ENA", `${ENA.measured.positiveCells}/${ENA.measured.cellsTried}`, `${f3(ENA.measured.medianExpectancyR)}R`)}
${row("$ICP", `${ICP.measured.positiveCells}/${ICP.measured.cellsTried}`, `${f3(ICP.measured.medianExpectancyR)}R`)}
\`\`\`

ENA: **không một ô nào trong ${f0(ENA.measured.cellsTried)}**. Ô trung vị của cả ba đều âm.

Luật đó, chạy trung thực, xoá sạch danh sách. Và tôi nghĩ đó là **kết quả đúng** cho thị trường lúc này — chứ không phải lỗi của luật. Một bộ lọc tốt phải có quyền trả về con số không.

CÒN MỘT CHỖ NGƯỢC NỮA

Họ phạt "high-beta" vì BTC đang yếu — hợp lý. Nhưng phạt sai người.

\`\`\`
${row("", "beta", "BTC giải thích")}
${row("$SUI", f2(SUI.measured.beta), `${f1(SUI.measured.btcVarianceExplainedPct)}%`)}
${row("$ENA", f2(ENA.measured.beta), `${f1(ENA.measured.btcVarianceExplainedPct)}%`)}
${row("$ICP", f2(ICP.measured.beta), `${f1(ICP.measured.btcVarianceExplainedPct)}%`)}
\`\`\`

ENA có beta cao hơn, nhưng **SUI mới là đồng bám BTC chặt nhất** — BTC giải thích ${f1(SUI.measured.btcVarianceExplainedPct)}% biến động ngày của nó, gấp đôi ENA và gần bốn lần ICP.

Beta nói *đi bao xa*, tương quan bình phương nói *bao nhiêu phần là chuyện của BTC*. Trong môi trường "BTC yếu thì phạt", cái thứ hai mới là cái phải phạt. SUI đáng bị phạt nhất và đang đứng đầu bảng.

NHỮNG GÌ HỌ LÀM ĐÚNG

Phải nói cho đủ, vì phần này mới là phần đáng học theo.

**ICP bị đẩy khỏi Early.** Đúng. Biên 30 ngày ${f1(ICP.measured.rangePosition30d)}%, giai đoạn ${ICP.measured.stage} — hết cửa gọi là sớm.

**Và họ đoán đúng cả hệ quả:** *"structure đẹp nhưng đã chạy → expectancy giảm."* Tôi có số cho câu đó. Lấy mọi ngày quá khứ của ICP có khối lượng nóng **và** giá cao trong biên — đúng trạng thái bây giờ — rồi đi tới 30 ngày:

\`\`\`
${row("kết thúc cao hơn", `${pct(icpState.conditional.higherPct)}%`, "")}
${row("nền, cùng số nến", `${pct(icpState.baseline.higherPct)}%`, "")}
${row("chênh lệch", `${pct(icpState.edgePp)} điểm`, "")}
\`\`\`

Lợi suất trung vị ${pct(icpState.conditional.medianEndPct)}%.

Nhưng trừ chồng lấn thì chỉ còn ${f1(icpState.effectiveN)} lần độc lập, tức **${f2(icpState.sigmasDeOverlapped)} sigma** — không chứng minh được gì. Tôi đưa ra vì mọi khung trên năm ngày đều chỉ cùng hướng, không vì con số đã đủ.

BTC ${f0(J.btc.price)} lần này nằm đúng trong vùng họ nói. Ghi nhận.

MỘT CỔNG NỮA NÊN THÊM

Rẻ nhất trong tất cả:

**Không tên nào được chấm điểm nếu có bất kỳ trường nào là tính từ.** Khối lượng, hàng kẹt, vị trí biên, beta — bốn trường đó phải là số hoặc để trống. Trống thì tên đó không vào bảng, chứ không phải bị đoán.

Bốn con số ấy lấy từ nến công khai trong một lần gọi. Cái giá của việc đoán chúng là bảng hôm nay: một tên trượt bốn trên năm cổng ngồi ở vị trí số một.

Quan điểm: **CHỜ** cả ba. SUI thì hàng kẹt ${f1(SUI.measured.underwaterPct)}% với khối lượng đang rút — đó là tên tệ nhất nhóm chứ không phải cân bằng nhất. ENA không có hình học nào dương. ICP sạch nhất nhưng đã chạy hết biên, và trạng thái đó trong lịch sử của chính nó không phải chỗ để mua.

Chỗ tôi mù: funding và open interest Binance bị chặn địa lý từ máy này, dữ liệu thanh lý thật thì không có nguồn miễn phí. **Không có dữ liệu miễn phí tại thời điểm này.**

Bộ lọc của bạn có bao giờ trả về con số không chưa? Nếu chưa lần nào, có thể nó chưa từng đóng.

Nghiên cứu giáo dục, không phải lời khuyên đầu tư. Tự chịu trách nhiệm.

#Altcoins #RiskManagement #MarketAnalysis`;

writeFileSync("drafts/68-cong-chua-chay.txt", text);
console.log("claims:", Object.keys(claims).length, "| words:", text.trim().split(/\s+/).length);
