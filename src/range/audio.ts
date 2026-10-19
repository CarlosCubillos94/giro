/** Tiny Web Audio cues. Tracking drone while on target; pop on a hit. */
export class RangeAudio {
  private ctx: AudioContext | null = null;
  private drone: OscillatorNode | null = null;
  private droneGain: GainNode | null = null;

  resume() {
    this.ctx ??= new AudioContext();
    void this.ctx.resume();
  }

  pop() {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(920, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(420, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.14, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.09);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  }

  setTracking(on: boolean) {
    const ctx = this.ctx;
    if (!ctx) return;
    if (on) {
      if (this.drone) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 184;
      gain.gain.value = 0.028;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      this.drone = osc;
      this.droneGain = gain;
      return;
    }
    if (!this.drone) return;
    try {
      this.drone.stop();
    } catch {
      /* already stopped */
    }
    this.drone.disconnect();
    this.droneGain?.disconnect();
    this.drone = null;
    this.droneGain = null;
  }

  dispose() {
    this.setTracking(false);
    if (this.ctx) void this.ctx.close();
    this.ctx = null;
  }
}
