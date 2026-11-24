# Hiệu năng desktop

## Cách đọc kết quả

Đo trên Linux, Node.js 24.22.3, dùng đúng `Game`, Three.js, physics, traffic và giao diện qua Vite/jsdom. Chromium dừng ở bước tạo socket, trước khi có WebGL. Cổng render đếm yêu cầu vẽ, cổng Web Audio đếm yêu cầu lập lịch. Số mili giây trong benchmark là thời gian CPU thực thi callback trên máy đo. Thời gian giữa các RAF trong game thật, thời gian GPU, quá trình upload texture, hiển thị CSS, âm thanh phát ra và FPS vẫn cần quan sát trên trình duyệt desktop.

Lệnh đầu chạy giao diện với profile thử nghiệm trong bộ nhớ. Lệnh thứ hai quét 120 vị trí camera trên mỗi bản đồ và tính cả lượt bóng của mặt trời. Cả hai đọc source từ thư mục làm việc. Muốn đo một commit cũ, vào worktree ở commit đó với dependency từ lockfile rồi dùng đường dẫn tuyệt đối đến script ở nhánh hiện tại.

```sh
node src/perf/benchmark.mjs
node --import tsx src/perf/benchmark-scene.mjs gt01 high
```

- **Màn đầu và showroom tĩnh** chạy mỗi cảnh 120 callback làm nóng, sau đó đo 900 callback với đồng hồ đầu vào 60 Hz. Garage mở và xem GT–01. Ở màn đầu, xe nằm trong cảnh game. Ở garage có thêm renderer cho mẫu xem trước.
- **Đổi xe** thực hiện 20 lần trong garage, tuần tự qua cả 4 mẫu đã sở hữu. Mỗi mẫu được chọn qua nút garage, dựng preview, áp dụng vào xe đang lái rồi gọi một callback. Thời gian gồm xử lý sự kiện và tạo/hủy model. Sau mỗi 4 lần, kiểm tra số đối tượng của cùng mẫu. Với 20 mẫu, p99 là mẫu chậm nhất.
- **Lái nhanh** đo riêng thành phố và ven biển, mỗi nơi 180 callback làm nóng và 1.500 callback đo. Xe GT–01 được đặt lên đường chính theo tiến độ ở 42 m/s (151,2 km/h), rồi physics chạy qua vòng lặp thật với ga W. Việc đặt tư thế chuẩn trước mỗi mẫu nằm ngoài đồng hồ CPU, giúp so sánh cùng một tuyến. Chạy mức Cao, mật độ Vừa, kích thước cửa sổ 1280×800, device pixel ratio 2; engine dùng seed cố định của game.
- Ở từng commit, chạy ba tiến trình độc lập, chọn trung vị của ba giá trị trung bình, của ba p95 và của ba p99. Thời gian gồm chi phí instrumentation và chịu nhiễu JIT/GC/lịch CPU. Quyết định giữ thay đổi dựa thêm trên đếm công việc cùng dữ liệu và trạng thái.

## Kết quả trước và sau từng sửa

Mỗi ô là **trung bình / p95 / p99** CPU, đơn vị ms cho một callback hoặc một lần đổi xe.

