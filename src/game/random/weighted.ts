export const pickWeightedOneIndex = (
  weights: number[],
  random: () => number = Math.random
) => {
  let totalWeight = 0;
  for (const weight of weights) {
    totalWeight += weight;
  }
  let roll = random() * totalWeight;
  for (let index = 0; index < weights.length; index += 1) {
    const weight = weights[index];
    if (roll <= weight) {
      return index;
    }
    roll -= weight;
  }
  return weights.length - 1;
};

export const pickWeightedUnique = <T>(
  items: readonly T[],
  count: number,
  getWeight: (item: T) => number,
  random: () => number = Math.random
): T[] => {
  if (count <= 0 || items.length === 0) {
    return [];
  }
  const pool = [...items];
  const picked: T[] = [];
  const selectionCount = Math.min(count, pool.length);
  for (let index = 0; index < selectionCount; index += 1) {
    const weights = pool.map((item) => getWeight(item));
    const pickedIndex = pickWeightedOneIndex(weights, random);
    picked.push(pool.splice(pickedIndex, 1)[0]);
  }
  return picked;
};
