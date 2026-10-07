import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/features/auth/hooks/useAuth";

export default function ProtectedRoute({ children }) {
    const { currentUser } = useAuth();
    const location = useLocation();

    // Nếu chưa đăng nhập, tự động đẩy về trang /login
    if (!currentUser) {
        return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
    }

    // Đã gỡ bỏ phân chia quyền, ai đã đăng nhập cũng có thể vào
    return children;
}
