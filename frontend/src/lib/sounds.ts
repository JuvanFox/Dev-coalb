/**
 * Notification sounds using Web Audio API — no external files needed.
 * Generates tones programmatically.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

/**
 * Play a short notification chime for incoming messages.
 * Two-tone "ding" sound, pleasant and subtle.
 */
export function playMessageNotification() {
  try {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") ctx.resume();

    const now = ctx.currentTime;

    // First tone (slightly higher)
    playTone(ctx, 880, now, 0.08, 0.15);
    // Second tone (base)
    playTone(ctx, 660, now + 0.1, 0.08, 0.2);
  } catch (err) {
    // Audio not available — silently ignore
    console.debug("[sounds] Could not play notification:", err);
  }
}

/**
 * Play a subtle "pop" sound for voice channel activity
 * (someone joins or starts speaking).
 */
export function playVoiceActivitySound() {
  try {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") ctx.resume();

    const now = ctx.currentTime;

    // Short rising tone
    playTone(ctx, 520, now, 0.04, 0.1);
    playTone(ctx, 780, now + 0.05, 0.04, 0.1);
  } catch (err) {
    console.debug("[sounds] Could not play voice sound:", err);
  }
}

/**
 * Play a short "chime" for when someone enters a voice channel
 */
export function playVoiceJoinSound() {
  try {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") ctx.resume();

    const now = ctx.currentTime;
    playTone(ctx, 440, now, 0.06, 0.08);
    playTone(ctx, 660, now + 0.08, 0.06, 0.08);
    playTone(ctx, 880, now + 0.16, 0.06, 0.12);
  } catch (err) {
    console.debug("[sounds] Could not play voice join sound:", err);
  }
}

/**
 * Play a short tone when push-to-talk is activated (local feedback)
 */
export function playPTTActivateSound() {
  try {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") ctx.resume();
    const now = ctx.currentTime;
    playTone(ctx, 600, now, 0.02, 0.05);
  } catch (err) {
    console.debug("[sounds] Could not play PTT sound:", err);
  }
}

/**
 * Play a tone when push-to-talk is deactivated
 */
export function playPTTDeactivateSound() {
  try {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") ctx.resume();
    const now = ctx.currentTime;
    playTone(ctx, 400, now, 0.02, 0.05);
  } catch (err) {
    console.debug("[sounds] Could not play PTT sound:", err);
  }
}

// ─── Internal ─────────────────────────────────────────

function playTone(
  ctx: AudioContext,
  frequency: number,
  startTime: number,
  duration: number,
  volume: number = 0.1
) {
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, startTime);

  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(volume, startTime + 0.01);
  gainNode.gain.linearRampToValueAtTime(0, startTime + duration);

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.01);
}
