
---

## PROMPT

Dự án game lái xe hiện tại đã có MVP chạy được (scene Three.js, điều khiển ga/phanh/lái, camera bám xe). Bây giờ tôi cần bạn **đọc kỹ code hiện có** rồi bổ sung 2 tính năng lớn dưới đây, tích hợp vào hệ thống vật lý xe đang có, **không phá vỡ** các phần đang hoạt động.

### A. Hệ thống hộp số & lên/xuống số kiểu Forza Horizon

1. **Module hộp số riêng** (ví dụ `src/physics/transmission.ts`):
   - State: `currentGear` (gồm N, R, 1, 2, 3... tối đa 6-7 số), `rpm`, `isClutchEngaged`.
   - Đường cong mô-men xoắn (`torqueCurve`) theo RPM — dùng bảng điểm (lookup table) rồi nội suy tuyến tính, dễ chỉnh sau này.
   - Idle RPM, redline RPM, RPM giới hạn khi nhả côn.

2. **Hai chế độ điều khiển**:
   - **Automatic**: tự động lên số khi RPM chạm ngưỡng shift-up, tự xuống số khi RPM xuống dưới ngưỡng shift-down hoặc khi tốc độ xe không đủ để duy trì số hiện tại.
   - **Manual**: người chơi tự bấm phím lên số / xuống số (ví dụ `Shift`/`Ctrl` hoặc `E`/`Q`), có thể chọn thêm chế độ sequential hoặc H-pattern nếu dễ làm.
   - Cho phép chuyển đổi Auto ↔ Manual bằng 1 phím tắt (ví dụ `T`), hiển thị trạng thái hiện tại trên HUD.

3. **Hiệu ứng khi sang số** (đúng cảm giác Forza):
   - Ngắt momen (torque cut) trong khoảng 100-200ms khi lên số, mô phỏng độ trễ ly hợp.
   - Rev-matching / blip ga khi về số (RPM tự tăng nhẹ trước khi khớp số thấp hơn).
   - Nếu về số khi RPM sẽ vượt redline → chặn lại, không cho về số đó (bảo vệ động cơ).
   - Rung nhẹ camera hoặc hiệu ứng hình ảnh khi sang số gấp (tùy chọn, làm sau nếu còn thời gian).

4. **HUD cập nhật**:
   - Đồng hồ vòng tua (kim RPM) phản ứng mượt theo giá trị RPM thực, đổi màu khi gần redline.
   - Hiển thị số hiện tại to, rõ (kiểu Forza: số lớn ở giữa, RPM dạng thanh ngang hoặc kim tròn).
   - Đèn báo shift light nhấp nháy khi gần redline.

### B. Màn hình tinh chỉnh hộp số & động cơ (Tuning UI)

1. **Tuning hộp số**:
   - Cho chỉnh **tỉ số truyền từng số** (gear ratio 1-6/7) bằng slider hoặc input số.
   - Cho chỉnh **tỉ số truyền cuối (final drive ratio)**.
   - Vẽ **biểu đồ tốc độ theo số** (speed vs RPM cho từng số) cập nhật real-time khi kéo slider, để người chơi thấy ngay ảnh hưởng (giống màn hình tuning của Forza).

2. **Tuning động cơ (engine tuning cơ bản)**:
   - Cho chỉnh hệ số nhân công suất/mô-men xoắn tổng thể (mô phỏng độ lớn của các bản độ: turbo, exhaust, intake) — đơn giản là 1-2 hệ số nhân lên torque curve gốc.
   - Cho chỉnh redline RPM (trong giới hạn hợp lý).
   - Hiển thị thông số tổng: mã lực ước tính (HP), mô-men xoắn cực đại, RPM đạt công suất tối đa.

3. **Lưu/tải cấu hình tuning**:
   - Lưu setup hiện tại vào `localStorage` (JSON), có nút "Reset về mặc định" và "Lưu preset".
   - Không bắt buộc phải có nhiều preset, nhưng nên tách rõ `defaultConfig` và `currentConfig` để dễ mở rộng sau.

### C. Yêu cầu kỹ thuật

- Giữ nguyên các phần vật lý xe (di chuyển, lái, phanh) đang hoạt động — chỉ mở rộng/nối thêm module hộp số vào chỗ tính lực kéo bánh xe hiện tại.
- Tách rõ **logic** (transmission.ts, tuning.ts) khỏi **UI** (React/HTML component riêng cho tuning screen và HUD).
- Viết theo từng bước nhỏ:
  1. Trước tiên chỉ làm phần lõi hộp số (auto + manual + torque curve), test bằng console log RPM/số, chưa cần UI đẹp.
  2. Sau đó làm HUD hiển thị số/RPM.
  3. Cuối cùng làm màn hình tuning + lưu localStorage.
- Sau mỗi bước, nói rõ cách tôi test (phím tắt nào, mở màn hình nào) trước khi làm bước tiếp theo.

Hãy bắt đầu bằng cách đọc code hiện tại, tóm tắt lại cấu trúc bạn thấy, rồi đề xuất cách bạn sẽ tích hợp module hộp số vào (không cần code ngay, chỉ cần plan trước để tôi duyệt).
