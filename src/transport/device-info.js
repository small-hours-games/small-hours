// Small Hours - User-Agent / Device Parser
// Parses HTTP User-Agent strings from WebSocket upgrades into clean device/OS/browser summaries.

function cleanRaw(ua) {
  return String(ua || '').trim().slice(0, 512);
}

function detectBrowser(ua) {
  if (!ua) return 'Unknown';
  if (/SmallHoursTV/i.test(ua)) return 'Small Hours TV';
  // Android WebView (Android TV app or in-app browser)
  if (/; wv\)/i.test(ua) || (/Android/i.test(ua) && /Version\/[\d.]+/i.test(ua) && /Chrome\//i.test(ua))) {
    return 'Android WebView';
  }
  if (/SamsungBrowser\/([\d.]+)/i.test(ua)) return 'Samsung Internet';
  if (/EdgA?\/([\d.]+)|EdgiOS\/([\d.]+)/i.test(ua)) return 'Edge';
  if (/OPR\/|Opera/i.test(ua)) return 'Opera';
  if (/CriOS\/([\d.]+)/i.test(ua)) return 'Chrome';
  if (/FxiOS\/([\d.]+)/i.test(ua) || /Firefox\/([\d.]+)/i.test(ua)) return 'Firefox';
  if (/Chrome\/([\d.]+)/i.test(ua) && !/Chromium/i.test(ua)) return 'Chrome';
  if (/Safari\/([\d.]+)/i.test(ua) && /AppleWebKit/i.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS/i.test(ua)) {
    return 'Safari';
  }
  if (/curl\/([\d.]+)/i.test(ua)) return 'curl';
  if (/node|undici|ws\//i.test(ua)) return 'Node.js Client';
  return 'Browser';
}

function parseVersion(str) {
  return String(str || '').replace(/_/g, '.').split('.').slice(0, 2).join('.');
}

function detectAndroidModel(ua) {
  // Look inside the parenthesized system info for Android device model token before "; wv" or ")" or "Build/"
  const buildMatch = ua.match(/Android\s+[^;)]+;\s*([^;)]+?)\s+Build\//i);
  if (buildMatch && buildMatch[1]) {
    const model = buildMatch[1].trim();
    if (model && model !== 'K' && model !== 'Mobile') {
      if (/^Pixel/i.test(model)) return model;
      if (/^SM-/i.test(model)) return `Samsung (${model})`;
      if (/^SHIELD/i.test(model)) return 'NVIDIA SHIELD';
      if (/^BRAVIA/i.test(model)) return 'Sony BRAVIA';
      if (/^AFT/i.test(model)) return 'Amazon Fire TV';
      if (/^Chromecast/i.test(model)) return 'Chromecast';
      if (/^MIBOX/i.test(model)) return 'Xiaomi Mi Box';
      return model.slice(0, 32);
    }
  }
  if (/Pixel/i.test(ua)) return 'Google Pixel';
  if (/SM-[A-Z0-9]+|Samsung/i.test(ua)) return 'Samsung Galaxy';
  if (/OnePlus/i.test(ua)) return 'OnePlus';
  if (/Xiaomi|Redmi|POCO/i.test(ua)) return 'Xiaomi';
  return null;
}

