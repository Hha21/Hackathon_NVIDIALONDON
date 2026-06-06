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

  // Native toast (used to flag demo/fallback data when the backend is unreachable).
  window.toast = function (msg) {
    if (window.Android && window.Android.toast) { try { window.Android.toast(msg); } catch (e) {} }
  };

  // GET /api/mobile/state via the native bridge (dodges WebView mixed-content/cleartext).
  // Resolves to { ok:boolean, data:object }. ok=false → caller should fall back to demo data.
  window.loadState = function (station) {
    return new Promise(function (resolve) {
      var done = false;
      var finish = function (r) { if (!done) { done = true; resolve(r); } };
      window.__onState = function (o) {
        try { finish({ ok: !!(o && o.ok), data: JSON.parse((o && o.raw) || "{}") }); }
        catch (e) { finish({ ok: false, data: {} }); }
      };
      if (window.Android && window.Android.fetchState) {
        window.Android.fetchState(station || "Lewisham");
        setTimeout(function () { finish({ ok: false, data: {} }); }, 12000);
      } else { finish({ ok: false, data: {} }); }
    });
  };

  // POST /api/mobile/accept. Resolves to { ok:boolean, data:{status,routing_uri} }.
  window.acceptRecommendation = function (recId, station, unit) {
    return new Promise(function (resolve) {
      var done = false;
      var finish = function (r) { if (!done) { done = true; resolve(r); } };
      window.__onAccept = function (o) {
        try { finish({ ok: !!(o && o.ok), data: JSON.parse((o && o.raw) || "{}") }); }
        catch (e) { finish({ ok: false, data: {} }); }
      };
      if (window.Android && window.Android.acceptRec) {
        window.Android.acceptRec(recId || "", station || "Lewisham", unit || "P1");
        setTimeout(function () { finish({ ok: false, data: {} }); }, 12000);
      } else { finish({ ok: false, data: {} }); }
    });
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
