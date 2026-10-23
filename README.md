# Coastline Drive — Hộp số, tuning và âm thanh

Web game lái xe 3D theo `prompt-game-lai-xe-forza.md`, dùng Three.js, Vite và TypeScript. Xe và cảnh quan được tạo riêng bằng hình học 3D, không sử dụng tài sản của Forza.

Đã bổ sung tính năng theo `prompt-bo-sung-hop-so-tuning.md` và yêu cầu âm thanh động cơ. Dự án chỉ chạy local, không tự push Git hay xuất bản.

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
| W / ↑ | Tăng ga theo số đang chọn |
| S / ↓ | Phanh; ở Auto, giữ sau khi dừng để lùi |
| A, D / ←, → | Lái trái / phải |
| Space | Phanh tay |
| C | Camera bám theo gần / xa |
| R | Dừng và đưa xe về đoạn đường gần nhất |
| Esc | Tạm dừng / tiếp tục |
| H | Hướng dẫn |
| T | Đổi Auto / Manual |
| E / Q | Lên / xuống số trong Manual |
| G | Mở tuning hộp số và động cơ |
| M | Bật / tắt âm thanh động cơ |

Manual dùng thứ tự `R ↔ N ↔ 1 ↔ 2 ↔ ... ↔ 6`. Khi xe dừng, Q từ số 1 về N rồi R; W để lùi. E từ R qua N về số 1. Chờ khoảng 150 ms giữa hai lần bấm để hoàn tất thao tác sang số. S luôn là phanh trong Manual; N không tạo lực kéo và cho phép lên ga tại chỗ.

Thiết bị cảm ứng có nút lái, ga, phanh, phanh tay và nút sang số trên HUD. Nút AUTO/MANUAL cũng bấm được. Menu Esc có tuning, âm lượng, đặt lại xe và đồ họa tiết kiệm. Chuyển tab hoặc rời cửa sổ tự tạm dừng cả xe và âm thanh.

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
    transmission.ts    Auto/Manual, RPM, ly hợp, torque cut, rev-match
  data/vehicles/
    types.ts           Schema bất biến cho xe, động cơ và drivetrain
    gt01.ts            Định nghĩa dữ liệu GT–01 hiện tại
    validate.ts        Kiểm tra runtime và deep-freeze config
    registry.ts        Tra cứu xe theo ID
  vehicles/
    vehicle-factory.ts Tạo physics, transmission và view từ vehicle ID
  world/
    track.ts           Đường vòng, spawn, truy vấn đoạn gần nhất
    world.ts           Biển, mặt đất, đường, cây, núi, ánh sáng
    car.ts             Xe GT–01 bằng mesh, chuyển động bánh xe
  ui/
    hud.ts             Tốc độ, minimap, menu, thông báo
    drivetrain.css     Đồng hồ RPM, số truyền, shift light
    tuning-panel.ts    Form tuning, biểu đồ, thao tác preset
    tuning.css         Giao diện tuning responsive
  audio/
    engine-audio.ts    Tổng hợp động cơ bằng Web Audio, mute/volume
  tuning/
    tuning.ts          Config, torque curve, validation, HP/tốc độ
    storage.ts         Preset localStorage có version và fallback
  assets/              Vị trí cho model, texture, âm thanh sau này
tests/
  vehicle.test.ts      Kiểm tra động học và đường chạy
  vehicle-config.test.ts Kiểm tra schema, registry và parity GT–01
  vehicle-factory.test.ts Kiểm tra factory và vòng đời view
  transmission.test.ts Kiểm tra hộp số và bảo vệ động cơ
  tuning.test.ts       Tính toán, tác động tuning, preset hỏng
  audio.test.ts        Vòng đời và tham số audio qua API giả lập
  ui.test.ts           Tương tác form/HUD/input bằng jsdom
public/
  favicon.svg          Biểu tượng của game
