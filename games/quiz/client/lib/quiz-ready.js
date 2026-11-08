// Display the server's remaining preparation time; the server starts question one.
let quizReadyInterval = null;
function stopQuizReadyCountdown() {
  clearInterval(quizReadyInterval);
  quizReadyInterval = null;
}
function startQuizReadyCountdown(elementId, timeLeft) {
  stopQuizReadyCountdown();
  const deadline = Date.now() + Math.max(0, timeLeft ?? 5) * 1000;
  const tick = () => {
    const el = document.getElementById(elementId);
    if (!el) { stopQuizReadyCountdown(); return; }
    const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    el.textContent = seconds ? String(seconds) : 'Go!';
    if (!seconds) stopQuizReadyCountdown();
  };
  quizReadyInterval = setInterval(tick, 100);
  tick();
}
