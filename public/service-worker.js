const CACHE_NAME = 'nexus-v1';
const STATIC_ASSETS = [
    '/',
    '/dashboard',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_ASSETS))
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            )
        })
    );
});

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(event.request)
                .catch(() => caches.match(event.request))
        );
        return;
    }

    if (url.host.includes('supabase.co')) {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                const fetchPromise = fetch(event.request).then(networkResponse => {
                    if (event.request.method === 'GET' && networkResponse.status === 200) {
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(event.request, networkResponse.clone());
                        });
                    }
                    return networkResponse;
                }).catch(() => {
                    if (event.request.mode === 'navigate') {
                        return caches.match('/');
                    }
                });
                return cachedResponse || fetchPromise;
            })
    );
});

self.addEventListener('sync', event => {
    if (event.tag === 'vault-sync') {
        self.registration.showNotification('Nexus', {
            body: 'Your notes have been synced',
            icon: '/icons/icon-192.png'
        });
    }
});

self.addEventListener('push', event => {
    const data = event.data?.json() || {};
    self.registration.showNotification(data.title || 'Nexus', {
        body: data.body || '',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-72.png',
        tag: data.tag || 'nexus-notification',
        data: { url: data.url || '/dashboard' }
    });
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(
        self.clients.openWindow(event.notification.data.url)
    );
});
