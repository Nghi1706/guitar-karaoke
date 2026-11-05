# Karaoke Guitar

Dán lời bài hát có hợp âm vào, chọn điệu, tempo và tông. Web tự đánh đệm guitar, đếm ngược rồi chạy chữ theo kiểu karaoke, người dùng chỉ cần hát.

## Chạy

Cần Node 24 trở lên (server chạy thẳng file `.ts` và dùng SQLite có sẵn trong Node).

```bash
npm install
cp .env.example .env   # điền ADMIN_EMAILS, sau này thêm khoá PayOS
npm run server         # API ở http://localhost:8787, tự khởi động lại khi sửa code
npm run dev            # mở http://localhost:5280 (trang giới thiệu), ứng dụng ở /app/
npm test               # unit test, gồm cả test server
```

Lúc dev, Vite chuyển `/api`, `/robots.txt`, `/sitemap.xml` sang server Node. Chưa điền khoá PayOS thì trang nâng cấp hiện nút **Giả lập thanh toán thành công** để thử luồng mua.

### Đưa lên mạng

```bash
npm run build          # dist/index.html (trang giới thiệu) và dist/app/ (ứng dụng)
npm start              # một tiến trình phục vụ cả web lẫn API, chế độ production
```

Trước khi build và chạy, đặt trong `.env`:

- `SITE_URL`: địa chỉ thật, ví dụ `https://karaokeguitar.vn`. Giá trị này được điền vào canonical, Open Graph, sitemap và link quay lại sau thanh toán, nên đổi xong phải build lại.
- `TRUST_PROXY=1` nếu chạy sau nginx hoặc Cloudflare.
- `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY` lấy ở my.payos.vn. Ở production mà thiếu khoá thì nút mua báo lỗi chứ không giả lập. Khai báo webhook trên PayOS là `<SITE_URL>/api/billing/payos-webhook`.
- `VITE_ADSENSE_CLIENT`, `VITE_ADSENSE_SLOT` nếu muốn chạy Google AdSense thay banner nhà.

Dữ liệu nằm trong file SQLite `data/app.db`, nhớ sao lưu.

### Tài khoản admin

Hai cách:

- Ghi email vào `ADMIN_EMAILS` trong `.env`. Tài khoản đó thành admin khi đăng ký hoặc đăng nhập.
- Đăng ký trên web rồi chạy `npm run make-admin -- email@vidu.com`.

Đang tắt tài khoản (xem phần Bật tắt tính năng) thì không có nút đăng nhập trên menu, admin mở thẳng `/app/#/account` để đăng nhập.

Admin thấy nút **Quản trị** trên thanh trên cùng. Trang này có số liệu theo ngày (người dùng, lượt hát, bài soạn mới, lượt lưu bài, góp ý, và đăng ký, doanh thu, quảng cáo khi các tính năng đó bật), quản lý tài khoản (cộng ngày Premium, khoá, cấp quyền, xoá), xử lý góp ý và xem đơn hàng.

## Cách dùng

1. Vào tab **Soạn bài** và dán lời. Web nhận hai kiểu viết:
   - Hợp âm nằm trong lời: `[A]Tình sao [C#]thế...`
   - Hợp âm nằm ở dòng phía trên lời (kiểu canh cột)

   Các dòng như `Verse 1:`, `Chorus:`, `ĐK:` được hiểu là tiêu đề đoạn.

2. Ở cột trái, chọn điệu, cách đánh (rải, quạt hay tự động), tempo, tông hát, capo và thời gian đếm ngược.
3. Sang tab **Hát** rồi bấm **▶ Phát** hoặc Space.
4. Mỗi hợp âm mặc định dài 1 ô nhịp. Lúc đang dừng, bấm vào một hợp âm để đổi độ dài của nó (¼ đến 4 ô), hoặc phát từ chỗ đó.

Bài đang soạn được tự lưu vào trình duyệt (localStorage). Muốn giữ nhiều bài thì bấm **Lưu vào thư viện**.

Nút **Góp ý** ở góc trên gửi thẳng vào trang quản trị.

## Bật tắt tính năng

Cờ nằm trong `src/config/features.ts`, đổi xong phải build lại:

