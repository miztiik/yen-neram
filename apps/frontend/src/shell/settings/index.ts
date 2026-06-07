export function mountAppSettings(container: HTMLElement): () => void {
  container.innerHTML =
    '<div class="p-6 text-yn-muted">App settings will live here in future games. Per-game settings live inside each game.</div>';
  return () => {
    container.innerHTML = "";
  };
}
