/**
 * Tile Match Game
 *
 * This class is a Phaser 3 scene that implements a tile match game.
 *
 * The game manages the state of a grid of tiles of random colors.  When a match
 * is found, all the tiles that are part of the matching group are removed from
 * the grid.  A matching group is a group of tiles that have the same color in a
 * vertical or horizontal line.
 *
 * The player can select a tile and drag it to another tile.  If the two tiles
 * are adjacent, they will swap places.  If the two tiles are not adjacent, the
 * game will try to swap them.  If the swap is successful, the game will check
 * for matches.  If no matches are found, the swap is reversed.
 *
 * When a tile is removed from the grid, the tiles above it will fall down to
 * fill the empty space.  If this causes a new match, the new tiles will be
 * removed and the process will repeat.
 *
 * The game has no win or lose condition.  It is an endless game.
 *
 */
import { logger, LogLevel } from '../lib/logger';

logger.setLogLevel(LogLevel.WARN);

type GameOptions = {
  gridSize: number;
  colors: number;
  tileSize: number;
  swapSpeed: number;
  fallSpeed: number;
  destroySpeed: number;
};

type Tile = {
  color: number;
  tileSprite: Phaser.GameObjects.Sprite;
  isEmpty: boolean;
};

const gameOptions: GameOptions = {
  gridSize: 7,
  colors: 6,
  tileSize: 100,
  swapSpeed: 200,
  fallSpeed: 100,
  destroySpeed: 200,
};

const HORIZONTAL = 1;
const VERTICAL = 2;

export class TileMatchGame extends Phaser.Scene {
  canPick: boolean;
  dragging: boolean;
  tileArray: Tile[][];
  poolArray: Phaser.GameObjects.Sprite[];
  tileGroup: Phaser.GameObjects.Group;
  selectedTile: Tile | null;
  // The number of tiles that are being swapped.
  swappingTiles: number;
  removeMap: number[][];

  constructor() {
    super('TileMatchGame');
  }

  preload() {
    this.load.spritesheet('tiles', 'assets/sprites/gems.png', {
      frameWidth: gameOptions.tileSize,
      frameHeight: gameOptions.tileSize,
    });
  }

  create() {
    logger.info('create');

    this.canPick = true;
    this.dragging = false;
    this.tileArray = [];
    this.poolArray = [];
    this.tileGroup = this.add.group();
    logger.info('Initializing tile grid');
    for (let i = 0; i < gameOptions.gridSize; i++) {
      this.tileArray[i] = [];
      for (let j = 0; j < gameOptions.gridSize; j++) {
        const sprite = this.add.sprite(
          gameOptions.tileSize * j + gameOptions.tileSize / 2,
          gameOptions.tileSize * i + gameOptions.tileSize / 2,
          'tiles',
        );
        this.tileGroup.add(sprite);
        do {
          const randomColor = Phaser.Math.Between(0, gameOptions.colors - 1);
          sprite.setFrame(randomColor);
          this.tileArray[i][j] = {
            color: randomColor,
            tileSprite: sprite,
            isEmpty: false,
          };
        } while (this.isMatch(i, j));
      }
    }
    logger.info(`Grid initialized, pool size: ${this.poolArray.length}`);
    this.selectedTile = null;
    this.input.on('pointerdown', this.tileSelect.bind(this));
    this.input.on('pointermove', this.startSwipe.bind(this));
    this.input.on('pointerup', this.stopSwipe.bind(this));
  }

  isMatch(row: number, col: number) {
    logger.info('isMatch', row, col);
    const result =
      this.isHorizontalMatch(row, col) || this.isVerticalMatch(row, col);
    logger.info('isMatch result', result);

    return result;
  }

  isHorizontalMatch(row: number, col: number) {
    logger.info('isHorizontalMatch', row, col);
    const tiles = [
      this.tileAt(row, col),
      this.tileAt(row, col - 1),
      this.tileAt(row, col - 2),
    ];

    if (tiles.some((tile) => tile === null)) {
      logger.info('isHorizontalMatch result', false);
      return false;
    }

    const colors = (tiles as Tile[]).map((tile) => tile.color);
    const result = colors.every((color) => color === colors[0]);

    logger.info('isHorizontalMatch result', result);

    return result;
  }

