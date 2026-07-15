/* ==========================================================================
   Fontaines Paris — application
   Carte des fontaines à boire de Paris (données ouvertes Ville de Paris /
   Eau de Paris) affichée avec Leaflet + OpenStreetMap/CARTO.
   ========================================================================== */
(function () {
  'use strict';

  var DATA_URL = 'https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/fontaines-a-boire/exports/geojson?limit=-1&timezone=Europe%2FParis';
  var CACHE_KEY = 'fp-data-cache-v1';
  var THEME_KEY = 'fp-theme';
  var FETCH_TIMEOUT_MS = 20000;
  var PARIS_CENTER = [48.8566, 2.3522];

  var TYPE_LABELS = {
    BORNE_FONTAINE: 'Borne fontaine',
    FONTAINE_2EN1: 'Fontaine 2 en 1',
    FONTAINE_ALBIEN: "Fontaine de l'Albien",
    FONTAINE_ARCEAU: 'Fontaine à arceau',
    FONTAINE_BOIS: "Point d'eau (parcs et bois)",
    FONTAINE_TOTEM: 'Fontaine Totem',
    FONTNE_WALLACE: 'Fontaine Wallace',
    FTNE_MILLENAIRE: 'Fontaine du Millénaire',
    FTNE_PETILLANTE: 'Fontaine pétillante',
    FTNE_POING_EAU: "Poing d'eau"
  };

  var MOTIF_LABELS = {
    'APP A REPARER': 'Appareil à réparer',
    'APP SANS EAU': 'Appareil actuellement sans eau',
    'FERMETURE HIVERNALE': 'Fermeture hivernale',
    'FERME DEMANDE TIERS': "Fermée à la demande d'un tiers",
    'APP SUR CHANTIER': 'Appareil sur un chantier',
    INACCESSIBLE: 'Point inaccessible',
    'APP A RENOUVELER': 'Appareil à renouveler',
    'APP PROJET': 'Appareil en projet',
    'APP SIGNALE': 'Appareil signalé',
    'ARRET EAU': "Arrêt d'eau",
    'FERME DEMANDE SSQ': 'Fermée à la demande des services de sécurité'
  };

  var SMALL_WORDS = ['de', 'du', 'des', 'le', 'la', 'les', 'l', 'd', 'et', 'aux', 'au', 'en', 'sur', 'sous'];

  var state = {
    allFeatures: [],
    markerByGid: new Map(),
    filterAvailableOnly: false,
    searchTerm: '',
    userLatLng: null,
    sheetMode: 'idle', // idle | search
    dataFresh: true,
    dataTimestamp: null
  };

  var map, clusterGroup, tileLight, tileDark, userMarker;

  /* ---------------------------------------------------------------- */
  /* Utilities                                                          */
  /* ---------------------------------------------------------------- */

  function $(id) { return document.getElementById(id); }

  function debounce(fn, wait) {
    var t;
    return function () {
      var args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(null, args); }, wait);
    };
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function normalize(str) {
    return String(str == null ? '' : str)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function frenchTitleCase(str) {
    if (!str) return '';
    var wordIndex = 0;
    var out = String(str).toLowerCase().split(/([\s-]+)/).map(function (token) {
      if (/^[\s-]+$/.test(token) || token === '') return token;
      var isFirst = wordIndex === 0;
      wordIndex++;
      if (!isFirst && SMALL_WORDS.indexOf(token) !== -1) return token;
      return token.charAt(0).toUpperCase() + token.slice(1);
    }).join('');
    return out.replace(/\b([ld])\b([\s-]+)(?=\w)/gi, function (m, letter) {
      return letter.toLowerCase() + "'";
    });
  }

  function formatCommune(commune) {
    if (!commune) return '';
    var m = String(commune).match(/^PARIS\s+(\d{1,2})(ER|EME)\s+ARRONDISSEMENT$/i);
    if (m) {
      var n = parseInt(m[1], 10);
      return 'Paris ' + n + (n === 1 ? 'er' : 'e') + ' arrondissement';
    }
    return frenchTitleCase(commune);
  }

  function formatAddress(props) {
    var num = props.no_voirie_pair || props.no_voirie_impair || '';
    var voie = frenchTitleCase(props.voie || '');
    var parts = [num, voie].filter(Boolean);
    return parts.length ? parts.join(' ') : formatCommune(props.commune) || 'Adresse inconnue';
  }

  function typeLabel(type) {
    return TYPE_LABELS[type] || frenchTitleCase(String(type || '').replace(/_/g, ' '));
  }

  function motifLabel(motif) {
    if (!motif) return '';
    return MOTIF_LABELS[motif] || frenchTitleCase(motif);
  }

  function formatDateFr(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(d);
    } catch (e) { return ''; }
  }

  function haversineMeters(lat1, lon1, lat2, lon2) {
    var R = 6371000;
    var toRad = function (v) { return (v * Math.PI) / 180; };
    var dLat = toRad(lat2 - lat1);
    var dLon = toRad(lon2 - lon1);
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function formatDistance(m) {
    if (m < 1000) return Math.round(m / 10) * 10 + ' m';
    return (m / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' km';
  }

  function formatNumberFr(n) {
    return n.toLocaleString('fr-FR');
  }

  function showToast(message, duration) {
    var toast = $('toast');
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { toast.hidden = true; }, duration || 3600);
  }

  /* ---------------------------------------------------------------- */
  /* Theme                                                               */
  /* ---------------------------------------------------------------- */

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
    var sun = $('theme-icon-sun');
    var moon = $('theme-icon-moon');
    var metaTheme = $('meta-theme-color');
    if (theme === 'dark') {
      sun.hidden = true; moon.hidden = false;
      if (metaTheme) metaTheme.setAttribute('content', '#0a1220');
      if (map) {
        if (map.hasLayer(tileLight)) map.removeLayer(tileLight);
        if (!map.hasLayer(tileDark)) tileDark.addTo(map);
        tileDark.bringToBack();
      }
    } else {
      sun.hidden = false; moon.hidden = true;
      if (metaTheme) metaTheme.setAttribute('content', '#0B63C5');
      if (map) {
        if (map.hasLayer(tileDark)) map.removeLayer(tileDark);
        if (!map.hasLayer(tileLight)) tileLight.addTo(map);
        tileLight.bringToBack();
      }
    }
  }

  function initTheme() {
    var stored = null;
    try { stored = localStorage.getItem(THEME_KEY); } catch (e) {}
    var initial = stored || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setTheme(initial);
    $('theme-toggle').addEventListener('click', function () {
      var current = document.documentElement.getAttribute('data-theme');
      setTheme(current === 'dark' ? 'light' : 'dark');
    });
  }

  /* ---------------------------------------------------------------- */
  /* Map + markers                                                       */
  /* ---------------------------------------------------------------- */

  function initMap() {
    map = L.map('map', {
      zoomControl: false,
      attributionControl: true,
      maxZoom: 19,
      minZoom: 3
    }).setView(PARIS_CENTER, 12);

    var attribution = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>';

    tileLight = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd', maxZoom: 19, attribution: attribution
    });
    tileDark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd', maxZoom: 19, attribution: attribution
    });

    clusterGroup = L.markerClusterGroup({
      maxClusterRadius: 55,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      disableClusteringAtZoom: 18
    });
    map.addLayer(clusterGroup);

    $('zoom-in-btn').addEventListener('click', function () { map.zoomIn(); });
    $('zoom-out-btn').addEventListener('click', function () { map.zoomOut(); });

    keepMapSized();
  }

  // iOS standalone PWAs lay the map out during the launch/splash transition, so
  // Leaflet frequently measures the container before the real viewport height
  // (and the home-indicator safe area) has settled. It then paints tiles over
  // that stale, too-short area only, leaving the map's own --bg background
  // showing as a band in the bottom safe zone. Re-measuring after the layout
  // settles — and whenever the app is resized, rotated, or brought back to the
  // foreground — makes Leaflet fill the full screen.
  function keepMapSized() {
    var refresh = function () { if (map) map.invalidateSize({ animate: false, pan: false }); };
    requestAnimationFrame(refresh);
    [120, 400, 900, 1800].forEach(function (ms) { setTimeout(refresh, ms); });
    window.addEventListener('load', refresh);
    window.addEventListener('orientationchange', function () { setTimeout(refresh, 300); });
    window.addEventListener('pageshow', refresh);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) refresh();
    });
  }

  function dropletIcon(color) {
    var svg = '<svg width="26" height="34" viewBox="0 0 26 34" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M13 0C13 0 2 14.5 2 21.5C2 28.4 6.8 33 13 33C19.2 33 24 28.4 24 21.5C24 14.5 13 0 13 0Z" fill="' + color + '" stroke="#ffffff" stroke-width="1.6"/>' +
      '<circle cx="9.3" cy="20.5" r="2.6" fill="rgba(255,255,255,0.55)"/>' +
      '</svg>';
    return L.divIcon({
      className: 'fp-marker',
      html: svg,
      iconSize: [26, 34],
      iconAnchor: [13, 32],
      popupAnchor: [0, -30]
    });
  }

  var ICONS = {
    available: dropletIcon('#1791c8'),
    unavailable: dropletIcon('#97a2b0')
  };

  function popupHtml(props) {
    var isOk = props.dispo === 'OUI';
    var badge = isOk
      ? '<span class="popup-badge is-ok">Disponible</span>'
      : '<span class="popup-badge is-off">Indisponible</span>';

    var metaLines = [];
    if (!isOk && props.motif_ind) {
      metaLines.push('<strong>Motif&nbsp;:</strong> ' + escapeHtml(motifLabel(props.motif_ind)));
    }
    if (!isOk && props.fin_ind) {
      var d = formatDateFr(props.fin_ind);
      if (d) metaLines.push('<strong>Retour prévu&nbsp;:</strong> ' + escapeHtml(d));
    }
    if (props.modele) {
      metaLines.push('<strong>Modèle&nbsp;:</strong> ' + escapeHtml(props.modele));
    }

    return '' +
      '<p class="popup-title">' + escapeHtml(formatAddress(props)) + '</p>' +
      '<p class="popup-sub">' + escapeHtml(formatCommune(props.commune)) + ' · ' + escapeHtml(typeLabel(props.type_objet)) + '</p>' +
      badge +
      (metaLines.length ? '<p class="popup-meta">' + metaLines.join('<br>') + '</p>' : '');
  }

  function buildMarkers(features) {
    clusterGroup.clearLayers();
    state.markerByGid.clear();

    features.forEach(function (feature) {
      var props = feature.properties || {};
      var coords = feature.geometry && feature.geometry.coordinates;
      if (!coords) return;
      var lat = coords[1], lon = coords[0];
      var isOk = props.dispo === 'OUI';
      var marker = L.marker([lat, lon], { icon: isOk ? ICONS.available : ICONS.unavailable });
      marker.bindPopup(popupHtml(props));
      marker.fpData = { props: props, lat: lat, lon: lon };
      state.markerByGid.set(String(props.gid), marker);
    });
  }

  function matchesSearch(props, term) {
    if (!term) return true;
    var haystack = normalize(
      (props.voie || '') + ' ' + (props.commune || '') + ' ' + (props.no_voirie_pair || '') + ' ' + (props.no_voirie_impair || '')
    );
    return haystack.indexOf(term) !== -1;
  }

  function currentFilteredMarkers() {
    var term = normalize(state.searchTerm);
    var out = [];
    state.markerByGid.forEach(function (marker) {
      var props = marker.fpData.props;
      if (state.filterAvailableOnly && props.dispo !== 'OUI') return;
      if (!matchesSearch(props, term)) return;
      out.push(marker);
    });
    return out;
  }

  function applyFilters() {
    clusterGroup.clearLayers();
    var filtered = currentFilteredMarkers();
    clusterGroup.addLayers(filtered);
    updateStats();

    if (state.searchTerm.trim()) {
      state.sheetMode = 'search';
      renderSearchResults(filtered);
    } else if (state.sheetMode === 'search') {
      state.sheetMode = 'idle';
      renderIdle();
    }
  }

  function updateStats() {
    var total = state.allFeatures.length;
    var available = 0;
    state.allFeatures.forEach(function (f) {
      if (f.properties && f.properties.dispo === 'OUI') available++;
    });
    var line = formatNumberFr(available) + ' fontaines disponibles sur ' + formatNumberFr(total);
    if (!state.dataFresh) line += ' · hors ligne';
    state.statsLine = total ? line : 'Données indisponibles';

    if (state.sheetMode === 'idle') {
      $('sheet-peek-text').textContent = state.statsLine;
    }
  }

  /* ---------------------------------------------------------------- */
  /* Sheet (bottom panel)                                                */
  /* ---------------------------------------------------------------- */

  function setSheetExpanded(expanded) {
    var sheet = $('sheet');
    sheet.dataset.state = expanded ? 'expanded' : 'collapsed';
    $('sheet-header').setAttribute('aria-expanded', expanded ? 'true' : 'false');
  }

  function isSheetExpanded() {
    return $('sheet').dataset.state === 'expanded';
  }

  function renderIdle() {
    $('sheet-peek-text').textContent = state.statsLine || 'Chargement…';
    $('sheet-content').innerHTML = '<p class="sheet-empty">Recherchez une rue ou un quartier, ou touchez <strong>Me localiser</strong> pour centrer la carte sur votre position.</p>';
  }

  function rowHtml(item) {
    var props = item.props;
    var isOk = props.dispo === 'OUI';
    var distanceHtml = item.distance != null ? '<span class="result-dist">' + formatDistance(item.distance) + '</span>' : '';
    return '' +
      '<button class="result-row" type="button" data-gid="' + escapeHtml(props.gid) + '">' +
      '<span class="result-dot' + (isOk ? '' : ' is-off') + '"></span>' +
      '<span class="result-text">' +
      '<span class="result-addr">' + escapeHtml(formatAddress(props)) + '</span>' +
      '<span class="result-sub">' + escapeHtml(formatCommune(props.commune)) + ' · ' + escapeHtml(typeLabel(props.type_objet)) + '</span>' +
      '</span>' +
      distanceHtml +
      '</button>';
  }

  function bindResultRows() {
    var rows = document.querySelectorAll('.result-row');
    rows.forEach(function (row) {
      row.addEventListener('click', function () {
        var gid = row.getAttribute('data-gid');
        focusMarker(gid);
      });
    });
  }

  function renderSearchResults(filteredMarkers) {
    var items = filteredMarkers.slice(0, 60).map(function (m) { return { props: m.fpData.props }; });
    if (state.userLatLng) {
      items.forEach(function (item) {
        var m = state.markerByGid.get(String(item.props.gid));
        item.distance = haversineMeters(state.userLatLng[0], state.userLatLng[1], m.fpData.lat, m.fpData.lon);
      });
      items.sort(function (a, b) { return a.distance - b.distance; });
    } else {
      items.sort(function (a, b) { return formatAddress(a.props).localeCompare(formatAddress(b.props), 'fr'); });
    }

    $('sheet-peek-text').textContent = items.length
      ? formatNumberFr(items.length) + ' résultat' + (items.length > 1 ? 's' : '')
      : 'Aucun résultat';

    if (!items.length) {
      $('sheet-content').innerHTML = '<p class="sheet-empty">Aucune fontaine ne correspond à cette recherche.</p>';
      return;
    }
    $('sheet-content').innerHTML = '<p class="sheet-title">Résultats</p>' + items.map(rowHtml).join('');
    bindResultRows();
    setSheetExpanded(true);
  }

  function focusMarker(gid) {
    var marker = state.markerByGid.get(String(gid));
    if (!marker) return;
    if (window.innerWidth < 620) setSheetExpanded(false);
    clusterGroup.zoomToShowLayer(marker, function () {
      map.once('moveend', function () { marker.openPopup(); });
      marker.openPopup();
    });
  }

  /* ---------------------------------------------------------------- */
  /* Geolocation                                                         */
  /* ---------------------------------------------------------------- */

  function placeUserMarker(latlng) {
    if (userMarker) { userMarker.setLatLng(latlng); return; }
    userMarker = L.marker(latlng, {
      icon: L.divIcon({ className: 'fp-user-marker', iconSize: [20, 20], iconAnchor: [10, 10] }),
      zIndexOffset: 1000,
      interactive: false
    }).addTo(map);
  }

  function locateMe() {
    if (!navigator.geolocation) {
      showToast('La géolocalisation n\u2019est pas disponible sur cet appareil.');
      return;
    }
    var btn = $('locate-btn');
    btn.classList.add('is-loading');
    navigator.geolocation.getCurrentPosition(function (pos) {
      btn.classList.remove('is-loading');
      state.userLatLng = [pos.coords.latitude, pos.coords.longitude];
      placeUserMarker(state.userLatLng);
      map.flyTo(state.userLatLng, 16, { duration: 0.8 });
      if (state.searchTerm.trim()) {
        applyFilters();
      }
    }, function (err) {
      btn.classList.remove('is-loading');
      var msg = 'Impossible de vous localiser.';
      if (err && err.code === 1) msg = 'Autorisez la localisation dans les réglages pour trouver les fontaines proches.';
      showToast(msg);
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  }

  /* ---------------------------------------------------------------- */
  /* Data loading                                                        */
  /* ---------------------------------------------------------------- */

  function readCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.features)) return parsed;
    } catch (e) {}
    return null;
  }

  function writeCache(features) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), features: features }));
    } catch (e) {}
  }

  function fetchWithTimeout(url, ms) {
    var controller = window.AbortController ? new AbortController() : null;
    var id = controller ? setTimeout(function () { controller.abort(); }, ms) : null;
    return fetch(url, { signal: controller ? controller.signal : undefined }).finally(function () {
      if (id) clearTimeout(id);
    });
  }

  function hideLoadingOverlay() {
    var overlay = $('loading-overlay');
    overlay.classList.add('is-fading');
    setTimeout(function () { overlay.hidden = true; }, 400);
  }

  function useData(features, fresh, ts) {
    state.allFeatures = features;
    state.dataFresh = fresh;
    state.dataTimestamp = ts || Date.now();
    buildMarkers(features);
    applyFilters();
    renderIdle();
  }

  function loadData() {
    fetchWithTimeout(DATA_URL, FETCH_TIMEOUT_MS)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (geojson) {
        var features = (geojson && geojson.features) || [];
        if (!features.length) throw new Error('Réponse vide');
        writeCache(features);
        useData(features, true, Date.now());
      })
      .catch(function (err) {
        console.error('Fontaines Paris: échec du chargement des données en direct', err);
        var cached = readCache();
        if (cached) {
          useData(cached.features, false, cached.ts);
          var d = new Date(cached.ts);
          showToast('Hors ligne : affichage des données du ' + d.toLocaleDateString('fr-FR') + '.', 5000);
        } else {
          $('sheet-peek-text').textContent = 'Données indisponibles';
          $('sheet-content').innerHTML = '<p class="sheet-empty">Impossible de charger les fontaines. Vérifiez votre connexion puis relancez l\u2019application.</p>';
          showToast('Impossible de charger les données. Vérifiez votre connexion.', 5000);
        }
      })
      .finally(function () {
        hideLoadingOverlay();
      });
  }

  /* ---------------------------------------------------------------- */
  /* UI bindings                                                         */
  /* ---------------------------------------------------------------- */

  function bindUI() {
    $('sheet-header').addEventListener('click', function () {
      setSheetExpanded(!isSheetExpanded());
    });

    var onSearchChange = debounce(function (value) {
      state.searchTerm = value;
      $('search-clear').hidden = !value;
      applyFilters();
    }, 200);

    $('search-input').addEventListener('input', function (e) {
      onSearchChange(e.target.value);
    });

    $('search-clear').addEventListener('click', function () {
      $('search-input').value = '';
      $('search-clear').hidden = true;
      state.searchTerm = '';
      applyFilters();
      $('search-input').focus();
    });

    $('filter-available').addEventListener('click', function () {
      state.filterAvailableOnly = !state.filterAvailableOnly;
      $('filter-available').setAttribute('aria-pressed', String(state.filterAvailableOnly));
      applyFilters();
    });

    $('locate-btn').addEventListener('click', locateMe);
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      // When a new service worker takes control after we ship an update, reload
      // once so the freshly cached HTML/CSS/JS actually render (installed iOS
      // PWAs otherwise keep showing the old shell). Guarded so it only fires for
      // real updates — a controller already existed — never on first install,
      // and never more than once (no reload loop).
      if (navigator.serviceWorker.controller) {
        var reloadedForUpdate = false;
        navigator.serviceWorker.addEventListener('controllerchange', function () {
          if (reloadedForUpdate) return;
          reloadedForUpdate = true;
          window.location.reload();
        });
      }
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('./service-worker.js').catch(function (err) {
          console.warn('Service worker non enregistré', err);
        });
      });
    }
  }

  /* ---------------------------------------------------------------- */
  /* Init                                                                */
  /* ---------------------------------------------------------------- */

  function init() {
    initMap();
    initTheme();
    bindUI();
    registerServiceWorker();
    loadData();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