| Commit và thay đổi | Màn đầu | Garage tĩnh | Đổi xe ×20 | Lái thành phố | Lái ven biển |
| --- | ---: | ---: | ---: | ---: | ---: |
| `13893ce` Gốc C/D | 0,2705 / 1,6439 / 2,5462 | 0,2182 / 1,1572 / 1,6544 | 12,0498 / 16,0323 / 22,6935 | 0,2746 / 1,3125 / 1,9255 | 0,2067 / 1,0362 / 1,5936 |
| `c10746b` Vẽ theo thay đổi | 0,0006 / 0,0008 / 0,0051 | 0,0004 / 0,0002 / 0,0019 | 14,6955 / 22,7438 / 27,2155 | 0,2984 / 1,4041 / 1,9265 | 0,2316 / 1,2007 / 1,7553 |
| `87f5871` Cây dừa theo cụm | 0,0006 / 0,0008 / 0,0043 | 0,0003 / 0,0003 / 0,0018 | 15,1713 / 22,2647 / 34,9314 | 0,3269 / 1,5888 / 2,3200 | 0,2433 / 1,2880 / 1,7168 |
| `c49d9f5` Bộ đệm preview | 0,0005 / 0,0008 / 0,0049 | 0,0004 / 0,0003 / 0,0021 | 16,6992 / 25,2422 / 68,7138 | 0,3000 / 1,4480 / 1,9898 | 0,2580 / 1,3594 / 1,9422 |
| `bf5f5b8` Mức đồ họa và đo | 0,0008 / 0,0011 / 0,0076 | 0,0003 / 0,0003 / 0,0018 | 15,6185 / 24,9809 / 29,3351 | 0,3527 / 1,3535 / 2,0748 | 0,2197 / 1,0830 / 1,3995 |
| `c8bb7c8` Chi tiết xe | 0,0008 / 0,0008 / 0,0144 | 0,0005 / 0,0003 / 0,0127 | 16,8004 / 28,6906 / 38,0546 | 0,3271 / 1,5230 / 2,1386 | 0,2923 / 1,3360 / 2,2564 |
| `f20e6d3` Trạng thái HUD | 0,0013 / 0,0015 / 0,0230 | 0,0006 / 0,0003 / 0,0135 | 13,8580 / 23,5716 / 29,9699 | 0,0589 / 0,1644 / 0,3182 | 0,0205 / 0,0507 / 0,1216 |
| `be1a4a1` Ô so sánh garage | 0,0010 / 0,0010 / 0,0164 | 0,0005 / 0,0003 / 0,0018 | 13,2243 / 21,1174 / 29,2460 | 0,0705 / 0,2063 / 0,5002 | 0,0240 / 0,0613 / 0,2217 |
| `750afdf` Định dạng đồng hồ | 0,0007 / 0,0011 / 0,0075 | 0,0003 / 0,0002 / 0,0017 | 12,8498 / 21,5847 / 23,9413 | 0,0622 / 0,1628 / 0,6660 | 0,0151 / 0,0257 / 0,0973 |
| `8ef9d89` Preview khi tab ẩn | 0,0007 / 0,0010 / 0,0054 | 0,0003 / 0,0003 / 0,0018 | 12,0548 / 23,4692 / 24,3728 | 0,0506 / 0,1311 / 0,2725 | 0,0195 / 0,0410 / 0,1469 |
| `400f298` Target âm thanh | 0,0006 / 0,0010 / 0,0056 | 0,0002 / 0,0002 / 0,0017 | 11,8430 / 16,6052 / 28,6883 | 0,0517 / 0,1463 / 0,3460 | 0,0185 / 0,0390 / 0,1138 |

### Thời gian và tài nguyên theo hệ thống

Mỗi dòng là một lần chạy kịch bản, với thời gian trung bình của từng hệ thống trên một callback (ms). Physics đo `Vehicle.update` gồm hộp số. Tra cứu bề mặt và vòng điều phối vẫn nằm trong tổng CPU phía trên. HUD đo `Hud.update` và `Game.updateProgress`. Traffic đo `TrafficSimulation.step`. Cột cảnh ghi **batch / tam giác** tại thời điểm kết thúc sau khi loại chunk ẩn, trước frustum và shadow. Cột G/M/T là số geometry/material/texture *khác nhau được tham chiếu* trong cây cảnh và preview đang mở. Các số này không đo VRAM, và giữ nguyên dù một frame tĩnh hoàn toàn bỏ render. Dưới đây là tất cả bản đo dùng để quyết định giữ hay bỏ tối ưu.

<details>
<summary>Bảng từng kịch bản và từng commit</summary>

