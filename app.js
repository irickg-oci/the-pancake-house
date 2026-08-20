const { useEffect, useLayoutEffect, useRef, useState } = React;
const h = React.createElement;

const PLAYER = "X";
const COMPUTER = "O";
const MIN_VIEWPORT_WIDTH = 400;
const MIN_VIEWPORT_HEIGHT = 300;
const VIEWPORT_GUTTER = 32;
const MISTAKE_CHANCE_PER_LEVEL = 0.2;
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

function findBestMove(board, mistakeChance = 0, random = Math.random) {
  const moves = [];

  board.forEach((square, index) => {
    if (square) return;

    const nextBoard = [...board];
    nextBoard[index] = COMPUTER;
    const score = scorePosition(nextBoard, false, 0);
    moves.push({ index, score });
  });

  if (moves.length === 0) return -1;

  const bestScore = Math.max(...moves.map((move) => move.score));
  const mistakes = moves.filter((move) => move.score < bestScore);

  if (
    mistakeChance > 0 &&
    mistakes.length > 0 &&
    random() < mistakeChance
  ) {
    return mistakes[Math.floor(random() * mistakes.length)].index;
  }

  return moves.find((move) => move.score === bestScore).index;
}

function Game() {
  const [board, setBoard] = useState(Array(9).fill(null));
  const [turn, setTurn] = useState(PLAYER);
  const [dopamine, setDopamine] = useState(0);
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
      const move = findBestMove(
        board,
        dopamine * MISTAKE_CHANCE_PER_LEVEL,
      );

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
  }, [board, dopamine, result.winner, turn]);

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

    if (result.line.includes(index)) classes.push("winner");

    let label = `Square ${index + 1}: empty`;
    let piece = null;

    if (mark === PLAYER) {
      label = `Square ${index + 1}: your blueberry pancakes`;
      piece = h("img", {
        alt: "",
        className: "piece",
        draggable: false,
        src: "assets/blueberry-pancakes.png",
      });
    }

    if (mark === COMPUTER) {
      label = `Square ${index + 1}: computer's butter pancakes`;
      piece = h("img", {
        alt: "",
        className: "piece",
        draggable: false,
        src: "assets/butter-pancakes.png",
      });
    }

    return h(
      "button",
      {
        "aria-label": label,
        className: classes.join(" "),
        disabled: Boolean(mark) || turn !== PLAYER || Boolean(result.winner),
        key: index,
        onClick: () => playSquare(index),
        type: "button",
      },
      piece,
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
      h("h1", null, "Pancake Wars"),
      h(
        "p",
        { className: "legend" },
        "You have blueberries. The computer has extra butter.",
      ),
      h("p", { "aria-live": "polite", className: "status" }, status),
      h(
        "div",
        { "aria-label": "Pancake Wars board", className: "board" },
        squares,
      ),
      h(
        "div",
        { className: "dopamine-control" },
        h(
          "div",
          { className: "dopamine-header" },
          h("label", { htmlFor: "dopamine" }, "Dopamine"),
          h(
            "output",
            { htmlFor: "dopamine", id: "dopamine-value" },
            `${dopamine} · ${dopamine * 20}% mistakes`,
          ),
        ),
        h(
          "div",
          { className: "dopamine-scale" },
          h(
            "span",
            { "aria-label": "Level 0: no mistakes", className: "dopamine-face" },
            "☹️",
          ),
          h("input", {
            "aria-describedby": "dopamine-value",
            "aria-valuetext": `Level ${dopamine}, ${dopamine * 20}% mistake chance`,
            id: "dopamine",
            max: 5,
            min: 0,
            onChange: (event) => setDopamine(Number(event.target.value)),
            step: 1,
            type: "range",
            value: dopamine,
          }),
          h(
            "span",
            {
              "aria-label": "Level 5: always makes a mistake when possible",
              className: "dopamine-face",
            },
            "😁",
          ),
        ),
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
