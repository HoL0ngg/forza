# Hiệu năng giao thông thành phố

## Chi phí CPU trong bài chạy lại

Node.js 24.22.3 trên Linux, không có WebGL. Mỗi dòng là một tiến trình riêng chạy cùng một vòng thành phố với GT–01, seed 2026. Bỏ 600 khung làm nóng, thu 6.000 khung kế tiếp. Mỗi khung đặt người quan sát ở mẫu đường kế tiếp trên hành trình, chạy hai tick 120 Hz rồi cập nhật model xe, cảnh, cổng đua và các instance giao thông. Bảng dùng mili giây. Mọi p95 được lấy trên từng khung, gồm cả các khung AI tính lại quyết định.

| Phiên bản / mức | CPU khung TB / p95 | Toàn mô phỏng TB / p95 | Giao thông: hai tick TB / p95 | Cập nhật instance TB / p95 | Giao thông tổng TB / p95 | Xe + cảnh + cổng đua TB / p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Trước C/D, `5b21e11` | 0,01347 / 0,01649 | 0,01261 / 0,01569 | 0 / 0 | 0 / 0 | 0 / 0 | 0,00077 / 0,00123 |
| Tắt | 0,01721 / 0,02257 | 0,01596 / 0,02144 | 0,00038 / 0,00041 | 0,00015 / 0,00023 | 0,00052 / 0,00059 | 0,00110 / 0,00127 |
| Thấp | 0,02494 / 0,05025 | 0,02249 / 0,04293 | 0,00630 / 0,01231 | 0,00145 / 0,00388 | 0,00775 / 0,01539 | 0,00100 / 0,00151 |
| Vừa | 0,02701 / 0,05859 | 0,02459 / 0,05157 | 0,01012 / 0,02284 | 0,00151 / 0,00418 | 0,01163 / 0,02585 | 0,00091 / 0,00130 |
| Cao | 0,03651 / 0,09360 | 0,03328 / 0,08547 | 0,01667 / 0,04974 | 0,00212 / 0,00369 | 0,01880 / 0,05481 | 0,00110 / 0,00161 |

Cột toàn mô phỏng bao gồm hai tick giao thông. Cột giao thông tổng cộng thời gian AI và cập nhật instance trong từng khung trước khi lấy p95. CPU khung bao gồm hai phần trên, xử lý đường/biên, physics, đua và cập nhật cảnh. Phép đo bỏ qua camera, DOM, âm thanh, WebGL, GPU và chờ màn hình. Muốn chạy lại ở mức Cao:

```sh
node --import tsx scripts/benchmark-traffic.mjs high
```

Có thể thay `high` bằng `off`, `low` hoặc `medium`. Để đo bản gốc, mở một worktree ở `5b21e11`, cài dependency theo lockfile, rồi từ thư mục gốc worktree đó chạy cùng script ở nhánh mới với đối số `--baseline` (script lấy mã nguồn theo thư mục làm việc).

## Số lượng thực thể và hình học

| Mức | Ngân sách xe toàn thành phố | Xe trong bán kính hiển thị TB / đỉnh | Đỉnh người đi bộ | Batch / tam giác toàn cảnh ở mẫu cuối | Geometry / texture tham chiếu trong scene |
| --- | ---: | ---: | ---: | ---: | ---: |
| Trước C/D | 0 | 0 / 0 | 0 | 104 / 77.732 | 109 / 0 |
| Tắt | 0 | 0 / 0 | 0 | 106 / 84.540 | 118 / 0 |
| Thấp | 8 | 1,36 / 3 | 4 | 110 / 86.124 | 118 / 0 |
| Vừa | 16 | 3,30 / 6 | 4 | 111 / 86.388 | 118 / 0 |
| Cao | 28 | 5,30 / 9 | 4 | 112 / 86.652 | 118 / 0 |

Phần bổ sung cho bờ Đông cũng có mặt ở mức Tắt. Batch và tam giác trong bảng đếm từ cây cảnh Three.js sau khi loại các chunk ẩn, trước khi camera cắt tầm nhìn hoặc renderer vẽ các lượt bóng. Geometry được đếm theo tham chiếu duy nhất kể cả mesh ẩn. Node không tạo texture biển hiệu bằng Canvas. Trình duyệt sẽ có số đếm khác.

Riêng lớp giao thông tạo 7 geometry dùng lại, tối đa 7 batch cho một lượt vẽ chính. Ngân sách hồi quy là 9 batch, 9.000 tam giác, 28 xe và 8 người đi bộ. Trường hợp hình học lớn nhất hiện dùng 8.184 tam giác nếu hiển thị cả 28 xe buýt và 8 người cùng lúc. Đổi bản đồ gỡ toàn bộ nhóm và giải phóng geometry, material và bộ đệm instancing. Khi một NPC ra khỏi vùng nhìn, slot được dùng lại.

Xe tính khoảng cách bám đuôi, quyền vào giao lộ, đèn và tốc độ mục tiêu ở 10 Hz. Giữa hai lần này xe xa tiến dọc làn theo tick. Trong khoảng 245 m quanh người lái, game cập nhật đầy đủ tư thế các xe nhìn thấy và kiểm tra tiếp xúc gần. Áp dụng cùng lịch quyết định cho toàn thành phố giữ quỹ đạo độc lập với đường đi của người quan sát.

Trong phép thử HUD bằng jsdom với 1.200 khung mô phỏng, số thay đổi DOM ở cụm HUD lái giảm từ 4.560 còn 5 với giá trị ổn định, và còn 921 khi giá trị thay đổi. Kiểm thử đường chạy bổ sung dùng 3 seed, 60.000 tick mỗi seed ở mật độ Cao và lấy mẫu sau mỗi 30 tick. Khoảng cách cản xe nhỏ nhất trên cùng làn là 1,25 m. Không có mẫu nào hai tâm xe trên hai cạnh khác nhau cách nhau dưới 1,9 m. Đây là các kịch bản kiểm tra, không phải bảo đảm cho mọi tư thế xe.

## Đo trong trình duyệt

Mở thành phố với `?debug=1`, bắt đầu lái rồi chọn mức mật độ trong menu tạm dừng. HUD chẩn đoán cập nhật khoảng nửa giây một lần. Đọc frame time trung bình/p95 từ khoảng cách giữa các RAF; đọc draw call, triangles, geometry và texture từ `renderer.info`. Thời gian CPU cho physics/đua, giao thông, cảnh, xe/camera/âm thanh, HUD và lệnh render được đo riêng. Đo trên cùng thiết bị, camera, tuyến đường và mức đồ họa khi so sánh mật độ.

Chromium trong môi trường kiểm tra dừng lúc tạo socket trước khi mở WebGL. Kết quả ở đây chưa có FPS, thời gian GPU, draw call thực tế hoặc kiểm tra nhiệt/pin trên điện thoại. Cần đo cả trên điện thoại sau một lượt chạy dài trước khi điều chỉnh ngân sách.
