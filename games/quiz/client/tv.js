// Quiz on the TV (Music Quiz reuses it).

    const quizNarrator = createQuizNarrator(speaking => SH.duckMusic(speaking));
    quizNarrator.prepareIntro();
    document.addEventListener('pointerdown', () => quizNarrator.retry());
    document.addEventListener('keydown', () => quizNarrator.retry());

    // --- Music Quiz audio (plays on the TV only) ---
    let musicAudio = null;
    let musicQuestionId = null;
    let musicFade = null;

    function syncMusic(msg) {
      const q = msg.question;
      const preview = q && q.media && q.media.preview;
      const audible = msg.phase === 'question' || msg.phase === 'reveal';
      if (!preview || !audible) {
        if (!audible) stopMusic();
        return;
      }
      // Re-renders within the same question keep the clip running
      if (q.id === musicQuestionId) { musicFade.sync(msg); return; }
      if (msg.phase !== 'question') return;
      stopMusic();
      musicQuestionId = q.id;
      musicAudio = new Audio(preview);
      musicAudio.muted = isMuted;
      musicFade = createMusicFade(musicAudio);
      musicFade.start(msg.timeLeft);
      musicAudio.play().catch(showSoundUnlock);
    }

    function stopMusic() {
      if (musicFade) musicFade.stop();
      musicFade = null;
      if (musicAudio) musicAudio.pause();
      musicAudio = null;
      musicQuestionId = null;
      hideSoundUnlock();
    }

    // Browsers block autoplay until the page has been clicked once
    function showSoundUnlock() {
      if (document.getElementById('soundUnlock')) return;
      const btn = document.createElement('button');
      btn.id = 'soundUnlock';
      btn.className = 'fixed top-20 left-1/2 -translate-x-1/2 z-[1400] px-6 py-3 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-2xl shadow-lg shadow-sky-600/30 flex items-center gap-2';
      btn.innerHTML = '<i class="fa-solid fa-volume-high"></i> Tap to enable sound';
      btn.onclick = () => {
        if (musicAudio) musicAudio.play().catch(() => {});
        hideSoundUnlock();
      };
      document.body.appendChild(btn);
    }

    function hideSoundUnlock() {
      document.getElementById('soundUnlock')?.remove();
    }

    function musicPanel(msg) {
      const media = msg.question && msg.question.media;
      if (!media) return '';
      if (msg.phase === 'reveal' && media.artist) {
        return '<div class="flex items-center justify-center gap-5 my-1">' +
          (media.cover ? '<img src="' + escapeHtml(media.cover) + '" alt="" class="w-28 h-28 rounded-2xl object-cover shadow-lg border-4 border-white">' : '') +
          '<div class="text-left"><div class="font-display text-3xl font-bold text-slate-800">' + escapeHtml(media.title) + '</div>' +
          '<div class="text-xl text-slate-500 font-semibold">' + escapeHtml(media.artist) + '</div></div>' +
        '</div>';
      }
      const genre = msg.question.category
        ? '<div class="text-center"><span class="inline-block px-4 py-1 rounded-full bg-sky-100 border border-sky-200 text-sky-800 font-bold text-lg">Genre: ' + escapeHtml(msg.question.category) + '</span></div>'
        : '';
      return genre + '<div class="flex items-end justify-center gap-2 h-12 my-1" aria-label="Song playing">' +
        [8, 14, 10, 16, 6, 12, 9, 15, 7].map((h, i) =>
          '<span class="w-3 rounded-full ' + (i % 2 ? 'bg-sky-600 animate-pulse' : 'bg-sky-400 animate-bounce') + '" style="height:' + (h * 3) + 'px;animation-delay:' + (i * 90) + 'ms"></span>'
        ).join('') +
      '</div>';
    }

    // --- Question countdown, ticked locally from the server's time left ---
    const hostCountdown = { deadline: 0, total: 0, interval: null };

    function startHostCountdown(timeLeft, timeTotal) {
      hostCountdown.deadline = Date.now() + timeLeft * 1000;
      hostCountdown.total = timeTotal;
      if (!hostCountdown.interval) hostCountdown.interval = setInterval(tickHostCountdown, 250);
      tickHostCountdown();
    }

    function tickHostCountdown() {
      const left = Math.max(0, (hostCountdown.deadline - Date.now()) / 1000);
      const pct = hostCountdown.total ? (left / hostCountdown.total) * 100 : 0;
      const cls = 'timer-bar' + (pct < 20 ? ' critical' : pct < 40 ? ' warning' : '');
      // Only touch class/text when they change: Tailwind's CDN compiler re-runs on every class change
      const container = document.getElementById('timerContainer');
      if (container.style.display !== 'block') container.style.display = 'block';
      const bar = document.getElementById('timerBar');
      bar.style.width = pct + '%';
      if (bar.className !== cls) bar.className = cls;
      const seconds = document.getElementById('timerSeconds');
      const secCls = 'timer-seconds' + (pct < 20 ? ' critical' : pct < 40 ? ' warning' : '');
      const secText = String(Math.ceil(left));
      if (seconds.style.display) seconds.style.display = '';
      if (seconds.textContent !== secText) seconds.textContent = secText;
      if (seconds.className !== secCls) seconds.className = secCls;
      if (left <= 0) stopHostCountdown(true);
    }

    function stopHostCountdown(keepDisplay) {
      clearInterval(hostCountdown.interval);
      hostCountdown.interval = null;
      if (!keepDisplay) {
        hostCountdown.deadline = 0;
        document.getElementById('timerContainer').style.display = 'none';
        document.getElementById('timerSeconds').style.display = 'none';
      }
    }

    function renderQuiz(msg) {
      const content = document.getElementById('gameContent');
      const timerContainer = document.getElementById('timerContainer');
      const timerBar = document.getElementById('timerBar');
      const roundInfo = document.getElementById('roundInfo');

      if (msg.phase !== 'countdown') stopQuizReadyCountdown();
      syncMusic(msg);
      quizNarrator.sync({ ...msg, gameType: state.gameType });
      if (msg.phase !== 'question') stopHostCountdown();

      // Progress indicator ("Question 3 of 10")
      if (msg.currentQuestion != null && msg.totalQuestions) {
        roundInfo.textContent = 'Question ' + (msg.currentQuestion + 1) + ' of ' + msg.totalQuestions;
      }

      if (msg.phase === 'countdown') {
        timerContainer.style.display = 'none';
        content.innerHTML = '<div class="quiz-display countdown-phase">' +
          '<div class="quiz-question-text">Get ready!</div>' +
          '<div class="quiz-ready-number" id="quizReadyNumber" role="timer" aria-label="Quiz starts in">5</div>' +
          '<div class="quiz-countdown-text">First question coming up...</div>' +
          '</div>';
        startQuizReadyCountdown('quizReadyNumber', msg.timeLeft);
        return;
      }

      if (msg.phase === 'between') {
        timerContainer.style.display = 'none';
        const nextQ = (msg.currentQuestion != null ? msg.currentQuestion + 1 : '?');
        content.innerHTML = '<div class="quiz-display between-phase">' +
          '<div class="quiz-question-text">Next up: Question ' + nextQ + '</div>' +
          '<div class="quiz-between-text">Get ready for the next round...</div>' +
          '</div>';
        return;
      }

      if (msg.phase === 'question') {
        const q = msg.question || {};
        const imageHtml = q.image && !q.media
          ? '<div class="quiz-image-wrap"><img src="' + escapeHtml(q.image) + '" alt="" class="quiz-question-image" loading="eager" onerror="this.parentElement.style.display=\'none\'"></div>'
          : '';
        // One countdown only: the bar under the game title plus the seconds badge in the header
        let html = '<div class="quiz-display question-phase">' +
          '<div class="quiz-question-text">' + escapeHtml(q.text || '') + '</div>' +
          imageHtml +
          musicPanel(msg) +
          '<div class="quiz-answers-display">';

        const labels = ['A', 'B', 'C', 'D'];
        const neonColors = ['var(--neon-red)', 'var(--neon-blue)', 'var(--neon-green)', 'var(--neon-orange)'];
        (q.answers || []).forEach((a, i) => {
          html += '<button class="answer-btn answer-' + labels[i].toLowerCase() + '" style="background:' + neonColors[i] + '" data-index="' + i + '" aria-label="Answer ' + labels[i] + ': ' + escapeHtml(a) + '">' +
            '<span class="answer-label">' + labels[i] + '.</span>' +
            '<span class="answer-text">' + escapeHtml(a) + '</span>' +
          '</button>';
        });

        html += '</div>';

        const timed = msg.timeLeft != null && msg.timeTotal;
        if (!timed) timerContainer.style.display = 'none';

        html += '</div>';
        content.innerHTML = html;
        // Tick the countdown locally from the server's time left (bar + seconds badge)
        if (timed) startHostCountdown(msg.timeLeft, msg.timeTotal);
        else if (hostCountdown.deadline) tickHostCountdown();
      } else if (msg.phase === 'reveal') {
        timerContainer.style.display = 'none';
        const q = msg.question || {};
        const imageHtml = q.image && !q.media
          ? '<div class="quiz-image-wrap"><img src="' + escapeHtml(q.image) + '" alt="" class="quiz-question-image" loading="eager" onerror="this.parentElement.style.display=\'none\'"></div>'
          : '';
        let html = '<div class="quiz-display reveal-phase">' +
          '<div class="quiz-question-text">' + escapeHtml(q.text || '') + '</div>' +
          imageHtml +
          musicPanel(msg) +
          '<div class="quiz-answers-display">';

        const labels = ['A', 'B', 'C', 'D'];
        const neonColors = ['var(--neon-red)', 'var(--neon-blue)', 'var(--neon-green)', 'var(--neon-orange)'];
        (q.answers || []).forEach((a, i) => {
          const isCorrect = i === msg.correctIndex;
          const mark = isCorrect ? '<span class="answer-mark correct" aria-label="Correct answer">&#9989;</span>' : '<span class="answer-mark incorrect" aria-label="Incorrect">&#10060;</span>';
          const correctClass = isCorrect ? ' correct' : ' incorrect';
          const names = msg.playerNames || state.playerNames || {};
          const guesses = Object.entries(msg.playerAnswers || {})
            .filter(([, answer]) => answer === a)
            .map(([pid]) => '<span class="answer-player">' + playerAvatarHtml(pid) +
              '<span>' + escapeHtml(names[pid] || 'Player') + '</span></span>');
          const guessHtml = '<span class="answer-guesses">' +
            (guesses.length ? guesses.join(' ') : 'No guesses') + '</span>';
          html += '<button class="answer-btn answer-' + labels[i].toLowerCase() + correctClass + '" style="background:' + (isCorrect ? 'var(--neon-green)' : neonColors[i]) + '" disabled aria-disabled="true" aria-label="' + (isCorrect ? 'Correct answer: ' : 'Incorrect: ') + escapeHtml(a) + '">' +
            '<span class="answer-label">' + labels[i] + '.</span>' +
            '<span class="answer-text">' + escapeHtml(a) + '</span>' +
            mark + guessHtml +
          '</button>';
        });

        html += '</div></div>';
        content.innerHTML = html;
      }
    }

    SH.registerGame('quiz', {
      render: renderQuiz,
      onEnter() { quizNarrator.stop(); },
      onLeave() { quizNarrator.stop(); },
      onMute(muted) {
        quizNarrator.setMuted(muted);
        if (musicAudio) musicAudio.muted = muted;
      },
      scoreboard(msg) {
        return msg.totalQuestions ? { roundLabel: 'Question ' + ((msg.currentQuestion || 0) + 1) + ' / ' + msg.totalQuestions } : {};
      },
    });
