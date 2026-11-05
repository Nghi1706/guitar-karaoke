// BẬT / TẮT TÍNH NĂNG trên giao diện. Đổi thành true rồi build lại để bật.
//
// Đang tạm tắt để ra mắt bản miễn phí hoàn toàn. Code phía server (tài khoản, thanh toán,
// quảng cáo) vẫn chạy bình thường, chỉ là giao diện không hiện ra.
// Bật lại nhớ sửa cả trang giới thiệu index.html (tìm "TẠM ẨN PREMIUM").

// Quảng cáo 5 giây trước lần phát đầu tiên
export const ADS_ENABLED = false

// Đăng nhập, tạo tài khoản, nâng cấp Premium.
// Khi tắt, trang đăng nhập vẫn mở được bằng địa chỉ /app/#/account (không có nút trên menu),
// chỉ còn ô đăng nhập để admin vào trang Quản trị.
export const ACCOUNTS_ENABLED = false
