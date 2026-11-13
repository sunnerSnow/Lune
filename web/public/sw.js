// Luné service worker：只處理提醒通知，不做離線快取。
// 通知內容由伺服器決定（src/lib/reminders/plan.ts），這裡只負責顯示與點擊；標題固定「Luné」。

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

/** 只接受站內路徑，避免被導到別的網站（/\evil.example 在瀏覽器裡等於 //evil.example） */
function safePath(value) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")
    ? value
    : "/dashboard";
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  event.waitUntil(
    self.registration.showNotification("Luné", {
      body: typeof data.body === "string" ? data.body.slice(0, 120) : "有一則新的提醒",
      icon: "/icons/icon-192.png",
      tag: typeof data.tag === "string" ? data.tag.slice(0, 80) : "lune",
      data: { url: safePath(data.url) },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(safePath(event.notification.data && event.notification.data.url), self.location.origin);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin !== target.origin) continue;
        try {
          await client.focus();
          await client.navigate(target.href);
          return;
        } catch {
          // 沒被這個 service worker 控制的分頁不能 navigate，改開新視窗
        }
      }
      await self.clients.openWindow(target.href);
    })(),
  );
});
