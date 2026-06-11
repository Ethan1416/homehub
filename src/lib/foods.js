// Searchable foods for logging what you actually ate. Weighed foods (meat, etc.)
// take a grams/oz/lb amount with a sensible default; per-item foods take a count;
// catalog meals are fixed. Per-gram values mirror lib/calories.js (USDA-based).
import { FOOD_CATALOG } from './foodCatalog.js'

// weighed: grams-based, shows amount + unit toggle, with a recommended default.
const WEIGHED = [
  { name: 'Chicken breast', kcalPerG: 1.65, def: 170 },
  { name: 'Chicken thigh', kcalPerG: 2.09, def: 170 },
  { name: 'Ground beef (80/20)', kcalPerG: 2.54, def: 225 },
  { name: 'Ribeye steak', kcalPerG: 2.91, def: 225 },
  { name: 'Salmon', kcalPerG: 2.06, def: 170 },
  { name: 'Chicken gizzards', kcalPerG: 1.54, def: 115 },
  { name: 'Sardines', kcalPerG: 2.08, def: 90 },
  { name: 'Avocado', kcalPerG: 1.60, def: 100 },
  { name: 'Broccoli', kcalPerG: 0.35, def: 150 },
  { name: 'Spinach', kcalPerG: 0.23, def: 100 },
  { name: 'White rice (cooked)', kcalPerG: 1.30, def: 200 },
  { name: 'Sweet potato (cooked)', kcalPerG: 0.90, def: 200 },
  { name: 'Oats (dry)', kcalPerG: 3.79, def: 80 },
]
const PER_ITEM = [
  { name: 'Egg — scrambled (with butter)', kcalEach: 96, def: 2 },
  { name: 'Egg — fried (with oil)', kcalEach: 90, def: 2 },
  { name: 'Egg — hard boiled', kcalEach: 78, def: 2 },
  { name: 'Egg — poached', kcalEach: 72, def: 2 },
  { name: 'Egg white', kcalEach: 17, def: 2 },
  { name: 'String cheese stick', kcalEach: 80, def: 1 },
]

export const UNITS = ['g', 'oz', 'lb']
const TO_G = { g: 1, oz: 28.3495, lb: 453.592 }

// Build the unified searchable list.
export const FOODS = [
  ...WEIGHED.map((f) => ({ ...f, kind: 'weighed' })),
  ...PER_ITEM.map((f) => ({ ...f, kind: 'item' })),
  ...FOOD_CATALOG.map((f) => ({ name: f.name, kind: 'fixed', kcal: f.kcal,
    protein: f.protein, carbs: f.carbs, fat: f.fat }))
]

export function searchFoods(q) {
  const s = (q || '').trim().toLowerCase()
  if (!s) return []
  return FOODS.filter((f) => f.name.toLowerCase().includes(s)).slice(0, 8)
}

// kcal for a chosen food + amount. unit only matters for weighed foods.
export function foodKcal(food, qty, unit = 'g') {
  const n = parseFloat(qty) || 0
  if (food.kind === 'weighed') return Math.round(n * TO_G[unit] * food.kcalPerG)
  if (food.kind === 'item') return Math.round(n * food.kcalEach)
  return Math.round((n || 1) * food.kcal) // fixed
}

// A human label for the logged entry.
export function foodLabel(food, qty, unit = 'g') {
  if (food.kind === 'weighed') return `${food.name} (${qty}${unit})`
  if (food.kind === 'item') return `${qty}× ${food.name}`
  return food.name
}