| Commit | Kịch bản | Physics | Camera | HUD | Audio | World | Traffic | Vẽ chính / preview | Cảnh batch / tam giác | G/M/T |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `13893ce` | title | 0,0000 | 0,0054 | 0,2539 | 0,0005 | 0,0022 | 0,0000 | 900 / 0 | 116 / 89.954 | 123/95/5 |
| `13893ce` | garage | 0,0000 | 0,0024 | 0,2086 | 0,0002 | 0,0006 | 0,0000 | 900 / 0 | 168 / 91.172 | 150/102/5 |
| `13893ce` | swap | 0,0000 | 0,0210 | 2,6372 | 0,0007 | 0,0042 | 0,0000 | 20 / 20 | 168 / 91.172 | 150/102/5 |
| `13893ce` | city | 0,0029 | 0,0022 | 0,2271 | 0,0009 | 0,0006 | 0,0123 | 1500 / 0 | 119 / 81.458 | 123/95/5 |
| `13893ce` | coast | 0,0014 | 0,0018 | 0,1889 | 0,0007 | 0,0002 | 0,0003 | 1500 / 0 | 378 / 56.730 | 96/23/1 |
| `c10746b` | title | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0 / 0 | 116 / 89.954 | 123/95/5 |
| `c10746b` | garage | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0 / 0 | 168 / 91.172 | 150/102/5 |
| `c10746b` | swap | 0,0000 | 0,0669 | 3,4583 | 0,0013 | 0,0196 | 0,0000 | 20 / 20 | 168 / 91.172 | 150/102/5 |
| `c10746b` | city | 0,0021 | 0,0035 | 0,2471 | 0,0008 | 0,0011 | 0,0136 | 1500 / 0 | 119 / 81.458 | 123/95/5 |
| `c10746b` | coast | 0,0014 | 0,0016 | 0,2130 | 0,0006 | 0,0003 | 0,0005 | 1500 / 0 | 378 / 56.730 | 96/23/1 |
| `87f5871` | title | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0 / 0 | 116 / 89.954 | 123/95/5 |
| `87f5871` | garage | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0 / 0 | 168 / 91.172 | 150/102/5 |
| `87f5871` | swap | 0,0000 | 0,0860 | 3,3474 | 0,0014 | 0,0209 | 0,0000 | 20 / 20 | 168 / 91.172 | 150/102/5 |
| `87f5871` | city | 0,0024 | 0,0028 | 0,2751 | 0,0008 | 0,0012 | 0,0135 | 1500 / 0 | 119 / 81.458 | 123/95/5 |
| `87f5871` | coast | 0,0017 | 0,0019 | 0,2240 | 0,0008 | 0,0003 | 0,0005 | 1500 / 0 | 138 / 56.730 | 65/23/1 |
| `c49d9f5` | title | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0 / 0 | 116 / 89.954 | 123/95/5 |
| `c49d9f5` | garage | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0 / 0 | 168 / 91.172 | 150/102/5 |
| `c49d9f5` | swap | 0,0000 | 0,1190 | 3,2055 | 0,0021 | 0,0336 | 0,0000 | 20 / 20 | 168 / 91.172 | 150/102/5 |
| `c49d9f5` | city | 0,0023 | 0,0028 | 0,2500 | 0,0008 | 0,0010 | 0,0139 | 1500 / 0 | 119 / 81.458 | 123/95/5 |
| `c49d9f5` | coast | 0,0016 | 0,0019 | 0,2368 | 0,0006 | 0,0003 | 0,0004 | 1500 / 0 | 138 / 56.730 | 65/23/1 |
| `bf5f5b8` | title | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0 / 0 | 116 / 89.954 | 123/95/5 |
| `bf5f5b8` | garage | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0 / 0 | 168 / 91.172 | 150/102/5 |
| `bf5f5b8` | swap | 0,0000 | 0,1023 | 3,2060 | 0,0000 | 0,0271 | 0,0000 | 20 / 20 | 168 / 91.172 | 150/102/5 |
| `bf5f5b8` | city | 0,0022 | 0,0027 | 0,3017 | 0,0012 | 0,0013 | 0,0129 | 1500 / 0 | 119 / 81.458 | 123/95/5 |
| `bf5f5b8` | coast | 0,0014 | 0,0024 | 0,2013 | 0,0006 | 0,0004 | 0,0004 | 1500 / 0 | 138 / 56.730 | 65/23/1 |
| `c8bb7c8` | title | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0 / 0 | 83 / 89.954 | 106/95/5 |
| `c8bb7c8` | garage | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0 / 0 | 102 / 91.172 | 116/102/5 |
| `c8bb7c8` | swap | 0,0000 | 0,0891 | 3,4240 | 0,0000 | 0,0312 | 0,0000 | 20 / 20 | 102 / 91.172 | 116/102/5 |
| `c8bb7c8` | city | 0,0025 | 0,0031 | 0,2741 | 0,0009 | 0,0016 | 0,0142 | 1500 / 0 | 86 / 81.458 | 106/95/5 |
| `c8bb7c8` | coast | 0,0016 | 0,0020 | 0,2703 | 0,0009 | 0,0004 | 0,0005 | 1500 / 0 | 105 / 56.730 | 48/23/1 |
| `f20e6d3` | title | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0 / 0 | 83 / 89.954 | 106/95/5 |
| `f20e6d3` | garage | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0 / 0 | 102 / 91.172 | 116/102/5 |
| `f20e6d3` | swap | 0,0000 | 0,0731 | 0,2523 | 0,0000 | 0,0405 | 0,0000 | 20 / 20 | 102 / 91.172 | 116/102/5 |
| `f20e6d3` | city | 0,0020 | 0,0028 | 0,0120 | 0,0008 | 0,0015 | 0,0135 | 1500 / 0 | 86 / 81.458 | 106/95/5 |
| `f20e6d3` | coast | 0,0010 | 0,0014 | 0,0056 | 0,0004 | 0,0005 | 0,0003 | 1500 / 0 | 105 / 56.730 | 48/23/1 |
| `be1a4a1` | title | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0 / 0 | 83 / 89.954 | 106/95/5 |
| `be1a4a1` | garage | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0 / 0 | 102 / 91.172 | 116/102/5 |
| `be1a4a1` | swap | 0,0000 | 0,0813 | 0,3077 | 0,0000 | 0,0226 | 0,0000 | 20 / 20 | 102 / 91.172 | 116/102/5 |
| `be1a4a1` | city | 0,0019 | 0,0027 | 0,0131 | 0,0009 | 0,0013 | 0,0154 | 1500 / 0 | 86 / 81.458 | 106/95/5 |
| `be1a4a1` | coast | 0,0010 | 0,0014 | 0,0074 | 0,0004 | 0,0003 | 0,0003 | 1500 / 0 | 105 / 56.730 | 48/23/1 |
| `750afdf` | title | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0 / 0 | 83 / 89.954 | 106/95/5 |
| `750afdf` | garage | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0 / 0 | 102 / 91.172 | 116/102/5 |
| `750afdf` | swap | 0,0000 | 0,0704 | 0,1854 | 0,0000 | 0,0190 | 0,0000 | 20 / 20 | 102 / 91.172 | 116/102/5 |
| `750afdf` | city | 0,0031 | 0,0026 | 0,0058 | 0,0010 | 0,0015 | 0,0134 | 1500 / 0 | 86 / 81.458 | 106/95/5 |
| `750afdf` | coast | 0,0009 | 0,0009 | 0,0015 | 0,0004 | 0,0003 | 0,0003 | 1500 / 0 | 105 / 56.730 | 48/23/1 |
| `8ef9d89` | title | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0 / 0 | 83 / 89.954 | 106/95/5 |
| `8ef9d89` | garage | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0 / 0 | 102 / 91.172 | 116/102/5 |
| `8ef9d89` | swap | 0,0000 | 0,1177 | 0,1802 | 0,0000 | 0,0193 | 0,0000 | 20 / 20 | 102 / 91.172 | 116/102/5 |
| `8ef9d89` | city | 0,0019 | 0,0020 | 0,0035 | 0,0006 | 0,0010 | 0,0114 | 1500 / 0 | 86 / 81.458 | 106/95/5 |
| `8ef9d89` | coast | 0,0013 | 0,0011 | 0,0021 | 0,0005 | 0,0003 | 0,0003 | 1500 / 0 | 105 / 56.730 | 48/23/1 |
| `400f298` | title | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0 / 0 | 83 / 89.954 | 106/95/5 |
| `400f298` | garage | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0,0000 | 0 / 0 | 102 / 91.172 | 116/102/5 |
| `400f298` | swap | 0,0000 | 0,0937 | 0,1840 | 0,0000 | 0,0252 | 0,0000 | 20 / 20 | 102 / 91.172 | 116/102/5 |
| `400f298` | city | 0,0017 | 0,0023 | 0,0050 | 0,0004 | 0,0010 | 0,0137 | 1500 / 0 | 86 / 81.458 | 106/95/5 |
| `400f298` | coast | 0,0009 | 0,0012 | 0,0026 | 0,0003 | 0,0004 | 0,0003 | 1500 / 0 | 105 / 56.730 | 48/23/1 |