  isVerticalMatch(row: number, col: number) {
    logger.info('isVerticalMatch', row, col);

    const tiles = [
      this.tileAt(row, col),
      this.tileAt(row - 1, col),
      this.tileAt(row - 2, col),
    ];

    if (tiles.some((tile) => tile === null)) {
      logger.info('isVerticalMatch result', false);
      return false;
    }

    const colors = (tiles as Tile[]).map((tile) => tile.color);
    const result = colors.every((color) => color === colors[0]);

    logger.info('isVerticalMatch result', result);

    return result;
  }

  tileAt(row: number, col: number): Tile | null {
    if (
      row < 0 ||
      row >= gameOptions.gridSize ||
      col < 0 ||
      col >= gameOptions.gridSize
    ) {
      return null;
    }
    return this.tileArray[row][col];
  }

  tileSelect(pointer: Phaser.Input.Pointer) {
    if (this.canPick) {
      this.dragging = true;
      const row = Math.floor(pointer.y / gameOptions.tileSize);
      const col = Math.floor(pointer.x / gameOptions.tileSize);
      const pickedTile = this.tileAt(row, col);
      if (pickedTile !== null) {
        if (this.selectedTile === null) {
          pickedTile.tileSprite.setScale(1.2);
          pickedTile.tileSprite.setDepth(1);
          this.selectedTile = pickedTile;
        } else {
          if (this.areTheSame(pickedTile, this.selectedTile)) {
            this.selectedTile.tileSprite.setScale(1);
            this.selectedTile = null;
          } else {
            if (this.areNext(pickedTile, this.selectedTile)) {
              this.selectedTile.tileSprite.setScale(1);
              this.swapTiles(this.selectedTile, pickedTile, true);
            } else {
              this.selectedTile.tileSprite.setScale(1);
              pickedTile.tileSprite.setScale(1.2);
              this.selectedTile = pickedTile;
            }
          }
        }
      }
    }
  }

  startSwipe(pointer: Phaser.Input.Pointer) {
    if (this.dragging && this.selectedTile != null) {
      const deltaX = pointer.downX - pointer.x;
      const deltaY = pointer.downY - pointer.y;
      let deltaRow = 0;
      let deltaCol = 0;
      if (
        deltaX > gameOptions.tileSize / 2 &&
        Math.abs(deltaY) < gameOptions.tileSize / 4
      ) {
        deltaCol = -1;
      }
      if (
        deltaX < -gameOptions.tileSize / 2 &&
        Math.abs(deltaY) < gameOptions.tileSize / 4
      ) {
        deltaCol = 1;
      }
      if (
        deltaY > gameOptions.tileSize / 2 &&
        Math.abs(deltaX) < gameOptions.tileSize / 4
      ) {
        deltaRow = -1;
      }
      if (
        deltaY < -gameOptions.tileSize / 2 &&
        Math.abs(deltaX) < gameOptions.tileSize / 4
      ) {
        deltaRow = 1;
      }
      if (deltaRow + deltaCol != 0) {
        const pickedTile = this.tileAt(
          this.getTileRow(this.selectedTile) + deltaRow,
          this.getTileCol(this.selectedTile) + deltaCol,
        );
        if (pickedTile !== null) {
          this.selectedTile.tileSprite.setScale(1);
          this.swapTiles(this.selectedTile, pickedTile, true);
          this.dragging = false;
        }
      }
    }
  }

  stopSwipe() {
    this.dragging = false;
  }

  areTheSame(tile1: Tile, tile2: Tile) {
    return (
      this.getTileRow(tile1) == this.getTileRow(tile2) &&
      this.getTileCol(tile1) == this.getTileCol(tile2)
    );
  }

