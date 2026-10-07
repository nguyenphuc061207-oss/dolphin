export function withTimeout(promise, ms = 20000) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Yêu cầu quá thời gian chờ. Vui lòng kiểm tra kết nối và thử lại.')), ms);
  })]).finally(() => clearTimeout(timer));
}

// Storage can be disabled or full; it must never crash the exam screen.
export function storageOperation(operation, key, value, storage) {
  try {
    const target = storage ?? globalThis.localStorage;
    return { ok: true, value: target[operation](key, value) };
  } catch (error) {
    return { ok: false, error };
  }
}

export function timestampDate(value) {
  try {
    if (value == null || value === '') return null;
    const date = typeof value.toDate === 'function' ? value.toDate()
      : typeof value.toMillis === 'function' ? new Date(value.toMillis())
      : typeof value.seconds === 'number' ? new Date(value.seconds * 1000)
      : new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  } catch { return null; }
}

export function timestampMillis(value) {
  return timestampDate(value)?.getTime() ?? 0;
}

export async function mapConcurrent(items, worker, limit = 3) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  }));
  return results;
}
