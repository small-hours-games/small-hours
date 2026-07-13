import { describe, it, expect } from 'vitest';

// DOM-like escapeHtml (polyfill for Node)
function escapeHtml(text) {
  const map = { '&': '&', '<': '<', '>': '>', '"': '"', "'": '&#039;' };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// NEW Shithead render implementation (what we'll implement)
function newRenderShithead(msg, state) {
  const names = (state && state.playerNames) || msg.playerNames || {};
  const players = msg.players || [];
  const phase = msg.phase || 'play';
  
  if (phase === 'swap') {
    let html = '<div class="shithead-display swap-phase">' +
      '<div class="shithead-phase-title neon">Swap Phase</div>' +
      '<p class="shithead-phase-desc">Players are arranging their cards...</p>';
    
    if (msg.swapConfirmed) {
      html += '<div class="swap-status-grid">';
      for (const [id, confirmed] of Object.entries(msg.swapConfirmed)) {
        const name = names[id] || id;
        const icon = confirmed ? '<span class="status-icon confirmed" aria-label="Confirmed">✓</span>' : '<span class="status-icon pending" aria-label="Pending">⋯</span>';
        html += '<div class="swap-status-item card">' + icon + ' ' + escapeHtml(name) + '</div>';
      }
      html += '</div>';
    }
    html += '</div>';
    return html;
  }
  
  if (phase === 'play' || phase === 'finished') {
    let html = '<div class="shithead-display play-phase">';
    
    // Central pile - large and visible
    html += '<div class="central-pile">';
    if (msg.pileTop) {
      html += '<div class="pile-top-card">' + renderCardImg(msg.pileTop, { width: 120, height: 168, pileCard: true }) + '</div>';
      html += '<div class="pile-info">Pile: ' + (msg.pileCount || 0) + ' cards</div>';
    } else {
      html += '<div class="pile-empty" aria-label="Empty pile">Empty</div>';
      html += '<div class="pile-info">Pile: 0 cards</div>';
    }
    html += '</div>';
    
    // Draw pile indicator
    if (msg.drawPileCount != null) {
      html += '<div class="draw-pile-info"><span class="draw-pile-icon">📦</span> Draw: ' + msg.drawPileCount + '</div>';
    }
    
    // Finished message
    if (phase === 'finished') {
      html += '<div class="game-finished">';
      if (msg.loser) {
        const loserName = names[msg.loser] || 'Someone';
        html += '<div class="loser-announce neon-pink">' + escapeHtml(loserName) + ' is the Shithead! 💩</div>';
      }
      html += '</div>';
    }
    
    // Player cards - fanned layout
    if (players && players.length > 0) {
      html += '<div class="shithead-players">';
      players.forEach(p => {
        const name = names[p.playerId] || p.playerId;
        const isCurrent = p.playerId === msg.currentPlayer;
        const isOut = p.isOut;
        const borderStyle = isCurrent ? 'current-turn' : '';
        const outClass = isOut ? 'player-out' : '';
        
        html += '<div class="player-panel card ' + borderStyle + ' ' + outClass + '" data-player-id="' + escapeHtml(p.playerId) + '">';
        // Name header
        html += '<div class="player-header">';
        html += '<span class="player-name">' + escapeHtml(name) + '</span>';
        if (isCurrent) html += '<span class="turn-indicator neon-green" aria-label="Current turn">▶</span>';
        if (isOut) html += '<span class="out-badge neon-green" aria-label="Player is out">✓ Out</span>';
        html += '</div>';
        
        // Card counts
        const handCount = p.handCount || 0;
        const faceDownCount = p.faceDownCount || 0;
        const faceUp = p.faceUp || [];
        
        html += '<div class="player-card-counts">';
        if (!isOut) {
          html += '<span class="count-item"><span class="count-label">Hand:</span> <span class="count-value">' + handCount + '</span></span>';
          html += '<span class="count-item"><span class="count-label">Down:</span> <span class="count-value">' + faceDownCount + '</span></span>';
        }
        html += '</div>';
        
        // Face-up cards - fanned display
        if (faceUp && faceUp.length > 0) {
          html += '<div class="face-up-fan" aria-label="Face up cards">';
          // Group by rank+suit
          const groups = {};
          faceUp.forEach(c => {
            const key = c.rank + c.suit;
            if (!groups[key]) groups[key] = { card: c, count: 0 };
            groups[key].count++;
          });
          Object.values(groups).sort((a, b) => a.card.rank - b.card.rank).forEach(g => {
            const c = g.card;
            const countBadge = g.count > 1 ? '<span class="count-badge">' + g.count + '</span>' : '';
            html += '<div class="fan-card" style="--card-index: 0;">' + countBadge + renderCardImg(c, { width: 50, height: 70 }) + '</div>';
          });
          html += '</div>';
        }
        
        html += '</div>';
      });
      html += '</div>';
    }
    
    html += '</div>';
    return html;
  }
  
  return '<div class="shithead-display">Loading...</div>';
}

function renderCardImg(c, opts) {
  opts = opts || {};
  var w = opts.width || 58;
  var h = opts.height || 82;
  var classes = ['playing-card'];
  if (opts.pileCard) classes.push('pile-card');
  if (opts.facedown) classes.push('facedown');
  
  const SUIT_MAP = { h: 'HEART', d: 'DIAMOND', c: 'CLUB', s: 'SPADE' };
  const RANK_MAP = { 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: '11-JACK', 12: '12-QUEEN', 13: '13-KING', 14: '1' };
  const suit = SUIT_MAP[c.suit] || c.suit.toUpperCase();
  const rank = RANK_MAP[c.rank] || String(c.rank);
  const src = '/cards/faces/' + suit + '-' + rank + '.svg';
  
  return '<img class="' + classes.join(' ') + '" src="' + src + '" width="' + w + '" height="' + h + '" draggable="false" alt="' + suit + ' ' + rank + '">';
}

describe('Host Shithead Display - Visual Contract', () => {
  it('swap phase shows clear status with confirmed/pending indicators', () => {
    const msg = {
      phase: 'swap',
      swapConfirmed: { alice: true, bob: false }
    };
    const state = { playerNames: { alice: 'Alice', bob: 'Bob' } };
    const html = newRenderShithead(msg, state);
    
    expect(html).toContain('Swap Phase');
    expect(html).toContain('swap-status-grid');
    expect(html).toContain('status-icon confirmed');
    expect(html).toContain('status-icon pending');
    expect(html).toContain('Alice');
    expect(html).toContain('Bob');
  });

  it('play phase shows large central pile card', () => {
    const msg = {
      phase: 'play',
      pileTop: { rank: 7, suit: 'h' },
      pileCount: 5,
      drawPileCount: 20,
      currentPlayer: 'alice',
      players: [
        { playerId: 'alice', handCount: 3, faceDownCount: 3, faceUp: [{rank: 10, suit: 's'}], isOut: false },
        { playerId: 'bob', handCount: 4, faceDownCount: 3, faceUp: [], isOut: false }
      ]
    };
    const state = { playerNames: { alice: 'Alice', bob: 'Bob' } };
    const html = newRenderShithead(msg, state);
    
    // Central pile should be large and visible
    expect(html).toContain('central-pile');
    expect(html).toContain('pile-top-card');
    expect(html).toContain('width="120"');
    expect(html).toContain('height="168"');
    expect(html).toContain('Pile: 5 cards');
    expect(html).toContain('Draw: 20');
  });

  it('current player has clear turn indicator', () => {
    const msg = {
      phase: 'play',
      currentPlayer: 'alice',
      players: [
        { playerId: 'alice', handCount: 3, faceDownCount: 3, faceUp: [], isOut: false },
        { playerId: 'bob', handCount: 4, faceDownCount: 3, faceUp: [], isOut: false }
      ]
    };
    const state = { playerNames: { alice: 'Alice', bob: 'Bob' } };
    const html = newRenderShithead(msg, state);
    
    expect(html).toContain('current-turn');
    expect(html).toContain('turn-indicator');
    expect(html).toContain('▶');
  });

  it('out players are visually distinct with badge', () => {
    const msg = {
      phase: 'play',
      currentPlayer: 'bob',
      players: [
        { playerId: 'alice', handCount: 0, faceDownCount: 0, faceUp: [], isOut: true },
        { playerId: 'bob', handCount: 4, faceDownCount: 3, faceUp: [], isOut: false }
      ]
    };
    const state = { playerNames: { alice: 'Alice', bob: 'Bob' } };
    const html = newRenderShithead(msg, state);
    
    expect(html).toContain('player-out');
    expect(html).toContain('out-badge');
    expect(html).toContain('✓ Out');
  });

  it('face-up cards displayed in fanned layout with count badges', () => {
    const msg = {
      phase: 'play',
      currentPlayer: 'alice',
      players: [
        { playerId: 'alice', handCount: 3, faceDownCount: 3, faceUp: [{rank: 10, suit: 's'}, {rank: 10, suit: 's'}, {rank: 7, suit: 'h'}], isOut: false }
      ]
    };
    const state = { playerNames: { alice: 'Alice' } };
    const html = newRenderShithead(msg, state);
    
    expect(html).toContain('face-up-fan');
    expect(html).toContain('fan-card');
    expect(html).toContain('count-badge');
    expect(html).toContain('SPADE 10'); // rank 10, suit s = SPADE 10
  });

  it('finished phase shows loser announcement', () => {
    const msg = {
      phase: 'finished',
      loser: 'bob',
      players: [
        { playerId: 'alice', handCount: 0, faceDownCount: 0, faceUp: [], isOut: true },
        { playerId: 'bob', handCount: 2, faceDownCount: 3, faceUp: [], isOut: false }
      ]
    };
    const state = { playerNames: { alice: 'Alice', bob: 'Bob' } };
    const html = newRenderShithead(msg, state);
    
    expect(html).toContain('game-finished');
    expect(html).toContain('loser-announce');
    expect(html).toContain('Bob is the Shithead');
    expect(html).toContain('💩');
  });
});