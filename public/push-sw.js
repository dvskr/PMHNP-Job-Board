// Service Worker for Push Notifications — PMHNP Hiring
/* eslint-disable no-restricted-globals */

self.addEventListener('push', function (event) {
    if (!event.data) return;

    try {
        const data = event.data.json();
        const options = {
            body: data.body || 'New PMHNP jobs available!',
            icon: data.icon || '/icon-192x192.png',
            badge: data.badge || '/favicon-48x48.png',
            data: { url: data.url || '/jobs' },
            vibrate: [100, 50, 100],
            actions: [
                { action: 'view', title: 'View Jobs' },
                { action: 'dismiss', title: 'Dismiss' },
            ],
        };

        event.waitUntil(
            self.registration.showNotification(data.title || 'PMHNP Hiring', options)
        );
    } catch (e) {
        console.error('Push event error:', e);
    }
});

self.addEventListener('notificationclick', function (event) {
    event.notification.close();

    const url = event.notification.data?.url || '/jobs';

    if (event.action === 'dismiss') return;

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
            // Focus existing tab if available
            for (const client of clientList) {
                if (client.url.includes('pmhnphiring.com') && 'focus' in client) {
                    client.navigate(url);
                    return client.focus();
                }
            }
            // Open new tab
            return self.clients.openWindow(url);
        })
    );
});
