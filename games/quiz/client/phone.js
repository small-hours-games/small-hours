// Quiz on the phone (Music Quiz reuses it).

    function quizFreshState() {
      return {
        selectedAnswer: null,
        powerupsUsed: { double: false, fifty: false, freeze: false },
        eliminatedAnswers: [],
        pendingPowerup: null,
        lastQuizQuestionId: null,
      };
    }
    Object.assign(state, quizFreshState());

    // --- Quiz ---
    const QUIZ_POWERUP_BTNS = { double: 'pwDouble', fifty: 'pwFifty', freeze: 'pwFreeze' };

    function renderQuizState(msg) {
      const timerContainer = document.getElementById('quizTimerContainer');
      const timerBar = document.getElementById('quizTimerBar');
      const timerText = document.getElementById('quizTimerText');
      const questionEl = document.getElementById('quizQuestion');
      const grid = document.getElementById('quizAnswers');
      const powerupsEl = document.getElementById('quizPowerups');

      if (msg.phase !== 'countdown') {
        stopQuizReadyCountdown();
        timerText.classList.remove('quiz-ready-number');
      }

      // Reset per-question state when a new question arrives
      const q = msg.question || null;
      if (q && q.id && q.id !== state.lastQuizQuestionId) {
        state.selectedAnswer = null;
        state.eliminatedAnswers = [];
        state.pendingPowerup = null;
        state.lastQuizQuestionId = q.id;
      }

      if (q && msg.selectedAnswer != null) {
        const selectedIndex = q.answers.indexOf(msg.selectedAnswer);
        if (selectedIndex !== -1) state.selectedAnswer = selectedIndex;
      }

      // Engine-provided eliminatedAnswers override local (keeps fifty powerup in sync)
      if (Array.isArray(msg.eliminatedAnswers)) {
        state.eliminatedAnswers = msg.eliminatedAnswers;
      }

      // Sync pending powerup with server powerup state — if the server says a
      // powerup is no longer available and we haven't marked it locally, sync.
      if (msg.myPowerups) {
        for (const p of ['double', 'fifty', 'freeze']) {
          if (msg.myPowerups[p] === false) {
            state.powerupsUsed[p] = true;
          }
        }
      }

      // Header line: "Question X of Y"
      const headerText = (msg.currentQuestion != null && msg.totalQuestions)
        ? 'Question ' + (msg.currentQuestion + 1) + ' of ' + msg.totalQuestions
        : '';
      const roundPill = document.getElementById('quizRoundPill');
      if (roundPill) {
        roundPill.textContent = headerText || (q && q.media ? '🎵 Music Quiz' : '🎯 Quiz');
      }

      if (msg.phase === 'countdown') {
        timerContainer.style.display = 'none';
        timerText.classList.add('quiz-ready-number');
        startQuizReadyCountdown('quizTimerText', msg.timeLeft);
        questionEl.textContent = headerText || 'Get ready!';
        grid.innerHTML = '';
        powerupsEl.style.display = 'none';
      } else if (msg.phase === 'between') {
        timerContainer.style.display = 'none';
        timerText.textContent = '';
        questionEl.textContent = 'Next up: ' + headerText;
        grid.innerHTML = '';
        powerupsEl.style.display = 'none';
      } else if (msg.phase === 'question') {
        questionEl.textContent = (q && q.text) ? q.text : headerText;

        // Save question state for re-renders (e.g. after answer selection)
        state._lastQuestion = q;

        // Timer: the server sends the time left; tick it down locally
        if (msg.timeLeft != null && msg.timeTotal) {
          startQuizCountdown(msg.timeLeft, msg.timeTotal);
        } else if (!state.quizCountdown) {
          timerContainer.style.display = 'none';
          timerText.textContent = '';
        }

        // Answers
        const labels = ['A', 'B', 'C', 'D'];
        const classes = ['answer-a', 'answer-b', 'answer-c', 'answer-d'];
        const answers = (q && q.answers) || [];
        grid.innerHTML = answers.map((a, i) => {
          let cls = 'answer-btn ' + classes[i];
          if (state.selectedAnswer === i) cls += ' selected';
          if (state.eliminatedAnswers.includes(i)) cls += ' eliminated';
          const disabled = state.selectedAnswer !== null ? ' disabled' : '';
          return '<button class="' + cls + '"' + disabled + ' aria-pressed="' + (state.selectedAnswer === i) + '" onclick="selectAnswer(' + i + ')">' +
            '<strong>' + labels[i] + '.</strong> ' + escapeHtml(a) + '</button>';
        }).join('');

        // Powerups
        powerupsEl.style.display = state.selectedAnswer === null ? 'grid' : 'none';
        updatePowerupBtns();

      } else if (msg.phase === 'reveal') {
        timerContainer.style.display = 'none';
        timerText.textContent = '';
        questionEl.textContent = (q && q.text) ? q.text : headerText;

        const labels = ['A', 'B', 'C', 'D'];
        const classes = ['answer-a', 'answer-b', 'answer-c', 'answer-d'];
        const answers = (q && q.answers) || [];
        grid.innerHTML = answers.map((a, i) => {
          let cls = 'answer-btn ' + classes[i];
          if (state.selectedAnswer === i) cls += ' selected';
          if (i === msg.correctIndex) cls += ' correct';
          else if (state.selectedAnswer === i) cls += ' incorrect';
          if (state.eliminatedAnswers.includes(i) && i !== msg.correctIndex) cls += ' eliminated';
          return '<button class="' + cls + '" aria-pressed="' + (state.selectedAnswer === i) + '" disabled>' +
            '<strong>' + labels[i] + '.</strong> ' + escapeHtml(a) + '</button>';
        }).join('');

        powerupsEl.style.display = 'none';
      }

      if (msg.phase !== 'question') stopQuizCountdown(msg.phase === 'countdown');
      renderQuizMedia(msg);

      if (msg.score != null) {
        document.getElementById('quizScore').style.display = 'inline-flex';
        document.getElementById('quizScoreVal').textContent = msg.score;
      }
    }

    // --- Question countdown (bar + seconds), ticked locally from the server's time left ---
    function startQuizCountdown(timeLeft, timeTotal) {
      state.quizDeadline = Date.now() + timeLeft * 1000;
      state.quizTotal = timeTotal;
      if (!state.quizCountdown) state.quizCountdown = setInterval(tickQuizCountdown, 250);
      tickQuizCountdown();
    }

    function tickQuizCountdown() {
      const left = Math.max(0, (state.quizDeadline - Date.now()) / 1000);
      const pct = state.quizTotal ? (left / state.quizTotal) * 100 : 0;
      // Only touch class/text when they change: Tailwind's CDN compiler re-runs on every class change
      const bar = document.getElementById('quizTimerBar');
      const container = document.getElementById('quizTimerContainer');
      if (container.style.display !== 'block') container.style.display = 'block';
      bar.style.width = pct + '%';
      const cls = 'timer-bar' + (pct < 20 ? ' critical' : pct < 40 ? ' warning' : '');
      if (bar.className !== cls) bar.className = cls;
      const text = document.getElementById('quizTimerText');
      const secText = String(Math.ceil(left));
      if (text.textContent !== secText) text.textContent = secText;
      if (left <= 0) stopQuizCountdown(true);
    }

    function stopQuizCountdown(keepDisplay) {
      clearInterval(state.quizCountdown);
      state.quizCountdown = null;
      if (!keepDisplay) {
        document.getElementById('quizTimerContainer').style.display = 'none';
        document.getElementById('quizTimerText').textContent = '';
      }
    }

    // --- Music Quiz audio: the clip plays on every phone (and the TV); big mute button per phone ---
    const SILENT_CLIP = 'data:audio/wav;base64,UklGRogAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YWQAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA';
    const phoneAudio = new Audio();
    const phoneMusicFade = createMusicFade(phoneAudio);
    let phoneAudioQuestion = null;
    state.musicMuted = (() => { try { return localStorage.getItem('sh_music_muted') === '1'; } catch { return false; } })();
    state.musicBlocked = false;
    phoneAudio.muted = state.musicMuted;

    // Phones only allow sound after a tap: unlock this one reusable element on the first tap
    document.addEventListener('pointerdown', () => {
      if (phoneAudioQuestion) {
        phoneAudio.play().then(() => { state.musicBlocked = false; updateMusicBtn(); }).catch(() => {});
        return;
      }
      phoneAudio.src = SILENT_CLIP;
      phoneAudio.play().catch(() => {});
    }, { once: true });

    function syncPhoneMusic(msg) {
      const q = msg.question;
      const preview = q && q.media && q.media.preview;
      const audible = msg.phase === 'question' || msg.phase === 'reveal';
      if (!preview || !audible) {
        if (!audible) stopPhoneMusic();
        return;
      }
      // Re-renders within the same question keep the clip running
      if (q.id === phoneAudioQuestion) { phoneMusicFade.sync(msg); return; }
      if (msg.phase !== 'question') return;
      phoneAudioQuestion = q.id;
      state.musicBlocked = false;
      phoneAudio.src = preview;
      phoneMusicFade.start(msg.timeLeft);
      phoneAudio.play().catch(() => { state.musicBlocked = true; updateMusicBtn(); });
    }

    function stopPhoneMusic() {
      phoneMusicFade.stop();
      if (phoneAudioQuestion) phoneAudio.pause();
      phoneAudioQuestion = null;
      state.musicBlocked = false;
    }

    function toggleMusicMute() {
      if (state.musicBlocked) {
        phoneAudio.play().then(() => { state.musicBlocked = false; updateMusicBtn(); }).catch(() => {});
        return;
      }
      state.musicMuted = !state.musicMuted;
      phoneAudio.muted = state.musicMuted;
      try { localStorage.setItem('sh_music_muted', state.musicMuted ? '1' : '0'); } catch { /* ignore */ }
      updateMusicBtn();
    }

    function musicBtnHtml() {
      const [icon, label, tone] = state.musicBlocked
        ? ['fa-play', 'Tap to hear', 'bg-sky-600 text-white shadow-md shadow-sky-600/30']
        : state.musicMuted
          ? ['fa-volume-xmark', 'Muted', 'bg-slate-200 text-slate-600']
          : ['fa-volume-high', 'Sound on', 'bg-sky-100 text-sky-700'];
      return '<button id="musicBtn" onclick="toggleMusicMute()" aria-label="' + label + '" class="shrink-0 w-16 h-16 rounded-2xl flex flex-col items-center justify-center gap-0.5 font-bold transition active:scale-95 ' + tone + '">' +
        '<i class="fa-solid ' + icon + ' text-2xl"></i><span class="text-[10px] leading-none">' + label + '</span></button>';
    }

    function updateMusicBtn() {
      const btn = document.getElementById('musicBtn');
      if (btn) btn.outerHTML = musicBtnHtml();
    }

    // Music Quiz strip: now playing + mute during the question, the song at reveal
    function renderQuizMedia(msg) {
      syncPhoneMusic(msg);
      const box = document.getElementById('quizMedia');
      const media = msg.question && msg.question.media;
      const image = msg.question && !media && msg.question.image;
      if ((!media && !image) || (msg.phase !== 'question' && msg.phase !== 'reveal')) {
        box.className = 'hidden';
        box.innerHTML = '';
        return;
      }
      if (image) {
        box.className = 'quiz-phone-image-wrap my-1 flex justify-center';
        box.innerHTML = '<img src="' + escapeHtml(image) + '" alt="" class="quiz-phone-image max-h-24 w-auto rounded-xl object-contain shadow-sm border-2 border-white bg-white/85" loading="eager" onerror="this.parentElement.className=\'hidden\'">';
        return;
      }
      box.className = 'device-screen bg-white/95 border-2 border-sky-200 rounded-xl p-2.5 flex items-center gap-3 shadow-sm';
      if (msg.phase === 'reveal' && media.artist) {
        box.innerHTML =
          (media.cover ? '<img src="' + escapeHtml(media.cover) + '" alt="" class="w-16 h-16 rounded-xl object-cover shadow-md border border-slate-200">' : '') +
          '<div class="min-w-0 flex-1">' +
            '<div class="text-[10px] font-extrabold uppercase tracking-wider text-emerald-600 mb-0.5">&#127925; Answer Track</div>' +
            '<div class="font-extrabold text-base text-slate-900 truncate">' + escapeHtml(media.title) + '</div>' +
            '<div class="text-xs font-semibold text-slate-600 truncate">' + escapeHtml(media.artist) + '</div>' +
          '</div>' +
          musicBtnHtml();
      } else {
        box.innerHTML =
          '<div class="flex-1 min-w-0">' +
            '<div class="flex items-center gap-2">' +
              '<span class="font-extrabold text-sm text-slate-800">&#127911; Listen &amp; Guess</span>' +
              (msg.question.category ? '<span class="px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 text-[11px] font-extrabold truncate">' + escapeHtml(msg.question.category) + '</span>' : '') +
            '</div>' +
            '<div class="flex items-end gap-1.5 h-7 mt-2">' +
              '<span class="w-2 h-3 bg-sky-500 rounded-full animate-bounce"></span>' +
              '<span class="w-2 h-6 bg-sky-600 rounded-full animate-pulse"></span>' +
              '<span class="w-2 h-4 bg-sky-400 rounded-full animate-bounce"></span>' +
              '<span class="w-2 h-7 bg-sky-700 rounded-full animate-pulse"></span>' +
              '<span class="w-2 h-3 bg-sky-500 rounded-full animate-bounce"></span>' +
              '<span class="w-2 h-5 bg-sky-600 rounded-full animate-pulse"></span>' +
            '</div>' +
          '</div>' +
          musicBtnHtml();
      }
    }

    function selectAnswer(index) {
      if (state.selectedAnswer !== null) return;
      if (state.eliminatedAnswers.includes(index)) return;
      state.selectedAnswer = index;
      // Send the answer text (not index) so the engine can compare against correct_answer string
      const answerId = state._lastQuestion && state._lastQuestion.answers
        ? state._lastQuestion.answers[index]
        : index;
      const action = { type: 'answer', answerId };
      // Attach any pending powerup (double/freeze) to the submission
      if (state.pendingPowerup && state.pendingPowerup !== 'fifty') {
        action.powerupType = state.pendingPowerup;
      }
      send({ type: 'GAME_ACTION', action });

      // Immediately reflect the selection in the DOM (server will confirm shortly)
      const btns = document.querySelectorAll('#quizAnswers .answer-btn');
      btns.forEach((btn, i) => {
        btn.disabled = true;
        btn.setAttribute('aria-pressed', String(i === index));
        if (i === index) btn.classList.add('selected');
      });
      document.getElementById('quizPowerups').style.display = 'none';
    }

    function usePowerup(type) {
      if (state.powerupsUsed[type]) return;
      if (state.selectedAnswer !== null) return;

      if (type === 'fifty') {
        // Fifty is activated immediately on the server — it trims the answer list
        // via the next view update (eliminatedAnswers).
        state.powerupsUsed.fifty = true;
        send({ type: 'GAME_ACTION', action: { type: 'useFifty' } });
      } else {
        // Double / freeze are tracked locally and attached to the answer on submit
        state.pendingPowerup = type;
        state.powerupsUsed[type] = true;
      }
      updatePowerupBtns();
    }

    function updatePowerupBtns() {
      for (const [p, btnId] of Object.entries(QUIZ_POWERUP_BTNS)) {
        const btn = document.getElementById(btnId);
        if (!btn) continue;
        if (state.powerupsUsed[p]) {
          btn.disabled = true;
          btn.classList.add('used');
        } else {
          btn.disabled = false;
          btn.classList.remove('used');
        }
        if (state.pendingPowerup === p) {
          btn.classList.add('selected');
        } else {
          btn.classList.remove('selected');
        }
      }
    }

    const quizPhone = {
      section: 'quizSection',
      render: renderQuizState,
      onEnter() { Object.assign(state, quizFreshState()); },
      startLabel() { return state.votingActive ? null : 'Start Quiz &rarr; Pick Topic'; },
    };
    SH.registerGame('quiz', quizPhone);
