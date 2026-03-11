'use client';

import React, { useState } from 'react';
import { usePushSubscription } from './usePushSubscription';

interface PushNotificationUIProps {
  userId: string;
}

export function PushNotificationUI({ userId }: PushNotificationUIProps) {
  const {
    permission,
    isSubscribed,
    isLoading,
    isPwaInstalled,
    isIos,
    notifyMode,
    subscribe,
    unsubscribe,
    updateNotifyMode,
  } = usePushSubscription(userId);

  const [showIosGuide, setShowIosGuide] = useState(false);

  // iOSでPWA未インストールの場合のガイド
  if (isIos && !isPwaInstalled) {
    return (
      <>
        <div
          onClick={() => setShowIosGuide(true)}
          style={{
            padding: '12px 16px',
            background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
            borderRadius: '12px',
            cursor: 'pointer',
            marginBottom: '12px',
            border: '1px solid #f59e0b',
          }}
        >
          <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#92400e', marginBottom: '4px' }}>
            通知を受け取るには
          </div>
          <div style={{ fontSize: '12px', color: '#78350f' }}>
            ホーム画面に追加してからアプリを開き直してください。タップで手順を表示
          </div>
        </div>

        {showIosGuide && (
          <div
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.5)', zIndex: 9999,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '20px',
            }}
            onClick={() => setShowIosGuide(false)}
          >
            <div
              style={{
                background: '#fff', borderRadius: '16px', padding: '24px',
                maxWidth: '340px', width: '100%',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', color: '#1e293b' }}>
                ホーム画面に追加する手順
              </h3>
              <div style={{ fontSize: '14px', color: '#475569', lineHeight: '1.8' }}>
                <p style={{ marginBottom: '12px' }}>
                  <strong>1.</strong> 画面下部の <span style={{ fontSize: '18px' }}>&#x2191;</span> (共有ボタン) をタップ
                </p>
                <p style={{ marginBottom: '12px' }}>
                  <strong>2.</strong> 「ホーム画面に追加」をタップ
                </p>
                <p style={{ marginBottom: '12px' }}>
                  <strong>3.</strong> 右上の「追加」をタップ
                </p>
                <p style={{ marginBottom: '12px' }}>
                  <strong>4.</strong> ホーム画面のアイコンからアプリを開く
                </p>
                <p style={{ color: '#3b82f6', fontWeight: 'bold' }}>
                  5. アプリ内で「通知を有効にする」ボタンをタップ
                </p>
              </div>
              <button
                onClick={() => setShowIosGuide(false)}
                style={{
                  marginTop: '16px', width: '100%', padding: '12px',
                  background: '#3b82f6', color: '#fff', border: 'none',
                  borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer',
                }}
              >
                閉じる
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  // Push非対応ブラウザ
  if (permission === 'unsupported') {
    return null;
  }

  // 通知が拒否されている場合
  if (permission === 'denied') {
    return (
      <div style={{
        padding: '10px 16px',
        background: '#fef2f2',
        borderRadius: '12px',
        marginBottom: '12px',
        border: '1px solid #fca5a5',
        fontSize: '12px',
        color: '#991b1b',
      }}>
        通知がブロックされています。ブラウザの設定から通知を許可してください。
      </div>
    );
  }

  // 購読済み
  if (isSubscribed) {
    return (
      <div style={{ marginBottom: '12px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px',
          background: '#f0fdf4',
          borderRadius: '12px 12px 0 0',
          border: '1px solid #86efac',
          borderBottom: 'none',
        }}>
          <span style={{ fontSize: '13px', color: '#166534' }}>
            通知ON
          </span>
          <button
            onClick={unsubscribe}
            disabled={isLoading}
            style={{
              padding: '4px 12px',
              background: 'transparent',
              color: '#6b7280',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            {isLoading ? '...' : 'OFF'}
          </button>
        </div>
        <div style={{
          display: 'flex', gap: '0',
          borderRadius: '0 0 12px 12px',
          border: '1px solid #86efac',
          overflow: 'hidden',
        }}>
          <button
            onClick={() => updateNotifyMode('all')}
            style={{
              flex: 1,
              padding: '8px',
              fontSize: '12px',
              fontWeight: notifyMode === 'all' ? 'bold' : 'normal',
              background: notifyMode === 'all' ? '#166534' : '#f0fdf4',
              color: notifyMode === 'all' ? '#fff' : '#166534',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            すべての案件
          </button>
          <button
            onClick={() => updateNotifyMode('mine')}
            style={{
              flex: 1,
              padding: '8px',
              fontSize: '12px',
              fontWeight: notifyMode === 'mine' ? 'bold' : 'normal',
              background: notifyMode === 'mine' ? '#166534' : '#f0fdf4',
              color: notifyMode === 'mine' ? '#fff' : '#166534',
              border: 'none',
              borderLeft: '1px solid #86efac',
              cursor: 'pointer',
            }}
          >
            自分の案件のみ
          </button>
        </div>
      </div>
    );
  }

  // 未購読 → 購読ボタン表示
  return (
    <button
      onClick={subscribe}
      disabled={isLoading}
      style={{
        width: '100%',
        padding: '12px',
        background: isLoading ? '#94a3b8' : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
        color: '#fff',
        border: 'none',
        borderRadius: '12px',
        fontWeight: 'bold',
        fontSize: '14px',
        cursor: isLoading ? 'default' : 'pointer',
        marginBottom: '12px',
        boxShadow: '0 2px 8px rgba(59,130,246,0.3)',
      }}
    >
      {isLoading ? '設定中...' : '通知を有効にする'}
    </button>
  );
}