export function parseUserAgent(rawUa) {
  const raw = cleanRaw(rawUa);
  if (!raw) {
    return {
      category: 'unknown',
      label: 'Unknown Device',
      os: 'Unknown OS',
      browser: 'Unknown',
      isTv: false,
      raw: '',
    };
  }

  const browser = detectBrowser(raw);

  // TVs first (Android TV, Fire TV, Apple TV, Tizen, webOS, Google TV)
  const isTvUa = /Android TV|GoogleTV|SmartTV|SMART-TV|Tizen|Web0S|webOS|BRAVIA|SHIELD Android TV|AFT[A-Z0-9]+|MIBOX|Chromecast|AppleTV|SmallHoursTV/i.test(raw)
    || (/Android/i.test(raw) && !/Mobile/i.test(raw) && /TV|Large Screen/i.test(raw));

  if (isTvUa) {
    let label = 'Smart TV';
    let os = 'TV OS';
    if (/SmallHoursTV/i.test(raw)) {
      label = 'Small Hours Android TV';
      os = 'Android TV';
    } else if (/Android/i.test(raw)) {
      const ver = raw.match(/Android\s+([\d.]+)/i);
      const model = detectAndroidModel(raw);
      label = model ? `${model} (TV)` : 'Android TV';
      os = ver ? `Android TV ${parseVersion(ver[1])}` : 'Android TV';
    } else if (/Tizen/i.test(raw)) {
      const ver = raw.match(/Tizen\s+([\d.]+)/i);
      label = 'Samsung Tizen TV';
      os = ver ? `Tizen ${parseVersion(ver[1])}` : 'Tizen';
    } else if (/Web0S|webOS/i.test(raw)) {
      label = 'LG webOS TV';
      os = 'webOS';
    } else if (/AppleTV/i.test(raw)) {
      label = 'Apple TV';
      os = 'tvOS';
    }
    return { category: 'tv', label, os, browser, isTv: true, raw };
  }

  // iPhone
  if (/iPhone/i.test(raw)) {
    const ver = raw.match(/iPhone OS\s+([\d_]+)/i);
    return {
      category: 'mobile',
      label: 'iPhone',
      os: ver ? `iOS ${parseVersion(ver[1])}` : 'iOS',
      browser,
      isTv: false,
      raw,
    };
  }

  // iPad
  if (/iPad/i.test(raw)) {
    const ver = raw.match(/CPU OS\s+([\d_]+)/i);
    return {
      category: 'tablet',
      label: 'iPad',
      os: ver ? `iPadOS ${parseVersion(ver[1])}` : 'iPadOS',
      browser,
      isTv: false,
      raw,
    };
  }

  // Android Phone / Tablet
  if (/Android/i.test(raw)) {
    const ver = raw.match(/Android\s+([\d.]+)/i);
    const os = ver ? `Android ${parseVersion(ver[1])}` : 'Android';
    const isMobile = /Mobile/i.test(raw);
    const model = detectAndroidModel(raw);
    return {
      category: isMobile ? 'mobile' : 'tablet',
      label: model || (isMobile ? 'Android Phone' : 'Android Tablet'),
      os,
      browser,
      isTv: false,
      raw,
    };
  }

  // Desktop OSes
  if (/Macintosh|Mac OS X/i.test(raw)) {
    // Modern iPadOS Safari sometimes masquerades as Macintosh; usually handled only with touch hints, so treat as Mac
    const ver = raw.match(/Mac OS X\s+([\d_]+)/i);
    return {
      category: 'desktop',
      label: 'Mac',
      os: ver ? `macOS ${parseVersion(ver[1])}` : 'macOS',
      browser,
      isTv: false,
      raw,
    };
  }

  if (/Windows NT/i.test(raw)) {
    let os = 'Windows';
    if (/Windows NT 10\.0/i.test(raw)) os = 'Windows 10/11';
    return {
      category: 'desktop',
      label: 'Windows PC',
      os,
      browser,
      isTv: false,
      raw,
    };
  }

  if (/CrOS/i.test(raw)) {
    return {
      category: 'desktop',
      label: 'Chromebook',
      os: 'ChromeOS',
      browser,
      isTv: false,
      raw,
    };
  }

  if (/Linux/i.test(raw)) {
    return {
      category: 'desktop',
      label: 'Linux PC',
      os: 'Linux',
      browser,
      isTv: false,
      raw,
    };
  }

  if (/bot|headless|playwright|puppeteer|curl|node|undici/i.test(raw)) {
    return {
      category: 'bot',
      label: 'Automated Client',
      os: 'CLI / Headless',
      browser,
      isTv: false,
      raw,
    };
  }

  return {
    category: 'unknown',
    label: 'Web Client',
    os: 'Unknown OS',
    browser,
    isTv: false,
    raw,
  };
}
