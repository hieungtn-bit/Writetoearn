/**
 * Post 65 — the scan came back corrected; here are the numbers it said it lacked.
 *
 * The interesting thing about this version is that repeating the previous audit
 * would be dishonest. It dropped the volume line that was backwards, it carries
 * overhead supply where it has a figure, it tells the reader to move the stop
 * when waiting for a break, and it closes by demanding a probability and a
 * sample size. Scoring it against faults it has already fixed would be point
 * scoring rather than checking.
 *
 * So the post does three other things: fills the two figures it declares
 * unavailable, tests the fix it made rather than the faults it repaired, and
 * corrects one claim it did make — "high BTC beta" on the pair with the lowest
 * beta of the four.
 *
 * One temptation is refused in here deliberately. Stop-in-ATR lines up with
 * which target wins on three of the four names, and it would make a clean rule.
 * Four points do not support a rule, and inventing one would be the same error
 * this series keeps pointing at, so the figure is reported and the rule is not
 * claimed.
 *
 * Every figure traces to research/scan-v2-check.json.
 */

import { readFileSync, writeFileSync } from "node:fs";

const J = JSON.parse(readFileSync("research/scan-v2-check.json", "utf8"));
const by = Object.fromEntries(J.rows.map((r) => [r.asset, r]));
const cmp = Object.fromEntries(J.targetComparison.map((t) => [t.asset, t]));
const ICP = by.ICP, ENA = by.ENA, SUI = by.SUI, XLM = by.XLM;

const btc30 = (r) => r.btc.find((b) => b.days === 30);
const rung = (r, m) => r.ladder.find((l) => l.multiple === m);
const helped = J.targetComparison.filter((t) => t.smallerTargetHelps);

const claims = {
  "the two figures it calls unavailable are computable":
    SUI.measured.underwaterPct != null && XLM.measured.underwaterPct != null,
  "and they are the largest in the group":
    XLM.measured.underwaterPct > SUI.measured.underwaterPct
    && SUI.measured.underwaterPct > ENA.measured.underwaterPct
    && ENA.measured.underwaterPct > ICP.measured.underwaterPct,
  "XLM in particular is nearly all overhead": XLM.measured.underwaterPct > 85,
  "with participation leaving at the same time": XLM.measured.volumeTrendPct < -40,
  "the overhead figure it quotes for ENA is accurate":
    Math.abs(ENA.measured.underwaterPct - ENA.claimed.overheadStated) < 1,
  // ICP's cited figure was accurate when it was taken and has since fallen,
  // because price rose through the trapped supply rather than because anyone
  // measured wrong. The direction of the drift is the point.
  "and ICP's has since fallen rather than drifted up":
    ICP.measured.underwaterPct < ICP.claimed.overheadStated,
  "the smaller target does rescue ICP on its own stated stop":
    rung(ICP, 1.5).stated.expectancyR > 0 && rung(ICP, 2).stated.expectancyR < -0.2,
  "but it helps only one name of the four": helped.length === 1,
  "and the rescue is too thin to call an edge":
    rung(ICP, 1.5).stated.expectancyR < 0.1 && rung(ICP, 1.5).stated.effectiveN < 15,
  "the high-beta label is on the lowest-beta name":
    btc30(ICP).beta < 1 && btc30(ENA).beta > btc30(ICP).beta && btc30(SUI).beta > btc30(ICP).beta,
  "and the most BTC-dependent name is the one nobody flagged":
    btc30(SUI).varianceExplainedPct > 50
    && btc30(SUI).varianceExplainedPct > btc30(ICP).varianceExplainedPct,
  "XLM's structural stop is narrower than a single day's range":
    XLM.measured.structuralStopInAtr < 1,
};
const bad = Object.entries(claims).filter(([, ok]) => !ok);
if (bad.length) { console.error("ABORT:"); for (const [c] of bad) console.error("  x " + c); process.exit(1); }

