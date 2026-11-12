/**
 * Text-to-Speech helper（Round 15）。
 *
 * 用瀏覽器內建的 SpeechSynthesis API — 免費、離線、不需裝任何東西。
 * 品質不如 Google Cloud TTS / ElevenLabs，但對查單詞發音完全夠用。
 *
 * 使用：
 *   import { speak, canSpeak } from "./lib/tts";
 *   speak("ecology");
 *
 * 偏好英式口音（en-GB）若可用，否則 en-US。使用者若要切口音，
 * 之後可以加到 SettingsModal。
 */

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return undefined;
  // Prefer: en-US Natural/Neural > en-GB > any en-*
  const byQuality =
    voices.find((v) => /en-US.*(Natural|Neural|Online)/i.test(v.name)) ??
    voices.find((v) => v.lang === "en-US" && v.localService) ??
    voices.find((v) => v.lang === "en-GB") ??
    voices.find((v) => v.lang.toLowerCase().startsWith("en"));
  return byQuality;
}

/**
 * Play a word / phrase. Cancels any ongoing utterance first so rapid clicks
 * don't pile up in the queue.
 */
export function speak(text: string, opts: { rate?: number; pitch?: number } = {}): void {
  if (!canSpeak()) return;
  const clean = text.trim();
  if (!clean) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(clean);
    const voice = pickVoice();
    if (voice) u.voice = voice;
    u.lang = voice?.lang ?? "en-US";
    u.rate = opts.rate ?? 0.95;
    u.pitch = opts.pitch ?? 1.0;
    window.speechSynthesis.speak(u);
  } catch (e) {
    console.warn("[tts] speak failed:", e);
  }
}

/** Some browsers load voices asynchronously — call this once at boot. */
export function warmupVoices() {
  if (!canSpeak()) return;
  // Accessing once triggers the lazy load.
  window.speechSynthesis.getVoices();
  if (window.speechSynthesis.onvoiceschanged === null) {
    window.speechSynthesis.onvoiceschanged = () => {
      // noop — future calls will use the now-populated list
    };
  }
}