  getTileRow(tile: Tile) {
    return Math.floor(tile.tileSprite.y / gameOptions.tileSize);
  }

  getTileCol(tile: Tile) {
    return Math.floor(tile.tileSprite.x / gameOptions.tileSize);
  }

  areNext(tile1: Tile, tile2: Tile) {
    return (
      Math.abs(this.getTileRow(tile1) - this.getTileRow(tile2)) +
        Math.abs(this.getTileCol(tile1) - this.getTileCol(tile2)) ==
      1
    );
  }

  swapTiles(tile1: Tile, tile2: Tile, swapBack: boolean) {
    this.swappingTiles = 2;
    this.canPick = false;
    const fromColor = tile1.color;
    const fromSprite = tile1.tileSprite;
    const toColor = tile2.color;
    const toSprite = tile2.tileSprite;
    const tile1Row = this.getTileRow(tile1);
    const tile1Col = this.getTileCol(tile1);
    const tile2Row = this.getTileRow(tile2);
    const tile2Col = this.getTileCol(tile2);
    this.tileArray[tile1Row][tile1Col].color = toColor;
    this.tileArray[tile1Row][tile1Col].tileSprite = toSprite;
    this.tileArray[tile2Row][tile2Col].color = fromColor;
    this.tileArray[tile2Row][tile2Col].tileSprite = fromSprite;
    this.tweenTile(tile1, tile2, swapBack);
    this.tweenTile(tile2, tile1, swapBack);
  }

  tweenTile(tile1: Tile, tile2: Tile, swapBack: boolean) {
    const row = this.getTileRow(tile1);
    const col = this.getTileCol(tile1);
    this.tweens.add({
      targets: this.tileArray[row][col].tileSprite,
      x: col * gameOptions.tileSize + gameOptions.tileSize / 2,
      y: row * gameOptions.tileSize + gameOptions.tileSize / 2,
      duration: gameOptions.swapSpeed,
      callbackScope: this,
      onComplete: () => {
        this.swappingTiles--;
        if (this.swappingTiles == 0) {
          if (!this.matchInBoard() && swapBack) {
            this.swapTiles(tile1, tile2, false);
          } else {
            if (this.matchInBoard()) {
              this.handleMatches();
            } else {
              this.canPick = true;
              this.selectedTile = null;
            }
          }
        }
      },
    });
  }

  matchInBoard() {
    logger.info('matchInBoard');
    for (let i = 0; i < gameOptions.gridSize; i++) {
      for (let j = 0; j < gameOptions.gridSize; j++) {
        if (this.isMatch(i, j)) {
          logger.info('matchInBoard result', true);
          return true;
        }
      }
    }

    logger.info('matchInBoard result', false);
    return false;
  }

  handleMatches() {
    this.removeMap = [];
    for (let i = 0; i < gameOptions.gridSize; i++) {
      this.removeMap[i] = [];
      for (let j = 0; j < gameOptions.gridSize; j++) {
        this.removeMap[i].push(0);
      }
    }
    this.markMatches(HORIZONTAL);
    this.markMatches(VERTICAL);
    this.destroyMarkedTiles();
  }

