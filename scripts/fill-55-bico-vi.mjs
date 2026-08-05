// Vietnamese, through the same gate as everything else.
//
// Draft 52 was written in Vietnamese and shipped with a note admitting it had
// no gate path, because verify.mjs only recognised English bias markers and
// disclaimers. That is fixed, so this one is checked like the rest.
import { readFileSync, writeFileSync } from "node:fs";

const L = JSON.parse(readFileSync("/home/user/Writetoearn/research/live-catches.json", "utf8"));
const b = L.rows.find((r) => r.asset === "BICO");
const hft = L.rows.filter((r) => r.delisting).sort((x, y) => y.changeSinceAlertPct - x.changeSinceAlertPct)[0];

const claims = {
  "BICO is up since the alert": b.changeSinceAlertPct > 20,
  "and is still scored a miss": b.hit === false && b.settled === true,
  "the gain inside the window was small": b.bestGainPct < 5,
  "the drawdown inside the window was not": b.worstDrawdownPct < -10,
  "the alert hour was genuinely extreme": b.turnoverVsNormal > 15,
  "the best-looking result is a delisting": hft.delisting === true
    && hft.changeSinceAlertPct > b.changeSinceAlertPct,
  "removing delistings lowers the hit rate":
    L.excludingDelistings.hitRatePct < L.overall.hitRatePct,
  "enough alerts have settled to say anything": L.settled >= 25,
};
const bad = Object.entries(claims).filter(([, ok]) => !ok);
if (bad.length) { console.error("ABORT:"); for (const [c] of bad) console.error("  x " + c); process.exit(1); }

const f1 = (v) => Number(v).toFixed(1);
const f2 = (v) => Number(v).toFixed(2);

const text = `Hệ thống của tôi báo $BICO hai hôm trước ở giá $${b.alertPrice}. Bây giờ nó $${b.priceNow}, tăng ${f1(b.changeSinceAlertPct)}%.

Tôi chấm nó TRƯỢT.

Mỗi cảnh báo có một đồng hồ mười hai tiếng. Trong mười hai tiếng đó BICO lên ${f2(b.bestGainPct)}% rồi rơi ${f2(Math.abs(b.worstDrawdownPct))}%. Cú tăng ai cũng thấy bây giờ đến sau khi cửa sổ đóng. Ai vào theo cảnh báo với một cái dừng lỗ tử tế đã bị quét ra từ lâu.

Đúng coin nhưng sai thời điểm thì vẫn là sai, chỉ kèm câu chuyện nghe hay hơn.

Phần chạy được: trong một giờ BICO khớp $${(b.hourTurnoverUsd / 1e6).toFixed(1)} triệu, trong khi giờ bình thường của nó là $${Math.round(b.averageHourTurnoverUsd / 1000)} nghìn. Gấp ${f1(b.turnoverVsNormal)} lần. Tiền đến trước, đám đông đến sau.

Thành tích thật: ${L.settled} cảnh báo đã đóng cửa sổ, ${f1(L.overall.hitRatePct)}% trúng. Bỏ những đồng tăng chỉ vì sàn báo sắp gỡ niêm yết, còn ${f1(L.excludingDelistings.hitRatePct)}% trên ${L.excludingDelistings.n}.

Con số đẹp nhất bảng của tôi, tăng ${f1(hft.changeSinceAlertPct)}%, chính là một đồng như vậy. Đó không phải chiến thắng, đó là hàng xếp hàng thoát ra.

Quan điểm: CHỜ. Máy tìm ra chuyển động không phải máy tìm ra lợi nhuận.

Bạn chọn cái nào — đúng đồng coin, hay đúng thời điểm?

Nghiên cứu giáo dục, không phải lời khuyên đầu tư. Tự chịu trách nhiệm.

#WriteToEarn #BinanceSquare`;

writeFileSync("/home/user/Writetoearn/drafts/55-bico-vi.txt", text);
console.log("claims:", Object.keys(claims).length, "| words:", text.trim().split(/\s+/).length);
