# Audit toàn diện thuật toán

Ngày audit: 2026-09-13 · Phạm vi: toàn bộ code tính toán trong `src/`, đối chiếu
với `research/` và `test/`.

Mỗi phát hiện dưới đây đều đã được **tái hiện bằng code thật**, không phải suy
luận từ đọc code. Lệnh tái hiện nằm trong từng mục.

Trạng thái test khi bắt đầu: 287/288 pass. Một test đỏ — xem F16.

---

## Tóm tắt

| # | Module | Vấn đề | Mức độ |
|---|---|---|---|
| F1 | `verify.mjs` | Số dưới 1 USD gần như không được kiểm tra | Nghiêm trọng |
| F2 | `verify.mjs` | Cổng kiểm số mù dấu: `-3.21%` khớp `+3.21%` | Nghiêm trọng |
| F3 | `verify.mjs` | Khoảng giá có gạch ngang làm mất số thứ hai | Nghiêm trọng |
| F4 | `verify.mjs` | Từ `without` miễn trừ cho claim bịa về open interest | Nghiêm trọng |
| F5 | `alert-score.mjs` | Alert cũ hơn 48h bị tính là "miss" | Nghiêm trọng |
| F6 | `stage.mjs`, `lessons.mjs` | VWAP tính sai trọng số, lệch cả dấu | Cao |
| F7 | `pulse.mjs` | `isEvent` chặn trên nến ngày chưa đóng | Cao |
| F8 | 14 file | `JUPUSDT` bị loại như leveraged token | Cao |
| F9 | `orderflow.mjs` | `takerFlow` chỉ đi hết 1 giờ đầu của cửa sổ | Cao |
| F10 | `pbbe.mjs` | `--min-volume-z` bị bỏ qua một nửa | Trung bình |
| F11 | `scoreboard.mjs` | WAIT không có level luôn được tính đúng | Trung bình |
| F12 | `scoreboard.mjs` | Claim quá 8 ngày không bao giờ chốt được | Trung bình |
| F13 | `analysis.mjs` | Horizon tự co lại trên coin mới list | Trung bình |
| F14 | `sides.mjs` | 1 trong 5 điều kiện không thể bật ở môi trường này | Trung bình |
| F15 | `stage.mjs` | `normalizeSymbol("SUSDT")` → `"SUSDTUSDT"` | Trung bình |
| F16 | `test/store.test.mjs` | Test hẹn giờ nổ, hôm nay đỏ | Thấp |
| F17 | toàn repo | Một metric được implement ở nhiều nơi | Thấp |
| F18 | `seasonality.mjs` | Nhãn "Cohen's d" dùng công thức equal-n | Thấp |
| F19 | `verify.mjs` | Số nguyên ≤ 100 không bao giờ bị kiểm | Thấp |
| F20 | `onchain.mjs` | `percentileOf` không bao giờ đạt 100 | Thấp |

---

## Nghiêm trọng — cổng kiểm số và bảng điểm

### F1 — `verify.mjs`: số dưới 1 USD gần như không được kiểm tra

`matches()` tại `src/verify.mjs:308`:

```js
const scale = Math.max(Math.abs(a), target, 1);
return Math.abs(a - target) / scale <= TOLERANCE;   // TOLERANCE = 0.005
```

Sàn `1` trong `Math.max` biến sai số **tương đối 0.5%** thành sai số **tuyệt đối
0.005** cho mọi giá trị nhỏ hơn 1. Với một token giá 0.02266:

```
claimed 0.02266 -> PASSES   (đúng)
claimed 0.0270  -> PASSES   (+19%)
claimed 0.0180  -> PASSES   (-21%)
claimed 0.0250  -> PASSES   (+10%)
```

Phần lớn universe mà `pulse`, `intraday` và `sides` đẩy lên đều dưới 1 USD — ví
dụ `SUSDT` ở 0.02266 trong `data/alerts.jsonl`. Với nhóm này cổng kiểm số không
còn tác dụng.