</details>

## Các chi phí xác nhận được

1. **Vẽ lại khi hình đứng yên.** Bản gốc gửi 900 lần vẽ chính trong 900 callback ở mỗi màn đầu và showroom. Preview trong garage chỉ vẽ khi mở hoặc đổi góc/mẫu. Sửa vòng đời giảm số lần vẽ chính xuống 0 sau khi hình tĩnh đã ổn định. Thay đổi kích thước, camera, map, mẫu xe hoặc mức đồ họa vẫn vẽ lại. Tab ẩn gỡ callback render. Physics duy trì tối đa 8 bước bù 120 Hz.
2. **Nhiều lệnh vẽ cho các bộ phận cố định.** Đếm sau khi thử frustum ở 120 vị trí mỗi bản đồ với seed 2026 và GT–01, gồm lượt camera và bóng. Số tam giác là lượng gửi ước tính, kể cả instance bị gom cùng cụm. Bản đo Node này bỏ biển hiệu dùng canvas.

| Bản đồ / giai đoạn | Batch TB / đỉnh | Tam giác TB / đỉnh | Batch GT–01 TB gồm bóng |
| --- | ---: | ---: | ---: |
| Ven biển, gốc | 166,6 / 218 | 70.822,7 / 71.676 | 77 |
| Ven biển, gom dừa vào 8 cụm | 109,5 / 119 | 71.235 / 72.196 | 77 |
| Ven biển, thêm gom phần cứng model xe | 59,5 / 69 | 71.235 / 72.196 | 27 |
| Thành phố, gốc và sau thay đổi cây dừa | 117 / 133 | 76.351,8 / 91.912 | 77 |
| Thành phố, sau gom model xe | 67 / 83 | 76.351,8 / 91.912 | 27 |

   Palm giữ cùng vật liệu và hình dáng. Cụm lớn làm số tam giác TB ven biển tăng khoảng 0,58% so với gốc. PM duyệt đánh đổi này sau khi so giảm số batch. Phép quét lấy mẫu camera và shadow/frustum của Three.js. Công cụ đếm hình học sau cull và giả sử một lần vẽ cho mỗi mesh/vật liệu mỗi lượt; các đường render riêng của vật liệu trong suốt và state của driver có thể cho số khác. Cách gom phần thân cứng của xe giữ tay lái, bánh quay và đèn phanh riêng. Các bộ đỉnh/vật liệu của bốn mẫu đã được so ở tư thế lái và phanh.

