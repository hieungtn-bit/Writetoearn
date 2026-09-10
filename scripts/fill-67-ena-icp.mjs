/**
 * Post 67 — ENA and ICP measured, and what geometry either pair actually
 * supports.
 *
 * The scan under discussion ranks ENA first and ICP third. Both orderings
 * reverse under measurement, and one of them reverses violently: ICP is
 * described as Stage 0-1 with weak volume while it is posting a 4.3-sigma volume
 * day at the top of its month with zero trapped supply.
 *
 * The second half is the part worth keeping. Rather than scoring one proposed
 * plan, it searches ninety geometries per pair and reports the shape of the
 * surface — because the honest answer to "what stop and target should I use" is
 * a region, not a number, and the shape of that region says more than its peak.
 *
 * The search is a multiple comparison and the post says so in the same breath as
 * the result. Ninety cells produce a best cell by construction. What makes ICP's
 * corner worth reporting is not that it is positive but that all eight positive
 * cells sit together at wide stops and long horizons, which is the pattern every
 * other measurement this week predicted — and clustering is weak evidence of
 * structure, not significance. The post says that too.
 *
 * Every figure traces to research/ena-icp-deep.json.
 */

import { readFileSync, writeFileSync } from "node:fs";

const J = JSON.parse(readFileSync("research/ena-icp-deep.json", "utf8"));
const b = J.btc;
const by = Object.fromEntries(J.rows.map((r) => [r.asset, r]));
const ENA = by.ENA, ICP = by.ICP;

const btc30 = (r) => r.btcLink.find((x) => x.days === 30);
const posCells = (r) => r.geometry.grid.filter((c) => c.expectancyR > 0);

const claims = {
  "BTC is not where the scan says it is": !b.insideClaimedBand,
  "and it is sitting on the level the scan says kills its own watchlist":
    Math.abs(b.distanceToInvalidationPct) < 1,
  "the death cross and the sub-SMA200 reading do hold": b.deathCross && !b.aboveSma200,
  "ICP is not quiet — it is posting a large volume day":
    ICP.technical.volumeZScoreCompleted > 3,
  "at the very top of its month": ICP.technical.rangePosition30d > 90,
  "with participation rising, not weak": ICP.positioning.volumeTrendPct > 40,
  "and nobody at all trapped above price": ICP.positioning.underwaterPct < 0.5,
  "ICP has cleared its own base top": ICP.technical.base.fromBaseTopPct > 0,
  "while ENA's participation is collapsing": ENA.positioning.volumeTrendPct < -40,
  "with a third of the month's volume trapped above it":
    ENA.positioning.underwaterPct > 30,
  "the high-beta label belongs to ENA, not ICP":
    btc30(ENA).beta > 1.2 && btc30(ICP).beta < 1,
  "no geometry at all pays on ENA": posCells(ENA).length === 0,
  "and its best of ninety tries is exactly break-even":
    ENA.geometry.best.expectancyR <= 0.001,
  "ICP has a positive corner": posCells(ICP).length > 0,
  "but a small one": ICP.geometry.positiveSharePct < 15,
  "and every cell in it uses a wide stop":
    posCells(ICP).every((c) => c.stopAtr >= 2.5),
  "with the median cell still losing on both pairs":
    ENA.geometry.medianExpectancyR < 0 && ICP.geometry.medianExpectancyR < 0,
  "funding is heating on ICP rather than cooling":
    ICP.positioning.funding.annualised7dPct > ICP.positioning.funding.annualisedPrior14dPct,
};
const bad = Object.entries(claims).filter(([, ok]) => !ok);
if (bad.length) { console.error("ABORT:"); for (const [c] of bad) console.error("  x " + c); process.exit(1); }

const f1 = (v) => Number(v).toFixed(1);
const f2 = (v) => Number(v).toFixed(2);
const f3 = (v) => Number(v).toFixed(3);
const f4 = (v) => Number(v).toFixed(4);
const f0 = (v) => Math.round(Number(v)).toLocaleString("en-US");
const pct = (v) => (Math.abs(Number(v)) < 10 ? Number(v).toFixed(2) : Number(v).toFixed(1));

