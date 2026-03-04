'use client';

import { useState, useEffect, useCallback } from 'react';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export type PushPermissionState = 'prompt' | 'granted' | 'denied' | 'unsupported';

export function usePushSubscription(userId: string) {
  const [permission, setPermission] = useState<PushPermissionState>('prompt');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isPwaInstalled, setIsPwaInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);

  // 初期状態チェック
  useEffect(() => {
    const ua = navigator.userAgent;
    const isIosDevice = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setIsIos(isIosDevice);

    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsPwaInstalled(isStandalone);

    if (!('PushManager' in window) || !('serviceWorker' in navigator)) {
      setPermission('unsupported');
      return;
    }

    if ('Notification' in window) {
      setPermission(Notification.permission as PushPermissionState);
    }

    navigator.serviceWorker.ready.then((registration) => {
      registration.pushManager.getSubscription().then((sub) => {
        setIsSubscribed(!!sub);
      });
    });
  }, []);

  // userId が有効になった + ブラウザ購読が既にある → DB にも再登録（同期）
  useEffect(() => {
    if (!userId || !VAPID_PUBLIC_KEY) return;
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.ready.then(async (registration) => {
      const existing = await registration.pushManager.getSubscription();
      if (!existing) return;

      try {
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subscription: existing.toJSON(),
            user_id: userId,
          }),
        });
        setIsSubscribed(true);
      } catch (err) {
        console.error('[usePush] sync error:', err);
      }
    });
  }, [userId]);

  // 購読登録
  const subscribe = useCallback(async () => {
    if (!userId || !VAPID_PUBLIC_KEY) {
      console.warn('[usePush] subscribe skipped: userId or VAPID_PUBLIC_KEY empty');
      return false;
    }
    setIsLoading(true);

    try {
      const perm = await Notification.requestPermission();
      setPermission(perm as PushPermissionState);

      if (perm !== 'granted') {
        setIsLoading(false);
        return false;
      }

      const registration = await navigator.serviceWorker.ready;

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as ArrayBuffer,
      });

      const subJson = subscription.toJSON();

      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: subJson,
          user_id: userId,
        }),
      });

      if (response.ok) {
        setIsSubscribed(true);
        setIsLoading(false);
        return true;
      } else {
        const errText = await response.text();
        console.error('[usePush] subscribe API error:', response.status, errText);
        setIsLoading(false);
        return false;
      }
    } catch (err) {
      console.error('[usePush] subscribe error:', err);
      setIsLoading(false);
      return false;
    }
  }, [userId]);

  // 購読解除
  const unsubscribe = useCallback(async () => {
    setIsLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }

      setIsSubscribed(false);
    } catch (err) {
      console.error('[usePush] unsubscribe error:', err);
    }
    setIsLoading(false);
  }, []);

  return {
    permission,
    isSubscribed,
    isLoading,
    isPwaInstalled,
    isIos,
    subscribe,
    unsubscribe,
  };
}
