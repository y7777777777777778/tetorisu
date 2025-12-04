/* js/tetris.js
   改良点:
   - キーボード / タッチ / ボタン対応
   - スコア・レベル・ハイスコア(localStorage)
   - ドロップ速度（レベルに応じて加速）
   - Pause/Restart 追加
   - 不具合修正（負の行チェック、spawn位置、next描画）
*/
class Tetris {
  constructor(opts = {}) {
    // stage size (cells)
    this.stageWidth = 10;
    this.stageHeight = 20;

    // elements
    this.stageCanvas = document.getElementById("stage");
    this.nextCanvas = document.getElementById("next");
    this.linesElem = document.getElementById("lines");
    this.scoreElem = document.getElementById("score");
    this.levelElem = document.getElementById("level");
    this.messageElem = document.getElementById("message");
    this.btnPause = document.getElementById("btn-pause");
    this.btnRestart = document.getElementById("btn-restart");

    // canvas pixel dims (ensure numeric)
    this.stageCanvas.width = Number(this.stageCanvas.getAttribute("width")) || 200;
    this.stageCanvas.height = Number(this.stageCanvas.getAttribute("height")) || 400;
    this.nextCanvas.width = Number(this.nextCanvas.getAttribute("width")) || 120;
    this.nextCanvas.height = Number(this.nextCanvas.getAttribute("height")) || 120;

    // cell size uses smaller of width/height per stage
    let cellWidth = this.stageCanvas.width / this.stageWidth;
    let cellHeight = this.stageCanvas.height / this.stageHeight;
    this.cellSize = Math.floor(Math.min(cellWidth, cellHeight));
    this.stageLeftPadding = Math.floor((this.stageCanvas.width - this.cellSize * this.stageWidth) / 2);
    this.stageTopPadding = Math.floor((this.stageCanvas.height - this.cellSize * this.stageHeight) / 2);

    // game data
    this.blocks = this.createBlocks();
    this.deletedLines = 0;
    this.score = 0;
    this.level = 1;
    this.dropInterval = 500; // ms base
    this.dropAccumulator = 0;
    this.lastTime = 0;
    this.paused = false;
    this.gameOver = false;

    // input bindings
    this.bindInputs();

    // UI buttons
    this.btnPause.addEventListener("click", () => this.togglePause());
    this.btnRestart.addEventListener("click", () => this.restart());

    // mobile buttons
    this.bindButtonTouch("tetris-move-left-button", () => this.moveLeft());
    this.bindButtonTouch("tetris-rotate-button", () => this.rotate());
    this.bindButtonTouch("tetris-move-right-button", () => this.moveRight());
    this.bindButtonTouch("tetris-fall-button", () => this.softDrop());

    // load highscore
    this.highScore = Number(localStorage.getItem("tetris_highscore") || 0);

    // start
    this.startGame();
  }

  /* ---------- blocks ---------- */
  createBlocks() {
    return [
      // I
      {
        shape: [
          [[-1, 0], [0, 0], [1, 0], [2, 0]],
          [[0, -1], [0, 0], [0, 1], [0, 2]],
          [[-1, 0], [0, 0], [1, 0], [2, 0]],
          [[0, -1], [0, 0], [0, 1], [0, 2]]
        ],
        color: "rgb(0, 255, 255)",
        highlight: "rgba(255,255,255,0.9)",
        shadow: "rgba(0,128,128,0.9)"
      },
      // O
      {
        shape: new Array(4).fill([[0, 0], [1, 0], [0, 1], [1, 1]]),
        color: "rgb(255, 255, 0)",
        highlight: "rgba(255,255,255,0.9)",
        shadow: "rgba(128,128,0,0.9)"
      },
      // S
      {
        shape: [
          [[0, 0], [1, 0], [-1, 1], [0, 1]],
          [[-1, -1], [-1, 0], [0, 0], [0, 1]],
          [[0, 0], [1, 0], [-1, 1], [0, 1]],
          [[-1, -1], [-1, 0], [0, 0], [0, 1]]
        ],
        color: "rgb(0, 255, 0)",
        highlight: "rgba(255,255,255,0.9)",
        shadow: "rgba(0,128,0,0.9)"
      },
      // Z (mirrored)
      {
        shape: [
          [[-1, 0], [0, 0], [0, 1], [1, 1]],
          [[0, -1], [-1, 0], [0, 0], [-1, 1]],
          [[-1, 0], [0, 0], [0, 1], [1, 1]],
          [[0, -1], [-1, 0], [0, 0], [-1, 1]]
        ],
        color: "rgb(255, 0, 0)",
        highlight: "rgba(255,255,255,0.9)",
        shadow: "rgba(128,0,0,0.9)"
      },
      // J
      {
        shape: [
          [[-1, -1], [-1, 0], [0, 0], [1, 0]],
          [[0, -1], [1, -1], [0, 0], [0, 1]],
          [[-1, 0], [0, 0], [1, 0], [1, 1]],
          [[0, -1], [0, 0], [-1, 1], [0, 1]]
        ],
        color: "rgb(0, 0, 255)",
        highlight: "rgba(255,255,255,0.9)",
        shadow: "rgba(0,0,128,0.9)"
      },
      // L
      {
        shape: [
          [[1, -1], [-1, 0], [0, 0], [1, 0]],
          [[0, -1], [0, 0], [0, 1], [1, 1]],
          [[-1, 0], [0, 0], [1, 0], [-1, 1]],
          [[-1, -1], [0, -1], [0, 0], [0, 1]]
        ],
        color: "rgb(255, 165, 0)",
        highlight: "rgba(255,255,255,0.9)",
        shadow: "rgba(128,82,0,0.9)"
      },
      // T
      {
        shape: [
          [[0, -1], [-1, 0], [0, 0], [1, 0]],
          [[0, -1], [0, 0], [1, 0], [0, 1]],
          [[-1, 0], [0, 0], [1, 0], [0, 1]],
          [[0, -1], [-1, 0], [0, 0], [0, 1]]
        ],
        color: "rgb(255, 0, 255)",
        highlight: "rgba(255,255,255,0.9)",
        shadow: "rgba(128,0,128,0.9)"
      }
    ];
  }

