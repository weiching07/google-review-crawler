self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', event => {
  let data = {
    title: '有新的 Google 評論',
    body: '你收到一則新評論。',
    url: './index.html',
    tag: 'google-review'
  };

  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (err) {
    data.body = event.data ? event.data.text() : data.body;
  }

  event.waitUntil(
    self.registration.showNotification(data.title || '有新的 Google 評論', {
      body: data.body || '你收到一則新評論。',
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: data.tag || 'google-review',
      renotify: true,
      data: {
        url: data.url || './index.html'
      }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || './index.html';

  event.waitUntil(
    self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then(clientsArr => {
      for (const client of clientsArr) {
        if ('focus' in client) {
          client.focus();
          return;
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});