// ★★★ 2026-09-14 全艦隊修「index.html 進快取名單」地雷(3D-Chess 幻影版實錘,補丁 static-pwa-ship/patches/patch-sw-index.mjs):
//    Cloudflare Pages 把 /index.html 308 轉到 / ⇒ 名單裡有 "./index.html" 的話 install 存到的是 redirected:true 的回應,
//    導覽拿到它瀏覽器直接拒收 ⇒ 裝成 App 開就 ERR_FAILED;每次 bump SW 重踩。⇒ 名單與離線退路只認 "./",永遠不要再把 index.html 加回來。
//    同時 addAll(全部或全無)改成逐一 add + catch:一個檔抓不到不再整批沒快取。
const CACHE_NAME = "gomoku-pwa-v29";
const CORE_ASSETS = [
  "./",
  "./style.css",
  "./script.js",
  "./touch-lens.js",
  "./game-rules.js",
  "./ai-engine.js",
  "./ai-worker.js",
  "./puzzle-solver.js",
  "./puzzles.js",
  "./daily-picker.js",
  "./commentary.js",   // 🤖 電腦口白句庫:script.js 的 import ⇒ 不進快取,離線開整支 script 會載入失敗
  "./manifest.webmanifest",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => Promise.all(CORE_ASSETS.map((u) => cache.add(u).catch(() => null))))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

// 🏷️ 版號回報(艦隊鐵則⑦,0906):右下徽章問「實際執行中的版本」,答案 = 本 SW 的快取名。
self.addEventListener("message", (event) => {
  if (event && event.data === "GET_VERSION" && event.source) event.source.postMessage({ type: "SW_VERSION", v: CACHE_NAME });
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("./"))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }

        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
        return networkResponse;
      });
    })
  );
});