const f1 = (v) => Number(v).toFixed(1);
const f2 = (v) => Number(v).toFixed(2);
const f3 = (v) => Number(v).toFixed(3);
const f0 = (v) => Math.round(Number(v)).toLocaleString("en-US");

/**
 * Percentages, rounded to survive the verifier's 0.5% relative tolerance.
 *
 * One decimal place is fine at 92.5 and wrong at 3.56: rounding it to 3.6 is a
 * 1.1% error, twice what the gate allows, and the gate is right to reject it.
 * Small values simply need the extra digit.
 */
const pct = (v) => (Math.abs(Number(v)) < 10 ? Number(v).toFixed(2) : Number(v).toFixed(1));

const row = (a, b, c, d) =>
  (String(a).padEnd(7) + String(b).padStart(11) + String(c).padStart(13) + String(d).padStart(12)).trimEnd();

const text = `Bản quét 2x hôm qua quay lại, đã sửa. Nó bỏ dòng mô tả khối lượng bị ngược, nó mang theo số hàng kẹt ở chỗ nó có, nó bảo phải dời stop nếu chờ break, và nó kết bằng đúng câu tôi đóng bài hôm qua: *xác suất bao nhiêu, đo trên bao nhiêu mẫu?*

Chấm lại nó bằng những lỗi nó đã sửa thì là ăn gian. Nên tôi làm việc khác: **lấp hai con số nó nói không có, rồi kiểm chính cái nó sửa.**

HAI CON SỐ NÓ BẢO KHÔNG LẤY ĐƯỢC

Với $SUI nó ghi "chưa có số chính xác miễn phí → confidence giảm". Với $XLM để trống.

Cả hai tính được từ nến công khai, một lần fetch. Đây là phần khối lượng 30 ngày qua đã giao dịch **cao hơn giá hiện tại** — tức số người đang kẹt, chờ hoà vốn để thoát:

\`\`\`
${row("$ICP", `${pct(ICP.measured.underwaterPct)}%`, "", "")}
${row("ENA", `${pct(ENA.measured.underwaterPct)}%`, "", "")}
${row("$SUI", `${pct(SUI.measured.underwaterPct)}%`, "", "chưa từng có số")}
${row("$XLM", `${pct(XLM.measured.underwaterPct)}%`, "", "chưa từng có số")}
\`\`\`

XLM: **${pct(XLM.measured.underwaterPct)}%**. Gần như toàn bộ khối lượng một tháng nằm trên đầu giá hiện tại.

Bản quét viết về XLM: *"cấu trúc đẹp trên giấy, nhưng hay fail nếu không có volume break."* Đúng hướng lo — nhưng đây mới là lý do. Không phải wedge đẹp hay xấu. Là mỗi lần giá nhích lên, nó đi vào một bức tường người chờ thoát.

Hai số nữa của XLM đi cùng chiều: xu hướng khối lượng ${f1(XLM.measured.volumeTrendPct)}%, RSI ${f1(XLM.measured.rsi14)}, vị trí trong biên 30 ngày ${f1(XLM.measured.rangePosition30d)}%.

Còn hai số nó **có** đưa thì không bịa. ENA nó ghi khoảng ${f0(ENA.claimed.overheadStated)}%, tôi đo ${pct(ENA.measured.underwaterPct)}% — khớp.

ICP nó ghi khoảng ${f0(ICP.claimed.overheadStated)}%. Tôi đo lại bây giờ: **${pct(ICP.measured.underwaterPct)}%**. Con số đã tụt, và tụt vì giá đi lên xuyên qua chỗ hàng kẹt chứ không phải vì ai đo sai. Đó là lời nhắc rằng loại số này hỏng theo giờ, không theo ngày — viết bài lúc chiều rồi đăng lúc tối là đủ để một câu đúng thành câu sai.

CÁI NÓ SỬA: HẠ MỤC TIÊU TỪ 2X XUỐNG 1.5X

Đây là thay đổi đáng kiểm nhất. Cùng một mức stop, mục tiêu ngắn lại — tỷ lệ trúng phải tăng, phần thưởng phải giảm. Ra dương hay âm là chuyện của **tích hai số**, không phải của số nào.

Với ICP, dùng đúng mức cắt lỗ mà bản quét tự đặt:

\`\`\`
${row("", "trúng 90d", "R:R", "kỳ vọng")}
${row("2x", `${f1(rung(ICP, 2).stated.upPct)}%`, f2(rung(ICP, 2).stated.rr), `${f3(rung(ICP, 2).stated.expectancyR)}R`)}
${row("1.5x", `${f1(rung(ICP, 1.5).stated.upPct)}%`, f2(rung(ICP, 1.5).stated.rr), `${f3(rung(ICP, 1.5).stated.expectancyR)}R`)}
\`\`\`

**Họ sửa đúng.** Cùng đồng, cùng stop, chỉ đổi mục tiêu, và kèo lật từ lỗ rõ sang dương.

Nhưng phải nói ngay hai điều, nếu không thì tôi đang bán cho bạn một thứ không có.

**Một.** ${f3(rung(ICP, 1.5).stated.expectancyR)}R không phải lợi thế. Nó là *sự vắng mặt của một khoản lỗ rõ ràng*. Hai thứ đó khác nhau.

**Hai.** Con số đó dựa trên ${f0(rung(ICP, 1.5).stated.n)} cửa sổ chồng lấn, tức khoảng **${f1(rung(ICP, 1.5).stated.effectiveN)} lần độc lập**. Mười lần thì chưa nói được gì cả. Tôi đưa nó ra vì nó là số tốt nhất tôi có, không phải vì nó đủ.

VÀ "HẠ MỤC TIÊU" KHÔNG PHẢI QUY TẮC

Tôi thử cùng phép so sánh cho cả bốn, trên cùng một thước — stop đặt tại đáy 30 ngày của chính mỗi đồng, vì bản quét chỉ đặt mức cắt lỗ cho hai trong bốn:

\`\`\`
${row("", "1.5x", "2x", "nhỏ hơn tốt?")}
${row("$ICP", `${f3(cmp.ICP.at1_5x.expectancyR)}R`, `${f3(cmp.ICP.at2x.expectancyR)}R`, cmp.ICP.smallerTargetHelps ? "có" : "không")}
${row("ENA", `${f3(cmp.ENA.at1_5x.expectancyR)}R`, `${f3(cmp.ENA.at2x.expectancyR)}R`, cmp.ENA.smallerTargetHelps ? "có" : "không")}
${row("$SUI", `${f3(cmp.SUI.at1_5x.expectancyR)}R`, `${f3(cmp.SUI.at2x.expectancyR)}R`, cmp.SUI.smallerTargetHelps ? "có" : "không")}
${row("$XLM", `${f3(cmp.XLM.at1_5x.expectancyR)}R`, `${f3(cmp.XLM.at2x.expectancyR)}R`, cmp.XLM.smallerTargetHelps ? "có" : "không")}
\`\`\`

**Một trên bốn.** Với ba đồng còn lại, hạ mục tiêu làm kèo *tệ hơn*.

Lý do thì tôi có một nghi ngờ: khi stop quá chặt so với biên độ ngày của chính đồng đó, bạn gần như chắc chắn bị quét dù mục tiêu ở đâu — nên mục tiêu nhỏ chỉ đổi lấy phần thưởng bé hơn cho cùng một cái chết. Stop cấu trúc của XLM bằng **${f2(XLM.measured.structuralStopInAtr)} lần** một biên độ ngày. Chưa tới một ngày.

Nhưng tôi **không** biến nghi ngờ đó thành quy tắc, vì tôi chỉ có bốn cái tên. Bốn điểm thì vẽ được bất kỳ đường nào. Đó đúng là lỗi tôi đang đi chỉ ra ở người khác, nên tôi không mắc nó ở đây.

Điều nói được chắc chắn: **"hạ mục tiêu cho an toàn" không phải câu đúng phổ quát.** Nó đúng hay sai tuỳ đồng, và cách biết là đo chứ không phải đoán.

MỘT CHỖ NÓ NÓI SAI

Bản quét ghi ICP: *"BTC beta cao."*

Beta không phải tương quan. Tương quan nói hai thứ đi cùng nhau **chặt tới đâu**; beta nói khi BTC nhúc nhích một phần trăm, đồng này đi **bao xa**. Một đồng có thể tương quan lỏng mà beta rất cao, và cái ảnh hưởng tới vị thế của bạn là cái thứ hai.

Beta 30 ngày, đo bằng hồi quy:

\`\`\`
${row("", "beta", "r", "BTC giải thích")}
${row("$ICP", f2(btc30(ICP).beta), f2(btc30(ICP).r), `${f1(btc30(ICP).varianceExplainedPct)}%`)}
${row("ENA", f2(btc30(ENA).beta), f2(btc30(ENA).r), `${f1(btc30(ENA).varianceExplainedPct)}%`)}
${row("$SUI", f2(btc30(SUI).beta), f2(btc30(SUI).r), `${f1(btc30(SUI).varianceExplainedPct)}%`)}
${row("$XLM", f2(btc30(XLM).beta), f2(btc30(XLM).r), `${f1(btc30(XLM).varianceExplainedPct)}%`)}
\`\`\`

ICP beta **${f2(btc30(ICP).beta)}** — dưới 1, và **thấp nhất nhóm**. ICP đi *ít hơn* BTC, không phải nhiều hơn. Đồng beta cao thật là ENA ở ${f2(btc30(ENA).beta)}.

Và con số không ai gắn nhãn: **SUI có r ${f2(btc30(SUI).r)}, BTC giải thích ${f1(btc30(SUI).varianceExplainedPct)}% biến động ngày của nó.** Cao nhất nhóm rất xa. Mua SUI ở đây gần như là mua BTC với thêm một lớp rủi ro riêng — không phải một kèo độc lập như "L1 + catalyst tổ chức" gợi ra.

CHỖ TÔI MÙ

Funding và open interest Binance: endpoint futures bị chặn địa lý từ máy này. Dữ liệu thanh lý thật: các nguồn đều từ chối nếu không có API trả phí. Không có dữ liệu miễn phí tại thời điểm này.

Và giới hạn lớn nhất của toàn bộ bảng trên: khung 90 ngày trên một nghìn nến chỉ cho khoảng ${f1(rung(ICP, 2).bare.effectiveN)} lần độc lập mỗi đồng. Mọi con số kỳ vọng ở đây nên đọc như **hướng**, không phải như phép đo chính xác.

Quan điểm: **CHỜ**. ICP vẫn là tên sạch nhất nhóm — hàng kẹt ${pct(ICP.measured.underwaterPct)}%, khối lượng đang nở ${f1(ICP.measured.volumeTrendPct)}%, giai đoạn mở rộng — và mục tiêu 1.5x với stop của họ là hình học đầu tiên trong hai ngày qua không lỗ rõ. Nhưng ${f3(rung(ICP, 1.5).stated.expectancyR)}R trên ${f1(rung(ICP, 1.5).stated.effectiveN)} lần độc lập là chưa đủ để gọi là cơ hội. XLM thì ${pct(XLM.measured.underwaterPct)}% hàng kẹt trả lời hộ luôn.

Điều đáng khen bản quét này: nó tự sửa khi có số mới. Rất ít bảng phân tích làm được điều đó, và đó là thứ phân biệt một phương pháp với một dự đoán.

Bạn có sẵn sàng bỏ luận điểm của mình khi số liệu đổi không?

Nghiên cứu giáo dục, không phải lời khuyên đầu tư. Tự chịu trách nhiệm.

#Altcoins #RiskManagement #MarketAnalysis`;

writeFileSync("drafts/65-quet-v2.txt", text);
console.log("claims:", Object.keys(claims).length, "| words:", text.trim().split(/\s+/).length);
