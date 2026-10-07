import { useEffect, useState } from "react";
import { AuthContext } from '../context/AuthContext';
import { auth, db } from "@/shared/config/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { withTimeout } from '@/shared/utils/runtimeSafety';

export const AuthProvider = ({ children }) => {
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [retry, setRetry] = useState(0);

    useEffect(() => {
        let generation = 0;
        let active = true;
        // Lắng nghe sự thay đổi trạng thái đăng nhập từ Firebase
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            const request = ++generation;
            setLoading(true);
            setError('');
            setCurrentUser(null);
            try {
            if (user) {
                // Tham chiếu đến document của user trong collection 'users'
                const userRef = doc(db, "users", user.uid);
                const userSnap = await withTimeout(getDoc(userRef));

                let userData = {
                    uid: user.uid,
                    email: user.email,
                    displayName: user.displayName,
                };

                // Nếu user chưa tồn tại trong Database, tiến hành tạo mới
                if (!userSnap.exists()) {
                    userData.shortId = Math.floor(1000 + Math.random() * 9000).toString();
                    userData.role = "student"; // Mặc định gán quyền là học sinh
                    userData.createdAt = new Date();
                    await withTimeout(setDoc(userRef, userData));
                } else {
                    const data = userSnap.data();
                    // Nếu đã có, lấy thông tin hiện tại từ Database
                    userData.role = data.role;
                    if (data.shortId) {
                        userData.shortId = data.shortId;
                    } else {
                        userData.shortId = Math.floor(1000 + Math.random() * 9000).toString();
                        await withTimeout(setDoc(userRef, { shortId: userData.shortId }, { merge: true }));
                    }
                }

                if (active && request === generation) setCurrentUser(userData);
            } else {
                if (active && request === generation) setCurrentUser(null);
            }
            } catch (err) {
                console.error('Không tải được hồ sơ đăng nhập:', err);
                if (active && request === generation) setError('Không tải được hồ sơ đăng nhập. Kiểm tra kết nối rồi thử lại.');
            } finally {
                if (active && request === generation) setLoading(false);
            }
        }, () => {
            if (active) { setError('Không xác định được trạng thái đăng nhập. Vui lòng thử lại.'); setLoading(false); }
        });

        return () => { active = false; generation++; unsubscribe(); };
    }, [retry]);

    return (
        <AuthContext.Provider value={{ currentUser }}>
            {loading ? <div className="min-h-screen flex items-center justify-center text-gray-500" role="status"><span>Đang mở không gian Dolphin…</span></div> : error ? <div className="min-h-screen flex flex-col gap-4 items-center justify-center p-6"><p role="alert">{error}</p><button className="px-4 py-2 rounded-xl bg-blue-600 text-white" onClick={() => setRetry(v => v + 1)}>Thử lại</button></div> : children}
        </AuthContext.Provider>
    );
};
