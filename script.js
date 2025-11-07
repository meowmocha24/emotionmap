// ------------- Face API + emotion tracking -------------

const video = document.getElementById('video');

// emotions provided by face-api
const EMOTIONS = [
  'neutral',
  'happy',
  'sad',
  'angry',
  'fearful',
  'disgusted',
  'surprised'
];

// history of readings over time
// each entry: { neutral: 0.1, happy: 0.7, ... }
let emotionHistory = [];

// how often to sample expressions (ms)
const SAMPLE_INTERVAL = 200;

// width in pixels for each "time step" in the map
const COL_WIDTH = 6;

let canvasHeight;

// ---------- SOUND SETUP (beeps) ----------

// have we unlocked audio yet?
let audioInitialized = false;

// base frequency per emotion (Hz)
const EMOTION_FREQS = {
  neutral: 220,   // grey
  happy: 880,     // yellow
  sad: 260,       // blue
  angry: 440,     // red
  fearful: 600,   // violet
  disgusted: 320, // green
  surprised: 700  // teal
};

// called by p5 when you click on the canvas/page
function mousePressed() {
  if (!audioInitialized) {
    audioInitialized = true;
    // unlock audio context (different p5 versions)
    try {
      if (typeof userStartAudio === 'function') {
        userStartAudio();
      }
      if (typeof getAudioContext === 'function') {
        getAudioContext().resume();
      }
    } catch (e) {
      console.log('Audio init error:', e);
    }
    console.log('Audio initialized');
  }
}

// create a short beep for a given emotion + intensity
function triggerBeepForEmotion(name, intensity) {
  if (!audioInitialized) return;

  const baseFreq = EMOTION_FREQS[name] || 440;
  const freq = baseFreq * (0.8 + intensity * 0.4); // small pitch modulation

  // create a new osc JUST for this beep
  const osc = new p5.Oscillator('sine');
  osc.freq(freq);
  osc.amp(0);
  osc.start();

  // map intensity to loudness (keep it gentle)
  const amp = 0.05 + intensity * 0.25; // 0.05–0.3

  // quick envelope: up then down
  osc.amp(amp, 0.01);       // up to amp in 10ms
  osc.amp(0, 0.15, 0.05);   // down to 0 over 150ms, starting after 50ms
  osc.stop(0.25);           // stop 250ms from now
}

// ---------- FACE-API MODEL LOADING ----------

Promise.all([
  faceapi.nets.tinyFaceDetector.loadFromUri('models'),
  faceapi.nets.faceLandmark68Net.loadFromUri('models'),
  faceapi.nets.faceRecognitionNet.loadFromUri('models'),
  faceapi.nets.faceExpressionNet.loadFromUri('models')
]).then(startVideo);

function startVideo() {
  // modern getUserMedia
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then(stream => {
        video.srcObject = stream;
        video.play();
      })
      .catch(err => console.error(err));
  } else {
    // fallback (older browsers)
    navigator.getUserMedia(
      { video: {} },
      stream => (video.srcObject = stream),
      err => console.error(err)
    );
  }
}

// when the video is playing, start sampling emotions
video.addEventListener('play', () => {
  setInterval(async () => {
    let snapshot = {};

    try {
      const detection = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
        .withFaceExpressions();

      if (detection && detection.expressions) {
        EMOTIONS.forEach(name => {
          snapshot[name] = detection.expressions[name] || 0;
        });
      } else {
        // no face → all zeros
        EMOTIONS.forEach(name => {
          snapshot[name] = 0;
        });
      }
    } catch (e) {
      // on error, push zeros
      EMOTIONS.forEach(name => {
        snapshot[name] = 0;
      });
    }

    emotionHistory.push(snapshot);

    // ---- SOUND: beep for dominant emotion at this time step ----
    let bestName = null;
    let bestVal = 0;
    for (const name of EMOTIONS) {
      const v = snapshot[name] || 0;
      if (v > bestVal) {
        bestVal = v;
        bestName = name;
      }
    }
    // only beep if emotion is at least a bit present
    if (bestName && bestVal > 0.2) {
      triggerBeepForEmotion(bestName, bestVal);
    }

    // grow canvas width as we get more data
    const neededWidth = Math.max(window.innerWidth, emotionHistory.length * COL_WIDTH);
    if (typeof resizeCanvas === 'function' && width !== neededWidth) {
      resizeCanvas(neededWidth, canvasHeight);
    }
  }, SAMPLE_INTERVAL);
});

// ------------- p5.js visualization -------------

function setup() {
  canvasHeight = window.innerHeight;
  createCanvas(window.innerWidth, canvasHeight);

  // we'll use HSB but with hand-picked colors per emotion
  colorMode(HSB, 360, 100, 100, 100);
  noStroke();
}

// map (emotion name, intensity 0..1) → a specific color
function getEmotionColor(name, value) {
  // value is 0..1 (how strong that emotion is)
  // we'll map it to brightness so low = dark, high = bright
  const b = lerp(10, 100, value); // brightness

  switch (name) {
    case 'neutral':
      // grey neutral: low saturation, mid–high brightness
      return color(0, 0, lerp(30, 80, value)); // HSB: hue 0, sat 0 = grey

    case 'happy':
      // yellow happy
      return color(60, 100, b); // hue ~60° = yellow

    case 'sad':
      // blue sad
      return color(220, 80, b); // hue ~220° = deep blue

    case 'angry':
      // red angry
      return color(0, 100, b); // hue 0° = red

    case 'fearful':
      // violet fearful
      return color(280, 80, b); // hue ~280° = violet

    case 'disgusted':
      // green disgust
      return color(130, 80, b); // hue ~130° = green

    case 'surprised':
      // teal surprised
      return color(180, 80, b); // hue ~180° = teal/cyan

    default:
      // fallback: just grey
      return color(0, 0, b);
  }
}

function draw() {
  background(0);

  if (emotionHistory.length === 0) return;

  const rowHeight = height / EMOTIONS.length;

  // draw one column per time step
  for (let t = 0; t < emotionHistory.length; t++) {
    const sample = emotionHistory[t];

    for (let e = 0; e < EMOTIONS.length; e++) {
      const name = EMOTIONS[e];
      const value = sample[name] || 0; // 0..1

      // get our custom color for this emotion/value
      const col = getEmotionColor(name, value);
      fill(col);

      const x = t * COL_WIDTH;
      const y = e * rowHeight;
      rect(x, y, COL_WIDTH, rowHeight);
    }
  }

  // subtle row separators so bands are readable
  stroke(0, 0, 30, 80);
  strokeWeight(1);
  for (let e = 1; e < EMOTIONS.length; e++) {
    const y = e * rowHeight;
    line(0, y, width, y);
  }
  noStroke();

  // auto-scroll to the newest part of the map
  const maxScrollX = Math.max(0, width - window.innerWidth);
  window.scrollTo(maxScrollX, 0);
}

function windowResized() {
  canvasHeight = window.innerHeight;
  const neededWidth = Math.max(window.innerWidth, emotionHistory.length * COL_WIDTH);
  resizeCanvas(neededWidth, canvasHeight);
}