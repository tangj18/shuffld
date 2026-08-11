import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";

/* ------------------------------------------------------------------ *
 * Generated default image — an icy crystalline shard field.
 * Kept generic (no copyrighted characters); load your own via the
 * "Load image" button or by dropping a file onto the board.
 * ------------------------------------------------------------------ */
const DEFAULT_SVG = `
<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='700' viewBox='0 0 1200 700'>
  <defs>
    <radialGradient id='bg' cx='34%' cy='38%' r='85%'>
      <stop offset='0%' stop-color='#173a5e'/>
      <stop offset='52%' stop-color='#0b1830'/>
      <stop offset='100%' stop-color='#04060e'/>
    </radialGradient>
    <linearGradient id='ice' x1='0' y1='0' x2='1' y2='1'>
      <stop offset='0%' stop-color='#dff4ff'/>
      <stop offset='45%' stop-color='#6cc0ff'/>
      <stop offset='100%' stop-color='#255cff'/>
    </linearGradient>
    <linearGradient id='ice2' x1='0' y1='1' x2='1' y2='0'>
      <stop offset='0%' stop-color='#2a6bff'/>
      <stop offset='100%' stop-color='#bfeaff'/>
    </linearGradient>
    <filter id='glow' x='-40%' y='-40%' width='180%' height='180%'>
      <feGaussianBlur stdDeviation='9' result='b'/>
      <feMerge><feMergeNode in='b'/><feMergeNode in='SourceGraphic'/></feMerge>
    </filter>
  </defs>
  <rect width='1200' height='700' fill='url(#bg)'/>
  <g opacity='0.9' filter='url(#glow)'>
    <polygon points='250,150 470,90 560,430 300,520 190,330' fill='url(#ice)' opacity='0.92'/>
    <polygon points='560,430 470,90 690,210 660,470' fill='url(#ice2)' opacity='0.8'/>
    <polygon points='700,300 900,180 1010,420 830,560 690,480' fill='url(#ice)' opacity='0.55'/>
    <polygon points='120,470 300,520 260,650 90,600' fill='url(#ice2)' opacity='0.5'/>
    <polygon points='900,120 1080,90 1130,300 950,320' fill='url(#ice)' opacity='0.4'/>
  </g>
  <g stroke='#dff4ff' stroke-width='2' opacity='0.5' filter='url(#glow)'>
    <line x1='180' y1='360' x2='1120' y2='120'/>
    <line x1='60' y1='560' x2='980' y2='420'/>
  </g>
  <g fill='#eaf7ff'>
    <circle cx='330' cy='210' r='4' opacity='0.9'/>
    <circle cx='620' cy='150' r='3' opacity='0.8'/>
    <circle cx='780' cy='420' r='5' opacity='0.7'/>
    <circle cx='980' cy='250' r='3' opacity='0.9'/>
    <circle cx='450' cy='500' r='4' opacity='0.6'/>
    <circle cx='150' cy='300' r='3' opacity='0.7'/>
    <circle cx='1060' cy='470' r='4' opacity='0.6'/>
    <circle cx='700' cy='600' r='3' opacity='0.8'/>
    <circle cx='860' cy='120' r='2.5' opacity='0.9'/>
    <circle cx='520' cy='330' r='2.5' opacity='0.9'/>
  </g>
</svg>`;

const DEFAULT_IMAGE = `data:image/svg+xml,${encodeURIComponent(DEFAULT_SVG.trim())}`;
const DEFAULT_ASPECT = 1200 / 700;

const PRESETS = [
  { rows: 3, cols: 4 },
  { rows: 3, cols: 5 },
  { rows: 4, cols: 4 },
  { rows: 4, cols: 5 },
  { rows: 4, cols: 6 },
  { rows: 5, cols: 5 },
];

const SPLASH_ROOT = "/lol-splashes";

const slug = (value) =>
  String(value)
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");

const getSplashPath = (champion, skinNumber, skinName) => {
  const filename = `${String(skinNumber).padStart(2, "0")}_${slug(skinName)}.webp`;

  return `${SPLASH_ROOT}/${slug(champion)}/${filename}`;
};

