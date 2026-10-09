self.addEventListener('push', (event) => {
  let data = { title: 'تنبيه جديد', body: 'لديك إشعار من نظام الوصال' };
  
  if (event.data) {
    data = event.data.json();
  }

  const options = {
    body: data.body,
    icon: '/icon.svg',
    badge: '/icon.svg',
    vibrate: [200, 100, 200],
    data: { dateOfArrival: Date.now() }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('/')
  );
});