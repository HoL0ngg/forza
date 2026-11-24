/** 32-bit LCG. The current state is sufficient to resume the sequence, including seed zero. */
export class SeededRandom {
  state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    return this.state / 4294967296;
  }
}
