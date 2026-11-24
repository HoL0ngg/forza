# Coastline Drive

Game lái xe 3D chơi đơn trên trình duyệt, dùng Three.js, TypeScript và Vite. Khám phá một thành phố lấy cảm hứng từ TP. Hồ Chí Minh hoặc trở lại đường vòng ven biển. Garage, credits và tuning được lưu cục bộ.

## Chạy local

Cần Node.js 22.12+ và trình duyệt có WebGL 2.

```sh
npm ci
npm run dev
npm test
npm run build
```

Mở địa chỉ Vite in ra, thường là `http://127.0.0.1:5173/`. Có thể kiểm tra bản production cục bộ bằng `npm run preview`.

## Lái xe và chọn bản đồ

| Phím | Chức năng |
| --- | --- |
| W / ↑, S / ↓ | Ga, phanh. Ở Auto, giữ S sau khi dừng để lùi |
| A / ←, D / → | Lái trái, phải |
| Space | Phanh tay |
| R, C | Về đường gần nhất, đổi khoảng cách camera |
| T, E / Q | Đổi Auto/Manual, lên/xuống số ở Manual |
| B, G, M | Garage, tuning, bật/tắt âm thanh |
| Esc, H | Tạm dừng, hướng dẫn |
| F | Bắt đầu đua tính giờ ở bản đồ ven biển |

Thêm `?debug=1` vào URL để xem thời gian khung hình trung bình và p95, thời gian CPU cập nhật giao thông, số lệnh vẽ, tam giác và tài nguyên renderer. Ở Manual, từ số 1 khi xe dừng, bấm Q về N rồi R và dùng W để lùi. Số N cho phép lên ga tại chỗ. Trên màn hình cảm ứng, dùng các nút ga, phanh, lái và sang số trên HUD. Menu và mất focus tạm dừng mô phỏng và âm thanh, đồng thời xóa input đang giữ.

- **Thành phố Sông Sài Gòn** là bản đồ mặc định. Tuyến vòng khoảng 2,7 km đi qua Đại lộ Ánh Dương, Cầu Bắc, vòng xoay Bờ Đông và Cầu Nam. Xe xuất phát và được đưa lại đường ở làn phải. Minimap dùng cùng tọa độ với đường 3D và hiển thị vị trí xe, 5 địa danh và 8 checkpoint khám phá.
- **Ven biển** dùng lại tuyến đường gốc và chế độ đua tính giờ đã có. Các cổng phải được qua đúng thứ tự, đúng chiều. Hoàn thành nhận 10.000 CR và có thể lập kỷ lục mới. Đổi xe, đổi bản đồ, đặt lại xe hoặc hủy đua sẽ dừng lượt hiện tại.
- Dùng mục **Bản đồ** để đổi cảnh ngay trong game. Xe về điểm xuất phát của bản đồ mới và giữ cấu hình tuning đang dùng. URL `?map=coast` mở đường ven biển.

Các địa danh hư cấu gồm Tháp Hừng Đông, Tháp Bến Trời với bãi đáp trực thăng, Nhà thờ Gạch Son, Bưu điện Vòm Vàng và Dinh Vườn Lớn. Chiều cao, vị trí và tỷ lệ được thiết kế cho tuyến lái xe trong game.

## Giao thông thành phố

Trong menu **Tạm nghỉ → Mật độ giao thông**, chọn **Tắt / Thấp / Vừa / Cao**. Mức mặc định là Vừa. Trình duyệt ghi nhớ lựa chọn này cho lần mở sau. Bốn mức tương ứng 0, 8, 16 và 28 xe trên toàn thành phố, tối đa 8 người đi bộ. Xe hatchback, sedan, tải nhỏ và buýt chạy làn phải trên đường chính và đường nối bờ Đông, giảm tốc trước cua, chờ đèn tại giao lộ và nhường xe đang chạy trong vòng xoay. Người đi bộ đi trên vỉa hè và dùng vạch qua đường theo pha đèn. Người lái có thể chạm xe NPC khi khám phá. Game kiểm tra chồng lấn, giảm tốc và dịch xe nhẹ. Người đi bộ chỉ là cảnh nền.

Giao thông dừng cùng game khi mở menu hoặc mất focus. Time trial ven biển tắt NPC để cùng một đường đua có điều kiện giống nhau ở mọi mức mật độ.

## Garage và tuning

| Hãng | Xe | Đặc trưng | Giá |
| --- | --- | --- | --- |
| Coastline | GT–01 | Xe mặc định, dẫn động cầu sau | Sở hữu sẵn |
| Vekrivar | Pico S | Hatchback đô thị nhẹ, dẫn động cầu trước, phản hồi lái nhanh | 12.000 CR |
| Sovareth | Aureline R | Coupé cân bằng, bốn bánh chủ động, tỉ số truyền và phanh thiên về đường nhựa | 28.000 CR |
| Talvorix | Veltrum V8 | Thân dài nặng hơn, mô-men cao, số cuối dài | 38.000 CR |