Hướng sửa: bỏ sàn `1`, dùng `scale = Math.max(Math.abs(a), target)` và một
epsilon tuyệt đối rất nhỏ chỉ để chặn chia cho 0.

### F2 — `verify.mjs`: cổng kiểm số mù dấu

Mọi giá trị được phép đều đi qua `Math.abs()` khi thu thập (`src/verify.mjs:159`,
`189`, `228`, `256`, `266`) và `matches()` cũng so sánh trên `Math.abs()`. Kết
quả: đảo dấu mọi con số trong bài vẫn lọt.

```
thật +3.21%, viết "-3.21%" -> PASSES
```

Đây là loại sai lệch gây hại nhất với người đọc: hướng đi của thị trường bị lật
ngược mà cổng vẫn báo an toàn. `extractNumbers` hiện không bắt dấu đứng trước số.

Hướng sửa: bắt dấu dẫn đầu trong `extractNumbers`, và với các số có `%` thì so
khớp theo giá trị có dấu.

### F3 — `verify.mjs`: khoảng giá có gạch ngang làm mất số thứ hai

`ISO_DATE = /\d{4}-\d{2}(?:-\d{2}…)?/g` tại `src/verify.mjs:57` khớp *bên trong*
một khoảng số. Với `"Support zone 63250-64100 matters."` nó khớp `3250-64`, tạo
skip-span `[1,8]`, và `64100` bắt đầu ở index 6 nên bị bỏ hoàn toàn:

```
extractNumbers -> chỉ 1 số: 63250
verifyNumbers  -> checked: 1   (không phải 2)
```

Mọi khoảng support/resistance viết dạng `a-b` đều xuất bản cận trên mà không qua
kiểm tra. Đúng loại con số mà `AGENT.md` bắt buộc phải lấy từ `levels`.

Hướng sửa: chặn biên chữ số cho `ISO_DATE`: `(?<!\d)\d{4}-\d{2}(?!\d)…`.

### F4 — `verify.mjs`: từ `without` miễn trừ cho claim bịa

`DISCLOSURE` tại `src/verify.mjs:358` có chứa `without`. Một câu chỉ cần có từ
này là cả câu được miễn kiểm tra forbidden-claim:

```
"Open interest rose sharply today."                          -> blocked  (đúng)
"Open interest rose sharply without any price follow-through." -> PASSES
"The long/short ratio tilted bullish without hesitation."      -> PASSES
```

`AGENT.md` nói rõ "never write about them". Hai câu lọt ở trên chính là loại
fabrication mà cổng được dựng để chặn. Các từ khác trong danh sách
(`not available`, `geo-blocked`, …) đều thực sự là lời thừa nhận thiếu dữ liệu;
`without` thì không.

Hướng sửa: bỏ `without` khỏi `DISCLOSURE`, hoặc chỉ chấp nhận nó khi đi cùng một
cụm phủ định về tính khả dụng (`without access to`, `without a source for`).

### F5 — `alert-score.mjs`: alert cũ hơn 48h bị tính là "miss"

`scoreAlerts` (`src/alert-score.mjs:65`) lấy `limit: 48` nến 1 giờ, nhưng chấm
100 alert gần nhất, và 100 alert đó trải trên ~152 giờ. Alert nào già hơn 48 giờ
sẽ có `window = []` → `maxGainPct = NaN` → `hit = false` → `now >= deadline` →
**`status: "miss"`**.

Tái hiện (alert 5 ngày trước, giá từ 50 lên 100, tức +100%):

```
{ "entry": 50, "maxGainPct": null, "status": "miss" }
```

Trong `data/alerts.jsonl`, **67 trên 100** alert gần nhất nằm trong vùng này. Hit
rate mà module này tồn tại để báo cáo trung thực đang bị kéo về gần 0 bởi dữ
liệu thiếu, không bởi kết quả thật. Đây là lỗi nặng nhất về mặt ý nghĩa: nó làm
hỏng đúng con số dùng để đối chiếu với backtest 27.6%.

