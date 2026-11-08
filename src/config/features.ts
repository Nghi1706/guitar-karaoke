// BẬT / TẮT TÍNH NĂNG trên giao diện. Đổi thành true rồi build lại để bật.
//
// Đang tạm tắt để ra mắt bản miễn phí hoàn toàn. Code phía server (tài khoản, thanh toán,
// quảng cáo) vẫn chạy bình thường, chỉ là giao diện không hiện ra.
// Bật lại nhớ sửa cả trang giới thiệu index.html (tìm "TẠM ẨN PREMIUM").

// Quảng cáo 5 giây trước lần phát đầu tiên
export const ADS_ENABLED = false

// Có server Node (npm start) đi kèm hay không.
// false = web tĩnh, đưa thẳng lên Cloudflare Pages, Netlify, Vercel, GitHub Pages...:
// không gọi /api nữa, ẩn nút Góp ý, các trang tài khoản, nâng cấp, quản trị quay về màn soạn/hát.
// Muốn bật lại tài khoản, quảng cáo có đếm lượt, trang admin thì đổi thành true và chạy kèm server.
export const SERVER_ENABLED = false

// Đăng nhập, tạo tài khoản, nâng cấp Premium. Chỉ có tác dụng khi SERVER_ENABLED = true.
// Khi tắt, trang đăng nhập vẫn mở được bằng địa chỉ /app/#/account (không có nút trên menu),
// chỉ còn ô đăng nhập để admin vào trang Quản trị.
export const ACCOUNTS_ENABLED = false
