import { nextTick, onUnmounted, watch, type Ref } from 'vue'

const openDialogs: HTMLElement[] = []

/** Keep keyboard navigation inside the topmost dialog and restore its trigger. */
export function useDialogKeyboard(dialog: Ref<HTMLElement | null>, close: () => void) {
  let trigger: HTMLElement | null = null
  let current: HTMLElement | null = null
  const controls = () => [...(dialog.value?.querySelectorAll<HTMLElement>(
    'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
  ) || [])].filter(el => el.getClientRects().length && !el.closest('[inert]'))
  function release() {
    if (current) openDialogs.splice(openDialogs.indexOf(current), 1)
    current = null
    if (trigger?.isConnected) trigger.focus()
    trigger = null
  }
  watch(dialog, async element => {
    release()
    if (!element) return
    trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    current = element
    openDialogs.push(element)
    await nextTick()
    if (dialog.value === element) (controls()[0] || element).focus()
  }, { flush: 'post' })
  function onKeydown(event: KeyboardEvent) {
    if (!current || openDialogs[openDialogs.length - 1] !== current) return
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopImmediatePropagation()
      close()
    } else if (event.key === 'Tab') {
      const elements = controls(), first = elements[0], last = elements[elements.length - 1]
      if (!first) { event.preventDefault(); current.focus(); return }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === current || !current.contains(document.activeElement))) {
        event.preventDefault(); last?.focus()
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === current || !current.contains(document.activeElement))) {
        event.preventDefault(); first.focus()
      }
    }
  }
  document.addEventListener('keydown', onKeydown, true)
  onUnmounted(() => { document.removeEventListener('keydown', onKeydown, true); release() })
}
