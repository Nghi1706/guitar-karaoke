// CẤU HÌNH QUẢNG CÁO
//
// Khách và tài khoản miễn phí xem 1 quảng cáo trước lần phát đầu tiên mỗi khi mở web.
// Tài khoản Premium không thấy quảng cáo.
//
// Nguồn quảng cáo:
//   - Mặc định: banner nội bộ (giới thiệu gói Premium), không cần đăng ký gì.
//   - Google AdSense: khi site đã được duyệt, đặt 2 biến trong file .env rồi build lại:
//       VITE_ADSENSE_CLIENT=ca-pub-xxxxxxxxxxxxxxxx
//       VITE_ADSENSE_SLOT=1234567890
//     Khung sẽ tự tải mã AdSense và hiện quảng cáo ở chỗ banner nội bộ.

export const AD_SECONDS = 5 // phải chờ bao lâu mới bấm bỏ qua được
export const AD_SESSION_KEY = 'gk.adSeen' // lưu trong sessionStorage: đóng tab là tính lượt mới

export const ADSENSE_CLIENT: string = import.meta.env.VITE_ADSENSE_CLIENT ?? ''
export const ADSENSE_SLOT: string = import.meta.env.VITE_ADSENSE_SLOT ?? ''

export const adProvider = (): 'adsense' | 'house' => (ADSENSE_CLIENT && ADSENSE_SLOT ? 'adsense' : 'house')
