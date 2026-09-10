/**
 * Post 63 — a "2x-3x scan", measured.
 *
 * The subject is not the four coins. It is what a scored watchlist leaves out:
 * a score to one decimal place makes an implicit promise that a higher number
 * is a better setup, and the promise is testable. Three things are tested here
 * — whether the descriptions match the tape, whether the multiple has a base
 * rate, and whether the score's ordering survives contact with expectancy.
 *
 * The rank correlation is carried with its own caveat attached in the same
 * breath: four items cannot support a significance claim, and a post that
 * quoted rho without saying so would be committing the exact sin it is
 * describing.
 *
 * Every figure traces to research/multiplier-scan-check.json.
 */

import { readFileSync, writeFileSync } from "node:fs";

const J = JSON.parse(readFileSync("research/multiplier-scan-check.json", "utf8"));
const by = Object.fromEntries(J.rows.map((r) => [r.asset, r]));
const ICP = by.ICP, ENA = by.ENA, ONDO = by.ONDO, ARB = by.ARB;

const d90 = (r) => r.doubling.find((x) => x.horizonDays === 90);
const two = (r) => r.geometry.spot.targets.find((t) => t.label === "2x");
const twoAfter = (r) => r.geometry.trigger.targets.find((t) => t.label === "2x");

const claims = {
  "every volume description in the scan is backwards":
    J.volumeAudit.length === 3 && J.volumeAudit.every((v) => !v.matches),
  "the one called weak is the only one expanding": ICP.measured.volumeTrendPct > 15,
  "and the ones called improving and stable are collapsing":
    ENA.measured.volumeTrendPct < -40 && ONDO.measured.volumeTrendPct < -40,
  "a double is uncommon even with no stop at all": d90(ICP).bare.hitPct < 20,
  "and rare once the scan's own invalidation is applied":
    d90(ICP).withStatedStop.upPct < 5 && d90(ICP).withStatedStop.downPct > 90,
  "the reward-to-risk reads generous": two(ICP).rr > 15,
  "yet every one of the four loses money in expectation":
    J.rows.every((r) => r.expectancyR90d < 0),
  "the score's ordering carries no rank information here":
    Math.abs(J.ranking.spearmanRho) < 0.01,
  "the top-ranked name is not the best of the four on expectancy":
    J.ranking.byExpectancy[0] !== J.ranking.byScore[0],
  "overhead supply separates them and goes unmentioned":
    ONDO.measured.underwaterPct > 70 && ARB.measured.underwaterPct > 70
    && ICP.measured.underwaterPct < 20,
  "waiting for the break costs reward-to-risk on all four":
    J.rows.every((r) => {
      const a = two(r), b = twoAfter(r);
      return a && b ? b.rr < a.rr : true;
    }),
  "BTC explains less than half of each one's movement":
    J.rows.every((r) => r.measured.btcVarianceExplainedPct < 50),
};
const bad = Object.entries(claims).filter(([, ok]) => !ok);
if (bad.length) { console.error("ABORT:"); for (const [c] of bad) console.error("  x " + c); process.exit(1); }

const f1 = (v) => Number(v).toFixed(1);
const f2 = (v) => Number(v).toFixed(2);
const f0 = (v) => Math.round(Number(v)).toLocaleString("en-US");

/** Fixed-width row so live values cannot break a hand-aligned column. */
const row = (a, b, c, d) =>
  (String(a).padEnd(7) + String(b).padStart(11) + String(c).padStart(13) + String(d).padStart(11))
    .trimEnd();