Hướng sửa: lấy nến theo `startTime`/`endTime` của chính alert (hoặc `limit` theo
tuổi alert), và trả `"unknown"` thay vì `"miss"` khi cửa sổ trống.

---

## Cao — con số sai đi vào nội dung đã xuất bản

### F6 — VWAP tính sai trọng số, lệch cả dấu

`src/stage.mjs:74` và `src/lessons.mjs:25` đều dùng:

```js
const vwap = candles.reduce((s, k) => s + typicalPrice(k) * k.quoteVolume, 0) / turnover;
```

`quoteVolume` **đã chứa giá** (`quoteVolume = price × baseVolume`), nên công thức
này bình phương ảnh hưởng của giá ở tử số. Đây là "trung bình typical price có
trọng số theo doanh thu", không phải VWAP. Nến đã mang sẵn `volume` (base), nên
`Σquote / Σbase` là có sẵn.

Tái hiện trên 10 ngày giá đi từ 100 lên 200 với base volume không đổi, spot 150:

| | giá trị |
|---|---|
| `vwap` báo cáo | 156.177 |
| VWAP thật (`Σquote/Σbase`) | 149.500 |
| `vsVwapPct` báo cáo | **-3.96%** |
| `vsVwapPct` thật | **+0.33%** |

Lệch dấu, và `vsVwapPct < -15` chính là điều kiện kích hoạt stage `BREAKDOWN`
(`src/stage.mjs:119`). `vsVwapPct` cũng nằm trong `collectStageNumbers` nên được
phép xuất bản.

Nặng hơn: bài học đã publish `are-holders-in-profit-vwap` ghi công thức sai làm
tài liệu dạy (`src/lessons.mjs:64`):

```
VWAP = sum(typical price x quote volume) / sum(quote volume)
```

và câu sinh ra từ đó khẳđịnh "The average buyer paid …" — một phát biểu không
đúng với số đang in.

### F7 — `pulse.mjs`: `isEvent` chặn trên nến ngày chưa đóng

`enrich` (`src/pulse.mjs:111`) gọi `volumeZScore` trên chuỗi nến **bao gồm nến
ngày đang chạy**. `analysis.mjs:296-305` mô tả đúng cái bẫy này và đã ship
`volumeZScoreCompleted` để tránh; `movers.mjs` và `pbbe.mjs` cũng đã đi đường
khác bằng `quoteVolume24h` rolling của ticker. `pulse.mjs` thì chưa.

Một ngày turnover gấp 3 lần thật sự, đo bằng công thức hiện tại:

| Thời điểm | volZ | Qua cổng `volZ>=2`? |
|---|---|---|
| 02:00 UTC | -3.59 | không |
| 06:00 UTC | -1.13 | không |
| 12:00 UTC | +2.50 | có |
| 18:00 UTC | +6.12 | có |

`isEvent` dùng `volumeZScore >= 2` làm **cổng cứng** (`src/pulse.mjs:152`), nên
`wte pulse` mù với event volume cho tới khoảng giữa trưa UTC. Hai slot `recap`
(00:30) và `europe` (07:30) đều chạy trong vùng mù đó.

### F8 — `JUPUSDT` bị loại như leveraged token

```js
const EXCLUDED = /(UP|DOWN|BULL|BEAR)USDT$|^(USDC|FDUSD|…)USDT$/;
```

`"JUPUSDT"` kết thúc bằng `UPUSDT`, nên khớp nhánh leveraged-token:

```
EXCLUDED  JUPUSDT      <- Jupiter, pair thanh khoản lớn
EXCLUDED  BTCUPUSDT    <- đúng ý đồ
kept      SUPERUSDT
kept      PUMPUSDT
```

