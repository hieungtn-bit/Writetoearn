import { readFileSync, writeFileSync } from "node:fs";

const J = JSON.parse(readFileSync("research/hour-of-day.json", "utf8"));
const B = J.eveningBlock;
const peakUtc = Object.entries(J.byHour).reduce((a, b) => (a[1].medianRangePct > b[1].medianRangePct ? a : b));
const peak = { vn: (Number(peakUtc[0]) + 7) % 24, range: peakUtc[1].medianRangePct };

const claims = {
  "direction is a coin flip in the evening": Math.abs(J.evening.directionVsRest.sigmas) < 1,
  "and the evening closes higher less than half the time": B.positiveSharePct < 50,
  "size is overwhelming instead": J.evening.sizeVsRest.sigmas > 10,
  "the evening really is wider than the rest of the day":
    J.evening.medianRangePct > J.rest.medianRangePct * 1.3,
  "the multiple-comparison guard matters": J.bestSingleHourSigma > 2,
  "and it beats every direction reading in the pre-named block":
    J.bestSingleHourSigma > Math.abs(J.evening.directionVsRest.sigmas),
  "the peak hour is inside the evening block":
    J.method.eveningHoursUtc.includes((peak.vn + 17) % 24),
  "the sample is large enough to say this": J.hours > 15000 && B.sessions > 500,
};
const bad = Object.entries(claims).filter(([, ok]) => !ok);
if (bad.length) { console.error("ABORT:"); for (const [c] of bad) console.error("  x " + c); process.exit(1); }

const f2 = (v) => Number(v).toFixed(2);
// English grouping, deliberately. The decimals in this post are English-style
// (0.71, not 0,71) because they come from toFixed, and mixing that with
// Vietnamese thousands (17.518) is incoherent for a reader and unreadable for
// the gate — it parsed "17.518" as seventeen-point-five-one-eight.
const vi = (n) => n.toLocaleString("en-US");

const text = `Tối nay $BTC lên hay xuống? Tôi không biết. Và tôi đo được rằng tôi không biết.

${vi(J.hours)} giờ nến, hai năm, xếp theo giờ Việt Nam.

Phiên tối (19–24h) tăng giá ${f2(J.evening.positiveSharePct)}% số giờ. Cả khối tối đóng cửa cao hơn ${f2(B.positiveSharePct)}% số phiên. Đồng xu. Lệch chuẩn ${f2(J.evening.directionVsRest.sigmas)} — tức không có gì.

Chỗ này suýt lừa được tôi. Thử 24 giờ với cùng một mốc thì kiểu gì cũng có một giờ trông "có ý nghĩa". Ô cao nhất bảng đạt ${f2(J.bestSingleHourSigma)} sigma — đúng mức nhiễu tạo ra khi thử 24 lần. Nếu không chốt khối giờ TRƯỚC khi chạy, tôi đã đăng một "khung giờ vàng" rất thuyết phục và hoàn toàn sai.

Nhưng có một thứ thật, và nó lớn: biên độ.

Phiên tối ${f2(J.evening.medianRangePct)}% mỗi giờ, ngày chỉ ${f2(J.rest.medianRangePct)}%. Lệch ${f2(J.evening.sizeVsRest.sigmas)} sigma. ${peak.vn}h là giờ dữ nhất ngày với ${f2(peak.range)}%, hơn gấp đôi giờ trưa.

Dùng được ngay: nửa số phiên tối có biên độ ${f2(B.p25RangePct)}–${f2(B.p75RangePct)}%. Dừng lỗ hẹp hơn ${f2(B.medianRangePct)}% sẽ bị quét bởi một đêm hoàn toàn bình thường, không cần tin gì cả.

Quan điểm: CHỜ. Giờ trong ngày không nói gì về hướng, nói rất nhiều về kích thước. Đó là chuyện cỡ lệnh, không phải chuyện đặt cửa nào.

Bạn có đang để lệnh đòn bẩy chạy qua ${peak.vn}h không?

Nghiên cứu giáo dục, không phải lời khuyên đầu tư. Tự chịu trách nhiệm.

#WriteToEarn #BinanceSquare`;

writeFileSync("drafts/56-gio-thi-truong.txt", text);
console.log("claims:", Object.keys(claims).length, "| words:", text.trim().split(/\s+/).length);
