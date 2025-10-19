// In-memory LRU cache
export class Cache<Key, Value> {
    private readonly capacity: number;
    private readonly cache: Map<Key, Value>;
  
    constructor(capacity: number = 4096) {
      this.capacity = capacity;
      this.cache = new Map();
    }
  
    private setMostRecentlyUsed(key: Key, value: Value) {
      this.cache.delete(key);
      this.cache.set(key, value);
    }
  
    public get(key: Key): Value | undefined {
      if (!this.cache.has(key)) return undefined;
      const value = this.cache.get(key)!;
      this.setMostRecentlyUsed(key, value);
      return value;
    }
  
    public set(key: Key, value: Value): void {
      this.setMostRecentlyUsed(key, value);
  
      while (this.cache.size > this.capacity) {
        const oldestKey = this.cache.keys().next().value;
        this.cache.delete(oldestKey);
      }
    }
  
    public delete(key: Key): void {
      this.cache.delete(key);
    }
  }
  