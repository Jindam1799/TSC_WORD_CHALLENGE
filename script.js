const QUESTION_COUNT = 20;
const TIME_LIMIT = 10;

// --- 상태 변수 ---
let currentTheme = null;
let currentQuestions = [];
let currentIndex = 0;
let wrongCount = 0;
let timerInterval = null;
let selectedThemeId = null;

// [변경] TSC 전용 저장 키 (HSK와 기록 분리)
const STORAGE_KEY = 'jindam_cleared_tsc';

// --- DOM 요소 ---
const themeList = document.getElementById('theme-list');
const timerFill = document.getElementById('timer-fill');
const flashCard = document.querySelector('.flash-card');
const exitModal = document.getElementById('exit-modal');
const modalCancelBtn = document.getElementById('modal-cancel-btn');
const modalConfirmBtn = document.getElementById('modal-confirm-btn');
const startGuideModal = document.getElementById('start-guide-modal');
const guideStartBtn = document.getElementById('guide-start-btn');
const guideCloseBtn = document.getElementById('guide-close-btn');

// --- 오디오 객체 생성 추가 ---
const timerAudio = new Audio('assets/timer.mp3');
timerAudio.loop = false;
const correctAudio = new Audio('assets/correct.mp3');
const wrongAudio = new Audio('assets/wrong.mp3');
const clearAudio = new Audio('assets/clear.mp3');

// --- 모바일 실제 가시 영역(vh) 계산 ---
function setScreenSize() {
  let vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);
}

setScreenSize();
window.addEventListener('resize', setScreenSize);

// --- 초기화 ---
init();

function init() {
  renderLobby();

  const openingScreen = document.getElementById('opening-screen');
  const securityModal = document.getElementById('security-modal');
  const securityConfirmBtn = document.getElementById('security-confirm-btn');

  if (openingScreen) {
    openingScreen.onclick = () => {
      const video = document.getElementById('opening-video');
      if (video) video.pause();
      securityModal.style.display = 'flex';
    };
  }

  if (securityConfirmBtn) {
    securityConfirmBtn.onclick = () => {
      securityModal.style.display = 'none';
      showScreen('lobby-screen');
    };
  }

  if (flashCard) {
    flashCard.onclick = () => {
      document.getElementById('q-pinyin').classList.add('visible');
    };
  }

  guideStartBtn.onclick = () => {
    startGuideModal.style.display = 'none';
    startGame(selectedThemeId);
  };

  guideCloseBtn.onclick = () => {
    startGuideModal.style.display = 'none';
  };

  document.getElementById('close-game').onclick = () => {
    resetTimer();
    exitModal.style.display = 'flex';
  };

  modalCancelBtn.onclick = () => {
    exitModal.style.display = 'none';
    startTimer();
  };

  modalConfirmBtn.onclick = () => {
    exitModal.style.display = 'none';
    showScreen('lobby-screen');
  };
}

function renderLobby() {
  themeList.innerHTML = '';
  // [변경] TSC 저장된 기록 불러오기
  const clearedData = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  const total = themesData.length;
  const cleared = clearedData.length;

  const totalClearedEl = document.getElementById('total-cleared');
  const totalProgressEl = document.getElementById('total-progress');

  if (totalClearedEl) totalClearedEl.innerText = `${cleared}/${total}`;
  if (totalProgressEl)
    totalProgressEl.style.width = `${(cleared / total) * 100}%`;

  themesData.forEach((theme) => {
    const isCleared = clearedData.includes(theme.id);
    const card = document.createElement('div');
    card.className = `theme-card ${isCleared ? 'cleared' : ''}`;
    card.onclick = () => {
      selectedThemeId = theme.id;
      startGuideModal.style.display = 'flex';
    };
    card.innerHTML = `
      ${isCleared ? '<div class="stamp">👑</div>' : ''}
      <div class="theme-icon">${theme.icon}</div>
      <div class="theme-title">${theme.title}</div>
    `;
    themeList.appendChild(card);
  });
}