const text = `Có người gửi tôi bản quét "altcoin tiềm năng 2x–3x", chấm điểm bốn đồng tới một chữ số thập phân. Tôi đo lại cả bốn bằng cùng một thước.

Điểm số đó hàm ý một lời hứa: **số cao hơn là kèo tốt hơn.** Lời hứa đó kiểm được.

MÔ TẢ KHỐI LƯỢNG: SAI CẢ BA

Bản quét mô tả khối lượng cho ba đồng. Tôi đo xu hướng khối lượng thật:

\`\`\`
${row("", "bản quét nói", "đo được", "")}
${row("$ICP", "yếu", `${f1(ICP.measured.volumeTrendPct)}%`, "đang nở")}
${row("$ENA", "cải thiện", `${f1(ENA.measured.volumeTrendPct)}%`, "đang co")}
${row("$ONDO", "ổn định", `${f1(ONDO.measured.volumeTrendPct)}%`, "đang sụp")}
\`\`\`

Ba trên ba, ngược chiều. Đồng duy nhất bị gọi là "yếu" lại là đồng duy nhất khối lượng đang nở. Hai đồng được khen "cải thiện" và "ổn định" thì một cái mất hơn một nửa, một cái mất hơn hai phần ba.

Đây không phải chuyện làm tròn. Đây là mô tả ngược hẳn thứ đang xảy ra.

CON SỐ BẢN QUÉT KHÔNG BAO GIỜ ĐƯA

"2x là mục tiêu xác suất, không phải đảm bảo." Câu đó đúng và vô nghĩa, vì nó không kèm con số. Xác suất bao nhiêu?

Đo được. Tôi đi ngược lịch sử từng đồng, **từng nến một**, hỏi: từ một ngày bất kỳ, trong 90 ngày sau, giá có gấp đôi không?

Bài kiểm dễ nhất trước — không stop, không quan tâm đường đi, chỉ cần có lúc nào đó chạm gấp đôi:

\`\`\`
${row("$ICP", `${f1(d90(ICP).bare.hitPct)}%`, "", "")}
${row("$ENA", `${f1(d90(ENA).bare.hitPct)}%`, "", "")}
${row("$ONDO", `${f1(d90(ONDO).bare.hitPct)}%`, "", "")}
${row("ARB", `${f1(d90(ARB).bare.hitPct)}%`, "", "")}
\`\`\`

Rồi áp chính mức invalidation mà bản quét tự đặt ra. Bây giờ đường đi mới quan trọng — chạm mức nào trước thì tính mức đó:

\`\`\`
${row("", "gấp đôi", "dính stop", "")}
${row("$ICP", `${f1(d90(ICP).withStatedStop.upPct)}%`, `${f1(d90(ICP).withStatedStop.downPct)}%`, "")}
${row("$ENA", `${f1(d90(ENA).withStatedStop.upPct)}%`, `${f1(d90(ENA).withStatedStop.downPct)}%`, "")}
${row("$ONDO", `${f1(d90(ONDO).withStatedStop.upPct)}%`, `${f1(d90(ONDO).withStatedStop.downPct)}%`, "")}
${row("ARB", `${f1(d90(ARB).withStatedStop.upPct)}%`, `${f1(d90(ARB).withStatedStop.downPct)}%`, "")}
\`\`\`

ICP: gấp đôi ${f1(d90(ICP).withStatedStop.upPct)}%, dính stop trước ${f1(d90(ICP).withStatedStop.downPct)}%.

CÁI BẪY CỦA MỘT TỶ LỆ ĐẸP

Đến đây nhiều người sẽ nói: kệ, tỷ lệ được–mất quá đẹp thì thắng ít lần vẫn lời.

Với ICP, mua ở ${f2(ICP.measured.price)} cắt ở ${f2(ICP.claimed.invalidation)} nhắm ${f2(two(ICP).price)}, tỷ lệ đúng là **${f2(two(ICP).rr)} ăn 1**. Nghe như quà tặng.

Nhân nó với ${f1(d90(ICP).withStatedStop.upPct)}% đi.

\`\`\`
${row("", "R:R", "trúng 90d", "kỳ vọng")}
${row("$ICP", f2(two(ICP).rr), `${f1(d90(ICP).withStatedStop.upPct)}%`, `${f2(ICP.expectancyR90d)}R`)}
${row("$ENA", f2(two(ENA).rr), `${f1(d90(ENA).withStatedStop.upPct)}%`, `${f2(ENA.expectancyR90d)}R`)}
${row("$ONDO", f2(two(ONDO).rr), `${f1(d90(ONDO).withStatedStop.upPct)}%`, `${f2(ONDO.expectancyR90d)}R`)}
${row("ARB", f2(two(ARB).rr), `${f1(d90(ARB).withStatedStop.upPct)}%`, `${f2(ARB.expectancyR90d)}R`)}
\`\`\`

Cả bốn đều âm.

Tỷ lệ được–mất không phải kỳ vọng. Bản quét đưa bạn cột đầu và giấu hai cột sau — mà hai cột sau mới là cột quyết định tài khoản.

ĐIỂM SỐ CÓ XẾP ĐÚNG THỨ TỰ KHÔNG

Bản quét xếp: **${J.ranking.byScore.join(" > ")}**.

Xếp lại theo kỳ vọng đo được: **${J.ranking.byExpectancy.join(" > ")}**.

Hệ số tương quan hạng: **${f2(J.ranking.spearmanRho)}**.

Đồng được chấm cao nhất về thứ ba. Đồng bị chấm thấp nhất về thứ hai.

Và tôi phải nói ngay chỗ này, vì không nói thì tôi mắc đúng cái lỗi tôi đang chỉ ra: **bốn mẫu thì quá ít để kết luận điểm số vô dụng.** Con số ${f2(J.ranking.spearmanRho)} nói rằng thứ tự đó *chưa được chứng minh*, không nói rằng nó sai. Muốn kết luận thật thì cần hàng trăm lần quét được theo dõi tới lúc kết quả xong — đúng thứ mà bảng điểm live của tôi đang làm, và đúng thứ mà không bản quét nào công bố.

THỨ KHÔNG AI ĐO TRONG BẢNG ĐÓ

Cả bốn setup đều nói về nền, về narrative, về kháng cự. Không cái nào nhắc tới **hàng kẹt trên đầu** — phần khối lượng một tháng qua giao dịch ở giá cao hơn giá hiện tại, tức số người đang lỗ và chờ hoà vốn để thoát.

\`\`\`
${row("$ICP", `${f1(ICP.measured.underwaterPct)}%`, "", "")}
${row("$ENA", `${f1(ENA.measured.underwaterPct)}%`, "", "")}
${row("$ONDO", `${f1(ONDO.measured.underwaterPct)}%`, "", "")}
${row("ARB", `${f1(ARB.measured.underwaterPct)}%`, "", "")}
\`\`\`

ONDO và ARB đang có khoảng ba phần tư khối lượng tháng nằm trên đầu. Mỗi nhịp hồi là một đợt người cũ thoát hàng. ICP thì gần như trống.

Đó là khác biệt lớn nhất giữa bốn cái tên này, và nó không xuất hiện ở bất kỳ dòng nào trong bảng gốc.

CÒN LỜI KHUYÊN "ĐỢI CONFIRMATION"

Bản quét kết bằng: *ưu tiên đợi break kháng cự rồi mới vào.*

Nhưng mức cắt lỗ thì giữ nguyên. Vào cao hơn mà stop đứng yên thì chân rủi ro dài ra:

\`\`\`
${row("", "vào ngay", "sau khi chờ", "")}
${row("$ICP", `${f2(ICP.geometry.spot.riskPct)}%`, `${f2(ICP.geometry.trigger.riskPct)}%`, "")}
${row("$ENA", `${f2(ENA.geometry.spot.riskPct)}%`, `${f2(ENA.geometry.trigger.riskPct)}%`, "")}
${row("$ONDO", `${f2(ONDO.geometry.spot.riskPct)}%`, `${f2(ONDO.geometry.trigger.riskPct)}%`, "")}
${row("ARB", `${f2(ARB.geometry.spot.riskPct)}%`, `${f2(ARB.geometry.trigger.riskPct)}%`, "")}
\`\`\`

ONDO: rủi ro tăng hơn ba lần. Tỷ lệ được–mất của nó rơi từ ${f2(two(ONDO).rr)} xuống ${f2(twoAfter(ONDO).rr)}.

Chờ không sai. Chờ mà không dời stop theo mới sai.

CHỖ TÔI MÙ

**Funding và open interest Binance**: endpoint futures bị chặn địa lý từ máy này. **Dữ liệu thanh lý thật**: CoinGlass, Glassnode, CryptoQuant đều từ chối nếu không có API trả phí. Không có dữ liệu miễn phí tại thời điểm này.

Và một giới hạn của chính bài này: ONDO chỉ có ${f0(ONDO.candles)} nến lịch sử, tức khoảng ${f1(d90(ONDO).bare.effectiveN)} lần độc lập ở khung 90 ngày sau khi trừ chồng lấn. Con số ${f1(d90(ONDO).bare.hitPct)}% của nó mỏng hơn ba đồng kia nhiều. Tôi vẫn để nó trong bảng, kèm câu này.

Quan điểm: **CHỜ** cả bốn. Không phải vì chúng xấu — ICP đúng là có cấu trúc sạch nhất nhóm, khối lượng đang nở thật, hàng kẹt gần như không có. Mà vì mục tiêu 2x với mức stop đó, trên lịch sử của chính chúng, không trả đủ cho rủi ro. Nếu muốn giữ ý tưởng, phải đổi hình học — không phải đổi niềm tin.

Một điều nữa nên nhớ: BTC giải thích ${f1(ICP.measured.btcVarianceExplainedPct)}% biến động ngày của ICP, ${f1(ENA.measured.btcVarianceExplainedPct)}% của ENA. Kèo alt nào cũng là kèo BTC mặc bộ đồ khác.

Lần tới thấy một bảng "tiềm năng 2x", hãy hỏi đúng một câu: **xác suất bao nhiêu, đo trên bao nhiêu mẫu?** Nếu bảng đó không trả lời được, nó là danh sách mong ước chứ không phải kết quả quét.

Bạn có bao giờ hỏi con số đó chưa?

Nghiên cứu giáo dục, không phải lời khuyên đầu tư. Tự chịu trách nhiệm.

#Altcoins #RiskManagement #MarketAnalysis`;

writeFileSync("drafts/63-quet-2x.txt", text);
console.log("claims:", Object.keys(claims).length, "| words:", text.trim().split(/\s+/).length);
