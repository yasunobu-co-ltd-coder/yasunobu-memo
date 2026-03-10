// ============================================================
// Service Worker — Push通知専用（キャッシュ制御なし）
// ============================================================

// install: 即座に activate へ移行
self.addEventListener('install', () => {
    self.skipWaiting();
});

// activate: このアプリの旧キャッシュのみ削除（他アプリのキャッシュには触れない）
const OWN_CACHE_PREFIX = 'yasunobu-';
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) =>
            Promise.all(
                names
                    .filter((name) => name.startsWith(OWN_CACHE_PREFIX))
                    .map((name) => caches.delete(name))
            )
        )
    );
    self.clients.claim();
});

// SKIP_WAITING メッセージ受信時に即座に activate
self.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// ============================================================
// Push通知イベントハンドラ
// ============================================================

self.addEventListener('push', (event) => {
    if (!event.data) return;

    let payload;
    try {
        payload = event.data.json();
    } catch (e) {
        payload = {
            title: 'yasunobu-memo',
            body: event.data.text(),
        };
    }

    const options = {
        body: payload.body || '',
        icon: '/icon-192.png',
        badge: '/favicon-32.png',
        tag: payload.memo_id || 'yasunobu-notification',
        renotify: true,
        data: {
            url: payload.url || '/',
            memo_id: payload.memo_id || null,
        },
        vibrate: [200, 100, 200],
    };

    event.waitUntil(
        self.registration.showNotification(payload.title || 'yasunobu-memo', options)
    );
});

// 通知クリック時のハンドラ
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const url = event.notification.data?.url || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    return client.focus();
                }
            }
            return clients.openWindow(url);
        })
    );
});
