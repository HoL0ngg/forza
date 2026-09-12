# Coastline Drive — Giai đoạn 1 (MVP)

Web game lái xe 3D theo `prompt-game-lai-xe-forza.md`, dùng Three.js, Vite và TypeScript. Xe và cảnh quan được tạo riêng bằng hình học 3D, không sử dụng tài sản của Forza.

**Dừng ở giai đoạn 1 để bạn xác nhận trước khi làm tiếp.**

## Chạy thử

Yêu cầu Node.js 22.12+ (khuyến nghị Node 22 LTS), npm, trình duyệt có WebGL 2 và tăng tốc phần cứng.

```sh
npm install
npm run dev
```

Mở địa chỉ Local do Vite hiển thị, thường là http://127.0.0.1:5173/, rồi chọn **Bắt đầu lái**. Không mở `index.html` trực tiếp bằng `file://`.

```sh
npm run test     # Kiểm tra mô hình xe và hình học đường
npm run build    # Kiểm tra TypeScript và xuất bản tĩnh vào dist/
npm run preview  # Chạy thử bản production
```

## Điều khiển

| Phím | Chức năng |
| --- | --- |
| W / ↑ | Tăng tốc |
| S / ↓ | Phanh; tiếp tục giữ sau khi dừng để lùi |
| A, D / ←, → | Lái trái / phải |
| Space | Phanh tay |
| C | Camera bám theo gần / xa |
| R | Dừng và đưa xe về đoạn đường gần nhất |
| Esc | Tạm dừng / tiếp tục |
| H | Hướng dẫn |

Thiết bị cảm ứng có các nút lái, ga, phanh/lùi và phanh tay. Menu tạm dừng cho phép trở về điểm xuất phát và chọn đồ họa tiết kiệm. Khi rời cửa sổ hoặc chuyển tab, game tự tạm dừng để tránh kẹt ga.

## Cấu trúc

```text
src/
  main.ts              Khởi tạo HUD, game, xử lý lỗi WebGL
  style.css            Giao diện, màn hình nhỏ, nút cảm ứng
  core/
    game.ts            Fixed timestep, trạng thái chơi/tạm dừng
    input.ts           Bàn phím, multitouch, xử lý mất focus
    camera.ts          Camera bám theo, nội suy, FOV theo tốc độ
    webmcp.ts          Tích hợp trình duyệt tùy chọn
  physics/
    vehicle.ts         Mô hình động học bicycle cho MVP
  world/
    track.ts           Đường vòng, spawn, truy vấn đoạn gần nhất
    world.ts           Biển, mặt đất, đường, cây, núi, ánh sáng
    car.ts             Xe GT–01 bằng mesh, chuyển động bánh xe
  ui/
    hud.ts             Tốc độ, minimap, menu, thông báo
  audio/               Dành cho giai đoạn 4
  tuning/              Dành cho giai đoạn 5
  assets/              Vị trí cho model, texture, âm thanh sau này
tests/
  vehicle.test.ts      Kiểm tra động học và đường chạy
public/
  favicon.svg          Biểu tượng của game
```

## Đã triển khai

- Xe thể thao GT–01 màu vàng, bánh xoay và đèn phanh.
- Đường nhựa vòng ven biển, đất bằng có thể lái tự do, cây và núi.
- Ga, phanh, lùi, lái, phanh tay; giảm tốc độ ngoài mặt đường.
- Camera bám theo gần/xa; góc xe ba phần tư ở màn hình bắt đầu.
- Tốc độ từ mô hình chuyển động, quãng đường phiên chơi, minimap vị trí/hướng xe.
- Tạm dừng, đưa xe lại lên đường, cảm ứng, chất lượng đồ họa và xử lý lỗi WebGL.

## Đánh đổi và giới hạn

MVP dùng mô hình động học bicycle: tốc độ quay thân xe = `v / wheelbase × tan(steering)`. Chạy ở bước thời gian 1/120 giây, giảm góc lái tối đa khi tốc độ cao và giới hạn thời gian bắt kịp mỗi khung hình. Đây là điều khiển arcade để thử luồng chơi, **chưa mô phỏng lực lốp, khối lượng, trọng tâm hoặc hệ treo**.

Cây, cột và biển báo là cảnh trang trí: xe có thể xuyên qua. Xe được đưa lại lên đường khi ra khỏi vùng đất bằng cho phép. Chưa có hộp số, RPM, drift vật lý, âm thanh, cockpit, tuning hoặc đua tính giờ. TIẾN/LÙI trên giao diện là hướng chạy, không phải số truyền.

Cây thường, vạch đường và cọc tiêu dùng InstancedMesh để giảm lệnh vẽ. Pixel ratio giới hạn ở 1.6; chế độ tiết kiệm dùng 1 và tắt bóng. Ánh sáng/bóng bám vùng quanh xe. Chưa đo FPS trên thiết bị thật nên không cam kết một mức FPS cụ thể.

Không tải model/âm thanh bên ngoài. Google Fonts có fallback hệ thống khi mất mạng. Không lưu tiến độ hay có máy chủ game. WebMCP là tích hợp tùy chọn, chỉ đăng ký khi `document.modelContext` tồn tại: đọc trạng thái, bắt đầu lái, đưa lại lên đường. Game không phụ thuộc API này.

## Checklist thử trực tiếp

1. Mở game, thấy đường 3D và xe vàng; chọn Bắt đầu lái.
2. Giữ W: tốc độ, bánh xe, vị trí minimap cùng thay đổi.
3. Thử A/D; giữ S để phanh rồi lùi; Space để dừng.
4. Ra bãi cỏ, kiểm tra tốc độ giảm; R đưa lại lên đường.
5. Thử C, Esc, H và menu. Chuyển tab: game phải tạm dừng.
6. Điện thoại: giữ ga và lái cùng lúc; chọn đồ họa tiết kiệm nếu cần.

Kiểm tra tự động/build không thay thế thử trực tiếp hình ảnh và điều khiển. Phiên phát triển không có trình duyệt kết nối nên chưa hoàn tất kiểm tra trực tiếp hay xác minh WebMCP trong trình duyệt hỗ trợ.

## Giai đoạn tiếp theo — chờ xác nhận

2. Cannon-es/Rapier: rigid body, raycast bánh xe, hệ treo, lực lốp, va chạm.
3. Torque curve, số tự động/số tay, sang số, đồng hồ RPM.
4. Web Audio API: động cơ theo RPM, tiếng pô, blip khi về số.
5. Tuning gear ratios/final drive, đồ thị tốc độ theo số.
6. Bản đồ mở rộng, Time Trial/checkpoint, polish.

Tài liệu: [Vite](https://vite.dev/guide/), [Three.js cameras](https://threejs.org/manual/en/cameras.html), [InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html).
