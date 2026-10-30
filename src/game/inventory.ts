import { makeItem } from "./items";
import type { Item, Recipe } from "./types";

export class Inventory {
  items: Item[] = [];
  hotbar: (Item | null)[] = [null, null, null, null, null];
  baseCapacity = 12;
  equippedId: string | null = null;

  get capacity() {
    return this.baseCapacity + this.items.reduce((sum, item) => sum + (item.carryBonus ?? 0), 0);
  }

  get weight() {
    return this.items.reduce((sum, item) => sum + item.weight * item.qty, 0);
  }

  get equipped() {
    return this.items.find((item) => item.id === this.equippedId) ?? this.items.find((item) => item.weapon) ?? null;
  }

  add(item: Item) {
    const stack = this.items.find((entry) => entry.name === item.name && !entry.weapon && !entry.carryBonus);
    if (stack) stack.qty += item.qty;
    else this.items.push(item);
  }

  countByName(name: string) {
    return this.items.filter((item) => item.name === name).reduce((sum, item) => sum + item.qty, 0);
  }

  hasItem(name: string, qty = 1) {
    return this.countByName(name) >= qty;
  }

  removeByName(name: string, qty = 1) {
    if (!this.hasItem(name, qty)) return false;
    let remaining = qty;
    for (const item of [...this.items].filter((entry) => entry.name === name)) {
      if (remaining <= 0) break;
      const taken = Math.min(remaining, item.qty);
      this.removeById(item.id, taken);
      remaining -= taken;
    }
    return true;
  }

  removeById(id: string, qty = 1) {
    const item = this.items.find((entry) => entry.id === id);
    if (!item) return null;
    const taken = Math.min(qty, item.qty);
    item.qty -= taken;
    const removed = { ...item, qty: taken };
    if (item.qty <= 0) {
      this.items = this.items.filter((entry) => entry.id !== id);
      this.hotbar = this.hotbar.map((entry) => (entry?.id === id ? null : entry));
      if (this.equippedId === id) this.equippedId = null;
    }
    return removed;
  }

  consume(id: string) {
    const item = this.items.find((entry) => entry.id === id);
    if (!item) return null;
    this.removeById(id, 1);
    return item;
  }

  equip(id: string) {
    const item = this.items.find((entry) => entry.id === id);
    if (item?.weapon) this.equippedId = id;
  }

  assignHotbar(slot: number, id: string) {
    const item = this.items.find((entry) => entry.id === id);
    if (item && slot >= 0 && slot < 5) this.hotbar[slot] = item;
  }

  hasNeeds(needs: Record<string, number>) {
    return Object.entries(needs).every(([name, qty]) => {
      return this.items.filter((item) => item.name === name).reduce((sum, item) => sum + item.qty, 0) >= qty;
    });
  }

  craft(recipe: Recipe) {
    if (recipe.station && !this.hasItem(recipe.station)) return false;
    if (!this.hasNeeds(recipe.needs)) return false;
    for (const [name, qty] of Object.entries(recipe.needs)) {
      let remaining = qty;
      for (const item of [...this.items].filter((entry) => entry.name === name)) {
        if (remaining <= 0) break;
        const taken = Math.min(remaining, item.qty);
        this.removeById(item.id, taken);
        remaining -= taken;
      }
    }
    this.add(makeItem(recipe.result));
    return true;
  }
}