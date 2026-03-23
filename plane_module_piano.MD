# Kế hoạch module piano + sheet music (MusicXML / OSMD)

File này dùng để **theo dõi tiến độ**. Cập nhật checkbox khi hoàn thành từng mục.

---

## Mục tiêu

Biến `module_piano_self_build` từ demo piano thành **module học piano thực tế** với:

- Giữ **bàn phím piano tự code** (không thay bằng widget bên thứ ba).
- Thêm **hiển thị bản nhạc** từ **MusicXML** (export MuseScore).
- Dùng **OpenSheetMusicDisplay (OSMD)** chỉ cho **render** bản nhạc.
- Stack: **HTML + CSS + vanilla JS**, không backend, không login/DB.
- Cấu trúc **modular**, sau này nhúng lại website chính.

---

## Trạng thái tổng quan

| Phase | Mô tả ngắn | Trạng thái |
|-------|------------|------------|
| 1 | Inspect codebase + kiến trúc | ✅ Đã làm (tóm tắt trong mục dưới) |
| 2 | OSMD + vùng score + file test MusicXML | ✅ Đã làm |
| 3 | Refactor cấu trúc thư mục / file | 🔄 Đang làm |
| 4 | Chuẩn bị practice (measure, loop, highlight — chưa sync full) | ⬜ Chưa |
| 5 | Deliverables + hướng dẫn chạy / đặt file | ⬜ Chưa |

---

## PHASE 1 — Đã inspect (tóm tắt kiến trúc)

### Cấu trúc file hiện tại

- `piano-loader.js` — entry nhúng: `data-base`, `data-mount`, inject CSS/font, `fetch` `piano-widget.partial.html`, load script theo chuỗi, `new PVQ_PianoStudioPlayer`.
- `piano-widget.partial.html` — UI widget, `[data-pvq-piano-root]`, `data-pvq-role` cho controls.
- `js/data/piano-lessons.js` — `PVQ_PIANO_LESSONS` (`title`, `notes[]`).
- `js/piano/audio-engine.js` — `PVQ_PianoAudioEngine`.
- `js/piano/piano-keyboard.js` — `PVQ_PianoKeyboard`.
- `js/piano/piano-player.js` — `PVQ_PianoStudioPlayer`.
- `js/piano/piano-practice.js` — chỉ khi **không** dùng loader.
- `js/score/score-loader.js` — tải MusicXML qua `fetch`.
- `js/score/score-renderer.js` — bọc OSMD để render score.
- `js/score/studio-score-init.js` — entry chỉ dùng cho `piano-studio.html`.
- `piano-studio.html`, `embed.example.html` — trang demo/embed.
- `css/piano-page.css`, `css/piano-widget.css`, `css/score-viewer.css`.
- `assets/scores/` — nơi chuẩn để đặt file score hiện tại.
- `sheet_piano/` — thư mục cũ, chỉ giữ tạm để tham chiếu/di trú; không dùng làm nguồn mặc định nữa.

### Điểm tích hợp score (sau này)

- Thêm vùng DOM score (container) cùng trang với `#pvq-piano-mount`.
- Hiện tại **giữ score viewer ở `piano-studio.html`**, chưa nhúng vào `piano-loader.js`.
- Nếu sau này cần embed cả score + piano, mở rộng loader theo hướng: mount thêm vùng score, nạp OSMD + `js/score/*`, rồi cho phép truyền `data-score-url`.
- Tách: loader MusicXML / renderer OSMD — không sửa logic piano cho đến khi cần sync.

### Ràng buộc môi trường

- Cần **HTTP** (`localhost` hoặc deploy) vì `fetch` partial và MusicXML.

---

## PHASE 2 — Nền tảng render bản nhạc

- [x] Wire **OpenSheetMusicDisplay** (CDN, cách đơn giản nhất).
- [x] Tạo **vùng score viewer** trên UI.
- [x] Load **một file MusicXML local** trong project (test).
- [x] Render thành công trên trình duyệt.
- [x] **Bàn phím piano vẫn hiển thị** trên cùng trang.

### Gợi ý bước đầu (thứ tự)