```

## Đã triển khai

- Xe thể thao GT–01 màu vàng, bánh xoay và đèn phanh.
- GT–01 đã được chuyển thành `VehicleDefinition` data-driven; factory dùng cùng một config cho physics, transmission, model procedural và HUD.
- Đường nhựa vòng ven biển, đất bằng có thể lái tự do, cây và núi.
- Ga, phanh, lùi, lái, phanh tay; giảm tốc độ ngoài mặt đường.
- Camera bám theo gần/xa; góc xe ba phần tư ở màn hình bắt đầu.
- Tốc độ từ mô hình chuyển động, quãng đường phiên chơi, minimap vị trí/hướng xe.
- Tạm dừng, đưa xe lại lên đường, cảm ứng, chất lượng đồ họa và xử lý lỗi WebGL.
- Hộp số 6 cấp + N/R, Auto/Manual, torque curve nội suy và RPM theo tốc độ bánh xe.
- Ngắt mô-men 150 ms, bù tua khi xuống số, chặn quá tua và đổi chiều khi đang chạy.
- HUD số truyền lớn, kim RPM mượt, vùng cảnh báo và shift light nhấp nháy.
- Tuning 6 tỉ số truyền, final drive, hệ số mô-men và redline; biểu đồ tốc độ lý thuyết, HP/Nm/RPM đỉnh công suất.
- Lưu/tải một preset localStorage, bản mặc định độc lập với bản đang chỉnh.
- Âm thanh động cơ tổng hợp theo RPM/ga, thay đổi khi sang số và pop nhẹ khi nhả ga ở tua cao.

## Thử theo từng bước

1. **Lõi hộp số:** mở `http://127.0.0.1:5173/?debug=1`, bật mức Verbose/Debug trong console. Log `[drivetrain]` mỗi 0.5 giây khi đang lái hiển thị số, RPM, chế độ, ly hợp và tốc độ. Thử Auto rồi T → E/Q. Log tắt khi không có `?debug=1`.
2. **HUD:** quan sát kim RPM giảm khi lên số, tăng khi xuống số; giữ số thấp trong Manual để thấy shift light và giới hạn tua. Thử xuống số ở tốc độ cao: thao tác vượt redline bị từ chối và có thông báo.
3. **Tuning:** G tự tạm dừng xe. Kéo final drive hoặc tỉ số truyền để xem các đường tốc độ thay đổi ngay. Tăng hệ số mô-men để thấy HP/Nm thay đổi. Nhập tỉ số sai thứ tự hoặc để trống: nút áp dụng/lưu bị khóa và có giải thích.
4. **Preset:** Lưu preset ghi bản đang chỉnh; Tải preset nạp vào bảng; Mặc định chỉ đặt lại bản đang chỉnh. Bấm Áp dụng & trở lại để thay đổi xe. Esc/nút đóng bỏ thay đổi chưa áp dụng; preset đã lưu vẫn tồn tại và tự tải khi mở game lại. Muốn mặc định cả lần chơi sau: Mặc định → Lưu preset → Áp dụng.
5. **Âm thanh:** bấm Bắt đầu lái để trình duyệt cho phép phát tiếng. Thử ga ở N, tăng tốc, sang số và nhả ga. M tắt/bật, Esc chỉnh âm lượng. Mở tuning hoặc chuyển tab phải im tiếng. Nếu chưa nghe, kiểm tra tab không bị mute, âm lượng lớn hơn 0 và bấm biểu tượng âm thanh để thử lại.

Preset thuộc đúng origin, ví dụ `127.0.0.1:5173`; `localhost:5173` hoặc cổng khác có vùng lưu riêng. JSON sai phiên bản, ngoài giới hạn hoặc không đọc được sẽ dùng mặc định. Khi không thể ghi localStorage, có thông báo và vẫn áp dụng để chơi trong phiên hiện tại được.

## Đánh đổi và giới hạn