  /* ---------- game lifecycle ---------- */
  startGame() {
    // virtual stage: width x height (x is column)
    const virtualStage = new Array(this.stageWidth);
    for (let x = 0; x < this.stageWidth; x++) {
      virtualStage[x] = new Array(this.stageHeight).fill(null);
    }
    this.virtualStage = virtualStage;

    this.deletedLines = 0;
    this.score = 0;
    this.level = 1;
    this.dropInterval = 500;
    this.messageElem.innerText = "";
    this.gameOver = false;
    this.paused = false;

    this.currentBlock = null;
    this.nextBlock = this.getRandomBlock();
    this.spawnBlock();

    // start animation loop
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  restart() {
    this.clear(this.stageCanvas);
    this.clear(this.nextCanvas);
    this.startGame();
  }

  togglePause() {
    if (this.gameOver) return;
    this.paused = !this.paused;
    this.btnPause.setAttribute("aria-pressed", String(this.paused));
    this.messageElem.innerText = this.paused ? "PAUSED" : "";
    if (!this.paused) {
      // resume timing
      this.lastTime = performance.now();
    }
  }

  loop(time) {
    if (this.paused || this.gameOver) {
      requestAnimationFrame((t) => this.loop(t));
      return;
    }
    const delta = time - this.lastTime;
    this.lastTime = time;
    this.dropAccumulator += delta;

    // level adjusts dropInterval (faster at higher level)
    const effectiveInterval = Math.max(80, this.dropInterval - (this.level - 1) * 40);

    if (this.dropAccumulator >= effectiveInterval) {
      this.dropAccumulator = 0;
      this.update();
    }
    // draw each frame to keep UI responsive
    this.drawStage();
    if (this.currentBlock != null) {
      this.drawBlock(
        this.stageLeftPadding + this.blockX * this.cellSize,
        this.stageTopPadding + this.blockY * this.cellSize,
        this.currentBlock,
        this.blockAngle,
        this.stageCanvas
      );
    }
    requestAnimationFrame((t) => this.loop(t));
  }

  update() {
    if (!this.currentBlock) {
      if (!this.createNewBlock()) {
        // game over
        this.gameOver = true;
        this.messageElem.innerText = "GAME OVER";
        this.saveHighScore();
        return;
      }
    } else {
      this.fallBlock();
    }
    this.drawNextBlock();
    this.updateUI();
  }

  spawnBlock() {
    this.currentBlock = this.nextBlock;
    this.nextBlock = this.getRandomBlock();
    // center spawn (ensure within bounds)
    this.blockX = Math.floor(this.stageWidth / 2) - 1;
    this.blockY = -1; // spawn slightly above so pieces can enter
    this.blockAngle = 0;
    this.drawNextBlock();
  }

  createNewBlock() {
    this.spawnBlock();
    if (!this.checkBlockMove(this.blockX, this.blockY, this.currentBlock, this.blockAngle)) {
      return false;
    }
    return true;
  }

  /* ---------- random ---------- */
  getRandomBlock() {
    return Math.floor(Math.random() * this.blocks.length);
  }

  /* ---------- drawing helpers ---------- */
  clear(canvas) {
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  drawCell(context, cellX, cellY, cellSize, type) {
    const block = this.blocks[type];
    const adjustedX = Math.floor(cellX) + 0.5;
    const adjustedY = Math.floor(cellY) + 0.5;
    const adjustedSize = Math.max(1, Math.floor(cellSize) - 1);

    // base
    context.fillStyle = block.color;
    context.fillRect(adjustedX, adjustedY, adjustedSize, adjustedSize);

    // highlight (top-left)
    context.strokeStyle = block.highlight;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(adjustedX, adjustedY + adjustedSize);
    context.lineTo(adjustedX, adjustedY);
    context.lineTo(adjustedX + adjustedSize, adjustedY);
    context.stroke();

    // shadow (bottom-right)
    context.strokeStyle = block.shadow;
    context.beginPath();
    context.moveTo(adjustedX, adjustedY + adjustedSize);
    context.lineTo(adjustedX + adjustedSize, adjustedY + adjustedSize);
    context.lineTo(adjustedX + adjustedSize, adjustedY);
    context.stroke();
  }

  drawBlock(x, y, type, angle, canvas) {
    const ctx = canvas.getContext("2d");
    const block = this.blocks[type];
    for (let i = 0; i < block.shape[angle].length; i++) {
      const cell = block.shape[angle][i];
      const px = x + cell[0] * this.cellSize;
      const py = y + cell[1] * this.cellSize;
      this.drawCell(ctx, px, py, this.cellSize, type);
    }
  }

  drawStage() {
    this.clear(this.stageCanvas);
    const ctx = this.stageCanvas.getContext("2d");
    for (let x = 0; x < this.virtualStage.length; x++) {
      for (let y = 0; y < this.virtualStage[x].length; y++) {
        const t = this.virtualStage[x][y];
        if (t != null) {
          this.drawCell(
            ctx,
            this.stageLeftPadding + x * this.cellSize,
            this.stageTopPadding + y * this.cellSize,
            this.cellSize,
            t
          );
        }
      }
    }
  }

  drawNextBlock() {
    this.clear(this.nextCanvas);
    // center next block in nextCanvas
    const ctx = this.nextCanvas.getContext("2d");
    // compute offset to roughly center (2 cell offset)
    const offsetX = (this.nextCanvas.width - this.cellSize * 4) / 2 + this.cellSize;
    const offsetY = (this.nextCanvas.height - this.cellSize * 4) / 2 + this.cellSize;
    this.drawBlock(offsetX, offsetY, this.nextBlock, 0, this.nextCanvas);
  }

  /* ---------- collision & fix ---------- */
  checkBlockMove(x, y, type, angle) {
    const shape = this.blocks[type].shape[angle];
    for (let i = 0; i < shape.length; i++) {
      const cellX = x + shape[i][0];
      const cellY = y + shape[i][1];

      // out of horizontal bounds
      if (cellX < 0 || cellX > this.stageWidth - 1) return false;
      // below bottom
      if (cellY > this.stageHeight - 1) return false;
      // above top: allowed (piece falling in)
      if (cellY < 0) continue;
      // check collision with existing cells
      if (this.virtualStage[cellX][cellY] != null) return false;
    }
    return true;
  }

  fixBlock(x, y, type, angle) {
    const shape = this.blocks[type].shape[angle];
    for (let i = 0; i < shape.length; i++) {
      const cellX = x + shape[i][0];
      const cellY = y + shape[i][1];
      if (cellY >= 0 && cellY < this.stageHeight && cellX >= 0 && cellX < this.stageWidth) {
        this.virtualStage[cellX][cellY] = type;
      }
    }
    this.clearFullLines();
  }

  clearFullLines() {
    let linesCleared = 0;
    for (let y = this.stageHeight - 1; y >= 0; y--) {
      let filled = true;
      for (let x = 0; x < this.stageWidth; x++) {
        if (this.virtualStage[x][y] == null) {
          filled = false;
          break;
        }
      }
      if (filled) {
        linesCleared++;
        // shift down
        for (let y2 = y; y2 > 0; y2--) {
          for (let x = 0; x < this.stageWidth; x++) {
            this.virtualStage[x][y2] = this.virtualStage[x][y2 - 1];
          }
        }
        // clear top row
        for (let x = 0; x < this.stageWidth; x++) {
          this.virtualStage[x][0] = null;
        }
        y++; // re-check same row index after shift
      }
    }

    if (linesCleared > 0) {
      // scoring (classic-ish)
      const scoreMap = {1: 100, 2: 300, 3: 500, 4: 800};
      this.score += scoreMap[linesCleared] || linesCleared * 200;
      this.deletedLines += linesCleared;

      // level up every 10 lines
      const newLevel = Math.floor(this.deletedLines / 10) + 1;
      if (newLevel > this.level) {
        this.level = newLevel;
      }
      this.updateUI();
    }
  }

  /* ---------- movement / rotation ---------- */
  fallBlock() {
    if (this.checkBlockMove(this.blockX, this.blockY + 1, this.currentBlock, this.blockAngle)) {
      this.blockY++;
    } else {
      // fix in place
      this.fixBlock(this.blockX, this.blockY, this.currentBlock, this.blockAngle);
      // spawn next
      this.currentBlock = null;
      this.nextBlock = this.nextBlock; // no-op but explicit
    }
  }

  softDrop() {
    // single step fall (called by button)
    if (this.currentBlock && this.checkBlockMove(this.blockX, this.blockY + 1, this.currentBlock, this.blockAngle)) {
      this.blockY++;
      this.score += 1;
      this.updateUI();
    } else if (this.currentBlock) {
      // fix if can't fall
      this.fixBlock(this.blockX, this.blockY, this.currentBlock, this.blockAngle);
      this.currentBlock = null;
    }
  }

  hardDrop() {
    if (!this.currentBlock) return;
    while (this.checkBlockMove(this.blockX, this.blockY + 1, this.currentBlock, this.blockAngle)) {
      this.blockY++;
      this.score += 2;
    }
    this.fixBlock(this.blockX, this.blockY, this.currentBlock, this.blockAngle);
    this.currentBlock = null;
    this.updateUI();
  }

  moveLeft() {
    if (!this.currentBlock) return;
    if (this.checkBlockMove(this.blockX - 1, this.blockY, this.currentBlock, this.blockAngle)) {
      this.blockX--;
    }
  }

  moveRight() {
    if (!this.currentBlock) return;
    if (this.checkBlockMove(this.blockX + 1, this.blockY, this.currentBlock, this.blockAngle)) {
      this.blockX++;
    }
  }

  rotate() {
    if (!this.currentBlock) return;
    const newAngle = (this.blockAngle + 1) % 4;
    // simple wall-kick: try left/right shift
    if (this.checkBlockMove(this.blockX, this.blockY, this.currentBlock, newAngle)) {
      this.blockAngle = newAngle;
      return;
    }
    if (this.checkBlockMove(this.blockX - 1, this.blockY, this.currentBlock, newAngle)) {
      this.blockX -= 1;
      this.blockAngle = newAngle;
      return;
    }
    if (this.checkBlockMove(this.blockX + 1, this.blockY, this.currentBlock, newAngle)) {
      this.blockX += 1;
      this.blockAngle = newAngle;
      return;
    }
  }

  /* ---------- UI / storage ---------- */
  updateUI() {
    this.linesElem.innerText = String(this.deletedLines);
    this.scoreElem.innerText = String(this.score);
    this.levelElem.innerText = String(this.level);
  }

  saveHighScore() {
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem("tetris_highscore", String(this.highScore));
      this.messageElem.innerText = `NEW HIGH SCORE: ${this.highScore}`;
    } else {
      this.messageElem.innerText = `GAME OVER (HS ${this.highScore})`;
    }
  }

  /* ---------- input handling ---------- */
  bindInputs() {
    window.addEventListener("keydown", (e) => {
      if (e.repeat) {
        // allow key repeat for move left/right by holding - we still handle here
      }
      if (e.code === "ArrowLeft") {
        this.moveLeft();
      } else if (e.code === "ArrowRight") {
        this.moveRight();
      } else if (e.code === "ArrowUp") {
        this.rotate();
      } else if (e.code === "ArrowDown") {
        this.softDrop();
      } else if (e.code === "Space") {
        e.preventDefault();
        this.hardDrop();
      } else if (e.code === "KeyP") {
        this.togglePause();
      }
    }, {passive:false});
    // prevent touch scrolling interfering
    window.addEventListener("touchmove", (ev) => { if (ev.target.closest(".mobile-controller")) ev.preventDefault(); }, {passive:false});
  }

  bindButtonTouch(id, fn) {
    const el = document.getElementById(id);
    if (!el) return;
    let pressed = false;
    const down = (e) => {
      e.preventDefault();
      pressed = true;
      el.classList.add("active");
      fn();
    };
    const up = (e) => {
      pressed = false;
      el.classList.remove("active");
    };
    el.addEventListener("touchstart", down, {passive:false});
    el.addEventListener("mousedown", down);
    window.addEventListener("touchend", up, {passive:false});
    window.addEventListener("mouseup", up);
  }
}

/* ---------- init ---------- */
// use a short delay to ensure DOM ready (or rely on module script)
window.addEventListener("load", () => {
  window.tetris = new Tetris();
});
