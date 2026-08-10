const normalize = (value) => value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();

const grams = (value) => {
  const text = normalize(value);
  if (!text) return [];
  if (text.length < 3) return [text];
  return [...new Set(Array.from({ length: text.length - 2 }, (_, index) => text.slice(index, index + 3)))];
};

export const createLibrarySearchIndex = (files) => {
  const records = new Map();
  const inverted = new Map();
  for (const file of files) {
    const text = normalize(`${file.name} ${file.relativePath} ${file.extension}`);
    records.set(file.key, text);
    for (const gram of grams(text)) {
      if (!inverted.has(gram)) inverted.set(gram, new Set());
      inverted.get(gram).add(file.key);
    }
  }
  return {
    search(query) {
      const normalized = normalize(query);
      if (!normalized) return new Set(records.keys());
      const queryGrams = grams(normalized);
      let candidates = null;
      for (const gram of queryGrams) {
        const matching = gram.length < 3
          ? new Set([...records].filter(([, text]) => text.includes(gram)).map(([key]) => key))
          : inverted.get(gram) || new Set();
        candidates = candidates === null ? new Set(matching) : new Set([...candidates].filter((key) => matching.has(key)));
        if (!candidates.size) break;
      }
      return new Set([...(candidates || [])].filter((key) => records.get(key).includes(normalized)));
    },
  };
};

export const saveLibraryFilter = (settings, { name, query, format, rootId, usageFilter }) => {
  const label = name.trim();
  if (!label) return "";
  settings.librarySavedFilters ||= [];
  let id = normalize(label).replaceAll(" ", "-") || "filter";
  let suffix = 2;
  while (settings.librarySavedFilters.some((filter) => filter.id === id)) id = `${normalize(label).replaceAll(" ", "-") || "filter"}-${suffix++}`;
  settings.librarySavedFilters.push({ id, name: label, query, format, rootId, usageFilter });
  return id;
};