3. **Cập nhật giao diện và preview.** Bản gốc tính lại chuỗi credits và truy vấn phần tử tiến trình ở chu kỳ HUD dù hồ sơ không đổi; thời gian DOM trong jsdom là hạng mục CPU lớn ở hai tuyến lái. Cache nút và giá trị theo thay đổi. Trong garage, một lượt mở, 20 lần xoay và 20 lần xem xe vẫn gửi đủ 41 lần vẽ. Số lần đặt lại viewport giảm từ 41 xuống 1 và số lần đọc kích thước CSS giảm từ 82 xuống 2. Trên 300 lần đổi mục đang sở hữu, tái sử dụng hàng so sánh giảm số node bảng tạo mới từ 4.200 còn 0. Trong phép thử đồng hồ với 3.600 lần cập nhật, số lần đọc text/thuộc tính giảm từ 39.600 còn 0, số thay đổi hiển thị giữ nguyên. Đóng garage thu backing buffer từ 704×396 còn 1×1 pixel, giữ renderer cho lần mở tiếp theo.
4. **Âm thanh.** Đồ thị âm thanh liên tục được tạo một lần khi unlock. Khi lái, bản gốc gửi 9.000 yêu cầu `setTargetAtTime` trong 1.500 callback trên mỗi map (6/callback). Sau khi nhớ target cuối cùng của từng tham số, lượng yêu cầu này còn 0 trong hai đoạn đo ga/RPM đã ổn định sau warmup. Ga/RPM hoặc trạng thái sang số thay đổi vẫn gửi target mới. Ở hai bản, số node âm thanh tạo mới trong đoạn chạy ổn định đều bằng 0. CPU đo cổng lập lịch; chi phí mixing và tác động tới GC trong trình duyệt vẫn chưa được định lượng.
5. **Các giả thuyết còn lại.** Từ bản C/D đã có trần 8 bước bù và loại phần dư, DPR hữu hạn, một nguồn sáng có bóng và preview theo sự kiện. 20 lần đổi xe không cho thấy tài nguyên tăng tích lũy ở mỗi chu kỳ trở về cùng xe. Heap JavaScript theo thời gian, thời gian GPU và chi phí blur trên canvas chưa đo được ở môi trường này. Giữ nguyên CSS trang trí, vật liệu, sương mù và thiết kế bản đồ khi thiếu bằng chứng để giảm chất lượng.

