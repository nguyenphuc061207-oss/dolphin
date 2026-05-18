import { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, onSnapshot } from "firebase/firestore";
import { useAuth } from "../contexts/AuthContext";
import { Copy, UserPlus, Trash2, Check, X } from "lucide-react";

export default function Friends() {
  const { currentUser } = useAuth();
  const [friends, setFriends] = useState([]);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [searchName, setSearchName] = useState("");
  const [searchId, setSearchId] = useState("");
  const [loading, setLoading] = useState(false);

  // Lắng nghe thời gian thực danh sách bạn bè và lời mời kết bạn
  useEffect(() => {
    if (!currentUser) return;

    // 1. Lắng nghe danh sách bạn bè
    const qFriends = query(
      collection(db, "friendships"),
      where("userId", "==", currentUser.uid)
    );
    const unsubscribeFriends = onSnapshot(qFriends, (snap) => {
      const list = [];
      snap.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      setFriends(list);
    }, (err) => {
      console.error("Lỗi lắng nghe danh sách bạn bè:", err);
    });

    // 2. Lắng nghe lời mời kết bạn đã nhận
    const qReqs = query(
      collection(db, "friendRequests"),
      where("toUid", "==", currentUser.uid),
      where("status", "==", "pending")
    );
    const unsubscribeReqs = onSnapshot(qReqs, (snap) => {
      const list = [];
      snap.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      setIncomingRequests(list);
    }, (err) => {
      console.error("Lỗi lắng nghe lời mời kết bạn:", err);
    });

    return () => {
      unsubscribeFriends();
      unsubscribeReqs();
    };
  }, [currentUser]);

  // Hỗ trợ tự động điền Tên và ID khi dán chuỗi định danh dạng "Họ Tên #ID"
  const handleNameChange = (val) => {
    if (val.includes("#")) {
      const parts = val.split("#");
      const name = parts[0].trim();
      const id = parts[1].trim();
      setSearchName(name);
      setSearchId(id);
    } else {
      setSearchName(val);
    }
  };

  // Gửi lời mời kết bạn
  const handleAddFriend = async () => {
    const trimmedName = searchName.trim();
    const trimmedId = searchId.trim();

    if (!trimmedName || !trimmedId) {
      return alert("Vui lòng nhập tên và ID của bạn bè.");
    }
    if (trimmedId === currentUser.shortId && trimmedName.toLowerCase() === currentUser.displayName.toLowerCase()) {
      return alert("Bạn không thể tự gửi lời mời kết bạn cho chính mình.");
    }
    setLoading(true);
    try {
      // 1. Tìm người dùng có shortId trùng khớp
      const q = query(
        collection(db, "users"),
        where("shortId", "==", trimmedId)
      );
      const snap = await getDocs(q);
      if (snap.empty) {
        alert("Không tìm thấy người dùng với ID đã nhập.");
        setLoading(false);
        return;
      }

      // 2. So khớp tên không phân biệt viết hoa/viết thường và khoảng trắng để tăng trải nghiệm người dùng
      const matchedDoc = snap.docs.find((d) => {
        const dbName = d.data().displayName || "";
        return dbName.trim().toLowerCase() === trimmedName.toLowerCase();
      });

      if (!matchedDoc) {
        alert("Tên người dùng không khớp với ID đã nhập. Vui lòng kiểm tra lại chính xác họ tên.");
        setLoading(false);
        return;
      }

      const friendUid = matchedDoc.id;
      const friendData = matchedDoc.data();

      // 3. Kiểm tra xem đã là bạn bè chưa
      const isAlreadyFriend = friends.some((f) => f.friendId === friendUid);
      if (isAlreadyFriend) {
        alert("Bạn và người này đã là bạn bè.");
        setLoading(false);
        return;
      }

      // 4. Kiểm tra xem đã gửi yêu cầu đi chưa
      const qSent = query(
        collection(db, "friendRequests"),
        where("fromUid", "==", currentUser.uid),
        where("toUid", "==", friendUid),
        where("status", "==", "pending")
      );
      const snapSent = await getDocs(qSent);
      if (!snapSent.empty) {
        alert("Bạn đã gửi lời mời kết bạn cho người này rồi. Vui lòng chờ họ phản hồi.");
        setLoading(false);
        return;
      }

      // 5. Kiểm tra xem có yêu cầu từ đối phương chưa
      const qReceived = query(
        collection(db, "friendRequests"),
        where("fromUid", "==", friendUid),
        where("toUid", "==", currentUser.uid),
        where("status", "==", "pending")
      );
      const snapReceived = await getDocs(qReceived);
      if (!snapReceived.empty) {
        alert("Người này đã gửi lời mời kết bạn cho bạn rồi. Vui lòng duyệt lời mời bên dưới!");
        setLoading(false);
        return;
      }

      // 6. Tạo tài liệu lời mời kết bạn mới
      await addDoc(collection(db, "friendRequests"), {
        fromUid: currentUser.uid,
        fromName: currentUser.displayName,
        fromShortId: currentUser.shortId,
        toUid: friendUid,
        toName: friendData.displayName,
        toShortId: friendData.shortId,
        status: "pending",
        createdAt: new Date()
      });

      alert("Đã gửi lời mời kết bạn thành công!");
      setSearchName("");
      setSearchId("");
    } catch (e) {
      console.error(e);
      alert("Lỗi khi gửi lời mời kết bạn.");
    }
    setLoading(false);
  };

  // Chấp nhận lời mời kết bạn
  const handleAcceptRequest = async (reqItem) => {
    try {
      // 1. Tạo liên kết bạn bè 2 chiều đồng bộ
      await addDoc(collection(db, "friendships"), {
        userId: reqItem.fromUid,
        friendId: reqItem.toUid,
        friendName: reqItem.toName,
        friendShortId: reqItem.toShortId,
        createdAt: new Date()
      });

      await addDoc(collection(db, "friendships"), {
        userId: reqItem.toUid,
        friendId: reqItem.fromUid,
        friendName: reqItem.fromName,
        friendShortId: reqItem.fromShortId,
        createdAt: new Date()
      });

      // 2. Xóa lời mời kết bạn
      await deleteDoc(doc(db, "friendRequests", reqItem.id));

      alert(`Đã đồng ý kết bạn với ${reqItem.fromName}!`);
    } catch (e) {
      console.error(e);
      alert("Lỗi khi chấp nhận kết bạn.");
    }
  };

  // Từ chối lời mời kết bạn
  const handleDeclineRequest = async (reqId) => {
    if (!window.confirm("Bạn có chắc muốn từ chối lời mời kết bạn này?")) return;
    try {
      await deleteDoc(doc(db, "friendRequests", reqId));
      alert("Đã từ chối lời mời.");
    } catch (e) {
      console.error(e);
      alert("Lỗi khi từ chối kết bạn.");
    }
  };

  // Hủy kết bạn
  const handleRemoveFriend = async (friendItem) => {
    if (!window.confirm(`Bạn có chắc chắn muốn hủy kết bạn với ${friendItem.friendName}?`)) return;
    try {
      // Xóa phía người dùng hiện tại
      await deleteDoc(doc(db, "friendships", friendItem.id));
      
      // Xóa phía đối phương để đảm bảo đồng bộ
      const qOpposite = query(
        collection(db, "friendships"),
        where("userId", "==", friendItem.friendId),
        where("friendId", "==", currentUser.uid)
      );
      const snapOpposite = await getDocs(qOpposite);
      if (!snapOpposite.empty) {
        await deleteDoc(doc(db, "friendships", snapOpposite.docs[0].id));
      }

      alert("Đã hủy kết bạn thành công.");
    } catch (e) {
      console.error(e);
      alert("Hủy kết bạn thất bại.");
    }
  };

  // Sao chép tên và ID cá nhân
  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      alert("Đã sao chép thông tin cá nhân: " + text);
    } catch (e) {
      console.error(e);
      alert("Sao chép thất bại.");
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-10 px-6 select-none">
      {/* Tiêu đề & Thông tin định danh của bạn - Notion Minimalist Style */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-gray-150 gap-4 mb-10">
        <div className="text-left">
          <h2 className="text-3xl font-extrabold tracking-tight text-gray-900">Bạn bè</h2>
          <p className="text-sm font-medium text-gray-400 mt-1">Kết nối, gửi lời mời và quản lý bạn bè của bạn trên hệ thống</p>
        </div>

        {/* Định danh cá nhân cực tối giản */}
        <div className="flex items-center gap-3 bg-gray-50 border border-gray-200/80 px-4 py-2.5 rounded-2xl shadow-sm">
          <div className="flex flex-col text-left">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none">Định danh cá nhân</span>
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className="text-sm font-bold text-gray-800">{currentUser?.displayName}</span>
              <span className="text-xs font-bold text-blue-600 bg-blue-50/80 px-2.5 py-0.5 rounded-lg">#{currentUser?.shortId}</span>
            </div>
          </div>
          <button
            onClick={() => copyToClipboard(`${currentUser?.displayName} #${currentUser?.shortId}`)}
            className="p-2.5 bg-white hover:bg-gray-50 text-gray-500 hover:text-gray-800 border border-gray-200 rounded-xl transition-all shadow-xs active:scale-95 cursor-pointer flex items-center justify-center"
            title="Sao chép tên & ID của bạn"
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Grid Layout 2 cột tối giản */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Cột trái: Form kết nối & Lời mời kết bạn */}
        <div className="lg:col-span-5 space-y-6">
          {/* Lời mời kết bạn đã nhận */}
          {incomingRequests.length > 0 && (
            <div className="bg-white border border-gray-200/80 rounded-2xl p-6 shadow-xs animate-in fade-in slide-in-from-bottom-2 duration-300">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-emerald-600 animate-pulse" /> Lời mời đã nhận ({incomingRequests.length})
              </h3>
              <div className="space-y-3">
                {incomingRequests.map((req) => (
                  <div key={req.id} className="flex items-center justify-between p-3.5 bg-gray-50 border border-gray-200/50 rounded-xl">
                    <div className="flex flex-col text-left">
                      <span className="font-semibold text-gray-800 text-sm">{req.fromName}</span>
                      <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">ID: #{req.fromShortId}</span>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => handleAcceptRequest(req)}
                        className="p-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold flex items-center gap-1 text-[11px] transition-colors cursor-pointer shadow-xs"
                        title="Chấp nhận kết bạn"
                      >
                        <Check className="w-3.5 h-3.5" /> Đồng ý
                      </button>
                      <button
                        onClick={() => handleDeclineRequest(req.id)}
                        className="p-1.5 px-3 bg-gray-200/80 hover:bg-gray-200 text-gray-600 rounded-lg font-bold flex items-center gap-1 text-[11px] transition-colors cursor-pointer"
                        title="Từ chối lời mời"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Form gửi lời mời kết bạn mới */}
          <div className="bg-white border border-gray-200/80 rounded-2xl p-6 shadow-xs">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-gray-400" /> Kết nối bạn mới
            </h3>
            <div className="space-y-4">
              <div className="text-left">
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Tên người bạn</label>
                <input
                  type="text"
                  placeholder="Nhập tên hoặc dán dạng 'Họ Tên #ID'..."
                  value={searchName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-sm font-medium text-gray-800 transition-all placeholder-gray-400"
                />
              </div>
              <div className="text-left">
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">ID định danh (4 chữ số)</label>
                <input
                  type="text"
                  placeholder="Ví dụ: 2252"
                  value={searchId}
                  onChange={(e) => setSearchId(e.target.value)}
                  maxLength={4}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-sm font-medium text-gray-800 transition-all placeholder-gray-400"
                />
              </div>
              <button
                onClick={handleAddFriend}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm shadow-xs transition-all active:scale-98 cursor-pointer mt-2"
              >
                {loading ? "Đang gửi..." : "Gửi lời mời kết bạn"}
              </button>
            </div>
          </div>
        </div>

        {/* Cột phải: Danh sách bạn bè */}
        <div className="lg:col-span-7">
          <div className="bg-white border border-gray-200/80 rounded-2xl p-6 shadow-xs min-h-[350px] flex flex-col">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 text-left">
              Danh sách bạn bè ({friends.length})
            </h3>
            {friends.length === 0 ? (
              <div className="flex-grow flex flex-col items-center justify-center py-12 text-gray-400 border border-dashed border-gray-200 rounded-xl bg-gray-50/50">
                <p className="text-sm font-medium">Bạn chưa có bạn bè nào.</p>
                <p className="text-[11px] text-gray-400 mt-0.5">Hãy dán ID định danh của đối phương để kết nối ngay!</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 max-h-[450px] overflow-y-auto pr-1">
                {friends.map((friend) => (
                  <div key={friend.id} className="flex items-center justify-between py-3.5 first:pt-0 last:pb-0 group">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-700 group-hover:text-gray-900 transition-colors text-sm">{friend.friendName}</span>
                      <span className="text-[10px] bg-gray-50 border border-gray-200/60 text-gray-400 px-2 py-0.5 rounded-lg font-bold">#{friend.friendShortId}</span>
                    </div>
                    <button
                      onClick={() => handleRemoveFriend(friend)}
                      className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer lg:opacity-0 lg:group-hover:opacity-100 lg:focus:opacity-100"
                      title="Hủy kết bạn"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
