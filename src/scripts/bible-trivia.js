document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('bible-trivia-app');
  if (!container) return;

  const rawData = container.getAttribute('data-questions');
  let questionBank = [];
  try {
    questionBank = JSON.parse(rawData);
  } catch (e) {
    console.error('Failed to parse questions', e);
    return;
  }

  // --- DOM Elements ---
  const screenMode = document.getElementById('screen-mode');
  const screenGame = document.getElementById('screen-game');
  const screenResult = document.getElementById('screen-result');

  // Game UI
  const questionText = document.getElementById('question-text');
  const answersGrid = document.getElementById('answers-grid');
  const timeBar = document.getElementById('time-bar');
  const timerText = document.getElementById('timer-text');
  const scoreDisplay = document.getElementById('score-display');
  const streakDisplay = document.getElementById('streak-display');
  const streakContainer = document.getElementById('streak-container');
  const progressText = document.getElementById('progress-text');
  const floatingPoints = document.getElementById('floating-points');
  
  // Feedback UI
  const feedbackArea = document.getElementById('feedback-area');
  const feedbackIcon = document.getElementById('feedback-icon');
  const feedbackTitle = document.getElementById('feedback-title');
  const feedbackEarned = document.getElementById('feedback-earned');
  const feedbackStreak = document.getElementById('feedback-streak');
  const correctionLabel = document.getElementById('correction-label');
  const feedbackAnswer = document.getElementById('feedback-answer');
  const feedbackExplanation = document.getElementById('feedback-explanation');
  const feedbackReference = document.getElementById('feedback-reference');

  // Results UI
  const finalScore = document.getElementById('final-score');
  const statCorrect = document.getElementById('stat-correct');
  const statAccuracy = document.getElementById('stat-accuracy');
  const statStreak = document.getElementById('stat-streak');
  const highscoreBanner = document.getElementById('highscore-banner');
  const beatScoreMsg = document.getElementById('beat-score-msg');
  
  const playAgainBtn = document.getElementById('play-again-btn');
  const homeBtn = document.getElementById('home-btn');

  // --- Game State ---
  let currentMode = null;
  let pool = [];
  let currentIndex = 0;
  let score = 0;
  let streak = 0;
  let maxStreak = 0;
  let correctCount = 0;
  let incorrectCount = 0;
  let currentTimer = null;
  let transitionTimeout = null;
  let timeRemaining = 0;
  let timeTotal = 20;

  // Configuration mapping
  const modeConfig = {
    'quick': { time: 20, count: 10, filter: () => true },
    'scripture': { time: 30, count: 10, filter: (q) => ['Scripture Memory', 'Finish the Verse'].includes(q.category) },
    'characters': { time: 20, count: 10, filter: (q) => ['Bible Characters', 'Who Am I?'].includes(q.category) },
    'books': { time: 20, count: 10, filter: (q) => q.category === 'Bible Books' }
  };

  // --- Storage Functions ---
  const getSeen = (mode) => JSON.parse(localStorage.getItem(`dr-bible-seen-${mode}`) || '[]');
  const addSeen = (mode, id) => {
    let seen = getSeen(mode);
    seen.push(id);
    localStorage.setItem(`dr-bible-seen-${mode}`, JSON.stringify(seen));
  };
  const resetSeen = (mode) => localStorage.removeItem(`dr-bible-seen-${mode}`);
  const getHighScore = () => parseInt(localStorage.getItem('dr-bible-highscore') || '0', 10);
  const setHighScore = (s) => localStorage.setItem('dr-bible-highscore', Math.max(s, getHighScore()));

  // --- Core Functions ---
  function init() {
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const mode = e.currentTarget.getAttribute('data-mode');
        startGame(mode);
      });
    });
    playAgainBtn.addEventListener('click', () => startGame(currentMode));
    homeBtn.addEventListener('click', () => showScreen(screenMode));
    
    // Display initial high score if exists
    updateGlobalHighscore();
  }
  
  function updateGlobalHighscore() {
    const hs = getHighScore();
    const el = document.getElementById('global-highscore');
    if(hs > 0) {
       el.textContent = `HIGH SCORE: ${hs}`;
       el.style.display = 'block';
    } else {
       el.style.display = 'none';
    }
  }

  function showScreen(screen) {
    [screenMode, screenGame, screenResult].forEach(s => {
      s.style.display = 'none';
      s.classList.remove('animate-fade-in');
    });
    screen.style.display = 'block';
    // Trigger reflow
    void screen.offsetWidth;
    screen.classList.add('animate-fade-in');
    
    if(screen === screenMode) updateGlobalHighscore();
  }

  function startGame(mode) {
    currentMode = mode;
    score = 0;
    streak = 0;
    maxStreak = 0;
    correctCount = 0;
    incorrectCount = 0;
    currentIndex = 0;
    clearTimeout(transitionTimeout);
    
    const config = modeConfig[mode];
    timeTotal = config.time;
    
    // Build pool
    let available = questionBank.filter(config.filter);
    
    // Filter out seen
    const seenIds = getSeen(mode);
    let unseen = available.filter(q => !seenIds.includes(q.id));
    
    // If we've seen more than 80%, reset
    if (unseen.length < config.count) {
      resetSeen(mode);
      unseen = available; // start fresh
    }

    // Shuffle and pick
    unseen.sort(() => Math.random() - 0.5);
    pool = unseen.slice(0, config.count);

    showScreen(screenGame);
    loadQuestion();
  }

  function loadQuestion() {
    feedbackArea.style.display = 'none';
    answersGrid.style.pointerEvents = 'auto'; // re-enable clicks
    
    const q = pool[currentIndex];
    progressText.textContent = `QUESTION ${currentIndex + 1} / ${pool.length}`;
    scoreDisplay.textContent = score;
    streakDisplay.textContent = streak;
    
    questionText.textContent = q.question;
    
    // Prep answers
    let answers = [...q.incorrectAnswers.map(a => ({ text: a, correct: false })), { text: q.correctAnswer, correct: true }];
    answers.sort(() => Math.random() - 0.5);
    
    answersGrid.innerHTML = '';
    answers.forEach(a => {
      const btn = document.createElement('button');
      btn.className = 'answer-btn';
      btn.textContent = a.text;
      btn.addEventListener('click', () => submitAnswer(a.correct, btn, q));
      answersGrid.appendChild(btn);
    });

    startTimer();
  }

  function startTimer() {
    clearInterval(currentTimer);
    timeRemaining = timeTotal;
    updateTimeBar();
    
    currentTimer = setInterval(() => {
      timeRemaining -= 0.1;
      updateTimeBar();
      if (timeRemaining <= 0) {
        clearInterval(currentTimer);
        timeRemaining = 0;
        updateTimeBar();
        handleTimeout();
      }
    }, 100);
  }

  function updateTimeBar() {
    const pct = Math.max(0, (timeRemaining / timeTotal) * 100);
    timeBar.style.width = `${pct}%`;
    timerText.textContent = Math.ceil(timeRemaining);
    
    if (pct < 25) {
      timeBar.style.backgroundColor = '#E53E3E'; // red
      timerText.style.color = '#E53E3E';
    } else if (pct < 50) {
      timeBar.style.backgroundColor = 'var(--color-accent-secondary)'; // amber
      timerText.style.color = 'var(--color-text-primary)';
    } else {
      timeBar.style.backgroundColor = 'var(--color-accent-primary)'; // green
      timerText.style.color = 'var(--color-text-primary)';
    }
  }

  function handleTimeout() {
    submitAnswer(false, null, pool[currentIndex], true);
  }
  
  function showFloatingPoints(pts) {
    floatingPoints.textContent = `+${pts}`;
    floatingPoints.classList.remove('animate-float-points');
    void floatingPoints.offsetWidth; // reflow
    floatingPoints.classList.add('animate-float-points');
  }
  
  function animateStreakBump() {
    streakContainer.classList.remove('streak-bump');
    void streakContainer.offsetWidth;
    streakContainer.classList.add('streak-bump');
  }

  function submitAnswer(isCorrect, selectedBtn, questionData, isTimeout = false) {
    clearInterval(currentTimer);
    answersGrid.style.pointerEvents = 'none'; // disable further clicks
    
    // Add to seen
    addSeen(currentMode, questionData.id);

    // Update visuals on buttons
    const allBtns = answersGrid.querySelectorAll('.answer-btn');
    allBtns.forEach(btn => {
      if (btn.textContent === questionData.correctAnswer) {
        btn.classList.add('correct');
      } else if (btn === selectedBtn) {
        btn.classList.add('incorrect');
      } else {
        btn.classList.add('disabled');
      }
    });

    let earnedPoints = 0;

    // Scoring & Feedback
    if (isCorrect) {
      correctCount++;
      const timeBonus = Math.floor((timeRemaining / timeTotal) * 50);
      const streakBonus = streak * 10;
      earnedPoints = 100 + timeBonus + streakBonus;
      score += earnedPoints;
      streak++;
      if (streak > maxStreak) maxStreak = streak;
      
      showFloatingPoints(earnedPoints);
      if(streak > 1) animateStreakBump();
      
      feedbackIcon.innerHTML = '🎉';
      feedbackTitle.textContent = 'CORRECT!';
      feedbackTitle.className = 'feedback-title correct-text';
      
      feedbackEarned.textContent = `+${earnedPoints} POINTS`;
      feedbackStreak.textContent = streak > 1 ? `🔥 ${streak} IN A ROW!` : '';
      
      correctionLabel.textContent = '';
      feedbackAnswer.textContent = '';
      
      feedbackArea.className = 'feedback-area interactive-card is-correct';
    } else {
      incorrectCount++;
      streak = 0;
      
      feedbackIcon.innerHTML = isTimeout ? '⏰' : '❌';
      feedbackTitle.textContent = isTimeout ? "TIME'S UP!" : 'NOT QUITE!';
      feedbackTitle.className = 'feedback-title incorrect-text';
      
      feedbackEarned.textContent = '';
      feedbackStreak.textContent = '';
      
      correctionLabel.textContent = 'The correct answer was:';
      feedbackAnswer.textContent = questionData.correctAnswer;
      
      feedbackArea.className = 'feedback-area interactive-card is-incorrect';
    }
    
    scoreDisplay.textContent = score;
    streakDisplay.textContent = streak;

    // Show feedback
    feedbackExplanation.textContent = questionData.explanation;
    feedbackReference.textContent = questionData.reference;
    feedbackArea.style.display = 'block';
    
    clearTimeout(transitionTimeout);
    transitionTimeout = setTimeout(() => {
      handleNext();
    }, 2000);
  }

  function handleNext() {
    currentIndex++;
    if (currentIndex >= pool.length) {
      showResults();
    } else {
      loadQuestion();
    }
  }

  function showResults() {
    const prevHS = getHighScore();
    const isNewHS = score > prevHS && score > 0;
    
    setHighScore(score);
    
    finalScore.textContent = score;
    statCorrect.textContent = correctCount;
    statAccuracy.textContent = Math.round((correctCount / pool.length) * 100) + '%';
    statStreak.textContent = maxStreak;
    
    if (isNewHS) {
      highscoreBanner.style.display = 'inline-block';
      beatScoreMsg.style.display = 'none';
    } else {
      highscoreBanner.style.display = 'none';
      beatScoreMsg.style.display = 'block';
    }
    
    showScreen(screenResult);
  }

  init();
});
