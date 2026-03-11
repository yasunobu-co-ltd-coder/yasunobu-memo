'use client';

/**
 * 更新案内カード
 *
 * 表示判定ロジックを分離しているため、将来的に
 * - build version 比較
 * - Service Worker の更新検知
 * - Remote Config
 * などへ差し替える場合は shouldShowUpdateNotice() を変更するだけで対応可能。
 */

/* ---------- 表示判定ロジック（将来拡張ポイント） ---------- */
function shouldShowUpdateNotice(): boolean {
  // 現在は環境変数による手動制御
  return process.env.NEXT_PUBLIC_SHOW_UPDATE_NOTICE === 'true';
}

/* ---------- コンポーネント ---------- */
export default function UpdateNotice() {
  if (!shouldShowUpdateNotice()) return null;

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, #eff6ff 0%, #fefce8 100%)',
        border: '1px solid #93c5fd',
        borderRadius: '12px',
        padding: '16px',
        marginBottom: '20px',
        display: 'flex',
        gap: '12px',
        alignItems: 'flex-start',
      }}
    >
      {/* アイコン */}
      <span
        style={{
          fontSize: '22px',
          lineHeight: 1,
          flexShrink: 0,
          marginTop: '2px',
        }}
        aria-hidden="true"
      >
        &#x1F4E2;
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* タイトル */}
        <p
          style={{
            margin: 0,
            fontWeight: 700,
            fontSize: '15px',
            color: '#1e3a5f',
          }}
        >
          新しいバージョンがあります
        </p>

        {/* 本文 */}
        <p
          style={{
            margin: '6px 0 0',
            fontSize: '13px',
            color: '#334155',
            lineHeight: 1.6,
          }}
        >
          アプリが正常に更新されない場合は、ホーム画面のアプリを削除して再追加してください。
        </p>

        {/* 補足文 */}
        <p
          style={{
            margin: '4px 0 0',
            fontSize: '12px',
            color: '#64748b',
            lineHeight: 1.5,
          }}
        >
          最新版が反映されないときのみ対応してください。
        </p>
      </div>
    </div>
  );
}
