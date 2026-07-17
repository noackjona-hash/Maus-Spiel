# Maus-Spiel 🐭🧩

**Maus-Spiel** is an interactive, grid-based pathway connection puzzle game themed around the beloved German children's television show **"Sendung mit der Maus"**. Built using Next.js and HTML5 Canvas, it challenges players to guide the Maus by rotating grid tiles to build a complete path from start to finish.

---

## 🚀 Key Features

* **Path-Routing Puzzle Mechanics:** Players click on grid tiles to rotate them (straight paths, bends/curves, start blocks, and end target endpoints) to establish a continuous link.
* **HTML5 Canvas Rendering:** Renders the game board, mouse avatars, and fluid transitions using high-performance 2D Canvas contexts, avoiding React component re-rendering overhead.
* **Persistent Shop & Rewards:**
  * Collect coins and high scores by completing levels.
  * Spend coins in the in-game shop to buy items (cakes, balloons, presents, crowns, trophies) to customize the environment.
* **Progress Saving:** Keeps track of levels, scores, streaks, and shop inventory across browser restarts via `localStorage`.
* **Sound Effects & Music:** Dynamic game state audio, including background music, tile clicks, success fanfares, and coin sounds.

---

## 🎮 How to Play

1. **Identify the Start & End:** Look for the starting tile (where the Maus begins) and the target destination.
2. **Rotate the Tiles:** Click/tap on any intermediate tile to rotate it 90 degrees.
3. **Complete the Path:** Connect the tiles in a continuous line from the start to the end. The level completes automatically once a valid path is formed!

---

## 🛠️ Tech Stack

* **Frontend Framework:** Next.js 16 (App Router)
* **Library:** React 19
* **Game Engine:** HTML5 Canvas API (2D Context)
* **Styling:** Tailwind CSS v4 (with PostCSS compilation)
* **Language:** TypeScript 5.x

---

## 💻 Getting Started

Follow these steps to run the game locally:

### 1. Clone the repository
```bash
git clone https://github.com/noackjona-hash/Maus-Spiel.git
cd Maus-Spiel
```

### 2. Install dependencies
```bash
npm install
```

### 3. Run the development server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.
