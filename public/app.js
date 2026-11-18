const maxFileSize = 40 * 1024 * 1024;

const elements = {
  apiStatus: document.querySelector('#api-status'),
  uploadView: document.querySelector('#upload-view'),
  loadingView: document.querySelector('#loading-view'),
  quizView: document.querySelector('#quiz-view'),
  resultsView: document.querySelector('#results-view'),
  form: document.querySelector('#upload-form'),
  input: document.querySelector('#pdf-input'),
  dropZone: document.querySelector('#drop-zone'),
  selectedFile: document.querySelector('#selected-file'),
  fileName: document.querySelector('#file-name'),
  fileSize: document.querySelector('#file-size'),
  removeFile: document.querySelector('#remove-file'),
  formError: document.querySelector('#form-error'),
  generateButton: document.querySelector('#generate-button'),
  loadingFile: document.querySelector('#loading-file'),
  quizTitle: document.querySelector('#quiz-title'),
  questionCounter: document.querySelector('#question-counter'),
  scoreCounter: document.querySelector('#score-counter'),
  progressBar: document.querySelector('#progress-bar'),
  questionNumber: document.querySelector('#question-number'),
  questionText: document.querySelector('#question-text'),
  optionsList: document.querySelector('#options-list'),
  feedback: document.querySelector('#feedback'),
  feedbackTitle: document.querySelector('#feedback-title'),
  feedbackExplanation: document.querySelector('#feedback-explanation'),
  feedbackSource: document.querySelector('#feedback-source'),
  nextButton: document.querySelector('#next-button'),
  newPdfButton: document.querySelector('#new-pdf-button'),
  finalScore: document.querySelector('#final-score'),
  resultsTitle: document.querySelector('#results-title'),
  resultsMessage: document.querySelector('#results-message'),
  retryButton: document.querySelector('#retry-button'),
  resultsNewPdfButton: document.querySelector('#results-new-pdf-button'),
  historyEmpty: document.querySelector('#history-empty'),
  historyList: document.querySelector('#history-list'),
  clearHistoryButton: document.querySelector('#clear-history-button'),
};

const sessionHistoryKey = 'testes:test-sessions:v1';
const maxStoredSessions = 20;
let selectedPdf = null;
let quiz = null;
let currentQuestionIndex = 0;
let score = 0;
let answered = false;
let answers = [];
let currentSessionId = null;
let currentPdfName = '';

function getHistoryKey(file) {
  const identity = `${file.name}|${file.size}|${file.lastModified}`;
  return `testes:question-history:${identity}`;
}

function getQuestionHistory(file) {
  try {
    const stored = JSON.parse(localStorage.getItem(getHistoryKey(file)) ?? '[]');
    return Array.isArray(stored)
      ? stored.filter((question) => typeof question === 'string').slice(-80)
      : [];
  } catch {
    return [];
  }
}

function rememberQuestions(file, questions) {
  const previousQuestions = getQuestionHistory(file);
  const newQuestions = questions
    .map((item) => item?.question)
    .filter((question) => typeof question === 'string');

  try {
    localStorage.setItem(
      getHistoryKey(file),
      JSON.stringify([...previousQuestions, ...newQuestions].slice(-80)),
    );
  } catch {
    // El test funciona aunque el navegador no permita almacenamiento local.
  }
}

function readTestSessions() {
  try {
    const sessions = JSON.parse(localStorage.getItem(sessionHistoryKey) ?? '[]');
    return Array.isArray(sessions)
      ? sessions.filter((session) => session?.id && Array.isArray(session?.quiz?.questions))
      : [];
  } catch {
    return [];
  }
}

function writeTestSessions(sessions) {
  try {
    localStorage.setItem(sessionHistoryKey, JSON.stringify(sessions.slice(0, maxStoredSessions)));
  } catch {
    // El test sigue funcionando aunque el almacenamiento local no esté disponible.
  }
}

