// ============================================================
// Page-view counter for the Analytics page in the admin panel.
// Sends: the page, a random visitor id kept in this browser, the referring
// site and mobile/desktop. No IP address and no personal data is stored.
// ============================================================
(function () {
  try {
    // Skip robots and automated browsers so they do not inflate the numbers.
    if (navigator.webdriver || /bot|crawl|spider|headless|lighthouse/i.test(navigator.userAgent)) return;

    function makeId() {
      if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
      // Fallback for old browsers: a random version-4 UUID
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 3 | 8)).toString(16);
      });
    }

    var id = null;
    try {
      id = localStorage.getItem('stanford_visitor');
      if (!id) { id = makeId(); localStorage.setItem('stanford_visitor', id); }
    } catch (e) { id = makeId(); } // storage blocked: counts as a new visitor each time

    var device = window.matchMedia && window.matchMedia('(max-width: 767px), (pointer: coarse) and (max-width: 1024px)').matches
      ? 'mobile' : 'desktop';

    fetch('/api/analytics/hit/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: location.pathname, visitor_id: id, referrer: document.referrer || '', device: device }),
      keepalive: true
    }).catch(function () { /* counting must never disturb the page */ });
  } catch (e) { /* ignore */ }
})();
