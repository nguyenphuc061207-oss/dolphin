import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function ProtectedRoute({ children }) {
    const { currentUser } = useAuth();

    // Nếu chưa đăng nhập, tự động đẩy về trang /login
    if (!currentUser) {
        return <Navigate to="/login" replace />;
    }

    // Đã gỡ bỏ phân chia quyền, ai đã đăng nhập cũng có thể vào
    return children;
}