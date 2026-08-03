# MAIX8 MC — 15-second video prompts

Reference frame: `IMG_7140.JPG` (studio MC, black-and-gold MAIX8 dress, tablet in hand).

Upload that image as the **first frame** in Grok Imagine and use the prompts below.
Describing the character again in text fights the reference and drifts the face —
so these prompts describe **motion, camera and light only**.

The script is regenerated per post from figures that passed `wte check`. Never
hand-type a number into a video script; copy it from the shipped draft.

---

## 1. Main prompt (image-to-video, 15s)

```
Subject stays exactly as in the reference frame. She is mid-broadcast.

Motion: she looks up from the tablet into the lens on the first beat, gives a
small confident nod, and speaks directly to camera. Natural talking-head
performance — subtle jaw and lip movement, relaxed blinks, micro head tilts on
emphasis. Right hand lifts off the tablet once, palm open, a single measured
gesture, then settles. Hair moves softly. She holds a calm half-smile at the
end and holds eye contact.

Camera: slow dolly-in from medium-wide to medium, roughly 8% over the full
shot. Locked horizon, no shake, shallow depth of field, subject always sharp.

Background: the studio screens stay alive but soft — candlestick chart drifting
slowly right, faint blue and amber glow, the circular MAIX8 logo steady on the
left panel. Everything behind her is defocused.

Light: broadcast key light from front-left, gold rim light on hair and
shoulders, cool blue fill from the screens. Cinematic, clean, high-end
financial-news look.

Style: photorealistic 4K broadcast studio, 24fps, natural colour, no stylisation.
```

**Negative prompt**

```
extra fingers, deformed hands, warped tablet, changing face, changing outfit,
text on screen, distorted logo, morphing background, jump cut, camera shake,
fisheye, oversaturated, cartoon, plastic skin, lip sync drift, extra person
```

---

## 2. Voiceover script — 15s ≈ 37 words

Keep to 35–40 words. Above that the delivery rushes and the last figure gets
clipped.

### EN

> Bitcoin is coiled in its tightest range in five hundred sessions.
> Ninety-six percent of this month's volume sits above price.
> Longs face a headwind, not an exit. Shorts get paid to wait.
> Neither side has an edge. Our call: wait.

### VI

> Bitcoin đang nén chặt nhất trong năm trăm phiên.
> Chín mươi sáu phần trăm khối lượng tháng này nằm trên giá.
> Phe long gặp gió ngược, chưa phải tín hiệu thoát. Phe short được trả tiền để chờ.
> Không bên nào có lợi thế. Khuyến nghị: chờ.

---

## 3. On-screen text overlay (add in edit, not in the prompt)

Generative video renders text as garbage. Burn these in afterwards.

| Time | Lower third |
|---|---|
| 0–3s | `MAIX8 RESEARCH` / `BTC MARKET CALL` |
| 4–9s | `30D RANGE 61,307 – 66,956` |
| 9–13s | `96% OF MONTHLY VOLUME ABOVE PRICE` |
| 13–15s | `BIAS: WAIT` |
| full | `Educational research, not financial advice. DYOR.` (small, bottom) |

---

## 4. Variants worth testing

- **Open loop** — replace the first beat with her already speaking, so the clip
  can be cut into a longer reel without a visible start.
- **Tablet cutaway** — same prompt, but `she turns the tablet toward camera on
  the last beat`. Composite the chart onto the screen in edit.
- **Vertical** — regenerate at 9:16 for Square and Reels; the reference frame is
  already vertical, so framing survives.
