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

## Quyền xem bài nộp

`firestore.rules` bảo vệ cả đọc trực tiếp bằng ID và truy vấn danh sách:

- Học sinh chỉ đọc bài có `studentId` bằng UID đăng nhập.
- Giáo viên đọc, chấm lại và xóa bài thuộc đề có `teacherId` bằng UID đăng nhập.
  Dự án hiện xác định giáo viên phụ trách bằng chủ sở hữu đề, chưa có mô hình lớp
  hoặc quyền quản trị viên riêng. Vai trò trong hồ sơ và `?from=teacher` không cấp quyền.
- Không được đổi `studentId`, `examId` của bài nộp hoặc chiếm `teacherId` của đề.
- Học sinh vẫn ẩn lịch sử và thử nộp lại cùng nội dung khi kết nối bị gián đoạn.
- Các collection khác giữ chính sách cũ; đây không phải bộ phân quyền toàn ứng dụng.

Kiểm thử bằng Firebase CLI và Java 21 trở lên:

```sh
node --test tests/*.test.mjs
firebase emulators:exec --project demo-dolphin-access --only firestore "node --test tests/firestore-access.rules.mjs"
```

Emulator dùng dự án demo và dữ liệu giả, không truy cập dữ liệu thật. Để áp dụng
lên hệ thống đang chạy, triển khai bản frontend mới và Rules vào đúng dự án:

```sh
firebase deploy --project azota-c0e26 --only firestore:rules
```

Chỉ build/deploy frontend không cập nhật Firestore Rules. Không giữ lại rule
wildcard cho phép toàn bộ dữ liệu: các `allow` trùng đường dẫn được kết hợp bằng OR.
Các truy vấn giáo viên chạy theo từng đề để không vượt giới hạn đọc tài liệu khi
Rules kiểm tra chủ sở hữu. Chế độ khóa/thời điểm xem đáp án hiện vẫn do giao diện
xử lý; bài nộp chứa cả điểm và đáp án trong cùng một document.

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
