//#region node_modules/.nitro/vite/services/ssr/assets/alerts-peoabm1f.js
var audioCtx = null;
var loopTimer = null;
var speaking = false;
function context() {
	if (typeof window === "undefined") return null;
	if (!audioCtx) {
		const Ctor = window.AudioContext || window.webkitAudioContext;
		if (!Ctor) return null;
		audioCtx = new Ctor();
	}
	return audioCtx;
}
function beep(freq, start, dur, gain = .28) {
	const ctx = context();
	if (!ctx) return;
	const osc = ctx.createOscillator();
	const g = ctx.createGain();
	osc.type = "sine";
	osc.frequency.value = freq;
	g.gain.setValueAtTime(1e-4, ctx.currentTime + start);
	g.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + start + .03);
	g.gain.exponentialRampToValueAtTime(1e-4, ctx.currentTime + start + dur);
	osc.connect(g);
	g.connect(ctx.destination);
	osc.start(ctx.currentTime + start);
	osc.stop(ctx.currentTime + start + dur + .02);
}
function playDoseChime() {
	const ctx = context();
	if (!ctx) return;
	ctx.resume();
	beep(523.25, 0, .28, .32);
	beep(659.25, .22, .32, .34);
	beep(783.99, .48, .5, .36);
}
function vibrateAlert() {
	if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
	navigator.vibrate([
		400,
		180,
		400,
		180,
		700
	]);
}
function speak(text) {
	if (typeof window === "undefined" || !window.speechSynthesis) return;
	window.speechSynthesis.cancel();
	const utter = new SpeechSynthesisUtterance(text);
	utter.rate = .88;
	utter.pitch = 1;
	utter.volume = 1;
	speaking = true;
	utter.onend = () => {
		speaking = false;
	};
	window.speechSynthesis.speak(utter);
}
function stopSpeech() {
	if (typeof window === "undefined" || !window.speechSynthesis) return;
	window.speechSynthesis.cancel();
	speaking = false;
}
function startDoseAlarm(opts) {
	stopDoseAlarm();
	const fire = () => {
		if (opts.soundOn) playDoseChime();
		if (opts.vibrateOn) vibrateAlert();
		if (opts.speakOn && !speaking) speak(opts.phrase);
	};
	fire();
	loopTimer = window.setInterval(fire, 18e3);
}
function stopDoseAlarm() {
	if (loopTimer != null) {
		window.clearInterval(loopTimer);
		loopTimer = null;
	}
	stopSpeech();
}
async function requestNotifyPermission() {
	if (typeof Notification === "undefined") return false;
	if (Notification.permission === "granted") return true;
	if (Notification.permission === "denied") return false;
	return await Notification.requestPermission() === "granted";
}
function showDoseNotification(title, body) {
	if (typeof Notification === "undefined") return;
	if (Notification.permission !== "granted") return;
	try {
		new Notification(title, {
			body,
			tag: "suredose-due",
			requireInteraction: true
		});
	} catch {}
}
//#endregion
export { stopDoseAlarm as i, showDoseNotification as n, startDoseAlarm as r, requestNotifyPermission as t };