// 잔상 해결을 위해 개선된 화면 전환 함수
function showScreen(screenId) {
  const screens = document.querySelectorAll('.screen');
  const targetScreen = document.getElementById(screenId);

  // 1. 타겟 화면을 먼저 위로 올리고 활성화
  targetScreen.classList.add('active');

  // 2. 다른 모든 화면에서 active 제거 (약간의 딜레이로 빈틈 방지)
  screens.forEach((s) => {
    if (s.id !== screenId) {
      s.classList.remove('active');
    }
  });

  // 3. 페이지 전환 시 스크롤 위치 초기화
  targetScreen.scrollTop = 0;
}

function startGame(themeId) {
  currentTheme = themesData.find((t) => t.id === themeId);
  if (!currentTheme) return;

  // 데이터가 20개 미만일 경우 에러 방지
  const safeCount = Math.min(currentTheme.words.length, QUESTION_COUNT);

  currentQuestions = [...currentTheme.words]
    .sort(() => Math.random() - 0.5)
    .slice(0, safeCount);

  currentIndex = 0;
  wrongCount = 0;
  document.getElementById('current-stage-name').innerText = currentTheme.title;
  showScreen('game-screen');
  renderQuestion();
}

function renderQuestion() {
  resetTimer();
  if (currentIndex >= currentQuestions.length) {
    endGame(true);
    return;
  }

  const q = currentQuestions[currentIndex];
  document.getElementById('q-chinese').innerText = q.ch;
  const pinyinEl = document.getElementById('q-pinyin');
  pinyinEl.innerText = q.py;
  pinyinEl.classList.remove('visible');

  document.getElementById('score-display').innerText =
    `${currentIndex + 1}/${currentQuestions.length}`;
  document.getElementById('progress-fill').style.width =
    `${(currentIndex / currentQuestions.length) * 100}%`;

  let wrongAnswer;
  let attempts = 0;

  // [수정됨] 중복 검사 로직 강화
  do {
    const randomIdx = Math.floor(Math.random() * currentTheme.words.length);
    wrongAnswer = currentTheme.words[randomIdx].mean;
    attempts++;

    // 1. 정답과 오답을 쉼표(,) 기준으로 쪼개서 핵심 단어 배열로 만듭니다.
    // 예: "약간, 조금" -> ["약간", "조금"]
    const answerKeywords = q.mean.split(',').map((s) => s.trim());

    // 2. 겹치는 단어가 하나라도 있는지 확인합니다.
    // "조금, 약간"이라는 오답 안에 "약간"이나 "조금"이 들어있으면 true가 됩니다.
    const isOverlapping = answerKeywords.some((keyword) =>
      wrongAnswer.includes(keyword),
    );

    // 겹치거나 완전히 같으면 다시 뽑습니다 (isOverlapping이 true면 반복)
    if (isOverlapping || wrongAnswer === q.mean) {
      wrongAnswer = null; // 조건 불만족 시 초기화하여 루프 유지
    }
  } while (
    !wrongAnswer && // wrongAnswer가 구해지지 않았으면 계속 반복
    attempts < 30 &&
    currentTheme.words.length > 1
  );

  // 만약 30번 시도해도 적절한 오답을 못 찾으면(단어가 너무 비슷하면), 그냥 아무거나 씁니다.
  if (!wrongAnswer) {
    const randomIdx = Math.floor(Math.random() * currentTheme.words.length);
    wrongAnswer = currentTheme.words[randomIdx].mean;
  }

  const btn1 = document.getElementById('btn-1');
  const btn2 = document.getElementById('btn-2');
  const newBtn1 = btn1.cloneNode(true);
  const newBtn2 = btn2.cloneNode(true);

  newBtn1.className = 'option-btn';
  newBtn2.className = 'option-btn';

  btn1.parentNode.replaceChild(newBtn1, btn1);
  btn2.parentNode.replaceChild(newBtn2, btn2);

  const isAnswerLeft = Math.random() < 0.5;
  if (isAnswerLeft) {
    newBtn1.innerText = q.mean;
    newBtn2.innerText = wrongAnswer;
    newBtn1.onclick = () => handleAnswer(true, newBtn1);
    newBtn2.onclick = () => handleAnswer(false, newBtn2);
  } else {
    newBtn1.innerText = wrongAnswer;
    newBtn2.innerText = q.mean;
    newBtn1.onclick = () => handleAnswer(false, newBtn1);
    newBtn2.onclick = () => handleAnswer(true, newBtn2);
  }
  startTimer();
}
function startTimer() {
  timerFill.style.transition = 'none';
  timerFill.style.width = '100%';

  // 타이머 오디오 재생
  timerAudio.currentTime = 0;
  timerAudio.play().catch((e) => console.warn('오디오 재생 차단됨:', e));

  setTimeout(() => {
    timerFill.style.transition = `width ${TIME_LIMIT}s linear`;
    timerFill.style.width = '0%';
  }, 50);
  timerInterval = setTimeout(
    () => endGame(false, '시간 초과! ⏱️'),
    TIME_LIMIT * 1000,
  );
}

