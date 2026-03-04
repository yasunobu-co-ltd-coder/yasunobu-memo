const CACHE_NAME = 'yasunobu-v2';

const urlsToCache = [
    '/',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(urlsToCache);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    // Network first strategy for API calls
    if (event.request.url.includes('supabase.co')) {
        event.respondWith(fetch(event.request));
        return;
    }

    // Cache first for static assets
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request).then((fetchResponse) => {
                // Cache successful responses
                if (fetchResponse.status === 200) {
                    const responseClone = fetchResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return fetchResponse;
            });
        })
    );
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
            title: 'yasunobu',
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
        self.registration.showNotification(payload.title || 'yasunobu', options)
    );
});

// 通知クリック時のハンドラ
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const url = event.notification.data?.url || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // 既にアプリが開いている場合はフォーカス
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    return client.focus();
                }
            }
            // 開いていない場合は新しいウィンドウで開く
            return clients.openWindow(url);
        })
    );
});
