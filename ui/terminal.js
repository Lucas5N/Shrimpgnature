// For developing version only
export function createTerminal(element) {
  return {
    log(message) {
      if (!element) return;
      const time = new Date().toISOString().split("T")[1].slice(0, -1);
      element.textContent += `\n[${time}] ${message}`;
      element.scrollTop = element.scrollHeight;
    },
  };
}
