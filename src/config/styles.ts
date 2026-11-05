// CÁC ĐIỆU ĐỆM: sửa trực tiếp ở đây để chỉnh cách đánh, không cần đụng code khác.
//
// Cách viết pattern (mỗi ký hiệu là một bước, cách nhau bằng dấu cách):
//   B    bass chính (nốt gốc của hợp âm)
//   B'   bass phụ (thường là nốt 5, dùng cho kiểu bass luân phiên)
//   1 2 3 4   dây cao thứ 1, 2, 3, 4 trong thế bấm (1 = dây cao nhất)
//   B3, 123   viết liền = gảy cùng lúc (móc bass + dây 3, móc 3 dây...)
//   D    quạt xuống        U    quạt lên
//   -    nghỉ (để các nốt trước ngân tiếp)
//
// Pattern lặp lại theo ô nhịp. Một pattern có thể dài hơn 1 ô (ví dụ 2 ô nhịp).
//
// Mỗi điệu có 2 kiểu đánh:
//   arpeggio  kiểu rải, nhẹ nhàng, mặc định dùng cho phiên khúc (verse)
//   strum     kiểu quạt, mạnh hơn, mặc định dùng cho điệp khúc (ĐK, chorus)
// Người dùng có thể chọn luôn rải hoặc luôn quạt trong phần Tuỳ chỉnh.
//
// ⚠ Đây là các pattern phổ biến, bản nháp ban đầu. Nghe thấy chưa đúng thì sửa lại cho chuẩn.

export interface StyleDef {
  id: string
  name: string
  timeSignature: string // chỉ để hiển thị
  beatsPerBar: number // số phách mỗi ô nhịp (BPM tính theo phách này)
  stepsPerBeat: number // mỗi phách chia mấy bước
  arpeggio: string // pattern kiểu rải
  strum: string // pattern kiểu quạt
  defaultBpm: number
}

export type PlayKind = 'arpeggio' | 'strum'

export const STYLES: StyleDef[] = [
  {
    id: 'ballad',
    name: 'Ballad',
    timeSignature: '4/4',
    beatsPerBar: 4,
    stepsPerBeat: 2,
    arpeggio: 'B 3 2 3 1 3 2 3',
    strum: 'D - D U D - D U',
    defaultBpm: 70,
  },
  {
    // "Bass 321 321 321": mỗi móc đơn gảy 3 dây cùng lúc, nghe dày và đều
    id: 'slowsurf',
    name: 'Slow Surf',
    timeSignature: '4/4',
    beatsPerBar: 4,
    stepsPerBeat: 2,
    arpeggio: "B 321 321 321 B' 321 321 321",
    strum: 'B - D - B B D -', // bùm - chát - bùm bùm - chát
    defaultBpm: 75,
  },
  {
    id: 'slowrock',
    name: 'Slow rock',
    timeSignature: '12/8',
    beatsPerBar: 4, // 4 phách chấm dôi, mỗi phách 3 móc đơn
    stepsPerBeat: 3,
    arpeggio: "B 3 2 1 2 3 B' 3 2 1 2 3",
    strum: 'D - D D U D D - D D U D',
    defaultBpm: 60,
  },
  {
    id: 'bolero',
    name: 'Bolero',
    timeSignature: '4/4',
    beatsPerBar: 4,
    stepsPerBeat: 2,
    arpeggio: "B 3 2 1 B' 3 2 1",
    strum: "B - D U B' - D U",
    defaultBpm: 80,
  },
  {
    // Nhịp 3/4: bùm chách chách
    id: 'valse',
    name: 'Valse',
    timeSignature: '3/4',
    beatsPerBar: 3,
    stepsPerBeat: 2,
    arpeggio: "B 3 2 1 2 3 B' 3 2 1 2 3",
    strum: "B - D - D U B' - D - D U",
    defaultBpm: 110,
  },
  {
    // Valse chậm, chèn thêm nốt đơn vào giữa các tiếng chách
    id: 'boston',
    name: 'Boston',
    timeSignature: '3/4',
    beatsPerBar: 3,
    stepsPerBeat: 2,
    arpeggio: "B 3 12 3 12 3 B' 3 12 3 12 3",
    strum: "B - D U D U B' - D U D U",
    defaultBpm: 85,
  },
  {
    // Nhịp shuffle: mỗi phách chia 3, gảy ở bước 1 và 3 cho ra tiếng "đà ... đá"
    id: 'blues',
    name: 'Blues',
    timeSignature: '4/4',
    beatsPerBar: 4,
    stepsPerBeat: 3,
    arpeggio: "B - 3 12 - 3 B' - 3 12 - 3",
    strum: 'D - U D - U D - U D - U',
    defaultBpm: 75,
  },
  {
    id: 'pop',
    name: 'Pop',
    timeSignature: '4/4',
    beatsPerBar: 4,
    stepsPerBeat: 2,
    arpeggio: "B 3 21 3 B' 3 21 3",
    strum: 'D - D U - U D U',
    defaultBpm: 90,
  },
]

export const getStyle = (id: string) => STYLES.find((s) => s.id === id) ?? STYLES[0]
