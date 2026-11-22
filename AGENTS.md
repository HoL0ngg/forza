# Coastline Drive — hướng dẫn phát triển

## Tầm nhìn
Game lái xe thế giới mở 3D lấy cảm hứng từ trải nghiệm khám phá và sưu tập xe của Forza Horizon, chạy gameplay hoàn toàn trên trình duyệt. Dùng tên, thiết kế và tài sản riêng; ghi nguồn và giấy phép của tài sản nhập vào. Ưu tiên cảm giác lái arcade dễ chơi, nhiều hãng xe, garage, shop và tiến trình rõ ràng.

Vòng chơi: khám phá hoặc đua → nhận credits → mua xe → chọn xe và tuning → tiếp tục đua. Bản đầu chơi đơn, tiền trong game và hãng hư cấu. Chưa triển khai multiplayer, backend hay thanh toán tiền thật; nhưng kiến trúc phải sẵn sàng cho chơi online với bạn bè về sau (xem mục "Sẵn sàng online"). Không tự thêm code mạng khi chưa được yêu cầu.

## Nền tảng hiện có
- Three.js, TypeScript, Vite; HUD/menu bằng HTML/CSS, thế giới và showroom xe bằng 3D.
- Đường vòng ven biển, bàn phím/cảm ứng, camera bám, hộp số Auto/Manual, tuning và Web Audio.
- Vật lý bicycle đơn giản; chưa mô phỏng rigid body, lực lốp, drift hoặc va chạm cảnh quan thực. Không mô tả thông số chưa được dùng như tính năng đã hoàn thành.
- GT–01 là xe mặc định; giữ tương thích dữ liệu tuning cũ khi mở rộng lưu tiến trình.

## Bản đồ code
- `src/core/`: vòng lặp fixed timestep 120 Hz, input, camera, điều phối game và WebMCP tùy chọn.
- `src/data/vehicles/`: định nghĩa xe bất biến, validation và registry; một nguồn dữ liệu cho physics, HUD và view.
- `src/vehicles/`: tạo/hủy runtime xe. Đổi xe phải giải phóng geometry/material cũ.
- `src/physics/`: chuyển động xe, truyền động và bảo vệ sang số.
- `src/world/`: cảnh quan, đường, model procedural. Chưa có loader GLB chỉ vì schema có đường dẫn.
- `src/ui/`: HUD, menu, garage/shop và tuning; giữ hỗ trợ bàn phím, cảm ứng và nhãn truy cập.
- `src/audio/`: âm thanh theo trạng thái động cơ; chỉ khởi chạy sau tương tác, dừng khi pause/mất focus.
- `src/tuning/`: tính toán, validation và preset theo xe.
- `src/progression/`: tiến trình, sở hữu xe, credits và giao dịch cục bộ khi được bổ sung.
- `src/racing/`: checkpoint, tính giờ và kết quả đua khi được bổ sung.
- `src/traffic/`: mạng làn đường, xe NPC, người đi bộ, luật giao thông đơn giản (khi được bổ sung).
- `src/sim/`: trạng thái mô phỏng tuần tự hóa được, RNG có seed, lệnh input, adapter mạng chỉ bản local (khi được bổ sung).
- `src/perf/`: đo hiệu năng, overlay chẩn đoán, mức chất lượng đồ họa, ngân sách hiệu năng.
- `tests/`: kiểm tra logic và giao diện với Node test runner/jsdom.
- `docs/`: tài liệu thiết kế (`performance.md`, `online-readiness.md`...).

## Quy tắc triển khai
- Đọc code liên quan và mọi caller trước khi sửa. Giữ thay đổi nhỏ nhưng hoàn chỉnh; tận dụng module và dependency hiện có.
- Thêm xe phải cập nhật definition, validation, registry, hình ảnh và kiểm tra liên quan; xe cần khác biệt về thông số và ngoại hình, không chỉ đổi tên.
- Tách dữ liệu danh mục xe khỏi quyền sở hữu của người chơi. Không cho chọn xe chưa sở hữu, mua trùng hoặc giao dịch vượt số credits.
- Save có version; kiểm tra dữ liệu đọc vào, giữ preset cũ khi migration lỗi, thông báo khi không lưu được. Lưu tuning riêng theo vehicle ID.
- Đua chỉ thưởng sau khi qua checkpoint đúng thứ tự và hoàn thành; reset, đổi xe hoặc hủy đua không được nhận thưởng.
- Pause/menu/mất focus phải ngừng simulation đua, giao thông và âm thanh, xóa input đang giữ. Không dùng thời gian thực để cộng thời gian đua hoặc tiến mô phỏng khi pause.
- Hoàn thành từng lát cắt: nhiều xe/garage → time trial → shop/tiến trình → chất lượng hình ảnh, âm thanh và thế giới. Lát cắt giao thông NPC và thế giới TP.HCM chỉ bắt đầu khi đã có số đo hiệu năng cơ sở.
- Không tự push, xuất bản hay deploy nếu chưa được yêu cầu. Dùng subagent khi người dùng yêu cầu; phân quyền file rõ ràng (mỗi file một agent sở hữu), thống nhất interface và kiểm tra tích hợp.

