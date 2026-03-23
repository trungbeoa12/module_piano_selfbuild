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
| 2 | OSMD + vùng score + file test MusicXML | ⬜ Chưa |
| 3 | Refactor cấu trúc thư mục / file | ⬜ Chưa |
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
- `piano-studio.html`, `embed.example.html` — trang demo/embed.
- `css/piano-page.css`, `css/piano-widget.css`.

### Điểm tích hợp score (sau này)

- Thêm vùng DOM score (container) cùng trang với `#pvq-piano-mount`.
- Loader: thêm OSMD (CDN) + script score sau chuỗi piano (hoặc gom `app.js`).
- Tách: loader MusicXML / renderer OSMD — không sửa logic piano cho đến khi cần sync.

### Ràng buộc môi trường

- Cần **HTTP** (`localhost` hoặc deploy) vì `fetch` partial và MusicXML.

---

## PHASE 2 — Nền tảng render bản nhạc

- [ ] Wire **OpenSheetMusicDisplay** (CDN, cách đơn giản nhất).
- [ ] Tạo **vùng score viewer** trên UI.
- [ ] Load **một file MusicXML local** trong project (test).
- [ ] Render thành công trên trình duyệt.
- [ ] **Bàn phím piano vẫn hiển thị** trên cùng trang.

### Gợi ý bước đầu (thứ tự)

1. Thêm `assets/scores/test-score.musicxml` (file export MuseScore hoặc mẫu tối thiểu).
2. Container ví dụ `#pvq-score-container` trong `piano-studio.html` hoặc partial.
3. Script OSMD từ CDN + script nhỏ: `fetch` → OSMD `load` → `render`.

---

## PHASE 3 — Refactor cấu trúc

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
- [ ] Không phá hỏng keyboard/audio hiện tại.
- [ ] Comment ngắn gọn từng module.
- [ ] Cập nhật `piano-loader.js` hoặc entry để trỏ đúng file mới.

---

## PHASE 4 — Chuẩn bị practice (chưa sync playback đầy đủ)

- [ ] Chọn measure/bar (API hoặc state sẵn).
- [ ] Loop một đoạn nhỏ (khung code).
- [ ] Highlight measure hiện tại (hook chỗ gọi OSMD sau này).
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
| | |

---

*Tên file: `plane_module_piano.MD` (giữ nguyên theo yêu cầu — có thể đổi thành `plan_module_piano.md` nếu muốn thống nhất chính tả "plan".)*
