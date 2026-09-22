importScripts("/controller/controller.sw.js");

addEventListener("fetch", (event) => {
  if (globalThis.$scramjetController.shouldRoute(event)) {
    event.respondWith(globalThis.$scramjetController.route(event));
  }
});
