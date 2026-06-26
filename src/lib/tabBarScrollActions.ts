type ScrollToTopHandler = () => void;

const handlers = new Map<string, ScrollToTopHandler>();

export function registerTabScrollToTop(tabName: string, handler: ScrollToTopHandler): () => void {
  handlers.set(tabName, handler);
  return () => {
    if (handlers.get(tabName) === handler) {
      handlers.delete(tabName);
    }
  };
}