const loadSplashLibrary = async () => {
  const response = await fetch(`${SPLASH_ROOT}/manifest.json`);

  if (!response.ok) {
    throw new Error(`Could not load manifest.json (HTTP ${response.status})`);
  }

  const manifest = await response.json();

  if (!Array.isArray(manifest.skins)) {
    throw new Error("manifest.json does not contain a skins array.");
  }

  return manifest.skins
    .map((skin) => ({
      title: `${skin.champion} — ${skin.name}`,
      url: getSplashPath(skin.champion, skin.num, skin.name),
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
};
// UTC date key so every player sees the same splash at the same moment,
// regardless of timezone. Rolls over at 00:00 UTC.
const dayKey = (date = new Date()) => date.toISOString().slice(0, 10);

// FNV-1a — small, stable, and gives a well-spread index from the date string.
const hashString = (str) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

// `library` is sorted by title, so the same index means the same splash for
// everyone loading the same manifest.
const pickDailyImage = (library, key = dayKey()) =>
  library.length ? library[hashString(key) % library.length] : null;

// mulberry32 — a given seed always replays the same sequence, so the daily
// scramble is identical for every player instead of per-load random.
const makeRng = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// Grid size is part of the seed: switching presets should give a genuinely
// different board, not a re-cut of the same scramble.
const dailyRng = (rows, cols, key = dayKey()) =>
  makeRng(hashString(`${key}:${rows}x${cols}`));

// Accepts: ["url", ...] | [{url,title?}, ...] | {images:[...]}
const normalizeList = (data) => {
  let arr = data;
  if (!Array.isArray(arr) && arr && Array.isArray(arr.images)) arr = arr.images;
  if (!Array.isArray(arr))
    throw new Error("expected an array of images (or { images: [...] }).");
  return arr
    .map((item, i) => {
      if (typeof item === "string")
        return { title: `Image ${i + 1}`, url: item };
      if (item && typeof item === "object" && typeof item.url === "string")
        return {
          title: item.title || item.name || `Image ${i + 1}`,
          url: item.url,
        };
      return null;
    })
    .filter(Boolean);
};

/* ---------- puzzle helpers ---------- */
const neighborsOf = (slot, rows, cols) => {
  const r = Math.floor(slot / cols),
    c = slot % cols;
  const out = [];
  if (r > 0) out.push(slot - cols);
  if (r < rows - 1) out.push(slot + cols);
  if (c > 0) out.push(slot - 1);
  if (c < cols - 1) out.push(slot + 1);
  return out;
};

const isSolved = (slots) => slots.every((piece, i) => piece === i);

// slots[slot] = piece currently in that slot. Blank piece = total-1.
const makeShuffled = (rows, cols, rng = Math.random) => {
  const total = rows * cols;
  const blank = total - 1;
  let slots = Array.from({ length: total }, (_, i) => i); // solved
  let blankSlot = blank;
  let prev = -1;
  const steps = Math.max(80, total * 45);
  for (let k = 0; k < steps; k++) {
    const nbrs = neighborsOf(blankSlot, rows, cols).filter((n) => n !== prev);
    const target = nbrs[Math.floor(rng() * nbrs.length)];
    // slide the piece at `target` into the blank slot
    slots[blankSlot] = slots[target];
    slots[target] = blank;
    prev = blankSlot;
    blankSlot = target;
  }
  // Pass `rng` down so the retry advances the same stream — a re-seeded
  // generator would replay the identical solved board and recurse forever.
  if (isSolved(slots)) return makeShuffled(rows, cols, rng);
  return slots;
};

const makeOneMoveFromSolved = (rows, cols) => {
  const total = rows * cols;
  const blank = total - 1;

  // Start solved: [0, 1, 2, ..., blank]
  const slots = Array.from({ length: total }, (_, i) => i);

  // Move the tile immediately left of the blank into the blank slot.
  // That leaves the blank one valid move away from its solved position.
  const tileToMove = blank - 1;

  slots[blank] = tileToMove;
  slots[tileToMove] = blank;

  return slots;
};

const fmtTime = (s) => {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
};

const solvedSlots = (rows, cols) =>
  Array.from({ length: rows * cols }, (_, i) => i);

/* ---------- daily result, persisted per browser ---------- *
 * One record, overwritten each day, so it cleans up after itself. Every
 * access is guarded: localStorage throws on access in some privacy modes
 * rather than just being empty, and a failure here should cost persistence,
 * not the game.
 * ------------------------------------------------------------------ */
const STORAGE_KEY = "sliding-puzzle:daily:v1";

const readDailyRecord = () => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const record = JSON.parse(raw);
    // A record from a previous day is stale — today's puzzle is unplayed.
    if (!record || record.day !== dayKey() || !record.solved) return null;
    return record;
  } catch {
    return null;
  }
};

const writeDailyRecord = (record) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    /* storage unavailable or full — the session still plays fine */
  }
};