  markMatches(direction: number) {
    logger.info('markMatches', direction);
    for (let i = 0; i < gameOptions.gridSize; i++) {
      let colorStreak = 1;
      let currentColor = -1;
      let startStreak = 0;
      for (let j = 0; j < gameOptions.gridSize; j++) {
        const tile =
          direction === HORIZONTAL ? this.tileAt(i, j) : this.tileAt(j, i);

        if (tile === null) {
          // If the tile is null, it means we are out of bounds or the tile is empty.
          // In either case, we should reset the streak.
          if (colorStreak >= 3) {
            for (let k = 0; k < colorStreak; k++) {
              if (direction === HORIZONTAL) {
                this.removeMap[i][startStreak + k]++;
              } else {
                this.removeMap[startStreak + k][i]++;
              }
            }
          }
          colorStreak = 1;
          currentColor = -1; // Reset current color to ensure new streak starts
          startStreak = j + 1; // Start streak from the next position
          continue;
        }

        const colorToWatch = tile.color;

        if (colorToWatch === currentColor) {
          colorStreak++;
        } else {
          if (colorStreak >= 3) {
            for (let k = 0; k < colorStreak; k++) {
              if (direction === HORIZONTAL) {
                this.removeMap[i][startStreak + k]++;
              } else {
                this.removeMap[startStreak + k][i]++;
              }
            }
          }
          startStreak = j;
          colorStreak = 1;
          currentColor = colorToWatch;
        }
      }
      // After the loop, check for any pending streak at the end of the row/column
      if (colorStreak >= 3) {
        for (let k = 0; k < colorStreak; k++) {
          if (direction === HORIZONTAL) {
            this.removeMap[i][startStreak + k]++;
          } else {
            this.removeMap[startStreak + k][i]++;
          }
        }
      }
    }
  }

  destroyMarkedTiles() {
    logger.info('destroyMarkedTiles');
    let destroyed = 0;
    let totalToDestroy = 0;

    // Count total tiles to destroy first
    for (let i = 0; i < gameOptions.gridSize; i++) {
      for (let j = 0; j < gameOptions.gridSize; j++) {
        if (this.removeMap[i][j] > 0) {
          totalToDestroy++;
        }
      }
    }

    logger.info('Total tiles to destroy:', totalToDestroy);

    if (totalToDestroy === 0) {
      logger.warn('No tiles to destroy, but destroyMarkedTiles was called');
      this.replenishField();
      return;
    }

    for (let i = 0; i < gameOptions.gridSize; i++) {
      for (let j = 0; j < gameOptions.gridSize; j++) {
        if (this.removeMap[i][j] > 0) {
          destroyed++;
          logger.info(
            `Destroying tile at (${i}, ${j}), destroyed count: ${destroyed}`,
          );
          this.tweens.add({
            targets: this.tileArray[i][j].tileSprite,
            alpha: 0.5,
            duration: gameOptions.destroySpeed,
            callbackScope: this,
            onComplete: () => {
              destroyed--;
              logger.info(
                `Tile destroyed animation complete, remaining: ${destroyed}`,
              );
              this.tileArray[i][j].tileSprite.visible = false;
              // Reset the sprite properties before adding to pool
              this.tileArray[i][j].tileSprite.alpha = 1;
              this.tileArray[i][j].tileSprite.x =
                gameOptions.tileSize * j + gameOptions.tileSize / 2;
              this.tileArray[i][j].tileSprite.y =
                gameOptions.tileSize * i + gameOptions.tileSize / 2;
              this.poolArray.push(this.tileArray[i][j].tileSprite);
              logger.info(
                `Sprite added to pool, pool size: ${this.poolArray.length}`,
              );
              if (destroyed == 0) {
                logger.info(
                  'All tiles destroyed, calling onAfterTilesDestroyed and replenishField',
                );
                this.onAfterTilesDestroyed();
                this.replenishField();
              }
            },
          });
          this.tileArray[i][j].isEmpty = true;
        }
      }
    }
  }

  onAfterTilesDestroyed() {
    logger.info('onAfterTilesDestroyed');
    let tilesMoved = 0;
    for (let j = 0; j < gameOptions.gridSize; j++) {
      for (let i = gameOptions.gridSize - 2; i >= 0; i--) {
        if (!this.tileArray[i][j].isEmpty) {
          const fallTiles = this.holesBelow(i, j);
          logger.info(`Tile at (${i}, ${j}) has ${fallTiles} holes below`);

          if (fallTiles > 0) {
            tilesMoved++;
            const tempTile = this.tileArray[i][j];
            this.tileArray[i + fallTiles][j] = tempTile;
            logger.info(
              `Moving tile from (${i}, ${j}) to (${i + fallTiles}, ${j})`,
            );
            this.tweens.add({
              targets: tempTile.tileSprite,
              y: tempTile.tileSprite.y + fallTiles * gameOptions.tileSize,
              duration: gameOptions.fallSpeed * fallTiles,
            });
            // Create an empty tile at the original position
            this.tileArray[i][j] = {
              color: 0, // Placeholder, will be replaced by new tiles
              tileSprite: this.add.sprite(0, 0, 'tiles'), // Create a new sprite for the empty space
              isEmpty: true,
            };
            // Hide the new sprite since it's empty
            this.tileArray[i][j].tileSprite.visible = false;
          }
        }
      }
    }
    logger.info(`onAfterTilesDestroyed completed, moved ${tilesMoved} tiles`);
  }

