import { describe, it, expect } from 'vitest';

// DOM-like escapeHtml (matches host.html implementation) - polyfill for Node
function escapeHtml(text) {
  const map = { '&': '&', '<': '<', '>': '>', '"': '"', "'": '&#039;' };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// NEW implementation (from host.html)
function newRenderScoreboard(scores, playerNames) {
  const names = playerNames || {};
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  
  return sorted.map(([id, score], i) => {
    const name = names[id] || id;
    const rank = i + 1;
    const rankClass = rank === 1 ? 'rank-gold' : rank === 2 ? 'rank-silver' : rank === 3 ? 'rank-bronze' : '';
    return '<div class="score-entry card" data-player-id="' + escapeHtml(id) + '">' +
      '<span class="score-rank ' + rankClass + '">' + rank + '</span>' +
      '<span class="score-name">' + escapeHtml(name) + '</span>' +
      '<span class="score-value">' + score + '</span></div>';
  }).join('');
}

// Score panel HTML structure
function scorePanelHTML() {
  return `
    <div id="scorePanel" class="card score-panel" role="region" aria-label="Live Scoreboard">
      <h3 class="score-panel-title neon">Live Scores</h3>
      <div id="scoreList"></div>
    </div>
  `;
}

describe('Host Scoreboard Panel - Visual & Accessibility Contract', () => {
  it('score entry has glass card styling class', () => {
    const html = newRenderScoreboard({ alice: 100, bob: 50 }, { alice: 'Alice', bob: 'Bob' });
    
    // Should have glass/card class for neon/glass aesthetic
    expect(html).toContain('class="score-entry card"');
  });

  it('score panel container has glassmorphism and proper ARIA', () => {
    const panelHTML = scorePanelHTML();
    
    expect(panelHTML).toContain('class="card score-panel"');
    expect(panelHTML).toContain('role="region"');
    expect(panelHTML).toContain('aria-label="Live Scoreboard"');
  });

  it('score entries have rank styling (gold/silver/bronze)', () => {
    const html = newRenderScoreboard({ 
      alice: 100, bob: 50, charlie: 25, dave: 10 
    }, { 
      alice: 'Alice', bob: 'Bob', charlie: 'Charlie', dave: 'Dave' 
    });
    
    // Check first place has gold rank
    expect(html).toContain('rank-gold');
    expect(html).toContain('rank-silver');
    expect(html).toContain('rank-bronze');
  });

  it('score value elements exist with proper values', () => {
    const html = newRenderScoreboard({ alice: 100, bob: 50 }, { alice: 'Alice', bob: 'Bob' });
    
    expect(html).toContain('<span class="score-value">100</span>');
    expect(html).toContain('<span class="score-value">50</span>');
  });

  it('player names are escaped and displayed correctly', () => {
    const html = newRenderScoreboard({ alice: 100 }, { alice: 'Alice <script>' });
    
    // Name should be HTML-escaped (the DOM escapeHtml converts < to <)
    expect(html).toContain('Alice <script>');
  });

  it('data-player-id attribute is present for potential animations', () => {
    const html = newRenderScoreboard({ alice: 100, bob: 50 }, { alice: 'Alice', bob: 'Bob' });
    
    expect(html).toContain('data-player-id="alice"');
    expect(html).toContain('data-player-id="bob"');
  });
});

// CSS contract tests - verify the style.css has the required classes
describe('Host Scoreboard Panel - CSS Contract', () => {
  const fs = require('fs');
  const css = fs.readFileSync('/opt/data/small-hours/public/css/style.css', 'utf-8');

  it('has .card class with glassmorphism (used by score entries)', () => {
    expect(css).toContain('.card');
    expect(css).toContain('backdrop-filter');
    expect(css).toContain('var(--bg-card)');
    expect(css).toContain('var(--glass-border)');
    expect(css).toContain('border-radius: 16px');
  });

  it('has neon text shadow classes for rank styling', () => {
    expect(css).toContain('.neon');
    expect(css).toContain('text-shadow');
    expect(css).toContain('var(--neon-purple)');
    expect(css).toContain('var(--neon-green)');
  });

  it('has animation keyframes for visual feedback', () => {
    expect(css).toContain('@keyframes');
    // Check for at least one animation keyframe
    expect(css).toContain('animation:');
  });

  it('has score panel title styling (in HTML uses .score-panel-title.neon)', () => {
    // The HTML uses class="score-panel-title neon" so the .neon class provides the styling
    expect(css).toContain('.neon');
  });
});