Regex này được copy-paste vào **14 file**: 6 trong `src/` (`context`, `pulse`,
`intraday`, `movers`, `pbbe`, `sides`) và 8 trong `research/` — trong đó có
`research/intraday-signal.mjs`, chính là study sinh ra kết quả 4.44x. Nghĩa là
JUP cũng vắng khỏi universe của nghiên cứu đó.

Repo tự mâu thuẫn: `screen.mjs:18` liệt kê `JUPUSDT` trong `ALT_UNIVERSE` thủ
công, trong khi mọi scanner động đều loại nó.

Hướng sửa: đưa regex về một module dùng chung, và thay nhánh leveraged bằng
danh sách tường minh — Binance đã rút hết leveraged token UP/DOWN từ 2021, nên
nhánh này hiện chỉ còn gây hại.

### F9 — `orderflow.mjs`: `takerFlow` chỉ đi hết 1 giờ đầu của cửa sổ

`endTime` bị chặn ở `cursor + 3_600_000` (`src/orderflow.mjs:46`) còn vòng lặp
thoát khi `page.length < 1000` (`:62`). Với một pair chạy 500 trade mỗi giờ và
`--minutes 360`:

```
requested window: 360 minutes (6h)
pages fetched: 1   [["06:00:00","07:00:00"]]
trades counted: 500       (thực tế cả cửa sổ ~3000)
reported as minutes: 360
```

Imbalance mua/bán — con số được in ra và dùng làm nội dung — được tính trên 1/6
cửa sổ mà nhãn vẫn ghi đủ 360 phút. `wte flow <sym> --minutes <n>` là flag có
tài liệu (`src/cli.mjs:89`). Cửa sổ nào không có trade trong giờ đầu còn trả về
`null`, tức "No trades in the window", dù các giờ sau có.

Hướng sửa: chỉ thoát khi cursor đã vượt `now`; trang ngắn trong một giờ không có
nghĩa là hết cửa sổ.

---

## Trung bình

### F10 — `pbbe.mjs`: `--min-volume-z` bị bỏ qua một nửa

`scorePair` không nhận `minVolumeZ` và hardcode hằng số module
(`src/pbbe.mjs:226`):

```js
volumeZ: Number.isFinite(z) && z >= MIN_VOLUME_Z,   // luôn là 2.0
```

`scan` chỉ áp giá trị người dùng như một filter *thêm* lên trên `passedGates`
(`:322`). Hệ quả: hạ ngưỡng không có tác dụng gì — row với z = 1.39 vẫn trượt
`gates.volumeZ` và không bao giờ vào `qualified`, dù người dùng truyền
`--min-volume-z 1.0`. Nâng ngưỡng thì lại có tác dụng. Ngoài ra `formatScan:336`
vẫn in `Gate z >= <giá trị người dùng>`, tức header báo sai ngưỡng đang áp dụng,
và dòng `Gate pass rates` đếm theo 2.0.

### F11 — `scoreboard.mjs`: WAIT không có level luôn được tính đúng

`src/scoreboard.mjs:93`:

```js
biasCorrect = supportHeld !== false && resistanceBroken !== true;
```

Khi claim không có `support` và `resistance`, cả hai biến là `null`, nên
`null !== false && null !== true` → `true`. Một call WAIT trên asset không có
dòng `levels` trong brief là **thắng vô điều kiện** trong track record. Đúng loại
lỗi mà comment ở đầu file cảnh báo: bảng điểm chỉ khoe hit là marketing.

### F12 — `scoreboard.mjs`: claim quá ~8 ngày không bao giờ chốt được

`scoreClaim` lấy `limit: 200` nến 1 giờ (`:76`), tức ~8.3 ngày. Claim già hơn thế
có `window` rỗng → `return null` → ở lại `pending` **mãi mãi**, và bị fetch lại
mỗi lần `scoreDueClaims` chạy. Nhẹ hơn F5 vì nó im lặng thay vì nói sai, nhưng
vẫn làm call rơi khỏi track record và tạo workload tăng dần không giới hạn.