  holesBelow(row: number, col: number) {
    let result = 0;
    for (let i = row + 1; i < gameOptions.gridSize; i++) {
      if (this.tileArray[i][col].isEmpty) {
        result++;
      }
    }
    return result;
  }

  replenishField() {
    logger.info('replenishField called');
    let replenished = 0;
    let totalEmptySpots = 0;

    // Count total empty spots first
    for (let j = 0; j < gameOptions.gridSize; j++) {
      const emptySpots = this.holesInCol(j);
      totalEmptySpots += emptySpots;
    }

    logger.info(
      `Total empty spots to replenish: ${totalEmptySpots}, pool size: ${this.poolArray.length}`,
    );

    if (totalEmptySpots === 0) {
      logger.info('No empty spots to replenish, enabling picking');
      this.canPick = true;
      this.selectedTile = null;
      return;
    }

    for (let j = 0; j < gameOptions.gridSize; j++) {
      const emptySpots = this.holesInCol(j);
      logger.info(`Column ${j} has ${emptySpots} empty spots`);
      if (emptySpots > 0) {
        for (let i = 0; i < emptySpots; i++) {
          replenished++;
          logger.info(
            `Replenishing position (${i}, ${j}), replenished count: ${replenished}`,
          );
          const randomColor = Phaser.Math.Between(0, gameOptions.colors - 1);
          const newTileSprite = this.poolArray.pop();
          logger.info(`Got sprite from pool: ${newTileSprite !== undefined}`);
          if (newTileSprite) {
            this.tileArray[i][j].color = randomColor;
            this.tileArray[i][j].tileSprite = newTileSprite;
            this.tileArray[i][j].tileSprite.setFrame(randomColor);
            this.tileArray[i][j].tileSprite.visible = true;
            this.tileArray[i][j].tileSprite.x =
              gameOptions.tileSize * j + gameOptions.tileSize / 2;
            this.tileArray[i][j].tileSprite.y =
              gameOptions.tileSize / 2 -
              (emptySpots - i) * gameOptions.tileSize;
            this.tileArray[i][j].tileSprite.alpha = 1;
            this.tileArray[i][j].isEmpty = false;
            this.tweens.add({
              targets: this.tileArray[i][j].tileSprite,
              y: gameOptions.tileSize * i + gameOptions.tileSize / 2,
              duration: gameOptions.fallSpeed * emptySpots,
              callbackScope: this,
              onComplete: () => {
                replenished--;
                logger.info(
                  `Replenish animation complete, remaining: ${replenished}`,
                );
                if (replenished === 0) {
                  logger.info(
                    'All tiles replenished, checking for new matches',
                  );
                  if (this.matchInBoard()) {
                    this.time.addEvent({
                      delay: 250,
                      callback: this.handleMatches.bind(this),
                    });
                  } else {
                    logger.info('No new matches, enabling picking');
                    this.canPick = true;
                    this.selectedTile = null;
                  }
                }
              },
            });
          } else {
            logger.warn('Pool array is empty, cannot replenish tile.');
            replenished--; // Decrement to avoid blocking completion if pool is empty
          }
        }
      }
    }
  }

  holesInCol(col: number) {
    let result = 0;
    for (let i = 0; i < gameOptions.gridSize; i++) {
      if (this.tileArray[i][col].isEmpty) {
        result++;
      }
    }
    return result;
  }
}
