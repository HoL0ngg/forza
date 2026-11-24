# Mô phỏng và thiết kế chơi cùng bạn bè

## Hợp đồng đang chạy

`SimulationSession` chạy một lượt cập nhật cho mỗi tick 1/120 giây. Tick 0 biểu thị trạng thái ban đầu. Trình điều phối đọc bàn phím hoặc cảm ứng, gửi trục ga, phanh, lái, phanh tay và danh sách thao tác rời rạc qua `NetworkAdapter`. Ví dụ, chuyển sang số tay rồi lên số trong cùng một tick được xử lý theo đúng thứ tự. `player-1` là ID người lái trong phiên chơi đơn. Chỉ lệnh của người lái ấy và đúng tick kế tiếp được dùng.

Trong một tick, phiên áp dụng lệnh, chạy bicycle và hộp số, cập nhật giao thông, xử lý biên bản đồ rồi kiểm tra checkpoint. Renderer đọc trạng thái sau tick để đặt xe, camera và các instance trong cảnh. Pause ngừng gọi `advance`. Đồng hồ đèn, đồng hồ đua và RNG chỉ tiến cùng mô phỏng. Phép đo thời gian CPU dùng cho chẩn đoán nằm ngoài snapshot.

`LocalNetworkAdapter` chuyển lệnh qua một ô nhớ dùng lại. `receiveInput(tick)` chỉ lấy lệnh khớp tick. Sau khi xử lý, ô nhớ dùng lại được ở tick kế tiếp. Snapshot có đường gửi/nhận riêng và được sao chép khi gửi. Việc này cho phép game chơi đơn chạy qua đúng giao diện mà một transport sau này có thể triển khai.

## Snapshot, khôi phục và tái lập

`session.getSnapshot()` chụp giữa hai tick. Có thể tuần tự hóa bằng `JSON.stringify`, đọc lại bằng `JSON.parse` và gọi `session.loadSnapshot(snapshot)` trên phiên cùng bản đồ, cùng mẫu xe. Định dạng v1 chứa tick, ID, trạng thái người lái, tuning, hộp số (kể cả số đang chờ và thời gian sang số), trạng thái đua (checkpoint kế tiếp và vị trí lần trước), đối tượng giao thông, mật độ và trạng thái RNG. Đèn dùng lịch theo tick và dữ liệu cố định của giao lộ. Geometry, texture, DOM và âm thanh được quản lý ở lớp hiển thị.

ID số của NPC có phạm vi theo bản đồ và loại thực thể. Ví dụ, xe số 0, người đi bộ số 0 và tín hiệu giao lộ số 0 trên bản đồ `city` được phân biệt bằng bộ `(worldId, loại, id)`. ID làn là chỉ mục ổn định của đồ thị trong cùng phiên bản layout. Renderer có thể dùng lại một instance hiển thị qua nhiều frame mà không đổi ID mô phỏng.

Khôi phục một snapshot không tự phát thưởng. Trong cùng phiên, một cuộc đua đã hoàn thành chỉ phát sự kiện thưởng một lần kể cả khi tua lại trước vạch đích. Quyền sở hữu, credits và preset dài hạn vẫn dùng các cơ chế lưu hiện có. Snapshot mô phỏng được dùng trong bộ nhớ và kiểm thử, chưa có màn hình lưu/tải replay.

Cùng phiên bản layout và thuật toán, cùng seed và cùng cấu hình cho phép hai máy tính lại các quỹ đạo giao thông bằng cách chạy đến cùng tick. Vị trí người lái chọn tập thực thể gần để hiển thị và xử lý tiếp xúc. Hai người ở hai khu phố có thể thấy hai tập khác nhau, nhưng một xe NPC có cùng ID phải ở cùng vị trí khi họ gặp lại. Va chạm đơn giản chỉ tác động lên xe người chơi. Host có thể gửi seed, tick và thay đổi cấu hình chung thay vì truyền từng NPC ở mọi tick.

