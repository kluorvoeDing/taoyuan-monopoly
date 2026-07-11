/**
 * 確定性隨機數生成器 (Mulberry32)
 * 用於確保遊戲引擎在相同種子下是完全確定性 (Deterministic) 的，以便於測試與重播。
 */
export class SeedableRNG {
  private seed: number;

  constructor(seedVal: string | number) {
    if (typeof seedVal === 'number') {
      this.seed = seedVal;
    } else {
      this.seed = this.hashString(seedVal);
    }
  }

  // 簡單的雜湊函式，將字串轉為數字
  private hashString(str: string): number {
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  // Mulberry32 隨機算法，回傳 0 ~ 1 之間的小數
  public next(): number {
    let t = (this.seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // 隨機整數範圍 [min, max] (皆包含)
  public range(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  // 隨機打亂陣列（不改變原陣列，回傳新陣列）
  public shuffle<T>(array: T[]): T[] {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = this.range(0, i);
      const temp = copy[i];
      copy[i] = copy[j];
      copy[j] = temp;
    }
    return copy;
  }

  // 序列化目前狀態
  public getStateString(): string {
    return this.seed.toString();
  }

  // 反序列化狀態
  public setStateString(state: string) {
    this.seed = parseInt(state, 10);
  }
}