function createSessionId() {
  return globalThis.crypto?.randomUUID?.()
    ?? `test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function calculateScore() {
  if (!quiz) return 0;
  return answers.reduce((total, selectedIndex, index) => (
    selectedIndex === quiz.questions[index]?.correctIndex ? total + 1 : total
  ), 0);
}

function saveCurrentSession({ completed = false } = {}) {
  if (!quiz || !currentSessionId) return;

  const sessions = readTestSessions();
  const previousSession = sessions.find((session) => session.id === currentSessionId);
  const now = new Date().toISOString();
  const session = {
    id: currentSessionId,
    title: quiz.title,
    pdfName: currentPdfName || 'PDF sin nombre',
    quiz,
    answers,
    currentQuestionIndex,
    score: calculateScore(),
    createdAt: previousSession?.createdAt ?? now,
    updatedAt: now,
    completedAt: completed ? (previousSession?.completedAt ?? now) : (previousSession?.completedAt ?? null),
  };

  writeTestSessions([session, ...sessions.filter((item) => item.id !== currentSessionId)]);
  renderHistory();
}

function formatSessionDate(value) {
  const date = new Date(value);
  const now = new Date();
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayDifference = Math.round((startOfToday - startOfDate) / 86_400_000);
  const time = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(date);

  if (dayDifference === 0) return `Hoy, ${time}`;
  if (dayDifference === 1) return `Ayer, ${time}`;
  return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' }).format(date);
}

function renderHistory() {
  const sessions = readTestSessions();
  elements.historyList.replaceChildren();
  elements.historyEmpty.hidden = sessions.length > 0;
  elements.clearHistoryButton.hidden = sessions.length === 0;

  sessions.forEach((session) => {
    const completed = Boolean(session.completedAt);
    const totalQuestions = session.quiz.questions.length;
    const item = document.createElement('article');
    item.className = 'history-item';

    const info = document.createElement('div');
    info.className = 'history-info';
    const title = document.createElement('strong');
    title.textContent = session.title || session.pdfName;
    const meta = document.createElement('div');
    meta.className = 'history-meta';

    const status = document.createElement('span');
    status.className = `history-status${completed ? ' completed' : ''}`;
    status.textContent = completed
      ? `Completado · ${session.score ?? 0}/${totalQuestions}`
      : `En curso · pregunta ${Math.min((session.currentQuestionIndex ?? 0) + 1, totalQuestions)}/${totalQuestions}`;

    const file = document.createElement('span');
    file.textContent = session.pdfName;
    const date = document.createElement('time');
    date.dateTime = session.updatedAt;
    date.textContent = formatSessionDate(session.updatedAt);
    meta.append(status, file, date);
    info.append(title, meta);

    const actions = document.createElement('div');
    actions.className = 'history-actions';
    const openButton = document.createElement('button');
    openButton.type = 'button';
    openButton.className = 'history-action';
    openButton.textContent = completed ? 'Repetir' : 'Continuar';
    openButton.addEventListener('click', () => {
      if (completed) startNewSession(session.quiz, session.pdfName);
      else resumeSession(session);
    });

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'history-delete';
    deleteButton.setAttribute('aria-label', `Eliminar del historial: ${session.title || session.pdfName}`);
    deleteButton.textContent = '×';
    deleteButton.addEventListener('click', () => {
      writeTestSessions(readTestSessions().filter((item) => item.id !== session.id));
      renderHistory();
    });

    actions.append(openButton, deleteButton);
    item.append(info, actions);
    elements.historyList.append(item);
  });
}

function resumeSession(session) {
  quiz = session.quiz;
  answers = Array.isArray(session.answers) ? [...session.answers] : [];
  currentQuestionIndex = Math.min(
    Math.max(Number(session.currentQuestionIndex) || 0, 0),
    quiz.questions.length - 1,
  );
  currentSessionId = session.id;
  currentPdfName = session.pdfName;
  score = calculateScore();
  elements.quizTitle.textContent = quiz.title;
  showView(elements.quizView);
  renderQuestion();
}

function startNewSession(targetQuiz, pdfName) {
  quiz = targetQuiz;
  currentPdfName = pdfName || 'PDF sin nombre';
  currentSessionId = createSessionId();
  resetQuiz();
  answers = Array(quiz.questions.length).fill(null);
  elements.quizTitle.textContent = quiz.title;
  saveCurrentSession();
  showView(elements.quizView);
  renderQuestion();
}

function showView(view) {
  [elements.uploadView, elements.loadingView, elements.quizView, elements.resultsView]
    .forEach((item) => { item.hidden = item !== view; });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showError(message) {
  elements.formError.textContent = message;
  elements.formError.hidden = false;
}

function clearError() {
  elements.formError.textContent = '';
  elements.formError.hidden = true;
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function selectFile(file) {
  clearError();

  if (!file) {
    selectedPdf = null;
    elements.input.value = '';
    elements.selectedFile.hidden = true;
    elements.generateButton.disabled = true;
    return;
  }

  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    selectFile(null);
    showError('Selecciona un archivo con formato PDF.');
    return;
  }

  if (file.size > maxFileSize) {
    selectFile(null);
    showError('El PDF supera el límite de 40 MB.');
    return;
  }

  selectedPdf = file;
  elements.fileName.textContent = file.name;
  elements.fileSize.textContent = formatBytes(file.size);
  elements.selectedFile.hidden = false;
  elements.generateButton.disabled = false;
}

async function checkApi() {
  try {
    const response = await fetch('/api/health', { cache: 'no-store' });
    const status = await response.json();
    elements.apiStatus.textContent = status.configured
      ? `IA preparada · ${status.provider ?? 'Gemini'} · ${status.model}`
      : 'Falta configurar la clave de Gemini';
    elements.apiStatus.className = `api-status ${status.configured ? 'ready' : 'warning'}`;
  } catch {
    elements.apiStatus.textContent = 'Servidor no disponible';
    elements.apiStatus.className = 'api-status warning';
  }
}

function resetQuiz() {
  currentQuestionIndex = 0;
  score = 0;
  answered = false;
  answers = [];
  elements.scoreCounter.textContent = '0 aciertos';
}

function renderQuestion() {
  const question = quiz.questions[currentQuestionIndex];
  const questionNumber = currentQuestionIndex + 1;
  const selectedIndex = answers[currentQuestionIndex];
  answered = Number.isInteger(selectedIndex);
  score = calculateScore();

  elements.questionCounter.textContent = `Pregunta ${questionNumber} de ${quiz.questions.length}`;
  elements.scoreCounter.textContent = `${score} ${score === 1 ? 'acierto' : 'aciertos'}`;
  elements.questionNumber.textContent = `Pregunta ${String(questionNumber).padStart(2, '0')}`;
  elements.questionText.textContent = question.question;
  elements.progressBar.style.width = `${(questionNumber / quiz.questions.length) * 100}%`;
  elements.feedback.hidden = true;
  elements.nextButton.hidden = true;
  elements.nextButton.querySelector('span').textContent = questionNumber === quiz.questions.length
    ? 'Ver resultado'
    : 'Siguiente pregunta';
  elements.optionsList.replaceChildren();

  question.options.forEach((option, index) => {
    const button = document.createElement('button');
    button.className = 'option-button';
    button.type = 'button';
    button.dataset.index = String(index);
    button.innerHTML = `<span class="option-letter" aria-hidden="true">${String.fromCharCode(65 + index)}</span><span></span>`;
    button.lastElementChild.textContent = option;
    button.addEventListener('click', () => answerQuestion(index));
    elements.optionsList.append(button);
  });

  if (answered) showAnswerFeedback(selectedIndex, false);
  else elements.questionText.focus();
}

function showAnswerFeedback(selectedIndex, moveFocus = true) {
  const question = quiz.questions[currentQuestionIndex];
  const isCorrect = selectedIndex === question.correctIndex;

  [...elements.optionsList.children].forEach((button, index) => {
    button.disabled = true;
    if (index === question.correctIndex) button.classList.add('correct');
    if (index === selectedIndex && !isCorrect) button.classList.add('incorrect');
  });

  elements.scoreCounter.textContent = `${score} ${score === 1 ? 'acierto' : 'aciertos'}`;
  elements.feedbackTitle.textContent = isCorrect ? '¡Respuesta correcta!' : 'Respuesta incorrecta';
  elements.feedbackExplanation.textContent = question.explanation;
  elements.feedbackSource.textContent = `Fuente: ${question.sourceReference}`;
  elements.feedback.hidden = false;
  elements.nextButton.hidden = false;
  if (moveFocus) elements.nextButton.focus();
}

function answerQuestion(selectedIndex) {
  if (answered) return;
  answered = true;
  answers[currentQuestionIndex] = selectedIndex;
  score = calculateScore();
  saveCurrentSession();
  showAnswerFeedback(selectedIndex);
}

function showResults() {
  score = calculateScore();
  saveCurrentSession({ completed: true });
  const percentage = Math.round((score / quiz.questions.length) * 100);
  elements.finalScore.textContent = String(score);

  if (percentage >= 85) {
    elements.resultsTitle.textContent = '¡Dominio excelente!';
    elements.resultsMessage.textContent = `Has acertado el ${percentage} %. El tema está muy bien asentado.`;
  } else if (percentage >= 60) {
    elements.resultsTitle.textContent = 'Vas por buen camino';
    elements.resultsMessage.textContent = `Has acertado el ${percentage} %. Repasa las explicaciones y vuelve a intentarlo.`;
  } else {
    elements.resultsTitle.textContent = 'Toca reforzar el tema';
    elements.resultsMessage.textContent = `Has acertado el ${percentage} %. Un repaso del PDF antes de repetir te ayudará mucho.`;
  }

  showView(elements.resultsView);
  elements.resultsTitle.focus?.();
}

function returnToUpload() {
  selectFile(null);
  quiz = null;
  resetQuiz();
  currentSessionId = null;
  currentPdfName = '';
  clearError();
  renderHistory();
  showView(elements.uploadView);
  elements.input.focus();
}

elements.input.addEventListener('change', () => selectFile(elements.input.files?.[0]));
elements.removeFile.addEventListener('click', () => selectFile(null));

['dragenter', 'dragover'].forEach((eventName) => {
  elements.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropZone.classList.add('dragging');
  });
});

['dragleave', 'drop'].forEach((eventName) => {
  elements.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropZone.classList.remove('dragging');
  });
});

elements.dropZone.addEventListener('drop', (event) => selectFile(event.dataTransfer?.files?.[0]));

elements.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError();
  if (!selectedPdf) {
    showError('Selecciona un PDF antes de crear el test.');
    return;
  }

  elements.loadingFile.textContent = selectedPdf.name;
  elements.generateButton.disabled = true;
  showView(elements.loadingView);

  try {
    const formData = new FormData();
    formData.append('pdf', selectedPdf);
    formData.append('previousQuestions', JSON.stringify(getQuestionHistory(selectedPdf)));
    const response = await fetch('/api/generate-test', { method: 'POST', body: formData });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) throw new Error(data.error || 'No se ha podido generar el test.');
    if (!Array.isArray(data.questions) || data.questions.length !== 20) {
      throw new Error('La IA no ha devuelto las 20 preguntas esperadas. Inténtalo de nuevo.');
    }

    rememberQuestions(selectedPdf, data.questions);
    startNewSession(data, selectedPdf.name);
  } catch (error) {
    showView(elements.uploadView);
    showError(error instanceof Error ? error.message : 'Ha ocurrido un error inesperado.');
  } finally {
    elements.generateButton.disabled = !selectedPdf;
  }
});

elements.nextButton.addEventListener('click', () => {
  if (!answered) return;
  if (currentQuestionIndex === quiz.questions.length - 1) {
    showResults();
    return;
  }
  currentQuestionIndex += 1;
  saveCurrentSession();
  renderQuestion();
});

elements.retryButton.addEventListener('click', () => startNewSession(quiz, currentPdfName));
elements.newPdfButton.addEventListener('click', returnToUpload);
elements.resultsNewPdfButton.addEventListener('click', returnToUpload);

elements.clearHistoryButton.addEventListener('click', () => {
  if (!window.confirm('¿Quieres borrar todo el historial de tests? Esta acción no se puede deshacer.')) return;
  writeTestSessions([]);
  renderHistory();
});

checkApi();
renderHistory();
