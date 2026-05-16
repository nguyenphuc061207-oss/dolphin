import { signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { auth } from "../firebase";
import { useNavigate } from "react-router-dom";

export default function Login() {
    const navigate = useNavigate();

    const handleGoogleLogin = async () => {
        const provider = new GoogleAuthProvider();
        try {
            const result = await signInWithPopup(auth, provider);
            // Log ra để kiểm tra xem đã lấy được thông tin người dùng chưa
            console.log("Đăng nhập thành công:", result.user.displayName, result.user.email);
            // Tạm thời điều hướng về trang chủ sau khi đăng nhập thành công
            navigate("/");
        } catch (error) {
            console.error("Lỗi đăng nhập:", error);
            alert("Đăng nhập thất bại, vui lòng kiểm tra lại cấu hình Firebase!");
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen w-full bg-gray-50 absolute top-0 left-0">
            <div className="p-8 bg-white rounded-xl shadow-lg w-96 flex flex-col items-center">
                <h2 className="text-2xl font-bold text-gray-800 mb-6">Đăng nhập hệ thống</h2>
                <button
                    onClick={handleGoogleLogin}
                    className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 font-medium text-gray-700 transition-all"
                >
                    <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="w-5 h-5" />
                    Tiếp tục với Google
                </button>
            </div>
        </div>
    );
}