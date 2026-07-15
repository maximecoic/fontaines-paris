/* Fontaines Paris — isolated iOS viewport and Leaflet diagnostics. */
(function () {
  'use strict';

  var LAB_VERSION = 'lab-v2';
  var VALID_VARIANTS = ['candidate', 'fixed-inset', 'dvh', 'percent', 'js-inner'];
  var VARIANT_LABELS = {
    candidate: 'Racine 100vh + carte 100vw/100vh',
    'fixed-inset': 'Carte fixed top/right/bottom/left:0',
    dvh: 'Racine et carte 100dvh',
    percent: 'Racine 100% + carte inset:0',
    'js-inner': 'Hauteur pilotée par window.innerHeight'
  };

  var map;
  var resizeObserver;
  var eventLog = [];
  var latestReport = null;
  var lastContainerSize = '';
  var startedAt = performance.now();

  function $(id) { return document.getElementById(id); }

  function round(value) {
    return typeof value === 'number' && isFinite(value) ? Math.round(value * 100) / 100 : value;
  }

  function rectOf(element) {
    if (!element) return null;
    var rect = element.getBoundingClientRect();
    return {
      top: round(rect.top),
      right: round(rect.right),
      bottom: round(rect.bottom),
      left: round(rect.left),
      width: round(rect.width),
      height: round(rect.height)
    };
  }

  function standaloneMode() {
    if (navigator.standalone === true) return 'navigator.standalone';
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return 'standalone';
    if (window.matchMedia && window.matchMedia('(display-mode: fullscreen)').matches) return 'fullscreen';
    if (window.matchMedia && window.matchMedia('(display-mode: minimal-ui)').matches) return 'minimal-ui';
    return 'browser';
  }

  function probeSize(selector, dimension) {
    var element = document.querySelector(selector);
    return element ? round(element.getBoundingClientRect()[dimension]) : null;
  }

  function cssValue(element, property) {
    return element ? getComputedStyle(element).getPropertyValue(property).trim() : '';
  }

  function currentVariant() {
    var params = new URLSearchParams(window.location.search);
    var requested = params.get('variant') || sessionStorage.getItem('fp-lab-variant') || 'candidate';
    return VALID_VARIANTS.indexOf(requested) === -1 ? 'candidate' : requested;
  }

  function setJsHeight() {
    document.documentElement.style.setProperty('--app-height', window.innerHeight + 'px');
  }

  function applyVariant(variant, updateUrl) {
    if (VALID_VARIANTS.indexOf(variant) === -1) variant = 'candidate';
    document.documentElement.dataset.variant = variant;
    $('variant').value = variant;
    $('variant-label').textContent = VARIANT_LABELS[variant];
    try { sessionStorage.setItem('fp-lab-variant', variant); } catch (e) {}
    if (variant === 'js-inner') setJsHeight();

    if (updateUrl && window.history && window.history.replaceState) {
      var url = new URL(window.location.href);
      url.searchParams.set('variant', variant);
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    }

    logEvent('variant', { value: variant });
    scheduleMeasurements('variant');
  }

  function logEvent(name, details) {
    var entry = {
      ms: round(performance.now() - startedAt),
      event: name,
      details: details || null
    };
    eventLog.push(entry);
    if (eventLog.length > 160) eventLog.shift();
    $('event-log').textContent = eventLog.map(function (item) {
      return '+' + item.ms + 'ms ' + item.event + (item.details ? ' ' + JSON.stringify(item.details) : '');
    }).join('\n');
  }

  function collectReport(reason) {
    var html = document.documentElement;
    var body = document.body;
    var mapElement = $('map');
    var viewport = window.visualViewport;
    var mapRect = rectOf(mapElement);
    var leafletSize = map && map.getSize ? map.getSize() : null;
    var bottomGap = mapRect ? round(window.innerHeight - mapRect.bottom) : null;
    var viewportBottomGap = mapRect && viewport
      ? round(viewport.offsetTop + viewport.height - mapRect.bottom)
      : null;

    return {
      capturedAt: new Date().toISOString(),
      reason: reason,
      labVersion: LAB_VERSION,
      variant: html.dataset.variant,
      variantLabel: VARIANT_LABELS[html.dataset.variant],
      url: window.location.href,
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      standalone: standaloneMode(),
      navigatorStandalone: navigator.standalone === true,
      displayModes: {
        standalone: !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches),
        fullscreen: !!(window.matchMedia && window.matchMedia('(display-mode: fullscreen)').matches),
        minimalUi: !!(window.matchMedia && window.matchMedia('(display-mode: minimal-ui)').matches)
      },
      orientation: {
        type: screen.orientation ? screen.orientation.type : null,
        angle: screen.orientation ? screen.orientation.angle : window.orientation
      },
      viewportMeta: $('viewport-meta').getAttribute('content'),
      window: {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        outerWidth: window.outerWidth,
        outerHeight: window.outerHeight,
        pageXOffset: round(window.pageXOffset),
        pageYOffset: round(window.pageYOffset),
        devicePixelRatio: window.devicePixelRatio
      },
      screen: {
        width: screen.width,
        height: screen.height,
        availWidth: screen.availWidth,
        availHeight: screen.availHeight
      },
      visualViewport: viewport ? {
        width: round(viewport.width),
        height: round(viewport.height),
        offsetTop: round(viewport.offsetTop),
        offsetLeft: round(viewport.offsetLeft),
        pageTop: round(viewport.pageTop),
        pageLeft: round(viewport.pageLeft),
        scale: round(viewport.scale)
      } : null,
      viewportUnits: {
        vh100: probeSize('.probe-vh', 'height'),
        dvh100: probeSize('.probe-dvh', 'height'),
        svh100: probeSize('.probe-svh', 'height'),
        lvh100: probeSize('.probe-lvh', 'height')
      },
      safeArea: {
        topProbe: probeSize('.safe-probe-top', 'height'),
        rightProbe: probeSize('.safe-probe-right', 'width'),
        bottomProbe: probeSize('.safe-probe-bottom', 'height'),
        leftProbe: probeSize('.safe-probe-left', 'width'),
        topCustomProperty: cssValue(html, '--safe-top'),
        rightCustomProperty: cssValue(html, '--safe-right'),
        bottomCustomProperty: cssValue(html, '--safe-bottom'),
        leftCustomProperty: cssValue(html, '--safe-left')
      },
      elements: {
        html: rectOf(html),
        body: rectOf(body),
        map: mapRect,
        mapClient: { width: mapElement.clientWidth, height: mapElement.clientHeight },
        mapComputed: {
          position: cssValue(mapElement, 'position'),
          width: cssValue(mapElement, 'width'),
          height: cssValue(mapElement, 'height'),
          top: cssValue(mapElement, 'top'),
          right: cssValue(mapElement, 'right'),
          bottom: cssValue(mapElement, 'bottom'),
          left: cssValue(mapElement, 'left')
        }
      },
      leaflet: leafletSize ? { width: leafletSize.x, height: leafletSize.y } : null,
      gaps: {
        mapBottomVsInnerHeight: bottomGap,
        mapBottomVsVisualViewport: viewportBottomGap,
        leafletVsMapWidth: leafletSize && mapRect ? round(mapRect.width - leafletSize.x) : null,
        leafletVsMapHeight: leafletSize && mapRect ? round(mapRect.height - leafletSize.y) : null
      },
      serviceWorker: {
        supported: 'serviceWorker' in navigator,
        controlled: !!navigator.serviceWorker.controller,
        controllerUrl: navigator.serviceWorker.controller ? navigator.serviceWorker.controller.scriptURL : null
      },
      events: eventLog.slice()
    };
  }

  function addMetric(rows, label, value) {
    rows.push('<tr><th>' + label + '</th><td>' + String(value == null ? '—' : value) + '</td></tr>');
  }

  function renderReport(reason) {
    latestReport = collectReport(reason);
    var report = latestReport;
    var rows = [];
    var gaps = report.gaps;
    var mapRect = report.elements.map;

    addMetric(rows, 'Version / stratégie', report.labVersion + ' · ' + report.variant);
    addMetric(rows, 'Mode d’affichage', report.standalone);
    addMetric(rows, 'Viewport meta', report.viewportMeta);
    addMetric(rows, 'window.innerWidth × innerHeight', report.window.innerWidth + ' × ' + report.window.innerHeight);
    addMetric(rows, 'visualViewport', report.visualViewport ? report.visualViewport.width + ' × ' + report.visualViewport.height + ' @ ' + report.visualViewport.offsetTop : 'indisponible');
    addMetric(rows, 'screen.width × height', report.screen.width + ' × ' + report.screen.height);
    addMetric(rows, '100vh / 100dvh', report.viewportUnits.vh100 + ' / ' + report.viewportUnits.dvh100);
    addMetric(rows, '100svh / 100lvh', report.viewportUnits.svh100 + ' / ' + report.viewportUnits.lvh100);
    addMetric(rows, 'Safe area top/right/bottom/left', report.safeArea.topProbe + ' / ' + report.safeArea.rightProbe + ' / ' + report.safeArea.bottomProbe + ' / ' + report.safeArea.leftProbe);
    addMetric(rows, 'Rectangle html', JSON.stringify(report.elements.html));
    addMetric(rows, 'Rectangle body', JSON.stringify(report.elements.body));
    addMetric(rows, 'Rectangle #map', JSON.stringify(mapRect));
    addMetric(rows, 'Taille client #map', report.elements.mapClient.width + ' × ' + report.elements.mapClient.height);
    addMetric(rows, 'Taille interne Leaflet', report.leaflet ? report.leaflet.width + ' × ' + report.leaflet.height : 'indisponible');
    addMetric(rows, 'Écart map → innerHeight', gaps.mapBottomVsInnerHeight + ' px');
    addMetric(rows, 'Écart map → visualViewport', gaps.mapBottomVsVisualViewport + ' px');
    addMetric(rows, 'Écart Leaflet → map', gaps.leafletVsMapWidth + ' × ' + gaps.leafletVsMapHeight + ' px');
    addMetric(rows, 'Service worker', report.serviceWorker.controlled ? 'contrôlé par ' + report.serviceWorker.controllerUrl : 'non contrôlé (voulu)');
    addMetric(rows, 'Orientation', JSON.stringify(report.orientation));
    addMetric(rows, 'User agent', report.userAgent);
    $('metrics-table').querySelector('tbody').innerHTML = rows.join('');

    var cssGap = Math.abs(Number(gaps.mapBottomVsInnerHeight || 0));
    var leafletGap = Math.abs(Number(gaps.leafletVsMapHeight || 0));
    var summary = $('summary');
    summary.className = 'summary';

    if (cssGap <= 1 && leafletGap <= 1) {
      summary.classList.add('is-ok');
      summary.innerHTML = '<strong>Mesures cohérentes.</strong> Le conteneur et Leaflet couvrent window.innerHeight. Si une bande reste visible, elle vient probablement du compositeur iOS, d’un overlay ou d’une zone système non exposée au document.';
    } else if (cssGap > 1) {
      summary.classList.add('is-bad');
      summary.innerHTML = '<strong>Écart CSS détecté : ' + gaps.mapBottomVsInnerHeight + ' px.</strong> Le rectangle de la carte ne rejoint pas le bas de window.innerHeight.';
    } else {
      summary.classList.add('is-warn');
      summary.innerHTML = '<strong>Écart Leaflet détecté : ' + gaps.leafletVsMapHeight + ' px.</strong> Le conteneur atteint le bas, mais Leaflet conserve une hauteur interne différente.';
    }
  }

  function invalidateMap(reason) {
    if (!map) return;
    if (document.documentElement.dataset.variant === 'js-inner') setJsHeight();
    var mapRect = rectOf($('map'));
    var sizeKey = mapRect ? mapRect.width + 'x' + mapRect.height : 'none';
    map.invalidateSize({ animate: false, pan: false });
    logEvent('invalidateSize:' + reason, { container: sizeKey, changed: sizeKey !== lastContainerSize });
    lastContainerSize = sizeKey;
    requestAnimationFrame(function () { renderReport(reason); });
  }

  function scheduleMeasurements(reason) {
    requestAnimationFrame(function () { invalidateMap(reason + ':raf'); });
    [100, 300, 700, 1500, 3000].forEach(function (delay) {
      setTimeout(function () { invalidateMap(reason + ':' + delay + 'ms'); }, delay);
    });
  }

  function toggleViewportFit() {
    var meta = $('viewport-meta');
    var content = meta.getAttribute('content') || '';
    var next;
    if (content.indexOf('viewport-fit=cover') !== -1) {
      next = content.replace('viewport-fit=cover', 'viewport-fit=auto');
    } else if (content.indexOf('viewport-fit=auto') !== -1) {
      next = content.replace('viewport-fit=auto', 'viewport-fit=cover');
    } else {
      next = content + ', viewport-fit=cover';
    }
    meta.setAttribute('content', next);
    logEvent('viewport-fit', { content: next });
    scheduleMeasurements('viewport-fit');
  }

  function initMap() {
    map = L.map('map', {
      zoomControl: false,
      attributionControl: true,
      maxZoom: 19,
      minZoom: 3
    }).setView([48.8566, 2.3522], 12);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
    }).addTo(map);

    L.marker([48.8566, 2.3522]).addTo(map).bindPopup('Centre de Paris · repère du laboratoire');

    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(function () {
        requestAnimationFrame(function () { invalidateMap('resize-observer'); });
      });
      resizeObserver.observe($('map'));
    }
  }

  function copyReport() {
    renderReport('copy');
    var text = JSON.stringify(latestReport, null, 2);
    var done = function () {
      $('copy-report').textContent = 'Copié ✓';
      setTimeout(function () { $('copy-report').textContent = 'Copier'; }, 1800);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text, done); });
    } else {
      fallbackCopy(text, done);
    }
  }

  function fallbackCopy(text, done) {
    var area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try { document.execCommand('copy'); done(); } catch (e) {}
    area.remove();
  }

  function bindEvents() {
    $('variant').addEventListener('change', function (event) {
      applyVariant(event.target.value, true);
    });
    $('refresh-measurements').addEventListener('click', function () {
      scheduleMeasurements('manual');
    });
    $('toggle-viewport-fit').addEventListener('click', toggleViewportFit);
    $('clear-log').addEventListener('click', function () {
      eventLog = [];
      logEvent('log-cleared');
      renderReport('log-cleared');
    });
    $('copy-report').addEventListener('click', copyReport);
    $('toggle-panel').addEventListener('click', function () {
      var panel = $('diagnostics');
      var hidden = !panel.hidden;
      panel.hidden = hidden;
      $('toggle-panel').textContent = hidden ? 'Afficher' : 'Masquer';
      $('toggle-panel').setAttribute('aria-expanded', hidden ? 'false' : 'true');
    });

    window.addEventListener('load', function () { scheduleMeasurements('load'); });
    window.addEventListener('resize', function () { invalidateMap('window-resize'); });
    window.addEventListener('orientationchange', function () {
      logEvent('orientationchange');
      scheduleMeasurements('orientationchange');
    });
    window.addEventListener('pageshow', function (event) {
      logEvent('pageshow', { persisted: event.persisted });
      scheduleMeasurements('pageshow');
    });
    window.addEventListener('pagehide', function (event) {
      logEvent('pagehide', { persisted: event.persisted });
    });
    document.addEventListener('visibilitychange', function () {
      logEvent('visibilitychange', { hidden: document.hidden });
      if (!document.hidden) scheduleMeasurements('visible');
    });

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', function () { invalidateMap('visual-viewport-resize'); });
      window.visualViewport.addEventListener('scroll', function () { renderReport('visual-viewport-scroll'); });
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        var controllerUrl = navigator.serviceWorker.controller
          ? navigator.serviceWorker.controller.scriptURL
          : null;
        logEvent('service-worker-controllerchange', {
          controller: controllerUrl
        });
        if (controllerUrl && controllerUrl.indexOf('/tests/service-worker.js') !== -1) {
          var reloadKey = 'fp-lab-controller-ready-' + LAB_VERSION;
          if (!sessionStorage.getItem(reloadKey)) {
            sessionStorage.setItem(reloadKey, '1');
            window.location.reload();
            return;
          }
        }
        renderReport('controllerchange');
      });
    }
  }

  function registerLabServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./service-worker.js', {
        scope: './',
        updateViaCache: 'none'
      })
        .then(function (registration) {
          logEvent('lab-service-worker-registered', { scope: registration.scope });
          renderReport('service-worker-registered');
        })
        .catch(function (error) {
          logEvent('lab-service-worker-error', { message: String(error) });
        });
    });
  }

  function init() {
    document.documentElement.dataset.variant = currentVariant();
    logEvent('init', {
      readyState: document.readyState,
      mode: standaloneMode(),
      viewport: [window.innerWidth, window.innerHeight]
    });
    applyVariant(currentVariant(), false);
    initMap();
    bindEvents();
    registerLabServiceWorker();
    scheduleMeasurements('init');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
