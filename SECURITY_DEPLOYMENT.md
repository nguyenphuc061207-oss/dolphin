# Triển khai backend bảo vệ đáp án

Bản này thay đổi giao thức làm bài và cấu trúc dữ liệu. Chỉ deploy frontend hoặc
chỉ deploy Rules sẽ khiến luồng cũ không hoạt động. Không còn cơ chế quay về chấm
điểm trên trình duyệt khi API gặp lỗi.

## Chuẩn bị

- Dự án Firebase: `azota-c0e26`. Cloud Functions cần gói Blaze; việc bật thanh toán
  và thay đổi dự án thật cần chủ dự án quyết định.
- Node 22, Java 21 trở lên cho Emulator, Firebase CLI và thông tin đăng nhập có
  quyền triển khai. Script migration dùng Application Default Credentials hoặc
  service account qua `GOOGLE_APPLICATION_CREDENTIALS`; không đưa khóa vào Git.
- Đăng ký App Check cho web app hiện có bằng reCAPTCHA Enterprise, khai báo đúng
  domain website. Đặt `VITE_APPCHECK_SITE_KEY` trên môi trường build frontend.
  Các callable bắt buộc App Check trong production; thiếu cấu hình sẽ bị từ chối.
- Cài backend: `npm ci --prefix functions`. Không cần cấp khóa dịch vụ cho frontend.

## Kiểm thử cục bộ

```sh
npm --prefix functions test
firebase emulators:exec --project demo-dolphin-access --only firestore,functions,auth "node tests/secure-emulator.mjs"
node --test tests/exam-progress.test.mjs tests/exam-security.test.mjs tests/runtime-safety.test.mjs
node tests/exam-progress.browser.mjs <đường-dẫn-gói-playwright>
pnpm build
```

Emulator dùng dữ liệu giả, không được đổi project demo thành project production
trong các script kiểm thử. Khi gọi API trên production, UID được lấy từ Firebase
Auth, không nhận từ payload. App Check không thay thế việc kiểm tra quyền.

## Chuyển hệ thống trong thời gian bảo trì

1. Thông báo và chọn thời điểm không có bài đang thi. Lưu bản Rules đang chạy và
   phiên bản frontend hiện tại để đối chiếu. Đáp án từng tải xuống thiết bị cũ không
   thể thu hồi; với đề có yêu cầu bảo mật cao, thay bộ câu hỏi đã bị lộ.
2. Deploy **Rules mới trước** để chặn đọc/ghi trực tiếp secrets, điểm và document
   bài thi cũ từ học sinh. Không tạo secrets khi Rules wildcard cũ còn hiệu lực:

   ```sh
   firebase deploy --project azota-c0e26 --only firestore:rules
   firebase deploy --project azota-c0e26 --only functions:exam-security
   ```

3. Kiểm tra dữ liệu trước khi chuyển (mặc định chỉ đọc):

   ```sh
   node functions/migrate.js --project azota-c0e26
   ```

   Nếu thiếu snapshot/đáp án, thiếu giáo viên của đề đã xóa hoặc không xác định
   duy nhất học sinh trong danh sách hạn chế, script báo ID và dừng. Không tự đoán
   chủ sở hữu. Có thể cung cấp `--owner-map PATH` với mapping `{examId: teacherUid}`
   đã được chủ dự án xác minh cho các đề đã xóa.
   Thời gian cũ không có timezone được hiểu là UTC+7 (Việt Nam); nếu dữ liệu cũ
   dùng múi giờ khác, truyền `--legacy-offset` với offset đã xác minh.

4. Sau khi báo cáo không còn lỗi, chuyển dữ liệu:

   ```sh
   node functions/migrate.js --project azota-c0e26 --apply
   ```

   Script khóa API và chỉnh sửa đề/kết quả, lưu backup vào
   `security-backups.local/` rồi tách đáp án khỏi document được đọc. Backup chứa
   thông tin riêng và đáp án: giữ ngoài Git. Điểm, bài ẩn và số lượt cũ được giữ.
   Script có thể chạy lại; không ghi đè secrets của dữ liệu đã chuyển xong.
   Nếu lỗi giữa chừng, bảo trì vẫn giữ bật để tiếp tục xử lý.

5. Build và triển khai frontend mới với site key App Check. Kiểm tra tài khoản
   học sinh/giáo viên, mở đề, danh sách kết quả và lịch công bố; sau đó mở lại API:

   ```sh
   node functions/migrate.js --project azota-c0e26 --resume
   ```

6. Xác minh bài hạn chế chỉ nhận đúng UID được cấp quyền, không còn đáp án trong
   Network/localStorage trước công bố, học sinh không ghi được điểm/hạn giờ, và
   giáo viên vẫn xem/chấm lại được bài. Kiểm tra đồng thời các luồng kết bạn.

## Bài dở và mất mạng

Lượt mới có mã, thứ tự câu hỏi và hạn giờ do server giữ. Bản nháp chỉ lưu câu hỏi
đã loại đáp án cùng câu trả lời; các thay đổi đồng bộ lên server sau 600 ms.
Khi còn giờ, bản nháp chưa đồng bộ được khôi phục để gửi lại. Khi đã hết giờ,
backend chỉ chấm câu trả lời nhận được trước hạn, không tin deadline/localStorage
của trình duyệt. Không thể bảo đảm chấm câu trả lời chỉ lưu offline sau hạn giờ.

Bản làm dở từ hệ thống cũ không có thời gian/thứ tự được server xác nhận. Frontend
giữ một bản sao đã loại đáp án ở `exam_legacy_progress_<examId>_<uid>` để hỗ trợ
khôi phục với giáo viên; không tự nhập nó thành lượt hợp lệ hoặc gia hạn bài.
Các cache và extension đã giữ đáp án từ phiên bản cũ không thể được website xóa.

## Khôi phục dữ liệu

`functions/restore-migration.js --project PROJECT --backup PATH` mặc định chỉ
kiểm tra; thêm `--apply` để ghi lại các document có trong backup. Script giữ bảo
trì bật, không xóa các lượt thi mới và không tự đưa Rules cũ trở lại. Sau khi khôi
phục, xử lý nguyên nhân và chạy lại migration trước khi mở API. Nếu quay lại
frontend/Rules cũ, lỗ hổng đọc đáp án sẽ trở lại.

## Giới hạn

Giới hạn API hiện là 120 yêu cầu/phút/tài khoản, được thực thi bằng transaction.
Log chỉ chứa loại thao tác, UID và mã lỗi, không chứa đáp án hoặc mật khẩu.
Đồng hồ hiển thị và phát hiện rời tab chỉ hỗ trợ giao diện; quyết định hạn giờ,
lượt thi và điểm nằm ở backend. Công cụ đọc dữ liệu không nhận được đáp án chưa
công bố; việc chụp câu hỏi rồi dùng AI tự giải không thể bị ngăn tuyệt đối bằng web.
