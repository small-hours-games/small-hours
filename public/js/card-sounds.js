// Card sounds on the TV speakers. Plain browser script exposing the global `audio`.

// Web Audio singleton — host display only (TV speakers)
var audio = {
  ctx: null,
  buffers: {},
  init: function() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    var self = this;
    var sounds = ['draw', 'place', 'deck_redraw', 'win'];
    sounds.forEach(function(name) { self._load(name); });
  },
  _load: function(name) {
    var self = this;
    fetch('/cards/sounds/' + name + '.wav')
      .then(function(res) { return res.arrayBuffer(); })
      .then(function(buf) { return self.ctx.decodeAudioData(buf); })
      .then(function(decoded) { self.buffers[name] = decoded; })
      .catch(function(e) { console.warn('Sound load failed:', name, e); });
  },
  play: function(name) {
    if (!this.ctx || !this.buffers[name]) return;
    var src = this.ctx.createBufferSource();
    src.buffer = this.buffers[name];
    src.connect(this.ctx.destination);
    src.start(0);
  }
};