function resetTimer() {
  clearTimeout(timerInterval);

  // 타이머 오디오 정지
  timerAudio.pause();
  timerAudio.currentTime = 0;

  timerFill.style.transition = 'none';
  timerFill.style.width = '100%';
}

function handleAnswer(isCorrect, btnElement) {
  resetTimer();

  // 1. 중복 클릭 방지를 위해 잠시 모든 버튼 클릭 막기
  const allBtns = document.querySelectorAll('.option-btn');
  allBtns.forEach((btn) => (btn.style.pointerEvents = 'none'));

  // 2. 선택 직후 병음 자동 노출 (학습 효과)
  document.getElementById('q-pinyin').classList.add('visible');

  if (isCorrect) {
    // 정답 사운드 재생
    correctAudio.currentTime = 0;
    correctAudio.play().catch((e) => console.warn('오디오 재생 차단됨:', e));

    // 정답 시각적 피드백
    btnElement.classList.add('correct-anim');

    setTimeout(() => {
      currentIndex++;
      allBtns.forEach((btn) => (btn.style.pointerEvents = 'auto'));
      renderQuestion();
    }, 800);
  } else {
    // 오답 사운드 재생
    wrongAudio.currentTime = 0;
    wrongAudio.play().catch((e) => console.warn('오디오 재생 차단됨:', e));

    // 오답 시각적 피드백
    btnElement.classList.add('wrong-anim');

    setTimeout(() => {
      allBtns.forEach((btn) => (btn.style.pointerEvents = 'auto'));
      endGame(false);
    }, 800);
  }
}

function endGame(isSuccess, reason = '') {
  resetTimer();
  showScreen('result-screen');
  const icon = document.getElementById('res-icon');
  const title = document.getElementById('res-title');
  const msg = document.getElementById('res-msg');

  if (isSuccess) {
    // 올클리어 사운드 재생
    clearAudio.currentTime = 0;
    clearAudio.play().catch((e) => console.warn('오디오 재생 차단됨:', e));

    icon.innerText = '👑';
    title.innerText = '테마 정복 완료!';
    title.style.color = 'var(--primary)';
    msg.innerText = `${currentQuestions.length}문제를 모두 맞추셨어요!`;

    // TSC 정복 기록 저장
    const clearedData = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!clearedData.includes(currentTheme.id)) {
      clearedData.push(currentTheme.id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(clearedData));
    }
  } else {
    icon.innerText = '😢';
    title.innerText = reason ? reason : '아쉽게 실패...';
    title.style.color = 'var(--error)';
    msg.innerText = reason
      ? '10초 안에 답해야 해요!'
      : `${currentIndex + 1}번째 문제에서 틀렸어요.`;
  }

  document.getElementById('next-btn').onclick = () => {
    renderLobby();
    showScreen('lobby-screen');
  };
  document.getElementById('retry-btn').onclick = () =>
    startGame(currentTheme.id);
}
