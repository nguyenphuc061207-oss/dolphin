import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function ProtectedRoute({ children, allowedRole }) {
    const { currentUser } = useAuth();

    // Nếu chưa đăng nhập, tự động đẩy về trang /login
    if (!currentUser) {
        return <Navigate to="/login" replace />;
    }

    // Nếu đã đăng nhập nhưng không khớp quyền (ví dụ học sinh cố vào trang giáo viên)
    if (allowedRole && currentUser.role !== allowedRole) {
        return (
            <div className="flex flex-col items-center justify-center p-8 bg-white rounded-lg shadow-md mt-10">
                <h2 className="text-2xl font-bold text-red-500 mb-2">Truy cập bị từ chối</h2>
                <p className="text-gray-600">Bạn không có quyền truy cập vào khu vực này!</p>
            </div>
        );
    }

    // Nếu vượt qua hết các trạm kiểm tra, cho phép render component con (children)
    return children;
}