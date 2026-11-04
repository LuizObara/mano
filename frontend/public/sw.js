// Service worker mínimo: só existe para o navegador permitir "instalar como app".
// Não faz cache — o Mano roda local e os dados vêm sempre do backend.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
