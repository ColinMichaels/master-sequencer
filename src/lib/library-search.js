const normalize = (value) => value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();

const words = (value) => normalize(value).split(" ").filter(Boolean);

const editDistance = (left, right) => {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const current = [leftIndex + 1];
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      current.push(Math.min(
        current[rightIndex] + 1,
        previous[rightIndex + 1] + 1,
        previous[rightIndex] + (left[leftIndex] === right[rightIndex] ? 0 : 1),
      ));
    }
    previous = current;
  }
  return previous.at(-1);
};

const tokenScore = (queryWord, recordWords, exactScore, prefixScore, partialScore, fuzzyScore) => {
  if (recordWords.includes(queryWord)) return exactScore;
  if (recordWords.some((word) => word.startsWith(queryWord) || (queryWord.length >= 4 && queryWord.startsWith(word)))) return prefixScore;
  if (queryWord.length >= 3 && recordWords.some((word) => word.includes(queryWord))) return partialScore;
  if (queryWord.length < 4) return 0;
  const allowedDistance = queryWord.length >= 8 ? 2 : 1;
  return recordWords.some((word) => Math.abs(word.length - queryWord.length) <= allowedDistance && editDistance(queryWord, word) <= allowedDistance) ? fuzzyScore : 0;
};

const scoreRecord = (record, normalizedQuery, queryWords) => {
  let score = 0;
  if (record.context) score += 20;
  if (record.name === normalizedQuery) score += 2_000;
  else if (record.name.startsWith(normalizedQuery)) score += 1_000;
  else if (record.name.includes(normalizedQuery)) score += 650;
  if (record.path.includes(normalizedQuery)) score += 220;
  if (record.context.includes(normalizedQuery)) score += 180;

  for (const queryWord of queryWords) {
    const wordScore = tokenScore(queryWord, record.nameWords, 150, 120, 95, 75)
      || tokenScore(queryWord, record.pathWords, 70, 55, 42, 30)
      || tokenScore(queryWord, record.contextWords, 65, 50, 38, 28);
    if (!wordScore) return 0;
    score += wordScore;
  }
  const orderedPositions = [];
  let position = -1;
  for (const queryWord of queryWords) {
    position = record.nameWords.findIndex((word, index) => index > position && (word === queryWord || word.startsWith(queryWord)));
    if (position < 0) break;
    orderedPositions.push(position);
  }
  if (orderedPositions.length === queryWords.length) {
    const span = orderedPositions.at(-1) - orderedPositions[0];
    score += Math.max(0, 180 - (span * 10) - (Math.max(0, record.nameWords.length - queryWords.length) * 4));
  }
  return score;
};

export const createLibrarySearchIndex = (files, { additionalTextByKey = new Map() } = {}) => {
  const records = files.map((file, position) => {
    const name = normalize(file.name.replace(/\.[^.]+$/, ""));
    const path = normalize(`${file.relativePath} ${file.extension}`);
    const context = normalize(additionalTextByKey.get(file.key) || "");
    return {
      key: file.key,
      position,
      name,
      path,
      context,
      nameWords: words(name),
      pathWords: words(path),
      contextWords: words(context),
    };
  });
  return {
    search(query) {
      const normalized = normalize(query);
      if (!normalized) return new Set(records.map(({ key }) => key));
      const queryWords = words(normalized);
      return new Set(records
        .map((record) => ({ key: record.key, position: record.position, score: scoreRecord(record, normalized, queryWords) }))
        .filter(({ score }) => score > 0)
        .sort((left, right) => right.score - left.score || left.position - right.position)
        .map(({ key }) => key));
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