- `ADS_ENABLED`: quảng cáo 5 giây ở lần bấm phát đầu tiên mỗi khi mở web (người có Premium không thấy).
- `ACCOUNTS_ENABLED`: đăng nhập, tạo tài khoản, nâng cấp Premium (tháng hoặc năm, trả bằng mã QR qua PayOS).

Hiện cả hai đang tắt. Server vẫn giữ nguyên các API này. Bật lại thì sửa cả trang giới thiệu `index.html`: tìm `TẠM ẨN PREMIUM` để hiện lại bảng giá và câu hỏi đáp.

## Đếm lượt dùng

Mỗi trình duyệt tự tạo một mã ngẫu nhiên (`gk.clientId` trong localStorage) rồi gửi các sự kiện `open`, `play`, `finish`, `compose`, `save` về `/api/usage/event`. Server lưu vào bảng `usage_events`, không lưu lời bài hát hay thông tin cá nhân. Một người dùng hai máy, hoặc xoá dữ liệu trình duyệt, sẽ được đếm thành nhiều người.

## Sửa kiểu đánh

Pattern của từng điệu nằm trong `src/config/styles.ts`, có sẵn chú thích cách viết. Mỗi điệu có hai pattern: `arpeggio` (rải) và `strum` (quạt). Ở chế độ **Tự động**, đoạn điệp khúc (tiêu đề `ĐK`, `Điệp khúc`, `Chorus`, `Refrain`) dùng kiểu quạt, các đoạn khác dùng kiểu rải. Muốn cả bài chỉ một kiểu thì chọn **Luôn rải** hoặc **Luôn quạt** trong ô Cách đánh.

Ký hiệu trong pattern:

- `B`: bass. `B'`: bass phụ (nốt 5).
- `1`–`4`: các dây cao. Viết liền như `123` nghĩa là gảy cùng lúc.
- `D` / `U`: quạt xuống / quạt lên. `-`: nghỉ.

Các pattern hiện tại chỉ là bản nháp, cần người biết đàn nghe thử và chỉnh lại.

## Cấu trúc

| Đường dẫn                   | Vai trò                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| `index.html`                | Trang giới thiệu tĩnh cho máy tìm kiếm (không chạy JS), CSS ở `src/landing/`                  |
| `app/index.html`            | Vỏ của ứng dụng React, điều hướng bằng `#/soan`, `#/hat`, `#/account`, `#/upgrade`, `#/admin` |
| `shared/api.ts`             | Kiểu dữ liệu và danh sách API dùng chung cho web và server                                    |
| `server/`                   | API Hono + SQLite: tài khoản, thanh toán PayOS, góp ý, quảng cáo, quản trị, robots/sitemap    |
| `src/lib/parser.ts`         | Tách bài thành đoạn, dòng và các cụm hợp âm + lời                                             |
| `src/lib/chordName.ts`      | Đọc tên hợp âm, dịch tông                                                                     |
| `src/lib/voicing.ts`        | Chọn thế bấm (chords-db) và quy ra nốt MIDI, tính cả capo                                     |
| `src/lib/arrange.ts`        | Dựng dòng thời gian và sinh nốt theo pattern                                                  |
| `src/audio/engine.ts`       | Phát âm thanh bằng Tone.js (Sampler + đếm ngược)                                              |
| `src/components/Player.tsx` | Màn hình karaoke                                                                              |
| `src/components/AdGate.tsx` | Khung quảng cáo trước khi phát, nguồn quảng cáo chọn ở `src/config/ads.ts`                    |
| `src/pages/`                | Trang tài khoản, nâng cấp, quản trị                                                           |
| `src/styles/tokens.css`     | Màu, font, bo góc dùng chung cho cả trang giới thiệu và ứng dụng                              |

Giao diện chia ba mốc: điện thoại đến 719px (thanh tab dưới đáy, bảng tuỳ chỉnh kéo từ dưới lên), tablet 720–1099px (tuỳ chỉnh mở từ cạnh phải), PC từ 1100px (cột tuỳ chỉnh luôn hiện).

Giá gói ghi ở hai chỗ: `.env` (giá thật khi thanh toán) và `index.html` (bảng giá và JSON-LD cho máy tìm kiếm). Đổi giá thì sửa cả hai.

Nguồn tiếng đàn và các thư viện dùng trong project: xem [CREDITS.md](CREDITS.md).
