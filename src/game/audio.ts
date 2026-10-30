export class GameAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private drone: OscillatorNode | null = null;
  private groanTimer = 0;
  /** Player-controlled master volume (0..1). */
  private volume = 0.7;

  /** Set the master volume. 0 mutes every sound effect. */
  setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 0.7));
    if (this.master && this.context) {
      this.master.gain.value = 0.035 * this.volume;
    }
  }

  /** Current master volume. */
  getVolume(): number {
    return this.volume;
  }

  start() {
    if (this.context) return;
    const AudioCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;
    this.context = new AudioCtor();
    this.master = this.context.createGain();
    this.master.gain.value = 0.035 * this.volume;
    this.master.connect(this.context.destination);
    this.drone = this.context.createOscillator();
    const droneGain = this.context.createGain();
    this.drone.type = "sawtooth";
    this.drone.frequency.value = 46;
    droneGain.gain.value = 0.14;
    this.drone.connect(droneGain);
    droneGain.connect(this.master);
    this.drone.start();
  }

  stop() {
    this.drone?.stop();
    this.context?.close();
    this.context = null;
    this.master = null;
    this.drone = null;
  }

  step() {
    this.beep(95, 0.025, "triangle", 0.05);
  }

  hit() {
    this.beep(130, 0.07, "square", 0.16);
  }

  groan(dt: number, nearby: number) {
    this.groanTimer -= dt;
    if (nearby <= 0 || this.groanTimer > 0) return;
    this.groanTimer = 2.5 + Math.random() * 5;
    this.beep(58 + Math.random() * 25, 0.4, "sawtooth", Math.min(0.2, nearby * 0.035));
  }

  private beep(frequency: number, duration: number, type: OscillatorType, volume: number) {
    if (!this.context || !this.master) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start();
    oscillator.stop(this.context.currentTime + duration);
  }
}