**Giới hạn còn thấy khi đổi xe.** Sau 20 lần đổi xe, số geometry/material/texture của cùng mẫu khi garage mở trở lại 116/102/5 sau mỗi 4 lần (gốc 150/102/5). CPU trung bình một lần đổi từ 12,05 còn 11,84 ms, nhưng p95 tăng từ 16,03 lên 16,61 ms và p99 từ 22,69 lên 28,69 ms. Chưa quy được phần đuôi đó cho GC, DOM hay tạo model nếu thiếu trace trong trình duyệt. Phần gộp hình học được giữ vì giảm công việc vẽ trong suốt lượt lái. Muốn cải thiện thao tác chọn xe, nên ghi trace quá trình tạo model/preview và upload khi luân phiên bốn mẫu trên desktop.

## Ngân sách và cách áp dụng

| Mức | DPR tối đa | Bóng | Far clip | Bán kính chi tiết | Draw call tối đa | Tam giác tối đa |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| Cao | 1,6 | 1 nguồn, 2.048² | 3.500 m | 575 m | 120 | 130.000 |
| Vừa | 1,25 | Tắt | 2.850 m | 470 m | 100 | 110.000 |
| Tiết kiệm | 1 | Tắt | 2.500 m | 350 m | 90 | 100.000 |

Ba mức dùng 0 lượt hậu kỳ. Tầm nhìn camera và khoảng bật cụm cảnh quan thay đổi theo mức. Tuning, nhịp vật lý, checkpoint và mật độ mô phỏng do người chơi chọn độc lập với cấu hình đồ họa. Mỗi cảnh phải nằm trong ngân sách camera và shadow cùng khung. Traffic chỉ dùng tối đa 28 xe, 8 người đi bộ, 9 batch chính và 9.000 tam giác. Quét 120 camera mỗi bản đồ với cả 4 mẫu xe cho đỉnh đã quan sát: Cao 83 batch / 92.168 tam giác, Vừa 67 / 81.076, Tiết kiệm 64 / 76.160. Nguồn số là phép quét hình học trước driver nói trên. Các ngưỡng chừa chỗ cho những góc camera, biển hiệu canvas và luồng traffic khác. Test có cảnh tham chiếu; cần đo lại cả hai bản đồ trước khi tăng giới hạn.

Mức mặc định Cao, tự hạ mặc định bật. Game xét các cửa sổ ít nhất 1 giây và 8 frame trong lúc lái. Ba cửa sổ liên tiếp có thời gian frame TB trên 25 ms sẽ hạ một nấc. Sau đó chờ 8 giây hoạt động trước khi lấy tiếp mẫu để hạ lại. Một frame trên 250 ms bắt đầu cửa sổ mới, chuỗi frame rất chậm vẫn được xét. Không tự tăng lại. Mức người chơi chọn và tùy chọn tự hạ lưu trong `coastline-drive:graphics:v1` với version 1. Mức hạ tự động chỉ áp dụng cho phiên hiện tại.

## Đo trên trình duyệt desktop

1. Chạy `npm run build` rồi `npm run preview`. Mở URL Vite in ra với `/?perf=1`, hoặc `/?map=coast&perf=1`. Overlay mặc định tắt. `?debug` cũ vẫn hoạt động.
2. Trong menu tạm dừng, chọn cùng mức đồ họa, mức mật độ và trạng thái tự hạ cho các lần so sánh. Lái qua cùng vị trí, hướng camera và tốc độ. Overlay tổng hợp tối đa 240 interval RAF lúc lái và cập nhật mỗi giây. Mean, p95, p99 mô tả các interval thật. Mục bước mô phỏng hiển thị trung bình, tối đa và mới nhất.
3. Draw calls và triangles là số khung vừa vẽ từ `renderer.info.render`, đã bao gồm shadow. Geometry và texture là số renderer đang quản lý. Heap JS chỉ xuất hiện nếu trình duyệt có `performance.memory`. Thời gian mục Render là CPU gửi lệnh, chưa đo GPU bằng truy vấn timer.
4. Trong DevTools Console, bật mức Verbose và lọc `[performance]`. Sao chép vài dòng JSON ở đoạn đường hay bị giật. Khi gửi lại, kèm tên bản đồ, xe, tốc độ, mức đồ họa thực tế, độ phân giải cửa sổ, trạng thái tự hạ và thao tác ngay trước khi khựng. Bản đo có phạm vi cửa sổ, số mẫu và bộ đếm đủ để so cùng điều kiện.


## Phụ lục lịch sử C/D — giao thông trước lát cắt desktop

### Chi phí CPU trong bài chạy lại

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

### Số lượng thực thể và hình học

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
