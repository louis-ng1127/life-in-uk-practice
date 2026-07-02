const $ = id => document.getElementById(id);
const STORAGE_KEY = "lifeUkQuizStatsV1";

const state = {
  data: null,
  stats: loadStats(),
  session: [],
  index: 0,
  selected: new Set(),
  submitted: false,
  answerVisible: false,
  correctThisSession: 0,
  answeredThisSession: 0,
  sessionWrongIds: new Set(),
  installPrompt: null
};

function loadStats() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { attempts: 0, correct: 0, answeredIds: [], wrongIds: [] };
  } catch {
    return { attempts: 0, correct: 0, answeredIds: [], wrongIds: [] };
  }
}

function saveStats() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.stats));
  renderStats();
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function showView(viewId) {
  for (const id of ["setupView", "quizView", "summaryView"]) $(id).classList.toggle("hidden", id !== viewId);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderStats() {
  const attempted = new Set(state.stats.answeredIds).size;
  const wrong = new Set(state.stats.wrongIds).size;
  const accuracy = state.stats.attempts ? Math.round(state.stats.correct / state.stats.attempts * 100) : 0;
  $("attemptedStat").textContent = attempted;
  $("correctStat").textContent = state.stats.correct;
  $("accuracyStat").textContent = `${accuracy}%`;
  $("wrongStat").textContent = wrong;
  $("wrongCount").textContent = wrong;
  $("wrongBtn").disabled = wrong === 0;
}

function updateRange() {
  const all = $("allQuestions").checked;
  $("startQuestion").disabled = all;
  $("endQuestion").disabled = all;
  if (all) {
    $("startQuestion").value = 1;
    $("endQuestion").value = state.data?.questionCount || 435;
  }
  const start = Number($("startQuestion").value);
  const end = Number($("endQuestion").value);
  const count = Number.isFinite(start) && Number.isFinite(end) && end >= start ? end - start + 1 : 0;
  $("rangeCount").textContent = `${count}题`;
}

function buildSession(questions) {
  state.session = shuffle(questions).map(question => ({ ...question, displayOptions: shuffle(question.options) }));
  state.index = 0;
  state.correctThisSession = 0;
  state.answeredThisSession = 0;
  state.sessionWrongIds = new Set();
  showView("quizView");
  renderQuestion();
}

function startRangeSession() {
  $("setupMessage").textContent = "";
  const total = state.data.questionCount;
  const start = Math.max(1, Number($("startQuestion").value));
  const end = Math.min(total, Number($("endQuestion").value));
  if (!Number.isInteger(start) || !Number.isInteger(end) || start > end) {
    $("setupMessage").textContent = `请输入1到${total}之间的有效范围。`;
    return;
  }
  buildSession(state.data.questions.filter(question => question.id >= start && question.id <= end));
}

function startWrongSession(ids = state.stats.wrongIds) {
  const wanted = new Set(ids);
  const questions = state.data.questions.filter(question => wanted.has(question.id));
  if (!questions.length) {
    $("setupMessage").textContent = "目前没有错题记录。";
    showView("setupView");
    return;
  }
  buildSession(questions);
}

function renderQuestion() {
  const question = state.session[state.index];
  state.selected = new Set();
  state.submitted = false;
  state.answerVisible = false;

  $("progressText").textContent = `${state.index + 1} / ${state.session.length}`;
  const score = state.answeredThisSession ? Math.round(state.correctThisSession / state.answeredThisSession * 100) : 0;
  $("scoreText").textContent = `得分 ${score}%`;
  $("progressBar").style.width = `${state.index / state.session.length * 100}%`;
  $("sourceNumber").textContent = `原题 #${question.id} · Exam ${question.exam} / Q${question.number}`;
  $("questionType").textContent = question.answer.length > 1 ? `多选题 · 选${question.answer.length}项` : "单选题";
  $("questionText").textContent = question.text;
  $("selectionHint").textContent = question.answer.length > 1 ? `请选择${question.answer.length}个答案，再点击提交。` : "请选择一个答案，再点击提交。";
  $("submitBtn").disabled = true;
  $("submitBtn").classList.remove("hidden");
  $("showAnswerBtn").classList.remove("hidden");
  $("resultPanel").classList.add("hidden");
  $("answerPanel").classList.add("hidden");
  $("navigation").classList.add("hidden");

  const options = $("options");
  options.replaceChildren();
  question.displayOptions.forEach((option, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "option";
    button.dataset.id = option.id;
    const markerClass = question.answer.length > 1 ? "multi-mark" : "single-mark";
    button.innerHTML = `<span class="option-key ${markerClass}">${String.fromCharCode(65 + index)}</span><span></span>`;
    button.lastElementChild.textContent = option.text;
    button.addEventListener("click", () => selectOption(option.id));
    options.appendChild(button);
  });
}

function selectOption(id) {
  if (state.submitted) return;
  const question = state.session[state.index];
  if (question.answer.length === 1) {
    state.selected = new Set([id]);
  } else if (state.selected.has(id)) {
    state.selected.delete(id);
  } else {
    state.selected.add(id);
  }
  for (const button of $("options").children) button.classList.toggle("selected", state.selected.has(button.dataset.id));
  $("submitBtn").disabled = state.selected.size === 0;
}

function recordResult(isCorrect, question) {
  state.answeredThisSession++;
  state.stats.attempts++;
  if (isCorrect) {
    state.correctThisSession++;
    state.stats.correct++;
    state.stats.wrongIds = state.stats.wrongIds.filter(id => id !== question.id);
  } else {
    state.sessionWrongIds.add(question.id);
    state.stats.wrongIds = [...new Set([...state.stats.wrongIds, question.id])];
  }
  state.stats.answeredIds = [...new Set([...state.stats.answeredIds, question.id])];
  saveStats();
}

function submitAnswer({ reveal = false, unanswered = false } = {}) {
  if (state.submitted) {
    if (reveal) revealAnswer();
    return;
  }
  if (!state.selected.size && !unanswered) return;

  state.submitted = true;
  const question = state.session[state.index];
  const selected = [...state.selected].sort().join("");
  const expected = [...question.answer].sort().join("");
  const isCorrect = !unanswered && selected === expected;
  recordResult(isCorrect, question);

  for (const button of $("options").children) {
    button.classList.toggle("selected", state.selected.has(button.dataset.id));
    button.disabled = true;
  }

  $("resultBanner").textContent = isCorrect ? "回答正确" : unanswered ? "已查看答案，本题记为未答对" : "回答错误";
  $("resultBanner").className = `result-banner ${isCorrect ? "good" : "bad"}`;
  $("resultPanel").classList.remove("hidden");
  $("submitBtn").classList.add("hidden");
  $("navigation").classList.remove("hidden");
  $("nextBtn").textContent = state.index === state.session.length - 1 ? "查看本轮成绩" : "下一题";

  const score = Math.round(state.correctThisSession / state.answeredThisSession * 100);
  $("scoreText").textContent = `得分 ${score}%`;
  $("progressBar").style.width = `${(state.index + 1) / state.session.length * 100}%`;
  if (reveal) revealAnswer();
}

function revealAnswer() {
  if (state.answerVisible) return;
  if (!state.submitted) {
    submitAnswer({ reveal: true, unanswered: state.selected.size === 0 });
    return;
  }

  state.answerVisible = true;
  const question = state.session[state.index];
  for (const button of $("options").children) {
    const id = button.dataset.id;
    button.classList.remove("selected");
    if (question.answer.includes(id)) button.classList.add("correct");
    else if (state.selected.has(id)) button.classList.add("incorrect");
  }

  const letterFor = id => String.fromCharCode(65 + question.displayOptions.findIndex(option => option.id === id));
  $("correctAnswer").textContent = question.answer.map(id => `${letterFor(id)}. ${question.options.find(o => o.id === id).text}`).join("；");
  $("explanation").textContent = question.explanation || "原题未提供解析。";
  $("answerPanel").classList.remove("hidden");
  $("showAnswerBtn").classList.add("hidden");
}

function nextQuestion() {
  if (state.index < state.session.length - 1) {
    state.index++;
    renderQuestion();
  } else {
    showSummary();
  }
}

function showSummary() {
  const score = state.answeredThisSession ? Math.round(state.correctThisSession / state.answeredThisSession * 100) : 0;
  $("finalScore").textContent = `${score}%`;
  $("finalDetail").textContent = `答对 ${state.correctThisSession} / ${state.answeredThisSession}，本轮错题 ${state.sessionWrongIds.size}`;
  $("retryWrongBtn").disabled = state.sessionWrongIds.size === 0;
  showView("summaryView");
}

function goHome() {
  showView("setupView");
  renderStats();
}

function wireEvents() {
  $("allQuestions").addEventListener("change", updateRange);
  $("startQuestion").addEventListener("input", updateRange);
  $("endQuestion").addEventListener("input", updateRange);
  $("startBtn").addEventListener("click", startRangeSession);
  $("wrongBtn").addEventListener("click", () => startWrongSession());
  $("submitBtn").addEventListener("click", () => submitAnswer());
  $("showAnswerBtn").addEventListener("click", revealAnswer);
  $("nextBtn").addEventListener("click", nextQuestion);
  $("exitBtn").addEventListener("click", goHome);
  $("homeBtn").addEventListener("click", goHome);
  $("newSessionBtn").addEventListener("click", goHome);
  $("retryWrongBtn").addEventListener("click", () => startWrongSession([...state.sessionWrongIds]));
  $("resetStatsBtn").addEventListener("click", () => {
    if (!confirm("确定清除当前浏览器中的全部学习记录吗？")) return;
    state.stats = { attempts: 0, correct: 0, answeredIds: [], wrongIds: [] };
    saveStats();
  });
  $("installBtn").addEventListener("click", async () => {
    if (!state.installPrompt) return;
    state.installPrompt.prompt();
    await state.installPrompt.userChoice;
    state.installPrompt = null;
    $("installBtn").classList.add("hidden");
  });
}

async function init() {
  wireEvents();
  try {
    const response = await fetch("questions.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.data = await response.json();
    $("endQuestion").max = state.data.questionCount;
    $("endQuestion").value = state.data.questionCount;
    $("startQuestion").max = state.data.questionCount;
    updateRange();
    renderStats();
  } catch (error) {
    $("setupMessage").textContent = "题库加载失败，请刷新页面或检查网络。";
    $("startBtn").disabled = true;
    console.error(error);
  }

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
}

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  state.installPrompt = event;
  $("installBtn").classList.remove("hidden");
});

init();
