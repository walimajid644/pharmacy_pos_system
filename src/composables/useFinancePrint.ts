import { nextTick, onBeforeUnmount, ref } from 'vue';
export function useFinancePrint() {
  const printing = ref(false);
  let cleanup: (() => void) | undefined;
  async function print() {
    if (printing.value) return;
    printing.value = true;
    await nextTick();
    const style = document.createElement('style');
    style.textContent = '@page {size:A4;margin:12mm;}';
    document.head.appendChild(style);
    document.body.classList.add('printing-finance-document');
    cleanup = () => {
      document.body.classList.remove('printing-finance-document');
      style.remove();
      printing.value = false;
      window.removeEventListener('afterprint', done);
      cleanup = undefined;
    };
    const done = () => cleanup?.();
    window.addEventListener('afterprint', done, { once: true });
    try {
      window.print();
    } catch (e) {
      done();
      throw e;
    }
  }
  onBeforeUnmount(() => cleanup?.());
  return { printing, print };
}