### F13 — `analysis.mjs`: horizon tự co lại trên coin mới list

`closes.at(-31) ?? closes[0]` (`src/analysis.mjs:278`) khiến `change30dPct` báo
bất kỳ lịch sử nào có sẵn. Với chuỗi 9 nến:

```
change7dPct :  94.87%   (đúng 7 ngày)
change30dPct: 114.36%   <- nhãn 30d, thực tế 8 ngày
high30d/low30d          <- nhãn 30d, thực tế 9 ngày
```

`rangePosition30d`, `realizedVol30d`, `rangeCompressionPct` suy giảm tương tự.
Không field nào báo rằng horizon 30 ngày không có thật. `pulse` và các scanner
đều chạm tới coin mới list, nên những số này được xuất bản dưới nhãn 30 ngày.
`sampleDays` chỉ áp cho nhóm percentile, không cho các field `*30d`.

### F14 — `sides.mjs`: 1 trong 5 điều kiện không thể bật ở môi trường này

`openInterestAligned` (`src/sides.mjs:84`) phụ thuộc open interest. Điểm vẫn in
là `/5` và `minScore` mặc định là 3, nên khi OI không có thì bar thực tế là 3/4.
Dòng "How often each fired" có phơi ra, nhưng điểm tiêu đề và ngưỡng mặc định
vẫn được hiệu chỉnh quanh một điều kiện có thể chết về mặt cấu trúc.

### F15 — `stage.mjs`: `normalizeSymbol("SUSDT")` → `"SUSDTUSDT"`

`/^.{2,}(USDT|USDC|BTC|ETH|FDUSD)$/` (`src/stage.mjs:147`) đòi ít nhất 2 ký tự
trước quote asset, nên base một chữ cái không truyền được dạng pair đầy đủ:

```
"S"     -> SUSDT        (đúng)
"SUSDT" -> SUSDTUSDT    (sai)
```

`SUSDT` là symbol ở **dòng đầu tiên** của `data/alerts.jsonl`, nên bất kỳ luồng
nào chuyển symbol đầy đủ từ alert log sang `stageOf` sẽ vỡ.

---

## Thấp — vệ sinh code

### F16 — test hẹn giờ nổ

`test/store.test.mjs:64` `"usage is bucketed per UTC day"` hardcode
`2026-07-30` / `2026-07-31`, còn `pruneUsage` (`src/store.mjs:225`) xoá bucket cũ
hơn 30 ngày. Hôm nay là 2026-09-13, nên cả hai bucket bị xoá ngay trong
`recordUsage` và assertion nhận `0 !== 3`. Test từng xanh khi viết, hôm nay đỏ.
Đây là 1 test đỏ duy nhất trong 288.

Hướng sửa: tính ngày tương đối so với `utcDayKey()` thay vì hardcode.

### F17 — một metric được implement ở nhiều nơi

`ARCHITECTURE.md` đặt luật "a metric is computed in exactly one place … One
implementation, one window, one answer". Hiện đang vi phạm ở:

- `EXCLUDED` regex: 14 bản sao (xem F8).
- `mean` / `stdev`: định nghĩa lại trong `analysis.mjs`, `pbbe.mjs`,
  `intraday.mjs` (`meanStdev`).
- Window stats: `stage.mjs` `computeStageMetrics` và `lessons.mjs` `windowStats`
  tính cùng một bộ số một cách độc lập — và cùng mang lỗi VWAP ở F6.
- `realizedVolatility({periods:30})` được gọi **3 lần** trong một lần
  `analyzeAsset` (`analysis.mjs:252`, `282`, `291`).

### F18 — nhãn "Cohen's d" dùng công thức equal-n

`seasonality.mjs:51` dùng `sqrt((s1² + s2²)/2)`, là dạng dành cho n bằng nhau.
Với ~24 ngày month-end so với ~700 ngày còn lại, mẫu số đúng là pooled SD có
trọng số theo n−1. Output vẫn in "Effect size (Cohen's d)". Comment đã nói đây là
"rough effect size", nhưng nhãn thì không.

