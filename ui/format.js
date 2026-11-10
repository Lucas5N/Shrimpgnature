export function truncateFileName(name, maxLength = 20) {
  if (name.length <= maxLength) return name;
  const extIndex = name.lastIndexOf(".");
  const ext = extIndex !== -1 ? name.slice(extIndex) : "";
  const base = extIndex !== -1 ? name.slice(0, extIndex) : name;
  const keep = maxLength - ext.length - 3;
  if (keep <= 0) return name.slice(0, maxLength - 3) + "...";
  const front = Math.ceil(keep / 2);
  const back = Math.floor(keep / 2);
  return `${base.slice(0, front)}...${base.slice(-back)}${ext}`;
}
