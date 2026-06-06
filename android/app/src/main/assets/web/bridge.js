// bridge.js — routes UI "Route here" / "Accept" actions to the native Google Maps intent.
// When running inside the Android app, window.Android is injected (see MainActivity).
// Falls back to a web maps URL when run in a plain browser (design preview).
(function () {
  window.routeTo = function (label, lat, lon) {
    if (window.Android && window.Android.openMaps) {
      window.Android.openMaps(lat, lon, label || "Destination");
      return;
    }
    try { window.open("https://www.google.com/maps/dir/?api=1&destination=" + lat + "," + lon, "_blank"); } catch (e) {}
  };
  window.routeByName = function (name) {
    if (window.Android && window.Android.openMapsQuery) {
      window.Android.openMapsQuery(name + ", London");
      return;
    }
    try { window.open("https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(name + ",London"), "_blank"); } catch (e) {}
  };

  // Open a news article (native browser intent; falls back to a new tab).
  window.openArticle = function (url) {
    if (!url) return;
    if (window.Android && window.Android.openUrl) { window.Android.openUrl(url); return; }
    try { window.open(url, "_blank"); } catch (e) {}
  };

  // Fetch live London fire news via the native bridge (GDELT). Resolves to an
  // array of {title, url, domain, seendate}. Cached so list + map share one fetch.
  window.loadNews = function () {
    if (window.__newsPromise) return window.__newsPromise;
    window.__newsPromise = new Promise(function (resolve) {
      window.__onNews = function (obj) {
        try {
          var data = JSON.parse((obj && obj.raw) || "{}");
          var arts = (data.articles || []).map(function (a) {
            return { title: a.title, url: a.url, domain: a.domain, seendate: a.seendate };
          });
          resolve(arts);
        } catch (e) { resolve([]); }
      };
      if (window.Android && window.Android.fetchNews) {
        window.Android.fetchNews();
        setTimeout(function () { resolve([]); }, 25000); // safety timeout
      } else {
        resolve([]);
      }
    });
    return window.__newsPromise;
  };
})();