### F19 — số nguyên ≤ 100 không bao giờ bị kiểm

`STRUCTURAL_MAX = 100` bỏ qua mọi số nguyên không thập phân, không `%`. Đây là
lựa chọn có chủ ý và có tài liệu, nhưng hệ quả là giá bịa vẫn lọt với mọi asset
dưới 100 USD:

```
verifyNumbers("SOL is trading at 95 and ETH at 88. Bias: WAIT")
-> checked: 0, ok: true
```

Ghi lại ở đây không phải để sửa ngay mà để đánh dấu vùng cổng không phủ.

### F20 — `percentileOf` không bao giờ đạt 100

`onchain.mjs:103` dùng `<` chặt và chuỗi có chứa chính giá trị mới nhất, nên mức
cao nhất lịch sử in ra là `(n-1)/n × 100`, đứng cạnh cột "record high" của chính
nó. Chỉ là vấn đề hiển thị.

---

## Những phần đã kiểm và thấy đúng

Không phải mọi thứ đều có lỗi. Các phần sau đã được kiểm và đúng:

- **`analysis.mjs`**: Wilder RSI và ATR (seed bằng SMA rồi smooth) đúng chuẩn;
  `realizedVolatility` annualise đúng; `dailySigmaPct = vol30/√365` đúng;
  `correlation` align theo phần tử cuối nên khớp ngày cho chuỗi khác độ dài.
- **`liquidation.mjs`**: `liquidationPrice` giải đúng từ `equity = maintenance`
  cho cả hai chiều; `mmrFor` lấy tier đầu tiên cho phép mức đòn bẩy là đúng với
  cách OKX xếp tier; `bandsFor` lọc đòn bẩy vượt `venueMax`.
- **`intraday.mjs` `scoreSeries`**: baseline `slice(-lookback-1, -1)` loại cả nến
  đang chạy *và* chính giờ đang chấm — đây là cách làm đúng, và là lý do F7 nổi
  bật như một ngoại lệ.
- **`market.mjs` `fetchFundingHistory`**: cửa sổ `week` (21 kỳ) và `prior` (42 kỳ)
  khớp đúng nhãn 7 ngày và 14 ngày trước đó; annualise 3×365 đơn giản, có ghi rõ
  là rate chứ không phải forecast.
- **`equities.mjs` `correlationOnDates`**: join theo ngày thật nên tránh được
  artefact cuối tuần; hai chuỗi đều đo Friday-close → Monday-close nên cùng span.
- **`pbbe.mjs` `maxAchievableZ`**: `(n-1)/√n` đúng, và việc phơi ra giới hạn
  2.268 của z 7 ngày là phân tích tốt.
- **`alerts.mjs`**: cooldown và dedupe theo `hourOpenTime` đúng; so sánh `firedAt`
  dạng chuỗi ISO-8601 UTC an toàn về thứ tự.

---

## Thứ tự đề xuất xử lý

1. **F1–F4** cùng một lượt: cả bốn nằm trong `verify.mjs`, cùng là cổng cuối
   trước khi xuất bản không thể thu hồi. F2 và F3 cần sửa `extractNumbers`, nên
   làm chung một lần.
2. **F5** tiếp theo: nó đang làm sai con số dùng để đối chiếu với backtest, tức
   là làm sai đúng thứ repo này lấy làm uy tín.
3. **F6** cần quyết định về mặt nội dung, không chỉ code: bài học đã publish
   đang dạy công thức sai, nên ngoài sửa code còn phải cập nhật `lesson-data`.
4. **F7, F9** là lỗi làm detector mù hoặc báo sai cửa sổ — sửa sau nhóm trên.
5. **F8** nên sửa cùng F17: gom regex về một chỗ rồi sửa một lần.
6. **F16** sửa nhanh, để test suite về xanh trước khi làm các mục còn lại.
