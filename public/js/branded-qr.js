// Small Hours - Branded SVG QR Renderer
// Generates a high-contrast Level-H QR code aligned with Small Hours styling:
// rounded Deep Night (#0b1530) modules on a crisp white plate, colored finder eyes
// (Sky, Violet, Rose), a 4-module quiet zone, and the centered 4-card Moon mark.

(function (root) {
  'use strict';

  var COLORS = {
    ink: '#0b1530',
    plate: '#ffffff',
    eyeTL: '#0284c7',
    eyeTR: '#6d28d9',
    eyeBL: '#e11d48',
  };

  function normalizeMatrix(input) {
    if (!input) return null;
    if (typeof input.count === 'number' && typeof input.isDark === 'function') {
      return input;
    }
    if (Array.isArray(input) && input.length > 0 && Array.isArray(input[0])) {
      var n = input.length;
      return {
        count: n,
        isDark: function (r, c) { return Boolean(input[r] && input[r][c]); },
      };
    }
    return null;
  }

  function extractQrMatrix(qrInstance) {
    var model = qrInstance && qrInstance._oQRCode;
    if (!model || typeof model.getModuleCount !== 'function' || typeof model.isDark !== 'function') {
      return null;
    }
    var n = model.getModuleCount();
    if (!(n > 0)) return null;
    return {
      count: n,
      isDark: function (r, c) { return Boolean(model.isDark(r, c)); },
    };
  }

  function isInFinder(r, c, n) {
    if (r < 7 && c < 7) return true;
    if (r < 7 && c >= n - 7) return true;
    if (r >= n - 7 && c < 7) return true;
    return false;
  }

  function computeCenterCutout(n) {
    if (n < 21) return { size: 0, start: -1, end: -1 };
    var raw = Math.round(n * 0.24);
    var size = raw % 2 === 0 ? raw + 1 : raw;
    var maxOdd = Math.min(11, Math.floor(n * 0.28));
    if (maxOdd % 2 === 0) maxOdd -= 1;
    size = Math.max(5, Math.min(maxOdd, size));
    if (n % 2 === 0 && size % 2 !== 0) size -= 1;
    var start = Math.floor((n - size) / 2);
    return { size: size, start: start, end: start + size - 1 };
  }

  function roundedRectPath(x, y, w, h, r) {
    var f = function (v) { return Number(v.toFixed(3)); };
    var x0 = f(x), y0 = f(y), rx = f(r), spanW = f(w - 2 * r), spanH = f(h - 2 * r);
    return 'M' + f(x0 + rx) + ' ' + y0 +
      ' h' + spanW +
      ' a' + rx + ' ' + rx + ' 0 0 1 ' + rx + ' ' + rx +
      ' v' + spanH +
      ' a' + rx + ' ' + rx + ' 0 0 1 ' + (-rx) + ' ' + rx +
      ' h' + (-spanW) +
      ' a' + rx + ' ' + rx + ' 0 0 1 ' + (-rx) + ' ' + (-rx) +
      ' v' + (-spanH) +
      ' a' + rx + ' ' + rx + ' 0 0 1 ' + rx + ' ' + (-rx) + 'z';
  }

  function finderSvg(ox, oy, eyeColor) {
    return '<g class="branded-qr-finder">' +
      '<rect x="' + ox + '" y="' + oy + '" width="7" height="7" rx="1.65" fill="' + COLORS.ink + '"/>' +
      '<rect x="' + (ox + 1) + '" y="' + (oy + 1) + '" width="5" height="5" rx="1.05" fill="' + COLORS.plate + '"/>' +
      '<rect x="' + (ox + 2) + '" y="' + (oy + 2) + '" width="3" height="3" rx="0.85" fill="' + eyeColor + '"/>' +
      '</g>';
  }

  function centerMarkSvg(cx, cy, boxSize) {
    if (!(boxSize > 0)) return '';
    var pad = 0.25;
    var shield = boxSize + pad;
    var x0 = cx - shield / 2;
    var y0 = cy - shield / 2;
    var scale = (boxSize * 0.88) / 46;
    return '<g class="branded-qr-emblem">' +
      '<rect x="' + x0.toFixed(3) + '" y="' + y0.toFixed(3) + '" width="' + shield.toFixed(3) + '" height="' + shield.toFixed(3) + '" rx="' + (shield * 0.26).toFixed(3) + '" fill="' + COLORS.plate + '" stroke="#cbd5e1" stroke-width="0.22"/>' +
      '<g transform="translate(' + cx.toFixed(3) + ' ' + cy.toFixed(3) + ') scale(' + scale.toFixed(4) + ') translate(-32 -29)">' +
        '<g transform="rotate(-24 32 62)"><rect x="21" y="10" width="22" height="36" rx="5" fill="#38bdf8" stroke="' + COLORS.ink + '" stroke-width="2.6"/></g>' +
        '<g transform="rotate(-8 32 62)"><rect x="21" y="10" width="22" height="36" rx="5" fill="#a78bfa" stroke="' + COLORS.ink + '" stroke-width="2.6"/></g>' +
        '<g transform="rotate(8 32 62)"><rect x="21" y="10" width="22" height="36" rx="5" fill="#fb7185" stroke="' + COLORS.ink + '" stroke-width="2.6"/></g>' +
        '<g transform="rotate(24 32 62)"><rect x="21" y="10" width="22" height="36" rx="5" fill="#facc15" stroke="' + COLORS.ink + '" stroke-width="2.6"/>' +
          '<circle cx="31" cy="26" r="7" fill="' + COLORS.ink + '"/><circle cx="34.3" cy="23.2" r="5.9" fill="#facc15"/></g>' +
      '</g>' +
    '</g>';
  }

  /**
   * Builds a crisp branded SVG QR code string from a boolean module matrix.
   * Keeps >=4-module quiet zone, high-contrast #0b1530 rounded modules,
   * color-accented finder eyes, and the centered Small Hours 4-card Moon mark.
   */
  function buildBrandedQrSvg(matrixInput, opts) {
    var matrix = normalizeMatrix(matrixInput);
    if (!matrix) return '';
    opts = opts || {};
    var n = matrix.count;
    var quiet = opts.quiet != null ? Math.max(4, Number(opts.quiet)) : 4;
    var total = n + quiet * 2;
    var cutout = computeCenterCutout(n);

    var dParts = [];
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (isInFinder(r, c, n)) continue;
        if (cutout.size > 0 && r >= cutout.start && r <= cutout.end && c >= cutout.start && c <= cutout.end) continue;
        if (matrix.isDark(r, c)) {
          dParts.push(roundedRectPath(quiet + c + 0.05, quiet + r + 0.05, 0.9, 0.9, 0.24));
        }
      }
    }

    var cx = total / 2;
    var cy = total / 2;
    var ariaLabel = opts.label || 'Join room QR code';

    return '<svg class="branded-qr-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + total + ' ' + total + '" width="100%" height="100%" role="img" aria-label="' + ariaLabel + '">' +
      '<rect x="0" y="0" width="' + total + '" height="' + total + '" fill="' + COLORS.plate + '"/>' +
      '<path class="branded-qr-modules" fill="' + COLORS.ink + '" d="' + dParts.join(' ') + '"/>' +
      finderSvg(quiet, quiet, COLORS.eyeTL) +
      finderSvg(quiet + n - 7, quiet, COLORS.eyeTR) +
      finderSvg(quiet, quiet + n - 7, COLORS.eyeBL) +
      centerMarkSvg(cx, cy, cutout.size) +
      '</svg>';
  }

  /**
   * Renders a branded QR code for `text` inside `container`, using qrcodejs Level H
   * as the local encoder and falling back cleanly if matrix access is unavailable.
   */
  function renderBrandedQr(container, text, opts) {
    if (!container || typeof root.QRCode === 'undefined' || !text) return false;
    opts = opts || {};
    container.innerHTML = '';
    var levelH = root.QRCode.CorrectLevel && root.QRCode.CorrectLevel.H != null
      ? root.QRCode.CorrectLevel.H : 2;
    var doc = container.ownerDocument || root.document;
    var scratch = doc.createElement('div');
    var qr = new root.QRCode(scratch, {
      text: String(text),
      width: 164,
      height: 164,
      colorDark: COLORS.ink,
      colorLight: COLORS.plate,
      correctLevel: levelH,
    });
    var matrix = extractQrMatrix(qr);
    if (matrix) {
      var svg = buildBrandedQrSvg(matrix, opts);
      if (svg) {
        container.innerHTML = svg;
        container.setAttribute('data-qr-mode', 'branded');
        return true;
      }
    }
    container.setAttribute('data-qr-mode', 'fallback');
    new root.QRCode(container, {
      text: String(text),
      width: 164,
      height: 164,
      colorDark: COLORS.ink,
      colorLight: COLORS.plate,
      correctLevel: levelH,
    });
    return true;
  }

  var api = {
    COLORS: COLORS,
    extractQrMatrix: extractQrMatrix,
    computeCenterCutout: computeCenterCutout,
    buildBrandedQrSvg: buildBrandedQrSvg,
    renderBrandedQr: renderBrandedQr,
  };

  root.SH = root.SH || {};
  root.SH.brandedQr = api;
  root.renderBrandedQr = renderBrandedQr;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
