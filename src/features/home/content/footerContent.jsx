import React from 'react';

export const footerDocuments = {
  terms: {
    title: "Điều khoản dịch vụ",
    content: (
      <div className="space-y-4 text-gray-600 leading-relaxed">
        <h4 className="text-lg font-bold text-gray-900">1. Giới thiệu chung</h4>
        <p>Chào mừng bạn đến với Dolphin - Nền tảng quản lý thi thông minh. Việc truy cập và sử dụng dịch vụ của chúng tôi đồng nghĩa với việc bạn đồng ý tuân thủ các quy định dưới đây.</p>
        
        <h4 className="text-lg font-bold text-gray-900 mt-6">2. Trách nhiệm của người dùng</h4>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Giáo viên:</strong> Chịu trách nhiệm hoàn toàn về nội dung câu hỏi và tính chính xác của đề thi do mình tạo ra trên hệ thống.</li>
          <li><strong>Học sinh:</strong> Tuân thủ nghiêm ngặt quy chế thi. Hệ thống có tích hợp tính năng giám sát chống gian lận (ghi nhận số lần thoát tab/chuyển cửa sổ trong lúc thi).</li>
        </ul>

        <h4 className="text-lg font-bold text-gray-900 mt-6">3. Đăng nhập bằng Google</h4>
        <p>Nền tảng sử dụng duy nhất phương thức đăng nhập qua tài khoản Google để đảm bảo tính an toàn và tiện lợi. Bạn tự chịu trách nhiệm bảo mật tài khoản Google của mình.</p>
      </div>
    )
  },
  privacy: {
    title: "Chính sách bảo mật",
    content: (
      <div className="space-y-4 text-gray-600 leading-relaxed">
        <h4 className="text-lg font-bold text-gray-900">1. Thu thập thông tin</h4>
        <p>Hệ thống chỉ thu thập các thông tin tối thiểu thông qua tài khoản Google của bạn, bao gồm: <strong>Tên hiển thị</strong> và <strong>Địa chỉ Email</strong>. Ngoài ra, chúng tôi lưu trữ lịch sử làm bài, điểm số và số liệu giám sát thi.</p>

        <h4 className="text-lg font-bold text-gray-900 mt-6">2. Sử dụng dữ liệu</h4>
        <p>Dữ liệu của bạn được sử dụng riêng biệt cho việc định danh tài khoản, cung cấp thống kê điểm số cho giáo viên, và đảm bảo tính minh bạch của kỳ thi.</p>

        <h4 className="text-lg font-bold text-gray-900 mt-6">3. Bảo vệ dữ liệu</h4>
        <p>Dolphin cam kết không bán, không chia sẻ thông tin cá nhân hay điểm số của bạn cho bất kỳ bên thứ ba nào vì mục đích thương mại.</p>
      </div>
    )
  },
  guide: {
    title: "Hướng dẫn sử dụng",
    content: (
      <div className="space-y-4 text-gray-600 leading-relaxed">
        <h4 className="text-lg font-bold text-gray-900">1. Dành cho Giáo viên</h4>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Tạo đề thi:</strong> Vào Khu Giáo viên, tạo đề thi với tính năng bóc tách tự động hoặc nhập thủ công. Có thể bật chế độ giám sát chống gian lận (Anti-cheat).</li>
          <li><strong>Theo dõi điểm số:</strong> Hệ thống tự động chấm điểm bài thi trắc nghiệm ngay lập tức.</li>
          <li><strong>Xuất Excel:</strong> Trong trang xem chi tiết điểm bài thi, giáo viên có thể nhấn nút "Xuất File Excel (CSV)" để tải toàn bộ bảng điểm, bao gồm cả lịch sử vi phạm thoát tab của học sinh.</li>
        </ul>

        <h4 className="text-lg font-bold text-gray-900 mt-6">2. Dành cho Học sinh</h4>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Đăng nhập:</strong> Đăng nhập nhanh bằng tài khoản Google.</li>
          <li><strong>Vào thi:</strong> Lấy Mã đề thi từ giáo viên, nhập vào ô tìm kiếm ở Khu Học sinh để bắt đầu.</li>
          <li><strong>Lưu ý khi làm bài:</strong> Nếu đề thi có bật giám sát, việc bạn chuyển sang tab khác hoặc thoát trình duyệt sẽ bị hệ thống ghi nhận vi phạm và báo cáo cho giáo viên.</li>
        </ul>
      </div>
    )
  },
  support: {
    title: "Hỗ trợ khách hàng",
    content: (
      <div className="space-y-4 text-gray-600 leading-relaxed">
        <p>Nếu bạn gặp sự cố khi sử dụng hệ thống Dolphin, vui lòng liên hệ với bộ phận hỗ trợ qua kênh Zalo chính thức.</p>
        
        <div className="bg-blue-50 p-5 rounded-xl border border-blue-100 my-4">
          <h4 className="font-bold text-blue-900 mb-3">Thông tin liên hệ:</h4>
          <div className="flex items-center gap-3">
            <span className="font-semibold text-gray-800">Zalo Hỗ trợ:</span> 
            <a href="https://zalo.me/0564213425" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline font-bold bg-white px-4 py-2 rounded-lg shadow-sm">
              0564213425
            </a>
          </div>
        </div>

        <h4 className="text-lg font-bold text-gray-900 mt-6">Câu hỏi thường gặp (FAQ)</h4>
        <div className="space-y-3">
          <details className="p-4 border border-gray-200 rounded-xl cursor-pointer bg-white group shadow-sm hover:border-blue-300 transition-colors">
            <summary className="font-semibold text-gray-800 outline-none group-open:text-blue-600 transition-colors">Làm sao để lấy lại mật khẩu đăng nhập?</summary>
            <p className="mt-3 text-sm text-gray-600 leading-relaxed pl-4 border-l-2 border-blue-100">
              Hệ thống Dolphin chỉ sử dụng tài khoản Google để đăng nhập. Do đó, bạn không cần và không thể tạo/lấy lại mật khẩu trên hệ thống của chúng tôi. Nếu quên mật khẩu Google, hãy sử dụng tính năng khôi phục của chính Google.
            </p>
          </details>
          <details className="p-4 border border-gray-200 rounded-xl cursor-pointer bg-white group shadow-sm hover:border-blue-300 transition-colors">
            <summary className="font-semibold text-gray-800 outline-none group-open:text-blue-600 transition-colors">Hệ thống có phát hiện gian lận không?</summary>
            <p className="mt-3 text-sm text-gray-600 leading-relaxed pl-4 border-l-2 border-blue-100">
              Có. Nếu giáo viên bật chế độ giám sát, hệ thống sẽ tự động đếm số lần học sinh thoát khỏi màn hình bài thi (chuyển tab, thu nhỏ trình duyệt...) và đính kèm vào báo cáo điểm số.
            </p>
          </details>
        </div>
      </div>
    )
  }
};
