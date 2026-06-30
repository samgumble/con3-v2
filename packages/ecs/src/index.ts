/**
 * Minimal, data-oriented Entity-Component-System.
 *
 * Entities are plain numeric ids. Components are stored in per-type maps
 * (struct-of-arrays-ish) so systems can iterate a single component type
 * tightly. Component *types* are identified by string keys; typed accessors
 * live in higher-level packages (e.g. @con3/sim) to keep this core generic.
 */

export type Entity = number;

export class World {
  private nextId: Entity = 1;
  private alive = new Set<Entity>();
  private stores = new Map<string, Map<Entity, unknown>>();

  /** Create a new entity id. */
  create(): Entity {
    const e = this.nextId++;
    this.alive.add(e);
    return e;
  }

  /** Remove an entity and all of its components. */
  destroy(e: Entity): void {
    this.alive.delete(e);
    for (const store of this.stores.values()) store.delete(e);
  }

  isAlive(e: Entity): boolean {
    return this.alive.has(e);
  }

  /** Number of living entities. */
  get size(): number {
    return this.alive.size;
  }

  private store(name: string): Map<Entity, unknown> {
    let s = this.stores.get(name);
    if (!s) {
      s = new Map();
      this.stores.set(name, s);
    }
    return s;
  }

  add<T>(e: Entity, name: string, data: T): T {
    this.store(name).set(e, data);
    return data;
  }

  get<T>(e: Entity, name: string): T | undefined {
    return this.store(name).get(e) as T | undefined;
  }

  has(e: Entity, name: string): boolean {
    return this.store(name).has(e);
  }

  remove(e: Entity, name: string): void {
    this.store(name).delete(e);
  }

  /**
   * Return every living entity that has all of the named components.
   * Iterates the smallest matching store for efficiency.
   */
  query(...names: string[]): Entity[] {
    if (names.length === 0) return [...this.alive];

    let smallest = this.store(names[0]);
    for (let i = 1; i < names.length; i++) {
      const s = this.store(names[i]);
      if (s.size < smallest.size) smallest = s;
    }

    const result: Entity[] = [];
    outer: for (const e of smallest.keys()) {
      for (const name of names) {
        if (!this.store(name).has(e)) continue outer;
      }
      result.push(e);
    }
    return result;
  }
}