## Hiệu năng
Nguyên tắc: đo trước, sửa sau, đo lại. Không tối ưu theo cảm giác và không cam kết FPS khi chưa đo trên thiết bị thật.
- Mọi thay đổi hiệu năng phải có số đo trước/sau (frame time trung bình và p95, draw call, triangles, geometries/textures còn sống, thời gian update từng hệ thống) và ghi vào `docs/performance.md`.
- Vòng lặp fixed timestep 120 Hz phải giới hạn số bước bù mỗi frame và bỏ phần dư khi tụt nhịp, tránh vòng xoáy bù bước làm lag nặng thêm. Tách tần suất mô phỏng khỏi tần suất render.
- Không cấp phát đối tượng mới (Vector3, mảng, chuỗi) trong vòng lặp nóng; tái sử dụng object và dùng object pool.
- Cập nhật DOM của HUD theo tần suất thấp (khoảng 10–20 Hz) và chỉ khi giá trị đổi; không đọc layout trong frame.
- Giới hạn pixel ratio, bóng đổ, hậu kỳ và số đèn; có các mức chất lượng (thấp/vừa/cao) và có thể tự hạ mức khi frame time kém kéo dài.
- Dùng instancing/gộp geometry, chia chunk và LOD, ẩn đối tượng ngoài tầm nhìn; giải phóng geometry/material/texture khi đổi xe hoặc đổi cảnh.
- Giữ ngân sách hiệu năng trong `src/perf/` (số draw call, triangles, số xe NPC tối đa); thay đổi vượt ngân sách phải được PM duyệt.
- Overlay chẩn đoán chỉ bật khi cần (ví dụ qua tham số URL hoặc phím tắt), không ảnh hưởng người chơi thường.

## Sẵn sàng online
Chỉ chuẩn bị kiến trúc, không viết code mạng khi chưa được yêu cầu.
- Tách trạng thái mô phỏng (xe người chơi, NPC, đèn giao thông, đồng hồ) khỏi object Three.js; state tuần tự hóa được và có ID ổn định cho mọi thực thể.
- Input đi qua lớp lệnh có số tick; physics không đọc trực tiếp bàn phím.
- Không dùng `Math.random` trong mô phỏng; dùng RNG có seed để tái lập từ (seed, tick).
- Game chạy qua interface `NetworkAdapter` với một cài đặt local/no-op; hỗ trợ lấy và nạp snapshot.
- Không thêm dependency mạng, không mở kết nối, không backend. Tài liệu hóa lựa chọn trong `docs/online-readiness.md`.

## Kiểm tra và báo cáo
- `npm test`: logic xe, truyền động, tuning, audio, UI và tính năng mới.
- `npm run build`: TypeScript và production build. Không có script lint riêng hiện tại.
- Logic mới về tiền, save và đua phải có test cho thành công và các tình huống lỗi quan trọng.
- Mô phỏng phải tất định: cùng seed và cùng chuỗi input cho cùng state sau N tick (có test).
- Test hiệu năng dạng hồi quy ở mức logic (ví dụ không rò rỉ tài nguyên sau nhiều lần đổi xe, pool không vượt giới hạn); số FPS thật chỉ đo thủ công trên thiết bị.
- Thử trực tiếp luồng chọn/mua xe, preview 3D, đua, tải lại tiến trình, pause và cảm ứng khi có môi trường hỗ trợ.
- Báo cáo phần đã làm, kết quả kiểm tra (số liệu thật) và giới hạn chưa xác minh; cập nhật README khi hành vi thay đổi.

<!-- postman-cli:installation:start -->
Postman CLI is installed on this device, and can be used for API Engineering work.
<!-- postman-cli:installation:end -->
