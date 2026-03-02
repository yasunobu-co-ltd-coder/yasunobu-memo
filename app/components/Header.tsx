"use client";

import { useRouter } from "next/navigation";

export default function Header({ userName }: { userName: string }) {
  const router = useRouter();

  const logout = () => {
    localStorage.removeItem("yasunobu_user"); // ←キー名はあなたの実装に合わせて
    router.push("/login");
  };

  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 700 }}>案件一覧</div>
        <div style={{ color: "#666" }}>ログイン中：{userName}</div>
      </div>

      <button onClick={logout} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #ddd" }}>
        ログアウト
      </button>
    </div>
  );
}
