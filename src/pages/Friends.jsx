import { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, query, where, getDocs, addDoc, deleteDoc, doc } from "firebase/firestore";
import { useAuth } from "../contexts/AuthContext";
import { Copy, UserPlus, Trash2 } from "lucide-react";

export default function Friends() {
  const { currentUser } = useAuth();
  const [friends, setFriends] = useState([]);
  const [searchName, setSearchName] = useState("");
  const [searchId, setSearchId] = useState("");
  const [loading, setLoading] = useState(false);

  // Load friends list
  useEffect(() => {
    if (!currentUser) return;
    const fetchFriends = async () => {
      const q = query(collection(db, "friendships"), where("userId", "==", currentUser.uid));
      const snap = await getDocs(q);
      const list = [];
      snap.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      setFriends(list);
    };
    fetchFriends();
  }, [currentUser]);

  const handleAddFriend = async () => {
    if (!searchName.trim() || !searchId.trim()) {
      return alert("Vui lòng nhập tên và ID của bạn bè.");
    }
    setLoading(true);
    try {
      // Tìm người dùng trong collection "users"
      const q = query(
        collection(db, "users"),
        where("shortId", "==", searchId.trim()),
        where("displayName", "==", searchName.trim())
      );
      const snap = await getDocs(q);
      if (snap.empty) {
        alert("Không tìm thấy người dùng với tên và ID đã nhập.");
        setLoading(false);
        return;
      }
      const userDoc = snap.docs[0];
      const friendUid = userDoc.id;
      // Kiểm tra đã có bạn bè chưa
      const existing = friends.find((f) => f.friendId === friendUid);
      if (existing) {
        alert("Bạn đã là bạn bè với người này.");
        setLoading(false);
        return;
      }
      await addDoc(collection(db, "friendships"), {
        userId: currentUser.uid,
        friendId: friendUid,
        friendName: userDoc.data().displayName,
        friendShortId: userDoc.data().shortId,
        createdAt: new Date()
      });
      // Refresh list
      setFriends((prev) => [
        ...prev,
        {
          userId: currentUser.uid,
          friendId: friendUid,
          friendName: userDoc.data().displayName,
          friendShortId: userDoc.data().shortId,
          id: "temp-" + Date.now()
        }
      ]);
      setSearchName("");
      setSearchId("");
    } catch (e) {
      console.error(e);
      alert("Lỗi khi thêm bạn bè.");
    }
    setLoading(false);
  };

  const handleRemoveFriend = async (docId) => {
    if (!window.confirm("Bạn có chắc muốn xóa bạn bè này?")) return;
    try {
      await deleteDoc(doc(db, "friendships", docId));
      setFriends((prev) => prev.filter((f) => f.id !== docId));
    } catch (e) {
      console.error(e);
      alert("Xóa bạn bè thất bại.");
    }
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      alert("Đã sao chép: " + text);
    } catch (e) {
      console.error(e);
      alert("Sao chép thất bại.");
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-10 px-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Kết bạn</h2>

      {/* Form add friend */}
      <div className="bg-white rounded-xl shadow-md p-6 mb-8 border border-gray-100">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            type="text"
            placeholder="Tên người bạn"
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="text"
            placeholder="ID (4 chữ số)"
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
            maxLength={4}
            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          onClick={handleAddFriend}
          disabled={loading}
          className="mt-4 flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition"
        >
          <UserPlus className="w-4 h-4" /> Thêm bạn
        </button>
      </div>

      {/* Friends list */}
      <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Danh sách bạn bè</h3>
        {friends.length === 0 ? (
          <p className="text-gray-500">Bạn chưa có bạn bè nào.</p>
        ) : (
          <ul className="space-y-3">
            {friends.map((friend) => (
              <li key={friend.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                <div className="flex items-center space-x-2">
                  <span className="font-medium text-gray-900">{friend.friendName}</span>
                  <span className="text-sm text-gray-500">#{friend.friendShortId}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => copyToClipboard(`${friend.friendName} #${friend.friendShortId}`)}
                    className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-200 rounded"
                    title="Sao chép tên + ID"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleRemoveFriend(friend.id)}
                    className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-100 rounded"
                    title="Xóa bạn bè"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
