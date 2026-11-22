/** Two soft struck tones, no recording: a singing-bowl-like end of a quiet minute. */
let ctx: AudioContext | null = null

function getContext(): AudioContext | null {
  if (ctx) return ctx
  type WindowWithAudio = Window & { webkitAudioContext?: typeof AudioContext }
  const Ctor = window.AudioContext ?? (window as WindowWithAudio).webkitAudioContext
  if (!Ctor) return null
  ctx = new Ctor()
  return ctx
}

/** Called from the first tap so iOS lets the chime play when the timer ends. */
export function primeAudio(): void {
  const audio = getContext()
  if (audio && audio.state === 'suspended') void audio.resume()
}

export function playChime(): void {
  const audio = getContext()
  if (!audio) return
  if (audio.state === 'suspended') void audio.resume()
  const now = audio.currentTime

  const tone = (freq: number, start: number, length: number, gainValue: number) => {
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.0001, now + start)
    gain.gain.exponentialRampToValueAtTime(gainValue, now + start + 0.05)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + start + length)
    osc.connect(gain).connect(audio.destination)
    osc.start(now + start)
    osc.stop(now + start + length + 0.05)
  }

  tone(528, 0, 4.2, 0.07)
  tone(792, 0.12, 3.4, 0.035)
  tone(1056, 0.28, 2.2, 0.018)
}
