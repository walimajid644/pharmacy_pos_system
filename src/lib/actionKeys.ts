/** Activate the same visible, enabled control used by the mouse. */
export function onActionKeydown(event: KeyboardEvent) {
  if (
    event.defaultPrevented ||
    event.repeat ||
    event.isComposing ||
    event.altKey ||
    event.shiftKey ||
    !(event.ctrlKey || event.metaKey)
  )
    return;
  const root = event.currentTarget as HTMLElement;
  const target = event.target as HTMLElement;
  if (target.closest('[role="dialog"]') !== root.closest('[role="dialog"]')) return;
  const key = event.key.toLowerCase();
  if (!['s', 'enter', 'p'].includes(key)) return;
  const button = root.querySelector<HTMLButtonElement>(
    `button[aria-keyshortcuts="Control+${key}"]`,
  );
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  if (!button.disabled && button.getClientRects().length && !button.closest('[inert]'))
    button.click();
}
