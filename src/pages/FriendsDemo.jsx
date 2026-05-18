import { useState } from "react";
import { Copy, UserPlus, Trash2, Users } from "lucide-react";

export default function FriendsDemo() {
  const [friends, setFriends] = useState([
    {
      id: "1",
      friendName: "Nguyễn Văn A",
      friendShortId: "1234",
    },
    {
      id: "2",
      friendName: "Trần Thị B",
      friendShortId: "5678",
    },
    {
      id: "3",
      friendName: "Lê Minh C",
      friendShortId: "9012",
    },
  ]);

  const [searchName, setSearchName] = useState("");
  const [searchId, setSearchId] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(null);

  const handleAddFriend = async () => {
    if (!searchName.trim() || !searchId.trim()) {
      alert("Vui lòng nhập tên và ID của bạn bè.");
      return;
    }
    setLoading(true);
    setTimeout(() => {
      setFriends((prev) => [
        ...prev,
        {
          id: "temp-" + Date.now(),
          friendName: searchName,
          friendShortId: searchId,
        },
      ]);
      setSearchName("");
      setSearchId("");
      setLoading(false);
    }, 500);
  };

  const handleRemoveFriend = async (docId) => {
    if (!window.confirm("Bạn có chắc muốn xóa bạn bè này?")) return;
    setFriends((prev) => prev.filter((f) => f.id !== docId));
  };

  const copyToClipboard = async (text, id) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    } catch (e) {
      console.error(e);
      alert("Sao chép thất bại.");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto py-12 px-6 md:px-8">
        {/* Header */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-3">
            <Users className="w-6 h-6 text-foreground" />
            <h1 className="text-4xl font-light text-foreground tracking-tight">Kết nối bạn bè</h1>
          </div>
          <p className="text-base text-muted-foreground">Quản lý danh sách bạn bè của bạn</p>
        </div>

        {/* Add Friend Section */}
        <div className="mb-12">
          <h2 className="text-lg font-medium text-foreground mb-6">Thêm bạn mới</h2>
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Tên người bạn"
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
                className="px-4 py-3 bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-foreground focus:border-foreground text-foreground placeholder-muted-foreground transition-colors"
              />
              <input
                type="text"
                placeholder="ID (4 chữ số)"
                value={searchId}
                onChange={(e) => setSearchId(e.target.value)}
                maxLength={4}
                className="px-4 py-3 bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-foreground focus:border-foreground text-foreground placeholder-muted-foreground transition-colors"
              />
            </div>
            <button
              onClick={handleAddFriend}
              disabled={loading}
              className="w-full md:w-auto px-6 py-3 bg-foreground text-background font-medium rounded-lg hover:bg-opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <UserPlus className="w-4 h-4" />
              {loading ? "Đang thêm..." : "Thêm bạn"}
            </button>
          </div>
        </div>

        {/* Friends List */}
        <div className="mb-8">
          <h2 className="text-lg font-medium text-foreground mb-6">
            Danh sách bạn bè ({friends.length})
          </h2>
          {friends.length === 0 ? (
            <div className="py-12 text-center">
              <Users className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className="text-muted-foreground">Bạn chưa có bạn bè nào</p>
              <p className="text-sm text-muted-foreground mt-1">Hãy thêm bạn bè để bắt đầu</p>
            </div>
          ) : (
            <div className="space-y-2">
              {friends.map((friend) => (
                <div
                  key={friend.id}
                  className="flex items-center justify-between p-4 bg-secondary border border-border rounded-lg hover:border-foreground/30 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-foreground/10 flex items-center justify-center">
                      <span className="text-sm font-medium text-foreground">
                        {friend.friendName.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{friend.friendName}</p>
                      <p className="text-sm text-muted-foreground">#{friend.friendShortId}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() =>
                        copyToClipboard(
                          `${friend.friendName} #${friend.friendShortId}`,
                          friend.id
                        )
                      }
                      className={`p-2 rounded-lg transition-colors ${
                        copied === friend.id
                          ? "bg-green-100 text-green-600"
                          : "hover:bg-background text-muted-foreground hover:text-foreground"
                      }`}
                      title="Sao chép"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleRemoveFriend(friend.id)}
                      className="p-2 rounded-lg hover:bg-red-100 text-muted-foreground hover:text-red-600 transition-colors"
                      title="Xóa bạn bè"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
