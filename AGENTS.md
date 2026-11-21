# Coastline Drive — hướng dẫn phát triển

## Tầm nhìn
Game lái xe thế giới mở 3D lấy cảm hứng từ trải nghiệm khám phá và sưu tập xe của Forza Horizon, chạy gameplay hoàn toàn trên trình duyệt. Dùng tên, thiết kế và tài sản riêng; ghi nguồn và giấy phép của tài sản nhập vào. Ưu tiên cảm giác lái arcade dễ chơi, nhiều hãng xe, garage, shop và tiến trình rõ ràng.

Vòng chơi: khám phá hoặc đua → nhận credits → mua xe → chọn xe và tuning → tiếp tục đua. Bản đầu chơi đơn, tiền trong game và hãng hư cấu. Không tự thêm thanh toán tiền thật, multiplayer hay backend.

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
- `tests/`: kiểm tra logic và giao diện với Node test runner/jsdom.

## Quy tắc triển khai
- Đọc code liên quan và mọi caller trước khi sửa. Giữ thay đổi nhỏ nhưng hoàn chỉnh; tận dụng module và dependency hiện có.
- Thêm xe phải cập nhật definition, validation, registry, hình ảnh và kiểm tra liên quan; xe cần khác biệt về thông số và ngoại hình, không chỉ đổi tên.
- Tách dữ liệu danh mục xe khỏi quyền sở hữu của người chơi. Không cho chọn xe chưa sở hữu, mua trùng hoặc giao dịch vượt số credits.
- Save có version; kiểm tra dữ liệu đọc vào, giữ preset cũ khi migration lỗi, thông báo khi không lưu được. Lưu tuning riêng theo vehicle ID.
- Đua chỉ thưởng sau khi qua checkpoint đúng thứ tự và hoàn thành; reset, đổi xe hoặc hủy đua không được nhận thưởng.
- Pause/menu/mất focus phải ngừng simulation đua và âm thanh, xóa input đang giữ. Không dùng thời gian thực để cộng thời gian đua khi pause.
- Giữ tiết kiệm draw call/pixel ratio và giải phóng tài nguyên. Không cam kết FPS khi chưa đo trên thiết bị thật.
- Hoàn thành từng lát cắt: nhiều xe/garage → time trial → shop/tiến trình → chất lượng hình ảnh, âm thanh và thế giới.
- Không tự push, xuất bản hay deploy nếu chưa được yêu cầu. Dùng subagent khi người dùng yêu cầu; phân quyền file rõ ràng, thống nhất interface và kiểm tra tích hợp.

## Kiểm tra và báo cáo
- `npm test`: logic xe, truyền động, tuning, audio, UI và tính năng mới.
- `npm run build`: TypeScript và production build. Không có script lint riêng hiện tại.
- Logic mới về tiền, save và đua phải có test cho thành công và các tình huống lỗi quan trọng.
- Thử trực tiếp luồng chọn/mua xe, preview 3D, đua, tải lại tiến trình, pause và cảm ứng khi có môi trường hỗ trợ.
- Báo cáo phần đã làm, kết quả kiểm tra và giới hạn chưa xác minh; cập nhật README khi hành vi thay đổi.

<!-- postman-cli:installation:start -->
Postman CLI is installed on this device, and can be used for API Engineering work.
<!-- postman-cli:installation:end -->
