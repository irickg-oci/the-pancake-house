const { useEffect, useLayoutEffect, useRef, useState } = React;
const h = React.createElement;

const PLAYER = "X";
const COMPUTER = "O";
const MIN_VIEWPORT_WIDTH = 400;
const MIN_VIEWPORT_HEIGHT = 300;
const VIEWPORT_GUTTER = 32;
const WINNING_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

function getResult(board) {
  for (const line of WINNING_LINES) {
    const [first, second, third] = line;

    if (
      board[first] &&
      board[first] === board[second] &&
      board[first] === board[third]
    ) {
      return { winner: board[first], line };
    }
  }

  return board.every(Boolean)
    ? { winner: "draw", line: [] }
    : { winner: null, line: [] };
}

function scorePosition(board, isComputerTurn, depth) {
  const { winner } = getResult(board);

  if (winner === COMPUTER) return 10 - depth;
  if (winner === PLAYER) return depth - 10;
  if (winner === "draw") return 0;

  const scores = [];

  board.forEach((square, index) => {
    if (square) return;

    const nextBoard = [...board];
    nextBoard[index] = isComputerTurn ? COMPUTER : PLAYER;
    scores.push(scorePosition(nextBoard, !isComputerTurn, depth + 1));
  });

  return isComputerTurn ? Math.max(...scores) : Math.min(...scores);
}

function findBestMove(board) {
  let bestScore = -Infinity;
  let bestMove = -1;

  board.forEach((square, index) => {
    if (square) return;

    const nextBoard = [...board];
    nextBoard[index] = COMPUTER;
    const score = scorePosition(nextBoard, false, 0);

    if (score > bestScore) {
      bestScore = score;
      bestMove = index;
    }
  });

  return bestMove;
}

function Game() {
  const [board, setBoard] = useState(Array(9).fill(null));
  const [turn, setTurn] = useState(PLAYER);
  const [layout, setLayout] = useState({ height: 672, scale: 1, width: 440 });
  const gameRef = useRef(null);
  const result = getResult(board);

  useLayoutEffect(() => {
    function fitGameToViewport() {
      const game = gameRef.current;
      if (!game) return;

      const width = game.offsetWidth;
      const height = game.offsetHeight;
      const availableWidth =
        Math.max(window.innerWidth, MIN_VIEWPORT_WIDTH) - VIEWPORT_GUTTER;
      const availableHeight =
        Math.max(window.innerHeight, MIN_VIEWPORT_HEIGHT) - VIEWPORT_GUTTER;
      const scale = Math.min(
        1,
        availableWidth / width,
        availableHeight / height,
      );

      setLayout((currentLayout) => {
        if (
          currentLayout.height === height &&
          currentLayout.scale === scale &&
          currentLayout.width === width
        ) {
          return currentLayout;
        }

        return { height, scale, width };
      });
    }

    fitGameToViewport();
    window.addEventListener("resize", fitGameToViewport);

    return () => window.removeEventListener("resize", fitGameToViewport);
  }, []);

  useEffect(() => {
    if (turn !== COMPUTER || result.winner) return undefined;

    const timer = window.setTimeout(() => {
      const move = findBestMove(board);

      if (move !== -1) {
        setBoard((currentBoard) => {
          const nextBoard = [...currentBoard];
          nextBoard[move] = COMPUTER;
          return nextBoard;
        });
        setTurn(PLAYER);
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [board, result.winner, turn]);

  function playSquare(index) {
    if (turn !== PLAYER || board[index] || result.winner) return;

    const nextBoard = [...board];
    nextBoard[index] = PLAYER;
    setBoard(nextBoard);
    setTurn(COMPUTER);
  }

  function restart() {
    setBoard(Array(9).fill(null));
    setTurn(PLAYER);
  }

  let status = "Your turn";

  if (turn === COMPUTER) status = "Computer is thinking…";
  if (result.winner === PLAYER) status = "You won!";
  if (result.winner === COMPUTER) status = "Computer wins";
  if (result.winner === "draw") status = "It’s a draw";

  const squares = board.map((mark, index) => {
    const classes = ["square"];

    if (mark === COMPUTER) classes.push("o");
    if (result.line.includes(index)) classes.push("winner");

    return h(
      "button",
      {
        "aria-label": mark
          ? `Square ${index + 1}: ${mark}`
          : `Square ${index + 1}: empty`,
        className: classes.join(" "),
        disabled: Boolean(mark) || turn !== PLAYER || Boolean(result.winner),
        key: index,
        onClick: () => playSquare(index),
        type: "button",
      },
      mark,
    );
  });

  return h(
    "div",
    {
      className: "game-frame",
      style: {
        "--game-scale": layout.scale,
        height: `${layout.height * layout.scale}px`,
        width: `${layout.width * layout.scale}px`,
      },
    },
    h(
      "section",
      { className: "game", ref: gameRef },
      h("p", { className: "eyebrow" }, "You vs. computer"),
      h("h1", null, "Tic Tac Toe"),
      h("p", { className: "legend" }, "You are X. The computer is O."),
      h("p", { "aria-live": "polite", className: "status" }, status),
      h(
        "div",
        { "aria-label": "Tic Tac Toe board", className: "board" },
        squares,
      ),
      h(
        "button",
        { className: "restart", onClick: restart, type: "button" },
        "Start over",
      ),
    ),
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(h(Game));
