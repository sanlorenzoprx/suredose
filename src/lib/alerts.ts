let audioCtx: AudioContext | null = null;
let loopTimer: number | null = null;
let speaking = false;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
  }
  return audioCtx;
}

function beep(freq: number, start: number, dur: number, gain = 0.28) {
  const ctx = context();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + start + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + dur + 0.02);
}

export function playDoseChime() {
  const ctx = context();
  if (!ctx) return;
  void ctx.resume();
  beep(523.25, 0, 0.28, 0.32);
  beep(659.25, 0.22, 0.32, 0.34);
  beep(783.99, 0.48, 0.5, 0.36);
}

export function vibrateAlert() {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  navigator.vibrate([400, 180, 400, 180, 700]);
}

export function speak(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 0.88;
  utter.pitch = 1;
  utter.volume = 1;
  speaking = true;
  utter.onend = () => {
    speaking = false;
  };
  window.speechSynthesis.speak(utter);
}

export function stopSpeech() {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  speaking = false;
}

export function startDoseAlarm(opts: {
  soundOn: boolean;
  vibrateOn: boolean;
  speakOn: boolean;
  phrase: string;
}) {
  stopDoseAlarm();
  const fire = () => {
    if (opts.soundOn) playDoseChime();
    if (opts.vibrateOn) vibrateAlert();
    if (opts.speakOn && !speaking) speak(opts.phrase);
  };
  fire();
  loopTimer = window.setInterval(fire, 18_000);
}

export function stopDoseAlarm() {
  if (loopTimer != null) {
    window.clearInterval(loopTimer);
    loopTimer = null;
  }
  stopSpeech();
}

export async function requestNotifyPermission(): Promise<boolean> {
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

export function showDoseNotification(title: string, body: string) {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, tag: "suredose-due", requireInteraction: true });
  } catch {
    /* some browsers block Notifications from iframes */
  }
}
