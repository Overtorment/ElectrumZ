import { expect, test, describe } from "bun:test";
import { Cache } from "../lib/cache";

describe("Cache", () => {
  test("basic get/set", () => {
    const cache = new Cache<string, number>();
    cache.set("a", 1);
    expect(cache.get("a")).toBe(1);
  });

  test("returns undefined for missing keys", () => {
    const cache = new Cache<string, number>();
    expect(cache.get("nonexistent")).toBeUndefined();
  });

  test("updates existing key", () => {
    const cache = new Cache<string, number>();
    cache.set("a", 1);
    cache.set("a", 2);
    expect(cache.get("a")).toBe(2);
  });

  test("delete removes key", () => {
    const cache = new Cache<string, number>();
    cache.set("a", 1);
    cache.delete("a");
    expect(cache.get("a")).toBeUndefined();
  });

  test("evicts LRU when capacity exceeded", () => {
    const cache = new Cache<string, number>(3);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    cache.set("d", 4); // should evict "a"
    
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe(2);
    expect(cache.get("c")).toBe(3);
    expect(cache.get("d")).toBe(4);
  });

  test("get() updates recency", () => {
    const cache = new Cache<string, number>(3);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    cache.get("a"); // mark "a" as recently used
    cache.set("d", 4); // should evict "b", not "a"
    
    expect(cache.get("a")).toBe(1);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("c")).toBe(3);
    expect(cache.get("d")).toBe(4);
  });

  test("works with different types", () => {
    const cache = new Cache<number, string>();
    cache.set(1, "one");
    cache.set(2, "two");
    expect(cache.get(1)).toBe("one");
    expect(cache.get(2)).toBe("two");
  });

  test("handles Buffer keys", () => {
    const cache = new Cache<Buffer, number>();
    const key1 = Buffer.from("key1");
    const key2 = Buffer.from("key2");
    
    cache.set(key1, 100);
    cache.set(key2, 200);
    
    expect(cache.get(key1)).toBe(100);
    expect(cache.get(key2)).toBe(200);
  });

  test("handles objects as values", () => {
    interface User {
      name: string;
      age: number;
    }
    
    const cache = new Cache<string, User>();
    const user1 = { name: "Alice", age: 30 };
    const user2 = { name: "Bob", age: 25 };
    
    cache.set("alice", user1);
    cache.set("bob", user2);
    
    expect(cache.get("alice")).toEqual(user1);
    expect(cache.get("bob")).toEqual(user2);
    expect(cache.get("alice")?.name).toBe("Alice");
    expect(cache.get("bob")?.age).toBe(25);
  });
});

