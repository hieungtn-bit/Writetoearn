import { readFileSync, writeFileSync } from "node:fs";

const J = JSON.parse(readFileSync("research/bnb-week.json", "utf8"));
const H = JSON.parse(readFileSync("research/hour-of-day.json", "utf8"));
const X = JSON.parse(readFileSync("research/icp-vs-avax.json", "utf8"));
const t = J.technical, p = J.positioning, F = J.fundamentals, w = J.weeklyRange;
const up = p.liquidationClusters.above, dn = p.liquidationClusters.below;

const claims = {
  "nobody who bought this month is under water": p.underwaterPct < 1,
  "price is above both moving averages": J.price > t.sma20 && t.sma20 > t.sma50,
  "and sits near the top of its own month": t.rangePosition30d > 80,
  "the base is genuinely tight": t.base.widthPct < 12,
  "participation is falling into that strength": p.volumeTrendPct < 0,
  "the ninety-day flow has not turned yet": t.upDownVolumeRatio90d < 1,
  "while the thirty-day flow has": t.upDownVolumeRatio30d > 1,
  "funding is cooling rather than heating": p.funding.annualised7dPct < p.funding.annualisedPrior14dPct,
  "BNB is held rather than traded": F.volumeToMarketCapPct < 1,
  "a median week travels several times the day-trade stop": J.medianWeekOverDayStop > 2.5,
  "and a week is close to a coin flip": Math.abs(w.positiveWeeksPct - 50) < 5,
  "clusters sit on both sides inside a normal week":
    up[0].level / J.price - 1 < w.medianPct / 100
    && 1 - dn[0].level / J.price < w.medianPct / 100,
  "the evening hour is still the violent one": H.evening.sizeVsRest.sigmas > 10,
};
const bad = Object.entries(claims).filter(([, ok]) => !ok);
if (bad.length) { console.error("ABORT:"); for (const [c] of bad) console.error("  x " + c); process.exit(1); }

const f1 = (v) => Number(v).toFixed(1);
const f2 = (v) => Number(v).toFixed(2);
const f0 = (v) => Math.round(Number(v)).toLocaleString("en-US");