Xe giữ mô hình động học bicycle: tốc độ quay thân xe = `v / wheelbase × tan(steering)`. Chạy ở bước thời gian 1/120 giây và giảm góc lái ở tốc độ cao. Lực kéo tính từ torque curve, tỉ số truyền, final drive, hiệu suất, bán kính bánh và khối lượng lấy từ config xe. Grip, rolling resistance, phanh, drag và steering cũng đọc từ config. Có giới hạn lực kéo arcade; suspension hiện chỉ ảnh hưởng tư thế model, **chưa mô phỏng rigid body, lực lốp chi tiết hoặc trọng tâm thực**.

Cây, cột và biển báo vẫn là cảnh trang trí; xe được đưa lại lên đường khi ra khỏi vùng đất bằng cho phép. Chưa có drift vật lý, cockpit, H-pattern hoặc đua tính giờ. Giới hạn tốc độ đường nhựa cố định đã thay bằng hộp số/redline/lực cản; giữ giới hạn off-road 24 m/s và lùi 11 m/s. Biểu đồ hiển thị tốc độ lý thuyết, không cam kết xe đủ công suất đạt tới. Áp dụng tuning khi đang tạm dừng không đổi tốc độ/vị trí, nhưng có thể chọn số cao hơn hoặc N để tránh quá tua.

Âm thanh là tổng hợp oscillator/noise cho động cơ sáu xi-lanh, không phải bản thu xe thật. Không có Doppler/cockpit audio hay thay loại ống xả. Graph chỉ tạo sau thao tác người chơi, dùng lại khi tiếp tục, đóng khi rời trang; lỗi thiết bị âm thanh không ngăn chơi game.

Cây thường, vạch đường và cọc tiêu dùng InstancedMesh để giảm lệnh vẽ. Pixel ratio giới hạn ở 1.6; chế độ tiết kiệm dùng 1 và tắt bóng. Ánh sáng/bóng bám vùng quanh xe. Chưa đo FPS trên thiết bị thật nên không cam kết một mức FPS cụ thể.

Không tải model/âm thanh bên ngoài. Google Fonts có fallback khi mất mạng. Preset tuning lưu trên thiết bị; không có máy chủ game. WebMCP tùy chọn vẫn có các thao tác đọc trạng thái, bắt đầu lái, đưa lại lên đường; game không phụ thuộc API này.

## Checklist thử trực tiếp

1. Mở game, thấy đường 3D và xe vàng; chọn Bắt đầu lái.
2. Giữ W: tốc độ, bánh xe, vị trí minimap cùng thay đổi.
3. Thử A/D; giữ S để phanh rồi lùi; Space để dừng.
4. Ra bãi cỏ, kiểm tra tốc độ giảm; R đưa lại lên đường.
5. Thử C, Esc, H và menu. Chuyển tab: game phải tạm dừng.
6. Điện thoại: giữ ga và lái cùng lúc; chọn đồ họa tiết kiệm nếu cần.

Kiểm tra tự động/build không thay thế thử trực tiếp hình ảnh và điều khiển. Test giao diện dùng jsdom, không render WebGL/layout; test âm thanh dùng API giả lập, không đánh giá chất âm. Phiên phát triển chưa có trình duyệt kết nối để nghe thử, kiểm tra hình ảnh hoặc xác minh WebMCP thực tế.

## Giai đoạn tiếp theo — chờ xác nhận

1. Thêm các config NA nhẹ/RWD, V8/RWD và Turbo/AWD; chuyển xe bằng query/debug để kiểm chứng trước khi làm UI.
2. Garage chọn xe và preview 3D trước khi vào game.
3. Preset tuning riêng theo vehicle ID và migration preset cũ.
4. Profile âm thanh theo aspiration/exhaust; EV là nhánh tùy chọn sau ba xe ICE.
5. Cannon-es/Rapier về sau nếu cần rigid body, raycast bánh xe, hệ treo và lực lốp thật.

Tài liệu: [Vite](https://vite.dev/guide/), [Three.js cameras](https://threejs.org/manual/en/cameras.html), [InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html), [Web Audio](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext), [AudioParam smoothing](https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/setTargetAtTime), [jsdom](https://github.com/jsdom/jsdom).
