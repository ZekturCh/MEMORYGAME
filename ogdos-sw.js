const CACHE_NAME="orica-event-ogdos-v2";
const CORE_ASSETS=[
  "./OGdos.html",
  "./orica-dos.html",
  "./RCOdos.html",
  "./ORICALOGO.png",
  "./logo-menu.png",
  "./logo-73-anios-03.png",
  "./assets/rco/intercambio_de_epp_en_fabrica_orica.png",
  "./assets/rco/operario_oculta_piezas_defectuosas_en_fabrica.png",
  "./assets/rco/saludo_de_equipo_en_fabrica_orica.png",
  "./assets/rco/desorden_en_vestuarios_de_orica.png",
  "./assets/rco/colaboracion_en_la_planta_orica.png",
  "./assets/rco/checklist_de_seguridad_en_fabrica_orica.png",
  "./assets/rco/trabajador_distraido_junto_a_maquinaria_industrial.png",
  "./assets/rco/equipo_y_mejora_continua_en_fabrica_orica.png",
  "./assets/back.webp",
  "./assets/cards/card-01.webp",
  "./assets/cards/card-02.webp",
  "./assets/cards/card-03.webp",
  "./assets/cards/card-04.webp",
  "./assets/cards/card-05.webp",
  "./assets/cards/card-06.webp",
  "./assets/cards/card-07.webp",
  "./assets/cards/card-08.webp"
];
const CORE_PATHS=new Set(CORE_ASSETS.map(url => new URL(url, self.location.href).pathname));

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith('orica-event-') && key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (!event.data || event.data.type !== 'CACHE_NOW') return;
  caches.open(CACHE_NAME)
    .then(cache => cache.addAll(CORE_ASSETS))
    .then(() => { if (event.source) event.source.postMessage({type:'CACHE_DONE'}); })
    .catch(() => { if (event.source) event.source.postMessage({type:'CACHE_ERROR'}); });
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;
  const shouldCache=CORE_PATHS.has(requestUrl.pathname);
  event.respondWith(
    caches.match(event.request, {ignoreSearch:true}).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type === 'opaque') return response;
        if (shouldCache) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return response;
      }).catch(() => caches.match('./OGdos.html'));
    })
  );
});
