/** True while the person is typing somewhere, so single-key shortcuts must stay out of the way. */
export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export const SHORTCUTS: { keys: string[]; what: string }[] = [
  { keys: ["Ctrl", "K"], what: "Search leads and pages" },
  { keys: ["J"], what: "Next lead in the list" },
  { keys: ["K"], what: "Previous lead in the list" },
  { keys: ["S"], what: "Shortlist the lead you are viewing" },
  { keys: ["X"], what: "Mark it not relevant" },
  { keys: ["W"], what: "Watch or stop watching it" },
  { keys: ["?"], what: "Show this list" },
];
