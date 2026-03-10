export function renameProperty<T = any>(
  data: T | T[],
  fromKey: string,
  toKey: string,
): any {
  function renameOne(item: any) {
    if (item == null) return item;
    const obj = typeof item.toObject === "function" ? item.toObject() : item;
    if (obj && Object.prototype.hasOwnProperty.call(obj, fromKey)) {
      obj[toKey] = obj[fromKey];
      delete obj[fromKey];
    }
    return obj;
  }

  if (Array.isArray(data)) {
    return data.map(renameOne);
  }

  return renameOne(data as any);
}

export default renameProperty;