Garage có xem trước 3D, lọc theo hãng và so sánh thông số xuất xưởng với xe đang lái. Hồ sơ mới có GT–01 và 30.000 CR. Duyệt được cả bốn xe. Mua xe bằng credits trong game để đưa xe vào danh sách sở hữu, rồi chọn **Cầm lái xe này**. Mua và chọn xe là hai thao tác riêng.

**Lưu preset** ghi cấu hình theo ID xe. **Tải preset** đưa dữ liệu vào bảng chỉnh. **Áp dụng** thay cấu hình đang chạy. Preset đã lưu tự nạp khi vào lại hoặc chuyển sang xe tương ứng. Preset GT–01 đời đầu được đọc từ khóa cũ khi cần, và bản gốc được giữ lại.

Tiến trình dùng localStorage có phiên bản và thuộc origin đang mở. ID trong hồ sơ cũ được chuyển từ `coast-rally` sang `sakura-sprint` (Pico S) và từ `ferro-gt` sang `sakura-rs` (Aureline R). Nếu đã sở hữu cả xe cũ lẫn xe thay thế, hồ sơ giữ một xe thay thế. Credits và kỷ lục ven biển được giữ. Preset của xe ngừng bán được dùng cho xe thay thế nếu xe thay thế chưa có preset riêng và cấu hình tương thích. Bản ghi gốc giữ nguyên kể cả khi cấu hình cũ nằm ngoài giới hạn của xe mới. Dữ liệu hỏng dùng mặc định, và ứng dụng báo lỗi nếu trình duyệt từ chối lưu.

## Kỹ thuật và tài sản

- `src/data/vehicles/` giữ danh mục bất biến và xác thực cấu hình. `src/vehicles/` tạo và giải phóng runtime xe. `src/progression/` và `src/tuning/` xử lý dữ liệu người chơi và preset theo xe.
- `src/world/` dựng đường, bản đồ và các model procedural. `src/ui/` chứa HUD, garage và bảng tuning. `src/racing/` giữ luật time trial ven biển.
- Xe chạy bằng mô hình bicycle ở 120 Hz. Tỉ số truyền, mô-men, khối lượng, lực cản, grip và góc lái tác động trực tiếp vào mô phỏng. Công suất trong garage là số ước tính từ torque curve ở cấu hình xuất xưởng.
- Hình khối xe, đường, nhà, landmark, biển hiệu và màu sắc là tài sản procedural tự thiết kế trong repo. Bố cục thành phố được vẽ tay và cách điệu. Dự án dùng hình học toán học, không nhập tập dữ liệu bản đồ, ảnh, texture, model 3D hay bản thu âm bên ngoài. Âm thanh động cơ được tổng hợp bằng Web Audio.
- Các cụm hình học lặp lại được vẽ bằng instancing. Nhà phố, cây và đèn được gom theo ô, chỉ bật các ô trong vùng quanh xe. Đồ họa Cao giới hạn pixel ratio ở 1,6 và bật bóng. Mức Vừa giới hạn ở 1,25, mức Tiết kiệm ở 1, cả hai tắt bóng. Tài nguyên cảnh và xe được giải phóng khi thay cảnh hoặc thay xe. FPS trên thiết bị thật chưa được đo.

Giao diện ưu tiên Be Vietnam Pro và Barlow Condensed nếu đã cài trên máy, rồi dùng font hệ thống. Xe NPC, người đi bộ và đèn giao thông cũng dùng hình học procedural của dự án. Khi chơi, ứng dụng không cần dịch vụ font hoặc dữ liệu giao thông bên ngoài.

## Giới hạn và hướng tiếp theo

Vật lý đất/đường chỉ phân biệt bề mặt và áp dụng biên phục hồi đơn giản. Nhà, cây, biển hiệu và lan can là cảnh quan. Va chạm với cảnh quan và xe máy chưa được mô phỏng. Checkpoint thành phố là mốc tuyến. Time trial tính thưởng hiện có chạy ở ven biển.

Các bước tiếp theo có thể gồm thử xe máy trên làn hỗn hợp, mở thêm time trial thành phố và cân bằng giá shop với phần thưởng. Với phòng chơi bạn bè, cần chọn transport, cách mời bạn và cơ chế xác nhận kết quả trước khi nối với credits.

Mô phỏng dùng lệnh theo tick và adapter cục bộ. Người phát triển có thể gọi `getSnapshot()` và `loadSnapshot(snapshot)` trên `Game` hoặc `SimulationSession` giữa hai tick, với cùng bản đồ và mẫu xe. Snapshot JSON giữ trạng thái NPC, người đi bộ, đèn, hộp số và đua. Nạp snapshot trong game xóa input đang giữ và giữ nguyên trạng thái mở menu cùng hồ sơ credits. Xem [thiết kế online](docs/online-readiness.md) và [số đo hiệu năng giao thông](docs/performance.md).