const row = (a, c, d) =>
  (String(a).padEnd(22) + String(c).padStart(12) + String(d).padStart(12)).trimEnd();

const best = ICP.geometry.best;
const bp = ICP.geometry.bestAsPrices;

const text = `Bản quét thị trường sáng nay xếp $ENA hạng nhất, $ICP hạng ba. Tôi đo cả hai bằng cùng một thước. Thứ tự đảo ngược — và một trong hai đảo rất mạnh.

Nhưng trước hết, một con số phải nói ngay.

BTC ĐANG ĐỨNG ĐÚNG TRÊN CÁI NGƯỠNG BẢN QUÉT TỰ ĐẶT

Bản quét viết $BTC quanh ${f0(b.claimedBand[0])}–${f0(b.claimedBand[1])}, và đặt luật: *"nếu BTC mất ${f0(b.invalidationBand[0])}–${f0(b.invalidationBand[1])} thì hầu hết setup mất hiệu lực."*

BTC lúc tôi đo: **${f0(b.price)}**.

Không nằm trong vùng họ nói. Và nó đang cách mép trên của chính cái ngưỡng vô hiệu hoá đó **${f2(b.distanceToInvalidationPct)}%** — tức đứng ngay trên vạch.

Cái luật đó không phải chuyện tương lai. Nó đang được kích hoạt lúc bạn đọc.

Phần cấu trúc thì họ đúng: SMA50 ${f0(b.sma50)} dưới SMA200 ${f0(b.sma200)}, death cross còn nguyên, giá dưới SMA200. RSI ${f1(b.rsi14)}, vị trí biên 30 ngày ${f1(b.rangePosition30d)}%.

ICP: NGƯỢC HẲN MÔ TẢ

Bản quét ghi ICP *"Stage 0–1, volume còn yếu, đang có dấu hiệu sống lại nhẹ."*

Đo được:

\`\`\`
${row("z-score khối lượng", f2(ICP.technical.volumeZScoreCompleted), "")}
${row("xu hướng khối lượng", `${f1(ICP.positioning.volumeTrendPct)}%`, "")}
${row("vị trí biên 30 ngày", `${f1(ICP.technical.rangePosition30d)}%`, "")}
${row("hàng kẹt trên giá", `${pct(ICP.positioning.underwaterPct)}%`, "")}
${row("giai đoạn", ICP.positioning.stage, "")}
\`\`\`

Không phải "sống lại nhẹ". Đây là **${f2(ICP.technical.volumeZScoreCompleted)} sigma khối lượng**, ở ${f1(ICP.technical.rangePosition30d)}% biên tháng, với **không một ai** đang kẹt trên giá.

Giá ${f4(ICP.price)} đã vượt đỉnh nền 25 ngày (${f4(ICP.technical.base.high)}) ${f2(ICP.technical.base.fromBaseTopPct)}%. Bảy ngày qua ${f1(ICP.fundamentals.change7dPct)}%.

Nhưng đọc lại dòng đó cho kỹ, vì nó cắt hai chiều.

**Hàng kẹt ${pct(ICP.positioning.underwaterPct)}% nghĩa là không có bức tường nào chặn đường lên.** Nó cũng nghĩa là **không một ai đang lỗ để phải gồng.** Tất cả đều đang lãi, và người đang lãi bán bất cứ lúc nào họ muốn. Không có nguồn cung treo trên đầu cũng có nghĩa không có nguồn giữ tay dưới chân.

Thêm nữa: funding OKX ${f2(ICP.positioning.funding.annualised7dPct)}% một năm, gấp đôi mức ${f2(ICP.positioning.funding.annualisedPrior14dPct)}% của hai tuần trước. **Đang nóng lên, không nguội đi.** Đó là chi phí của việc vào muộn.

ENA: CŨNG NGƯỢC, NHƯNG NGƯỢC CHIỀU KIA

Bản quét ghi ENA *"volume có dấu hiệu ổn định hơn gần đây"*, xếp hạng nhất.

\`\`\`
${row("xu hướng khối lượng", `${f1(ENA.positioning.volumeTrendPct)}%`, "")}
${row("z-score khối lượng", f2(ENA.technical.volumeZScoreCompleted), "")}
${row("hàng kẹt trên giá", `${f1(ENA.positioning.underwaterPct)}%`, "")}
${row("dòng tiền 30 ngày", f2(ENA.technical.upDownVolumeRatio30d), "")}
${row("giai đoạn", ENA.positioning.stage, "")}
\`\`\`

Khối lượng mất hơn một nửa. Hơn một phần ba khối lượng tháng nằm kẹt trên giá. Dòng tiền 30 ngày dưới 1 — tiền vào ngày giảm nhiều hơn ngày tăng.

Một điều bản quét nói **đúng** về ENA: beta cao. Tôi đo beta ${f2(btc30(ENA).beta)} với BTC, so với ICP chỉ ${f2(btc30(ICP).beta)}. Nhưng beta cao lúc BTC đang đứng trên ngưỡng vô hiệu hoá không phải ưu điểm — đó là đòn bẩy vào đúng thứ rủi ro nhất trên bàn.

Và tấm bản đồ dài hạn: ENA cách đỉnh lịch sử ${f1(ENA.fundamentals.fromAthPct)}%, một năm qua ${f1(ENA.fundamentals.change1yPct)}%, ${f1(ENA.fundamentals.supplyNotCirculatingPct)}% nguồn cung tối đa chưa từng lưu hành.

CÂU HỎI KHÔNG AI HỎI: HÌNH HỌC NÀO THÌ ĂN?

Chấm một kế hoạch cụ thể chỉ trả lời được "kế hoạch này ăn không". Câu hữu ích hơn: **trên chính lịch sử đồng này, có hình học nào ăn không?**

Nên tôi quét lưới. ${f0(ENA.geometry.stopAtrsTried.length)} khoảng cách stop (tính bằng biên độ ngày của chính nó) × ${f0(ENA.geometry.rrTried.length)} tỷ lệ được–mất × ${f0(ENA.geometry.horizonsTried.length)} khung thời gian = **${f0(ENA.geometry.cellsTried)} ô cho mỗi đồng**, mỗi ô đi từng nến.

Phải nói ngay chỗ nguy hiểm: **thử ${f0(ENA.geometry.cellsTried)} ô rồi khoe ô tốt nhất là trò bịp.** Ô tốt nhất luôn tồn tại kể cả khi tất cả chỉ là nhiễu. Nên tôi báo ba con số cùng lúc: số ô đã thử, số ô dương, và ô trung vị.

\`\`\`
${row("", "$ENA", "$ICP")}
${row("số ô thử", f0(ENA.geometry.cellsTried), f0(ICP.geometry.cellsTried))}
${row("số ô dương", f0(ENA.geometry.positiveCells), f0(ICP.geometry.positiveCells))}
${row("ô trung vị", `${f3(ENA.geometry.medianExpectancyR)}R`, `${f3(ICP.geometry.medianExpectancyR)}R`)}
${row("ô tốt nhất", `${f3(ENA.geometry.best.expectancyR)}R`, `${f3(ICP.geometry.best.expectancyR)}R`)}
\`\`\`

**ENA: không một ô nào trong ${f0(ENA.geometry.cellsTried)} ô có kỳ vọng dương.** Ô tốt nhất đúng bằng ${f3(ENA.geometry.best.expectancyR)}R — hoà vốn chằn chặn, và đó là cái tốt nhất sau khi thử hết. Không phải "chưa tìm ra điểm vào đẹp". Là trên lịch sử của chính nó, không có điểm vào nào cả.

ICP có ${f0(ICP.geometry.positiveCells)} ô dương trên ${f0(ICP.geometry.cellsTried)}. Ít. Nhưng chúng **không rải rác** — cả ${f0(ICP.geometry.positiveCells)} ô đều nằm cùng một góc:

\`\`\`
${row("", "stop", "khung")}
${posCells(ICP).slice(0, 4).map((c) => row(`${f3(c.expectancyR)}R  R:R ${f1(c.rr)}`, `${f1(c.stopAtr)} ATR`, `${c.horizonDays} ngày`)).join("\n")}
\`\`\`

Mọi ô dương đều dùng stop **rộng** và khung **dài**. Không ô nào có stop dưới 2.5 lần biên độ ngày. Đó đúng là hình dạng mọi phép đo tuần này chỉ về: stop chặt thì chết vì tiếng ồn, không vì sai hướng.

Cụm lại một chỗ là bằng chứng **yếu** cho việc có cấu trúc thật — không phải bằng chứng đủ. ${f0(ICP.geometry.positiveCells)} trên ${f0(ICP.geometry.cellsTried)} ô, mỗi ô khoảng ${f0(best.effectiveN)} lần độc lập. Tôi báo nó ra vì hình dạng có nghĩa, không vì con số đã đủ.

Ô tốt nhất của ICP, quy ra giá từ đây:

\`\`\`
${row("vào", f4(bp.entry), "")}
${row("cắt lỗ", f4(bp.stop), `−${f2(best.stopPct)}%`)}
${row("mục tiêu", f4(bp.target), `+${f2(best.targetPct)}%`)}
${row("tỷ lệ trúng", `${f1(best.hitPct)}%`, `cần ${f1(best.breakevenWinRatePct)}%`)}
${row("kỳ vọng", `${f3(best.expectancyR)}R`, `${best.horizonDays} ngày`)}
\`\`\`

Cái stop đó rộng ${f2(best.stopPct)}%. Nghe đáng sợ, và đúng là đáng sợ — nhưng biên độ một tuần trung vị của ICP là ${f2(ICP.weeklyRange.medianPct)}%. Muốn giữ lệnh ba tháng thì stop phải rộng hơn một tuần bình thường, nếu không bạn chỉ đang trả tiền cho một tuần bình thường.

Với vốn, điều đó có nghĩa: vị thế phải **nhỏ hơn nhiều**. Cùng một mức rủi ro trải trên một khoảng cách trung thực.

CHỖ TÔI MÙ

Funding và open interest Binance bị chặn địa lý từ máy này — mọi số funding ở trên là OKX và tôi ghi rõ. Dữ liệu thanh lý thật thì các nguồn đều từ chối nếu không có API trả phí. Không có dữ liệu miễn phí tại thời điểm này.

Open interest toàn thị trường thì tôi **không có** — Binance chặn. Số OKX lấy được: ICP $${f2((ICP.positioning.okxOpenInterest?.usd ?? 0) / 1e6)} triệu, ENA $${f2((ENA.positioning.okxOpenInterest?.usd ?? 0) / 1e6)} triệu. Cả hai đều mỏng, và đó là một sàn chứ không phải cả thị trường.

Quan điểm: **CHỜ** với ENA, **CHỜ** với ICP — hai lý do khác hẳn nhau.

ENA thì không có gì để chờ: khối lượng rút, hàng kẹt cao, và ${f0(ENA.geometry.cellsTried)} trên ${f0(ENA.geometry.cellsTried)} hình học đều âm. Bản quét xếp nó hạng nhất; số liệu xếp nó cuối.

ICP thì ngược lại — nó là thứ sạch nhất tôi đo được trong nhiều tuần: không hàng kẹt, khối lượng nở ${f1(ICP.positioning.volumeTrendPct)}%, vượt đỉnh nền, giai đoạn mở rộng. Tôi vẫn chờ, vì ba lý do: giá đã ở ${f1(ICP.technical.rangePosition30d)}% biên tháng nên đây là mua đuổi chứ không phải vào sớm; funding đang gấp đôi lên; và BTC đang đứng trên vạch mà chính bản quét nói là vô hiệu hoá tất cả.

Cấu trúc đẹp và điểm vào đẹp là hai chuyện khác nhau. Cái này đang đẹp cấu trúc.

Bạn mua khi biểu đồ đẹp, hay khi hình học trả đủ tiền?

Nghiên cứu giáo dục, không phải lời khuyên đầu tư. Tự chịu trách nhiệm.

#Altcoins #RiskManagement #MarketAnalysis`;

writeFileSync("drafts/67-ena-icp.txt", text);
console.log("claims:", Object.keys(claims).length, "| words:", text.trim().split(/\s+/).length);