Để tái lập cả xe người chơi cần thêm mẫu xe, tuning ban đầu và cùng lịch lệnh lái. Đổi bản đồ bắt đầu một phiên mới. Đổi xe hủy cuộc đua và giữ tick của giao thông trong cảnh. Đổi mật độ, áp dụng tuning hoặc thao tác menu giữa các tick cũng phải được ghi vào lịch sự kiện nếu muốn phát lại cả phiên từ đầu. Máy vào muộn có thể dùng snapshot đầy đủ để tránh tính lại từ tick 0. Mức tái lập giữa các engine JavaScript và nền tảng khác nhau cần được đo.

## Phương án cho nhóm bạn bè nhỏ

Đề xuất một người mở phòng làm **host-authoritative**. Host quyết định tick, vị trí xe, vùng sinh NPC, checkpoint và kết quả. Client gửi lệnh có tick, ID và số thứ tự. Khi có nhiều tài xế, host cần quyết định cách chia ngân sách NPC hiển thị cho từng máy, ai xử lý tiếp xúc với người chơi và cách mở rộng đội xe khi nhóm tách xa nhau. ID người chơi, phiên, cuộc đua và thế hệ đối tượng sẽ cần duy nhất trong cả phòng.

Client có thể dự đoán riêng xe mình để phản hồi thao tác ngay. Khi nhận snapshot mới, client quay về tick đã xác nhận, áp lại những lệnh còn thiếu và làm mượt phần hiển thị. Với xe khác có thể giữ một bộ đệm snapshot và nội suy giữa hai mẫu. Tần suất gửi snapshot, độ dài bộ đệm và mức sửa sai phải được chọn qua đo độ trễ, jitter và mất gói. 120 Hz là nhịp mô phỏng cục bộ.

| Phương án vận chuyển | Hạ tầng và đánh đổi |
| --- | --- |
| WebRTC DataChannel | Cần một signaling server để trao đổi thông tin lập kết nối khi mở phòng. Triển khai thực tế cần xét STUN/TURN cho NAT, chi phí relay và việc host rời phòng. Có thể tách lệnh cần giao theo thứ tự khỏi snapshot đã cũ. [MDN về signaling](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Signaling_and_video_calling) |
| WebSocket | Cần backend nhận kết nối và xử lý phòng hoặc chuyển tiếp tới host. Kênh tin cậy, có thứ tự giúp triển khai đơn giản hơn, nhưng một gói chậm có thể làm các cập nhật sau phải chờ. [MDN về WebSocket server](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Writing_WebSocket_servers) |

## Gian lận, tiến trình và việc còn mở

Host phải kiểm tra người gửi, quyền điều khiển xe, tick, tốc độ gửi, giới hạn input/tuning và thứ tự checkpoint. Chơi cùng bạn bè vẫn phụ thuộc vào độ tin cậy của host. Người chơi có thể sửa hồ sơ cục bộ. Việc nạp snapshot thành công chỉ chứng minh định dạng phù hợp với mô phỏng.

Nếu các phòng chia sẻ một nền kinh tế, cần một nguồn quyết toán credits đáng tin, mã giao dịch để xử lý lại an toàn và quy tắc xử lý xung đột giữa các bản save. Bản thử nhóm bạn có thể giữ toàn bộ shop và tiến trình ở từng máy, tách kết quả phòng khỏi phần thưởng lâu dài cho tới khi có mô hình tin cậy phù hợp.

Các quyết định còn mở gồm định danh và mời bạn, signaling/backend, chống spam, bắt tay kiểm tra phiên bản, mã hóa payload, giới hạn kích thước, bắt nhịp đồng hồ, chính sách input trễ, xác nhận lệnh, rejoin và chuyển host. Cần đo băng thông, kiểm thử desync qua nhiều trình duyệt, thử lỗi mạng và quyết định chi phí vận hành trước khi chọn transport. Lát cắt này chỉ có adapter cục bộ.
