import { createContext, useContext, useEffect, useState } from "react";
import { auth, db } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Lắng nghe sự thay đổi trạng thái đăng nhập từ Firebase
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                // Tham chiếu đến document của user trong collection 'users'
                const userRef = doc(db, "users", user.uid);
                const userSnap = await getDoc(userRef);

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
                    await setDoc(userRef, userData);
                } else {
                    const data = userSnap.data();
                    // Nếu đã có, lấy thông tin hiện tại từ Database
                    userData.role = data.role;
                    if (data.shortId) {
                        userData.shortId = data.shortId;
                    } else {
                        userData.shortId = Math.floor(1000 + Math.random() * 9000).toString();
                        await setDoc(userRef, { shortId: userData.shortId }, { merge: true });
                    }
                }

                setCurrentUser(userData);
            } else {
                setCurrentUser(null);
            }
            setLoading(false);
        });

        return unsubscribe; // Dọn dẹp listener khi component unmount
    }, []);

    return (
        <AuthContext.Provider value={{ currentUser }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};