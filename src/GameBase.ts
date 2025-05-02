export abstract class GameBase {
  /**
   * Called once to initialize the game (load assets, set up state, etc.)
   */
  abstract init(): void | Promise<void>;

  /**
   * Called to start or resume the game loop
   */
  abstract start(): void;

  /**
   * Called to pause the game loop
   */
  abstract pause(): void;

  /**
   * Called to reset the game to its initial state
   */
  abstract reset(): void;

  /**
   * Called to clean up resources when the game is removed
   */
  abstract destroy(): void;
} 