1. Thêm `assets/scores/test-score.musicxml` (file export MuseScore hoặc mẫu tối thiểu).
2. Container ví dụ `#pvq-score-container` trong `piano-studio.html` hoặc partial.
3. Script OSMD từ CDN + script nhỏ: `fetch` → OSMD `load` → `render`.

---

## PHASE 3 — Refactor cấu trúc

Quy ước hiện tại cần giữ thống nhất:

- Dùng `assets/scores/` làm **nguồn chuẩn duy nhất** cho file `.musicxml` / `.mxl`.
- Dùng `js/score/` làm **nhóm script score** (`score-loader.js`, `score-renderer.js`, `studio-score-init.js`).
- `sheet_piano/` là **legacy folder**, không thêm file mới vào đây.
- Score viewer hiện **chỉ sống ở `piano-studio.html`**; `piano-loader.js` hiện chỉ chịu trách nhiệm nhúng piano widget.

Cấu trúc mục tiêu:

```text
module_piano_self_build/
  index.html
  css/
    app.css
    piano.css
    score-viewer.css
  js/
    core/
      audio-engine.js
      keyboard.js
      player.js
    score/
      score-loader.js
      score-renderer.js
      score-segments.js
    app.js
  assets/
    scores/
      test-score.musicxml
```

- [ ] Tách rõ logic score vs piano.
- [x] Chuẩn hóa score assets về `assets/scores/`.
- [x] Chuẩn hóa score scripts về `js/score/`.
- [x] Ghi chú rõ `sheet_piano/` là thư mục cũ để tránh nhầm.
- [x] Chốt score viewer ở `piano-studio.html` trước, chưa đưa vào loader.
- [ ] Ghi sẵn hướng mở rộng `piano-loader.js` nếu sau này cần embed cả score.
- [ ] Không phá hỏng keyboard/audio hiện tại.
- [ ] Comment ngắn gọn từng module.
- [ ] Cập nhật `piano-loader.js` hoặc entry để trỏ đúng file mới.

---

## PHASE 4 — Chuẩn bị practice (chưa sync playback đầy đủ)

- [x] Chọn measure/bar (state + overlay click trên score).
- [x] Playback riêng cho sheet nhạc (cursor OSMD, chưa sync với piano).
- [ ] Loop một đoạn nhỏ (khung code).
- [x] Highlight measure hiện tại / đoạn đang chọn trên score.
- [ ] **Không** làm đồng bộ playback score ↔ keyboard đầy đủ trong phase này — chỉ kiến trúc sạch để mở rộng.

---

## PHASE 5 — Deliverables

- [ ] Ngắn: **implementation plan** (có thể chính là file này).
- [ ] **Cây thư mục** cập nhật sau refactor.
- [ ] **Thay đổi code** (PR/commit log hoặc mô tả).
- [ ] Hướng dẫn: **đặt file MusicXML** ở đâu (`assets/scores/…`).
- [ ] Hướng dẫn: **chạy local** (vd. `npx serve`, `python -m http.server`) và test.

---

## Ràng buộc nhắc lại

- Không thay module piano custom bằng piano widget bên thứ ba.
- Chỉ dùng OSMD cho **sheet rendering**.
- UI đơn giản, thân thiện dev.
- Tránh over-engineer; abstraction vừa đủ.

---

## Ghi chú tiến độ (tự ghi khi làm)

| Ngày | Việc đã làm |
|------|-------------|
| 2026-03-23 | Hoàn tất render score bằng OSMD trên `piano-studio.html`; thống nhất dùng `assets/scores/` và `js/score/`; đánh dấu `sheet_piano/` là thư mục cũ (legacy); chốt score viewer sống ở `piano-studio.html`, chưa đưa vào `piano-loader.js`. |
| 2026-03-23 | Bắt đầu Phase 4: lấy measure từ SVG do OSMD render, thêm chọn đoạn measure và highlight trực tiếp trên score viewer. |
| 2026-03-23 | Thêm playback riêng cho sheet nhạc bằng cursor của OSMD: Play/Pause, Stop, chỉnh tốc độ; nếu có selection thì phát đoạn đã chọn, nếu không thì phát toàn bộ bản nhạc. |

---

*Tên file: `plane_module_piano.MD` (giữ nguyên theo yêu cầu — có thể đổi thành `plan_module_piano.md` nếu muốn thống nhất chính tả "plan".)*
