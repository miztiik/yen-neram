export type MountOptions = {
  readonly queryParams: URLSearchParams;
  readonly mode?: string | undefined;
  readonly theme?: string | undefined;
};

export type GameInstance = {
  unmount(): void;
};

export type GameMount = (container: HTMLElement, options: MountOptions) => Promise<GameInstance>;

export type GameModule = {
  default: GameMount;
};
