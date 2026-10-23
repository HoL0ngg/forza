# Prompt dùng cho Codex — Xây dựng Web Game Lái Xe (phong cách Forza Horizon)

---

## PROMPT

Tôi muốn bạn giúp tôi xây dựng một **dự án web game đua xe/lái xe tự do (open-world driving game)** lấy cảm hứng từ Forza Horizon, chạy hoàn toàn trên trình duyệt (HTML5 + WebGL). Hãy thực hiện theo từng giai đoạn, giải thích rõ cấu trúc code, và ưu tiên hiệu năng mượt trên trình duyệt.

### 1. Công nghệ đề xuất
- **Engine render**: Three.js (WebGL) — nếu bạn thấy công cụ khác phù hợp hơn (Babylon.js, PlayCanvas) thì đề xuất kèm lý do.
- **Vật lý xe**: Cannon-es hoặc Rapier (WASM) để mô phỏng vật lý xe thực tế (treo giảm xóc, độ bám đường, trọng tâm).
- **Âm thanh**: Web Audio API để xử lý âm thanh động cơ, tiếng pô theo thời gian thực (pitch shift theo RPM, hiệu ứng backfire/pop khi nhả ga).
- **Build tool**: Vite + TypeScript.
- **State management**: đơn giản, không cần framework UI nặng (có thể dùng React chỉ cho HUD/menu nếu cần).

### 2. Cơ chế lái xe cốt lõi
- Mô hình vật lý xe bán thực (arcade-sim hybrid): công suất động cơ, mô-men xoắn theo dải vòng tua, hộp số, vi sai, độ bám lốp, drift.
- **Hệ thống số (transmission)**:
  - Chế độ **số tự động (Automatic)** và **số tay (Manual/H-pattern hoặc sequential)**.
  - Đường cong mô-men xoắn (torque curve) theo RPM cho từng loại động cơ.
  - Tính năng **lên/xuống số bằng phím** (ví dụ: `Shift` lên số, `Ctrl` xuống số) hoặc paddle shift.
  - Rev-matching khi về số (kèm hiệu ứng blip ga).
  - Redline/giới hạn vòng tua, cắt côn khi lên số (ngắt momen tức thời).
- **Tinh chỉnh hộp số (gearbox tuning)**:
  - Cho phép người chơi chỉnh tỉ số truyền từng số (gear ratio), tỉ số cầu (final drive).
  - Ảnh hưởng trực tiếp đến gia tốc, tốc độ tối đa từng số.
  - Giao diện tuning trực quan (đồ thị hiển thị tốc độ lý thuyết theo số).
- **Tinh chỉnh xe (car tuning) mở rộng** (tùy chọn thêm sau):
  - Turbo/tăng áp, ống xả (ảnh hưởng âm thanh + công suất), lò xo/giảm xóc, độ chụm bánh, phân bổ phanh.

### 3. Âm thanh động cơ & tiếng pô
- Âm thanh động cơ tổng hợp theo RPM thực tế (dùng sample loop + pitch/gain điều chỉnh động, hoặc tổng hợp bằng oscillator).
- Tiếng pô thay đổi theo:
  - Loại ống xả (stock/sport/racing).
  - Trạng thái ga (nhả ga đột ngột → tiếng pop/backfire).
  - Chế độ tua máy khi về số (blip).
- Hiệu ứng Doppler khi xe di chuyển ngang qua camera/người chơi khác.

### 4. Thế giới mở & gameplay
- Bản đồ mở nhỏ (ví dụ 2-4 km²) để test trước, có đường nhựa, off-road, đồi núi.
- Camera: góc nhìn thứ 3 (chase cam), trong xe (cockpit), có thể chuyển đổi.
- HUD: tốc độ, vòng tua (kim đồng hồ RPM động), số hiện tại, mini-map.
- Chế độ chơi: Free roam, Time Trial, Checkpoint race (giai đoạn đầu chỉ cần Free roam + Time Trial).

### 5. Cấu trúc dự án mong muốn
```
/src
  /core        -> game loop, input, camera
  /physics     -> vehicle physics, tire model, suspension
  /audio       -> engine sound engine, exhaust FX
  /tuning      -> gearbox tuning logic, UI data binding
  /world       -> map loading, track, terrain
  /ui          -> HUD, menu, tuning screen
  /assets      -> models, sounds, textures
```

### 6. Yêu cầu triển khai theo giai đoạn
1. **Giai đoạn 1 (MVP)**: Dựng scene Three.js cơ bản, load 1 xe (model đơn giản/hộp chữ nhật tạm), điều khiển ga/phanh/lái, camera bám theo xe.
2. **Giai đoạn 2**: Thêm vật lý xe thật (Cannon-es/Rapier), mô hình lốp, treo.
3. **Giai đoạn 3**: Hệ thống hộp số (auto + manual), torque curve theo RPM, HUD hiển thị số & RPM.
4. **Giai đoạn 4**: Âm thanh động cơ + tiếng pô động theo RPM/ga.
5. **Giai đoạn 5**: Màn hình tuning hộp số (chỉnh tỉ số truyền, xem đồ thị tốc độ/số).
6. **Giai đoạn 6**: Mở rộng bản đồ, thêm chế độ chơi, polish UI/UX.

### 7. Yêu cầu chất lượng code
- TypeScript, chia module rõ ràng, comment giải thích các công thức vật lý/âm thanh quan trọng.
- Viết theo từng bước nhỏ, sau mỗi bước cho tôi biết cách chạy thử (`npm run dev`) và kiểm tra tính năng.
- Nếu có quyết định kỹ thuật cần đánh đổi (performance vs độ chân thực), hãy nêu rõ lựa chọn và lý do.

Hãy bắt đầu bằng cách đề xuất cấu trúc dự án chi tiết + khởi tạo Giai đoạn 1 (MVP), sau đó dừng lại để tôi xác nhận trước khi làm tiếp giai đoạn sau.

---