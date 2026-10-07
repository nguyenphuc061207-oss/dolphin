# Dolphin

Ứng dụng React dành cho giáo viên và học sinh: tạo đề, làm bài, quản lý kết quả,
kết nối bạn bè và trợ lý AI. Sử dụng Vite, Tailwind CSS, Firebase và Gemini.

## Chạy dự án

```sh
pnpm install
pnpm dev
pnpm build
pnpm preview
pnpm lint
```

Các biến môi trường: `VITE_GEMINI_API_KEY` cho trợ lý AI và
`VITE_IMGBB_API_KEY` để tải ảnh khi tạo đề. Thiết lập Firebase nằm tại
`src/shared/config/firebase.js`. File `.env` được Git bỏ qua.

## Cấu trúc

```text
src/
├── main.jsx                     # Entry point, CSS và providers
├── app/                         # Ghép các tính năng thành ứng dụng
│   ├── App.jsx
│   ├── layouts/                 # AppLayout, Navigation
│   ├── providers/               # AppProviders
│   ├── router/                  # Route và lazy loading
│   └── styles/                  # CSS toàn cục
├── features/
│   ├── auth/                    # Đăng nhập, context, hook và bảo vệ route
│   │   ├── components/
│   │   ├── context/
│   │   ├── hooks/
│   │   ├── pages/
│   │   └── providers/
│   ├── exams/                   # Tạo đề, quản lý, làm bài và kết quả
│   │   ├── components/          # TeacherSidebar
│   │   ├── pages/
│   │   └── parsers/             # Phân tích câu hỏi, nhập đề DOCX
│   ├── assistant/
│   │   ├── components/          # Chat, avatar, trạng thái và nút mở
│   │   └── services/            # Tích hợp Gemini
│   ├── friends/pages/
│   └── home/
│       ├── pages/               # LandingPage
│       └── content/             # Nội dung footer
└── shared/                      # Mã dùng chung
    ├── components/              # Modal, MathText, RichTextRenderer
    ├── config/                  # Firebase
    ├── hooks/                   # useDocumentTitle
    ├── math/                    # ASCII Math, MathML, OMML, chuẩn hóa LaTeX
    └── utils/                   # cn

public/                          # Logo và mascot đang sử dụng
archive/                         # Snapshot, template và chat cũ để tra cứu
```

## Quy ước phát triển

- `app` quản lý router, layout và providers; logic nghiệp vụ nằm trong `features`.
- Mã riêng của một tính năng nằm trong thư mục tính năng đó. Chỉ tạo thư mục
  `components`, `hooks`, `services`, `parsers` khi có mã cần đặt vào.
- `shared` không import từ `features` hoặc `app`.
- Khi cần dùng một tính năng khác, ưu tiên API nhỏ có tên rõ ràng (ví dụ `useAuth`);
  tránh import page của tính năng khác.
- Import nội bộ cùng tính năng dùng đường dẫn tương đối. Import giữa các phần
  dùng alias `@/`, được khai báo trong `vite.config.js` và `jsconfig.json`.
- Các trang nặng được lazy-load tại `app/router/AppRoutes.jsx`.
- Mã trong `archive` được loại khỏi ESLint và không được import vào `src`.
  Muốn phục hồi, chuyển mã về tính năng phù hợp và cập nhật import trước.

Các trang đề thi lớn hiện vẫn giữ nguyên logic. Khi bổ sung chức năng, tách UI
thành component, state/effect thành hook và truy cập dữ liệu thành service trong
`features/exams`, thay vì tiếp tục mở rộng page.