export default function SlidingPuzzle() {
  const [grid, setGrid] = useState({ rows: 3, cols: 4 });
  // Read once on mount. If today's puzzle is already done, the board starts
  // finished and stays that way.
  const [restored] = useState(readDailyRecord);
  const [completed, setCompleted] = useState(() => Boolean(restored));
  const [image, setImage] = useState(DEFAULT_IMAGE);
  const [aspect, setAspect] = useState(DEFAULT_ASPECT);
  const [slots, setSlots] = useState(() =>
    restored ? solvedSlots(3, 4) : makeShuffled(3, 4, dailyRng(3, 4)),
  );
  const [moves, setMoves] = useState(() => restored?.moves ?? 0);
  const [seconds, setSeconds] = useState(() => restored?.seconds ?? 0);
  const [running, setRunning] = useState(false);
  const [showNumbers, setShowNumbers] = useState(false);
  const [showGuides, setShowGuides] = useState(true);
  const [peek, setPeek] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [lastMoved, setLastMoved] = useState(-1);

  const [library, setLibrary] = useState([]);
  const [activeUrl, setActiveUrl] = useState(DEFAULT_IMAGE);
  const [jsonText, setJsonText] = useState("");
  const [jsonUrl, setJsonUrl] = useState("");
  const [libMsg, setLibMsg] = useState("");
  const [libBusy, setLibBusy] = useState(false);
  const [showJson, setShowJson] = useState(false);

  const fileRef = useRef(null);
  const boardRef = useRef(null);
  const { rows, cols } = grid;
  const total = rows * cols;
  const blank = total - 1;
  const solved = useMemo(() => isSolved(slots), [slots]);

  // piece -> current slot, for stable-identity rendering
  const pieceSlot = useMemo(() => {
    const map = new Array(total);
    slots.forEach((piece, slot) => {
      map[piece] = slot;
    });
    return map;
  }, [slots, total]);

  // reset board whenever grid changes — back to today's board, not a new one.
  // Once today is finished this becomes a no-op that re-asserts the solved
  // board, so the async splash load can't reset a completed puzzle.
  const reshuffle = useCallback(() => {
    if (completed) {
      setSlots(solvedSlots(rows, cols));
      return;
    }
    setSlots(makeShuffled(rows, cols, dailyRng(rows, cols)));
    setMoves(0);
    setSeconds(0);
    setRunning(false);
    setLastMoved(-1);
  }, [rows, cols, completed]);

  useEffect(() => {
    reshuffle(); /* eslint-disable-next-line */
  }, [rows, cols, image]);

  // timer
  useEffect(() => {
    if (!running || solved) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [running, solved]);

  useEffect(() => {
    if (solved && running) setRunning(false);
  }, [solved, running]);

  // Record the finish once. `completed` gates this, so a restored board never
  // rewrites its own result and the original time/moves stand.
  useEffect(() => {
    if (!solved || completed) return;
    setCompleted(true);
    writeDailyRecord({ day: dayKey(), solved: true, seconds, moves });
  }, [solved, completed, seconds, moves]);

  const tryMovePiece = useCallback(
    (piece) => {
      if (solved || piece === blank) return;
      setSlots((cur) => {
        const from = cur.indexOf(piece);
        const blankSlot = cur.indexOf(blank);
        if (!neighborsOf(from, rows, cols).includes(blankSlot)) return cur;
        const next = cur.slice();
        next[blankSlot] = piece;
        next[from] = blank;
        return next;
      });
      setMoves((m) => m + 1);
      setLastMoved(piece);
      setRunning(true);
    },
    [solved, blank, rows, cols],
  );

  // keyboard: arrow = direction the tile slides into the blank
  useEffect(() => {
    const onKey = (e) => {
      const keys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
      if (!keys.includes(e.key)) return;
      e.preventDefault();
      setSlots((cur) => {
        const blankSlot = cur.indexOf(blank);
        const r = Math.floor(blankSlot / cols),
          c = blankSlot % cols;
        let src = -1;
        if (e.key === "ArrowUp" && r < rows - 1) src = blankSlot + cols; // tile below moves up
        if (e.key === "ArrowDown" && r > 0) src = blankSlot - cols; // tile above moves down
        if (e.key === "ArrowLeft" && c < cols - 1) src = blankSlot + 1; // tile right moves left
        if (e.key === "ArrowRight" && c > 0) src = blankSlot - 1; // tile left moves right
        if (src === -1) return cur;
        const piece = cur[src];
        const next = cur.slice();
        next[blankSlot] = piece;
        next[src] = blank;
        setMoves((m) => m + 1);
        setLastMoved(piece);
        setRunning(true);
        return next;
      });
    };
    const el = boardRef.current;
    el?.addEventListener("keydown", onKey);
    return () => el?.removeEventListener("keydown", onKey);
  }, [blank, rows, cols]);

  const loadFile = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result;
      const img = new Image();
      img.onload = () => {
        setAspect(img.naturalWidth / img.naturalHeight);
        setActiveUrl(url);
        setImage(url);
      };
      img.src = url;
    };
    reader.readAsDataURL(file);
  };

  const selectUrl = useCallback((url) => {
    console.log("selectUrl", url);
    setLibMsg("");
    const img = new Image();
    img.onload = () => {
      setAspect(img.naturalWidth / img.naturalHeight);
      setActiveUrl(url);
      setImage(url);
    };
    img.onerror = () =>
      setLibMsg(
        "That image URL wouldn't load — check the link or the host's permissions.",
      );
    img.src = url;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadLibrary = async () => {
      try {
        setLibBusy(true);
        setLibMsg("");

        const images = await loadSplashLibrary();

        if (cancelled) return;

        setLibrary(images);
        setLibMsg(`Loaded ${images.length} League splash images.`);
      } catch (error) {
        if (!cancelled) {
          setLibMsg(`Could not load League splashes: ${error.message}`);
        }
      } finally {
        if (!cancelled) {
          setLibBusy(false);
        }
      }
    };

    loadLibrary();

    return () => {
      cancelled = true;
    };
  }, []);

  const randomImage = useCallback(() => {
    if (!library.length) return;
    const pool = library.filter((it) => it.url !== activeUrl);
    const pick = (pool.length ? pool : library)[
      Math.floor(Math.random() * (pool.length ? pool.length : library.length))
    ];
    selectUrl(pick.url);
  }, [library, activeUrl, selectUrl]);

  useEffect(() => {
    if (!library.length) return;

    const pick = pickDailyImage(library);
    if (pick) selectUrl(pick.url);
  }, [library, selectUrl]);

  const applyJson = () => {
    try {
      const list = normalizeList(JSON.parse(jsonText));
      if (!list.length) throw new Error("no valid image entries found.");
      setLibrary(list);
      setLibMsg(`Loaded ${list.length} image${list.length > 1 ? "s" : ""}.`);
      selectUrl(list[0].url);
    } catch (e) {
      setLibMsg(`Couldn't read that JSON — ${e.message}`);
    }
  };

  const fetchJson = async () => {
    if (!jsonUrl.trim()) return;
    setLibBusy(true);
    setLibMsg("");
    try {
      const res = await fetch(jsonUrl.trim());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const list = normalizeList(await res.json());
      if (!list.length) throw new Error("no valid image entries found.");
      setLibrary(list);
      setLibMsg(`Loaded ${list.length} images from URL.`);
      selectUrl(list[0].url);
    } catch (e) {
      setLibMsg(
        `Fetch failed (${e.message}). The host may block cross-origin requests — paste the JSON below instead.`,
      );
    } finally {
      setLibBusy(false);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    loadFile(e.dataTransfer.files?.[0]);
  };

  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  /* ---------- styles ---------- */
  const C = {
    bg: "#070b12",
    panel: "#0e1622",
    edge: "rgba(120,180,255,.14)",
    edgeStrong: "rgba(140,200,255,.32)",
    ink: "#eaf3ff",
    dim: "#8ea6c6",
    ice: "#7ecbff",
    iceBright: "#d6f0ff",
  };

  const btn = (active, disableHover = false) => ({
    fontFamily: "'Chakra Petch',sans-serif",
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: ".02em",
    color: active ? C.bg : C.ink,
    background: active
      ? "linear-gradient(180deg,#bfe8ff,#6cbcff)"
      : "rgba(255,255,255,.03)",
    border: `1px solid ${active ? "transparent" : C.edge}`,
    borderRadius: 10,
    padding: "9px 14px",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    transition: disableHover
      ? "none"
      : "background .15s, border-color .15s, transform .1s",
    transform: disableHover ? "none" : undefined,
    boxShadow: active ? "0 0 18px rgba(120,190,255,.35)" : "none",
    width: "100%",
    marginTop: 20,
    justifyContent: "center",
  });

  const stat = (label, value, accent) => (
    <div
      style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 62 }}
    >
      <span
        style={{
          fontFamily: "'Chakra Petch',sans-serif",
          fontSize: 10.5,
          letterSpacing: ".18em",
          textTransform: "uppercase",
          color: C.dim,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "'Chakra Petch',sans-serif",
          fontWeight: 700,
          fontSize: 22,
          color: accent || C.ink,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1,
        }}
      >
        {value}
      </span>
    </div>
  );

  return (
    <div
      style={{
        minHeight: "100%",
        background: `radial-gradient(1100px 600px at 30% -10%, #12233b 0%, ${C.bg} 60%)`,
        padding: "26px 18px 40px",
        boxSizing: "border-box",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600;700&family=Inter:wght@400;500;600&display=swap');
        *{box-sizing:border-box}
        .tile-btn:focus-visible{outline:2px solid ${C.iceBright};outline-offset:2px}
        .ctrl:hover{transform:translateY(-1px)}
        .board-focus:focus-visible{outline:2px solid ${C.edgeStrong};outline-offset:4px}
        @keyframes flash{0%{opacity:0}25%{opacity:.85}100%{opacity:0}}
        @keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        @keyframes winPop {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.72);
  }
  65% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1.04);
  }
  100% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}
      `}</style>

      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        {/* header */}
        <div style={{ marginBottom: 18 }}>
          <div
            style={{
              fontFamily: "'Chakra Petch',sans-serif",
              fontSize: 11,
              letterSpacing: ".34em",
              textTransform: "uppercase",
              color: C.ice,
              marginBottom: 6,
            }}
          >
            Sliding Puzzle
          </div>
          <h1
            style={{
              fontFamily: "'Chakra Petch',sans-serif",
              fontWeight: 700,
              fontSize: 34,
              margin: 0,
              color: C.ink,
              lineHeight: 1.02,
            }}
          >
            Slide the shards back into place
          </h1>
          <p
            style={{
              fontFamily: "Inter,sans-serif",
              color: C.dim,
              fontSize: 14,
              margin: "8px 0 0",
              maxWidth: 520,
            }}
          >
            Tap a tile next to the gap to slide it. Arrow keys work too. Drop
            your own image on the board to play with it.
          </p>
        </div>

        {/* board */}
        <div
          ref={boardRef}
          tabIndex={0}
          className="board-focus"
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          style={{
            position: "relative",
            width: "100%",
            aspectRatio: String(aspect),
            borderRadius: 16,
            overflow: "hidden",
            border: `1px solid ${dragOver ? C.iceBright : C.edgeStrong}`,
            background: "#060a11",
            boxShadow: `0 30px 80px -30px rgba(0,0,0,.8), 0 0 0 1px rgba(0,0,0,.4) inset`,
            transition: "border-color .15s",
          }}
        >
          {Array.from({ length: total }).map((_, piece) => {
            const slot = pieceSlot[piece];
            const col = slot % cols,
              row = Math.floor(slot / cols);
            const gCol = piece % cols,
              gRow = Math.floor(piece / cols);
            const isBlank = piece === blank;
            const showFilled = !isBlank || solved; // blank fills in on solve
            const gap = showGuides && !solved ? 1.4 : 0;
            return (
              <button
                key={piece}
                type="button"
                className="tile-btn"
                aria-label={`Tile ${piece + 1}`}
                onClick={() => tryMovePiece(piece)}
                style={{
                  position: "absolute",
                  left: `calc(${(col * 100) / cols}% + ${gap}px)`,
                  top: `calc(${(row * 100) / rows}% + ${gap}px)`,
                  width: `calc(${100 / cols}% - ${gap * 2}px)`,
                  height: `calc(${100 / rows}% - ${gap * 2}px)`,
                  padding: 0,
                  margin: 0,
                  border: "none",
                  borderRadius: solved ? 0 : 3,
                  cursor: isBlank || solved ? "default" : "pointer",
                  opacity: showFilled ? 1 : 0,
                  backgroundImage: `url("${image}")`,
                  backgroundSize: `${cols * 100}% ${rows * 100}%`,
                  backgroundPosition: `${cols > 1 ? (gCol / (cols - 1)) * 100 : 0}% ${rows > 1 ? (gRow / (rows - 1)) * 100 : 0}%`,
                  transition: reduce
                    ? "none"
                    : `left .18s cubic-bezier(.2,.8,.2,1), top .18s cubic-bezier(.2,.8,.2,1), border-radius .4s, opacity .35s`,
                  boxShadow: solved
                    ? "none"
                    : lastMoved === piece
                      ? "inset 0 0 0 1px rgba(190,230,255,.55), 0 0 16px rgba(120,190,255,.4)"
                      : "inset 0 0 0 1px rgba(180,215,255,.12)",
                  zIndex: lastMoved === piece ? 2 : 1,
                }}
              >
                {showNumbers && !isBlank && !solved && (
                  <span
                    style={{
                      position: "absolute",
                      left: 6,
                      top: 5,
                      fontFamily: "'Chakra Petch',sans-serif",
                      fontWeight: 700,
                      fontSize: 13,
                      color: "#eaf7ff",
                      textShadow: "0 1px 4px rgba(0,0,0,.9)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {piece + 1}
                  </span>
                )}
              </button>
            );
          })}

          {/* peek overlay (see the full target) */}
          {peek && !solved && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 10,
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "center",
                paddingBottom: 14,
                backgroundImage: `url("${image}")`,
                backgroundSize: "100% 100%",
                backgroundPosition: "center",
                opacity: 0.78,
                pointerEvents: "none",
                boxShadow: "inset 0 0 0 2px rgba(214,240,255,.7)",
              }}
            >
              <span
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  background: "rgba(5,10,18,.78)",
                  border: `1px solid ${C.edgeStrong}`,
                  color: C.iceBright,
                  fontFamily: "'Chakra Petch',sans-serif",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: ".1em",
                  textTransform: "uppercase",
                }}
              >
                Reference image
              </span>
            </div>
          )}

          {/* solved flash + card */}
          {solved && (
            <>
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 5,
                  pointerEvents: "none",
                  background: "rgba(2, 12, 7, 0.28)",
                  backdropFilter: "blur(3px)",
                  WebkitBackdropFilter: "blur(3px)",
                }}
              />
              <div
                role="status"
                aria-live="polite"
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  zIndex: 5,
                  width: "min(360px, calc(100% - 32px))",
                  padding: "26px 24px 22px",
                  textAlign: "center",
                  borderRadius: 18,
                  color: "#effff4",
                  background:
                    "linear-gradient(145deg, rgba(25,125,76,.97), rgba(10,67,42,.97))",
                  border: "1px solid rgba(140,255,184,.68)",
                  boxShadow:
                    "0 22px 70px rgba(0,0,0,.5), 0 0 40px rgba(62,235,137,.32), inset 0 1px 0 rgba(255,255,255,.18)",
                  backdropFilter: "blur(10px)",
                  animation: reduce
                    ? "none"
                    : "winPop .42s cubic-bezier(.16,.9,.3,1.25) both",
                }}
              >
                <div
                  style={{
                    width: 54,
                    height: 54,
                    margin: "0 auto 12px",
                    display: "grid",
                    placeItems: "center",
                    borderRadius: "50%",
                    color: "#073d25",
                    background: "linear-gradient(180deg, #b8ffd2, #55db91)",
                    boxShadow: "0 0 24px rgba(119,255,173,.58)",
                    fontFamily: "'Chakra Petch',sans-serif",
                    fontSize: 30,
                    fontWeight: 700,
                    lineHeight: 1,
                  }}
                >
                  ✓
                </div>

                <div
                  style={{
                    fontFamily: "'Chakra Petch',sans-serif",
                    fontSize: 22,
                    fontWeight: 700,
                    letterSpacing: ".02em",
                  }}
                >
                  {restored ? "Already solved today" : "Puzzle complete!"}
                </div>

                <p
                  style={{
                    margin: "7px 0 18px",
                    fontFamily: "Inter,sans-serif",
                    fontSize: 13,
                    color: "rgba(235,255,243,.76)",
                  }}
                >
                  {restored
                    ? "You finished today's puzzle. A new image and board arrive tomorrow."
                    : "Nice work — you put the image back together."}
                </p>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    gap: 10,
                    marginBottom: 20,
                  }}
                >
                  <div
                    style={{
                      minWidth: 105,
                      padding: "10px 12px",
                      borderRadius: 10,
                      background: "rgba(0,0,0,.18)",
                      border: "1px solid rgba(200,255,218,.18)",
                    }}
                  >
                    <div
                      style={{
                        color: "rgba(232,255,240,.65)",
                        fontFamily: "'Chakra Petch',sans-serif",
                        fontSize: 10,
                        letterSpacing: ".16em",
                        textTransform: "uppercase",
                      }}
                    >
                      Time
                    </div>
                    <div
                      style={{
                        marginTop: 3,
                        fontFamily: "'Chakra Petch',sans-serif",
                        fontSize: 22,
                        fontWeight: 700,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {fmtTime(seconds)}
                    </div>
                  </div>

                  <div
                    style={{
                      minWidth: 105,
                      padding: "10px 12px",
                      borderRadius: 10,
                      background: "rgba(0,0,0,.18)",
                      border: "1px solid rgba(200,255,218,.18)",
                    }}
                  >
                    <div
                      style={{
                        color: "rgba(232,255,240,.65)",
                        fontFamily: "'Chakra Petch',sans-serif",
                        fontSize: 10,
                        letterSpacing: ".16em",
                        textTransform: "uppercase",
                      }}
                    >
                      Moves
                    </div>
                    <div
                      style={{
                        marginTop: 3,
                        fontFamily: "'Chakra Petch',sans-serif",
                        fontSize: 22,
                        fontWeight: 700,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {moves}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
        <div>
          <button
            type="button"
            className="ctrl"
            disabled={solved}
            style={{
              ...btn(peek, solved),
              cursor: solved ? "default" : "pointer",
              opacity: solved ? 0.45 : 1,
            }}
            onMouseEnter={() => setPeek(true)}
            onMouseLeave={() => setPeek(false)}
            onFocus={() => setPeek(true)}
            onBlur={() => setPeek(false)}
            onPointerCancel={() => setPeek(false)}
            aria-label="Hold to view the completed reference image"
          >
            {solved ? "Puzzle complete" : "Hover to peek"}
          </button>
        </div>
        {libMsg && (
          <p
            style={{
              margin: "12px 0 0",
              color: "#ff9d9d",
              fontFamily: "Inter, sans-serif",
              fontSize: 13,
            }}
          >
            {libMsg}
          </p>
        )}
      </div>
    </div>
  );
}