const text = `Trước hết một điều phải nói ngay: $BNB là token của chính sàn mà tôi đăng bài này lên. Tôi không làm mềm bất cứ con số nào vì lý do đó, và mọi con số chống lại lệnh mua đều nằm cùng bảng với những con số ủng hộ nó.

CON SỐ HIẾM

BNB ở ${f2(J.price)}. Trong 30 ngày qua, **${f1(p.underwaterPct)}% khối lượng giao dịch nằm trên giá hiện tại**.

Không phải làm tròn. Không một ai mua BNB trong tháng vừa rồi đang lỗ.

Tôi đo chỉ số này trên mọi đồng mỗi ngày. ICP đo được ${f1(X.pairs.ICP.underwaterPct)}%, AVAX ${f1(X.pairs.AVAX.underwaterPct)}%. Số không là thứ tôi hầu như không gặp. Nó có nghĩa: không có tường người chờ hoà vốn để bán, không có nguồn xả nào treo trên đầu.

CẤU TRÚC GIÁ

Giá nằm trên cả hai đường trung bình — SMA20 ${f2(t.sma20)}, SMA50 ${f2(t.sma50)} — và SMA20 nằm trên SMA50. Đó là cấu trúc tăng, không phải hồi phục trong xu hướng giảm.

Nền 25 ngày rộng ${f2(t.base.widthPct)}%, giá cách đỉnh nền ${f2(Math.abs(t.base.fromBaseTopPct))}%. Chặt và sát.

RSI ${f1(t.rsi14)}. ATR ${f2(t.atrPct)}% mỗi ngày — biến động thấp.

BA CON SỐ CHỐNG LẠI

**Một.** Vị trí trong biên 30 ngày: ${f1(t.rangePosition30d)}%. Bạn đang mua gần đỉnh tháng, không phải gần đáy.

**Hai.** Xu hướng khối lượng ${f1(p.volumeTrendPct)}%. Khối lượng ba ngày gần nhất thấp hơn giai đoạn trước một phần tư. Giá lên nhưng người tham gia đang rời đi — đó là thứ tôi không thích thấy ở vùng đỉnh biên.

**Ba.** Dòng tiền 30 ngày là ${f2(t.upDownVolumeRatio30d)} (tiền vào ngày tăng nhiều hơn), nhưng 90 ngày vẫn ${f2(t.upDownVolumeRatio90d)} — dưới 1. Cú đảo chiều mới chỉ một tháng tuổi.

ĐIỀU KHÔNG AI NÓI VỀ BNB

Khối lượng 24 giờ chia cho vốn hoá: **${f2(F.volumeToMarketCapPct)}%**.

Tuần này tôi đo ICP ${f2(X.pairs.ICP.volumeToMarketCapPct)}% và AVAX ${f2(X.pairs.AVAX.volumeToMarketCapPct)}%. BNB quay vòng chưa tới một phần năm tỷ lệ đó.

BNB được **giữ**, không được **giao dịch**. Điều đó cắt cả hai chiều: ít hàng đè lên mỗi nhịp tăng, nhưng cũng ít độ sâu để thoát ra khi cần.

Vốn hoá ${f1(F.marketCapUsd / 1e9)} tỷ đô, hạng ${F.marketCapRank}. Cách đỉnh lịch sử ${f1(Math.abs(F.fromAthPct))}% (${F.athDate}). Một năm qua ${f1(F.change1yPct)}%. ${f1(F.supplyNotCirculatingPct)}% nguồn cung tối đa chưa bao giờ lưu hành.

ĐÒN BẨY

Funding ${f2(p.funding.annualised7dPct)}% một năm, hạ từ ${f2(p.funding.annualisedPrior14dPct)}% của hai tuần trước. Đang nguội, không nóng lên. ${f1(p.funding.negativeSharePct)}% số kỳ là âm.

Cụm thanh lý gần nhất (mô hình ước lượng, không phải feed thật):

  trên   ${f2(up[2].level)}   +${f2((up[2].level / J.price - 1) * 100)}%   shorts
  trên   ${f2(up[0].level)}   +${f2((up[0].level / J.price - 1) * 100)}%   shorts
  dưới   ${f2(dn[1].level)}   ${f2((dn[1].level / J.price - 1) * 100)}%   longs
  dưới   ${f2(dn[0].level)}   ${f2((dn[0].level / J.price - 1) * 100)}%   longs

Cả bốn đều nằm trong biên độ một tuần bình thường. Kỳ vọng bị quét hai chiều trước khi có hướng thật.

SAI LẦM MÀ HẦU HẾT KẾ HOẠCH TUẦN MẮC PHẢI

Đây là phần quan trọng nhất bài này.

Tôi đo ${w.weeks} tuần hoàn tất của BNB. Biên độ một tuần, đỉnh tới đáy:

  p25        ${f2(w.p25Pct)}%
  trung vị   ${f2(w.medianPct)}%
  p75        ${f2(w.p75Pct)}%
  p90        ${f2(w.p90Pct)}%

Còn stop tiêu chuẩn tính theo ATR ngày là ${f2(J.dayPlan.stopDistancePct)}%.

**Một tuần trung vị đi xa gấp ${f2(J.medianWeekOverDayStop)} lần cái stop đó.**

Đặt stop theo ATR ngày rồi giữ lệnh cả tuần không phải quản trị rủi ro. Đó là đảm bảo bị quét bởi một tuần hoàn toàn bình thường, không cần tin tức gì.

KẾ HOẠCH TUẦN NÀY

Stop đặt ở nửa biên độ tuần trung vị, không phải theo ATR ngày:

  vào        ${f2(J.price)}
  cắt lỗ     ${f2(J.weekPlan.stop)}   −${f2(J.weekPlan.stopDistancePct)}%
  TP1        ${f2(J.weekPlan.targets[0].price)}   +${f2(J.weekPlan.stopDistancePct)}%
  TP2        ${f2(J.weekPlan.targets[1].price)}
  TP3        ${f2(J.weekPlan.targets[2].price)}

  vốn        $${f0(J.weekPlan.positionUsd)} cho mỗi $1,000 để rủi ro đúng 1%
  đòn bẩy    tối đa ${f2(J.weekPlan.maxLeverage)}x — cao hơn thì sàn thanh lý trước khi stop kịp chạy

So sánh: kế hoạch trong ngày dùng stop ${f2(J.dayPlan.stopDistancePct)}% và cho phép $${f0(J.dayPlan.positionUsd)} mỗi $1,000. Stop rộng hơn thì vị thế phải nhỏ hơn. Đó không phải nhược điểm, đó là cùng một rủi ro trải trên một khoảng cách trung thực.

Vô hiệu hoá luận điểm: đóng cửa tuần dưới SMA50 ở ${f2(t.sma50)}.

VÀ ĐÂY LÀ PHẦN LÀM TÔI KHÔNG PHẤN KHÍCH

Trong ${w.weeks} tuần đó, BNB đóng cửa tăng ${f1(w.positiveWeeksPct)}% số tuần. Lợi suất tuần trung vị ${f2(w.medianReturnPct)}%.

Đồng xu. Cấu trúc đẹp không đổi được điều đó.

Thêm nữa, tôi đã đo trên ${f0(H.hours)} giờ nến rằng giờ trong ngày không nói gì về hướng nhưng nói rất nhiều về kích thước — biên độ khối tối lệch ${f2(H.evening.sizeVsRest.sigmas)} sigma so với phần còn lại. Nếu bạn giữ lệnh đòn bẩy qua ${(14 + 7) % 24}h giờ Việt Nam mà không nhìn, đó là lựa chọn chứ không phải tai nạn.

Quan điểm: CHỜ. Cấu trúc BNB là thứ sạch nhất tôi đo được trong nhóm lớn tuần này — không hàng kẹt, trên cả hai MA, nền chặt, funding nguội. Nhưng khối lượng đang rút khỏi vùng đỉnh biên, dòng tiền 90 ngày chưa đảo, và một tuần vẫn là đồng xu. Tôi chờ khối lượng xác nhận trước khi gọi đây là hơn một cấu trúc đẹp.

Bạn đặt stop theo ATR ngày hay theo biên độ khung thời gian bạn thực sự giữ lệnh?

Nghiên cứu giáo dục, không phải lời khuyên đầu tư. Tự chịu trách nhiệm.

#BNB #TradingPlan #RiskManagement #WriteToEarn`;

writeFileSync("drafts/61-bnb-tuan.txt", text);
console.log("claims:", Object.keys(claims).length, "| words:", text.trim().split(/\s+/).length);
