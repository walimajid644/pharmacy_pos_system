import type { ComponentPublicInstance, Ref } from 'vue';

// Explicit callback refs keep composable-owned DOM/component refs synchronized
// when conditional dialogs mount and unmount.
export function bindTemplateRef<T>(target: Ref<T | null>) {
  return (instance: Element | ComponentPublicInstance | null) => {
    target.value = instance as T | null;
  };
}
