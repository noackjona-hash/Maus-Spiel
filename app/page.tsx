"use client";

import { useEffect, useRef } from 'react';

export default function MausGame() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // --- KONFIGURATION ---
        const GRID_W = 600;
        const GRID_H = 600;
        const UI_H = 100;     
        const BOTTOM_H = 60;  
        const SCREEN_W = GRID_W;
        const SCREEN_H = GRID_H + UI_H + BOTTOM_H;
        let GRID_SIZE = 5;
        let TILE_SIZE = GRID_W / GRID_SIZE;

        const CONNECTIONS = {
            "gerade": [true, false, true, false], 
            "kurve":  [true, false, false, true], 
            "start":  [false, false, true, false],
            "ende":   [true, false, false, false]
        };

        const VISUAL_OFFSETS = {
            "gerade": 90, 
            "kurve": 90,
            "start": 90,
            "ende": 90
        };

        const ASSETS: Record<string, string> = {
            bg: "/bg.jpg", gerade: "/Gerade.png", kurve: "/Kurve.png", start: "/Start.png", ende: "/Ende.png"
        };
        const AUDIO_URLS: Record<string, string> = {
            bg: "/bg.mp3", bing: "/bing.mp3", water: "/water.mp3", win: "/win.mp3"
        };

        const images: Record<string, HTMLImageElement> = {};
        const sounds: Record<string, HTMLAudioElement> = {};

        // --- SPIELSTATUS & SHOP ---
        let saveGame = { 
            score: 0, coins: 0, level: 1, streak: 0, 
            shop: { cake: false, balloons: false, presents: false, crown: false, trophy: false } 
        };
        
        if (typeof window !== 'undefined' && localStorage.getItem("maus_save_premium")) {
            try { saveGame = Object.assign(saveGame, JSON.parse(localStorage.getItem("maus_save_premium") || "{}")); } catch(e) {}
        }
        function saveProgress() {
            if (typeof window !== 'undefined') localStorage.setItem("maus_save_premium", JSON.stringify(saveGame));
        }

        const SHOP_ITEMS = [
            { id: 'cake', name: 'Geburtstags-Torte', cost: 150, icon: '🎂' },
            { id: 'balloons', name: 'Luftballons', cost: 400, icon: '🎈' },
            { id: 'presents', name: 'Geschenke-Berg', cost: 1000, icon: '🎁' },
            { id: 'crown', name: 'Goldene Krone', cost: 2500, icon: '👑' },
            { id: 'trophy', name: 'Premium Pokal', cost: 5000, icon: '🏆' }
        ];

        let state: "MENU" | "SHOP" | "PLAYING" = "MENU"; 
        let board: GameBoard | null = null;
        let isWon = false;
        let maxPathDist = 0;
        let winTime = 0;
        let flowFinished = false;
        let flowFront = 0;
        let levelStartTime = Date.now();
        let timeElapsed = 0;
        let usedCheat = false;
        let audioStarted = false;
        let displayScore = saveGame.score;
        let displayCoins = saveGame.coins;
        let animationFrameId: number;
        let mouseX = 0, mouseY = 0;
        let particles: {x:number, y:number, vy:number, s:number, a:number}[] = [];

        // Partikel initialisieren
        for(let i=0; i<30; i++) {
            particles.push({
                x: Math.random() * SCREEN_W, y: Math.random() * SCREEN_H,
                vy: -Math.random() * 1 - 0.2, s: Math.random() * 2 + 1, a: Math.random() * 0.5 + 0.1
            });
        }

        // --- KLASSEN ---
        class Tile {
            type: keyof typeof CONNECTIONS;
            logicalRot: number; x: number; y: number;
            visualAngle: number; targetAngle: number;
            isConnected: boolean; dist: number;

            constructor(type: keyof typeof CONNECTIONS, rot: number, x: number, y: number) {
                this.type = type; this.logicalRot = rot; this.x = x; this.y = y;
                let offset = VISUAL_OFFSETS[this.type] || 0;
                if (this.type === "start" || this.type === "ende") { this.visualAngle = offset; this.targetAngle = offset; } 
                else { this.visualAngle = (rot * 90) + offset; this.targetAngle = (rot * 90) + offset; }
                this.isConnected = false; this.dist = -1;
            }

            rotate() {
                if (this.type === "gerade" || this.type === "kurve") {
                    this.logicalRot = (this.logicalRot + 1) % 4;
                    this.targetAngle += 90;
                    playSound('bing');
                }
            }

            updateAnimation() {
                let diff = this.targetAngle - this.visualAngle;
                if (Math.abs(diff) > 0.5) this.visualAngle += diff * 0.4;
                else this.visualAngle = this.targetAngle;
            }

            getCurrentConnections() {
                let conns = [...CONNECTIONS[this.type]];
                for (let i = 0; i < this.logicalRot; i++) { conns = [conns[3], conns[0], conns[1], conns[2]]; }
                return conns;
            }

            draw(ctx: CanvasRenderingContext2D) {
                this.updateAnimation();
                const px = this.x * TILE_SIZE; const py = UI_H + this.y * TILE_SIZE;
                const cx = px + TILE_SIZE / 2; const cy = py + TILE_SIZE / 2;

                ctx.fillStyle = ((this.x + this.y) % 2 === 0) ? "rgba(0, 0, 0, 0.4)" : "rgba(0, 0, 0, 0.6)";
                ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

                ctx.save(); ctx.translate(cx, cy); ctx.rotate((this.visualAngle * Math.PI) / 180);

                if (images[this.type]) {
                    ctx.drawImage(images[this.type], 0, 0, 128, 128, -TILE_SIZE/2, -TILE_SIZE/2, TILE_SIZE, TILE_SIZE);
                }

                if (this.isConnected && isWon && this.dist >= 0 && this.type !== "start" && this.type !== "ende") {
                    if (flowFront >= this.dist) {
                        let tCanvas = document.createElement('canvas'); tCanvas.width = 128; tCanvas.height = 128;
                        let tCtx = tCanvas.getContext('2d');
                        if (tCtx && images[this.type]) {
                            tCtx.drawImage(images[this.type], 0, 0, 128, 128);
                            tCtx.globalCompositeOperation = "source-atop";
                            tCtx.fillStyle = "rgba(0, 160, 255, 0.9)";
                            tCtx.fillRect(0, 0, 128, 128);
                            let progress = Math.min(1.0, Math.max(0.0, flowFront - this.dist));
                            ctx.globalAlpha = progress * (0.7 + 0.3 * Math.sin(Date.now() / 150));
                            ctx.drawImage(tCanvas, 0, 0, 128, 128, -TILE_SIZE/2, -TILE_SIZE/2, TILE_SIZE, TILE_SIZE);
                        }
                    }
                }
                ctx.restore();
                ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 1; ctx.strokeRect(px, py, TILE_SIZE, TILE_SIZE);
            }
        }

        class GameBoard {
            grid: Tile[][]; correctRotations: number[][];
            constructor() {
                GRID_SIZE = Math.min(5 + Math.floor((saveGame.level - 1) / 5), 8);
                TILE_SIZE = GRID_W / GRID_SIZE;
                this.grid = []; this.correctRotations = Array(GRID_SIZE).fill(0).map(() => Array(GRID_SIZE).fill(0));
                this.generateLevel();
            }

            generateLevel() {
                let path = this.findValidPath();
                let logicalGrid = Array(GRID_SIZE).fill("").map(() => Array(GRID_SIZE).fill(""));

                for (let i = 1; i < path.length - 1; i++) {
                    let p = path[i-1], c = path[i], n = path[i+1];
                    if ((p.y === c.y && c.y === n.y) || (p.x === c.x && c.x === n.x)) logicalGrid[c.y][c.x] = "gerade";
                    else logicalGrid[c.y][c.x] = "kurve";
                }

                for (let y = 0; y < GRID_SIZE; y++) {
                    for (let x = 0; x < GRID_SIZE; x++) { if (!logicalGrid[y][x]) logicalGrid[y][x] = Math.random() > 0.5 ? "gerade" : "kurve"; }
                }
                
                logicalGrid[0][0] = "start"; logicalGrid[GRID_SIZE-1][GRID_SIZE-1] = "ende";
                let initialRotations = Array(GRID_SIZE).fill(0).map(() => Array(GRID_SIZE).fill(0).map(()=>Math.floor(Math.random()*4)));
                initialRotations[0][0] = 0; initialRotations[GRID_SIZE-1][GRID_SIZE-1] = 0;

                const vecToIdx: Record<string, number> = {"-1,0": 0, "0,1": 1, "1,0": 2, "0,-1": 3};

                for (let i = 1; i < path.length - 1; i++) {
                    let p = path[i-1], c = path[i], n = path[i+1];
                    let needed = [false, false, false, false];
                    needed[vecToIdx[`${p.y-c.y},${p.x-c.x}`]] = true; needed[vecToIdx[`${n.y-c.y},${n.x-c.x}`]] = true;
                    let pType = logicalGrid[c.y][c.x] as keyof typeof CONNECTIONS;
                    let baseConns = [...CONNECTIONS[pType]];

                    for (let rot = 0; rot < 4; rot++) {
                        let testConns = [...baseConns];
                        for (let r = 0; r < rot; r++) testConns = [testConns[3], testConns[0], testConns[1], testConns[2]];
                        if (testConns[0] === needed[0] && testConns[1] === needed[1] && testConns[2] === needed[2] && testConns[3] === needed[3]) {
                            this.correctRotations[c.y][c.x] = rot;
                            let opts = [0, 1, 2, 3].filter(r => r !== rot);
                            initialRotations[c.y][c.x] = opts[Math.floor(Math.random() * opts.length)];
                            break;
                        }
                    }
                }

                for (let y = 0; y < GRID_SIZE; y++) {
                    let row: Tile[] = [];
                    for (let x = 0; x < GRID_SIZE; x++) { row.push(new Tile(logicalGrid[y][x] as keyof typeof CONNECTIONS, initialRotations[y][x], x, y)); }
                    this.grid.push(row);
                }
            }

            findValidPath() {
                while (true) {
                    let visited = new Set(['0,0', '1,0']); let path = [{y:0, x:0}, {y:1, x:0}];
                    let current = {y:1, x:0}; let target = {y:GRID_SIZE-2, x:GRID_SIZE-1}; let steps = 0;
                    while ((current.x !== target.x || current.y !== target.y) && steps < 200) {
                        steps++;
                        let dirs = [{dy:1, dx:0}, {dy:0, dx:1}, {dy:-1, dx:0}, {dy:0, dx:-1}].sort(() => Math.random() - 0.5); 
                        let moved = false;
                        for (let d of dirs) {
                            let ny = current.y + d.dy, nx = current.x + d.dx;
                            if (ny >= 0 && ny < GRID_SIZE && nx >= 0 && nx < GRID_SIZE) {
                                if (ny === GRID_SIZE-1 && nx === GRID_SIZE-1) continue;
                                if (!visited.has(`${ny},${nx}`)) { visited.add(`${ny},${nx}`); path.push({y:ny, x:nx}); current = {y:ny, x:nx}; moved = true; break; }
                            }
                        }
                        if (!moved) { path.pop(); if (path.length < 2) break; current = path[path.length - 1]; }
                    }
                    if (current.x === target.x && current.y === target.y) { path.push({y:GRID_SIZE-1, x:GRID_SIZE-1}); return path; }
                }
            }

            updateConnections() {
                for (let y = 0; y < GRID_SIZE; y++) { for (let x = 0; x < GRID_SIZE; x++) { this.grid[y][x].isConnected = false; this.grid[y][x].dist = -1; } }
                let visited = new Set(); let queue = [{y:0, x:0, dist:0}];
                let pathTiles = []; let won = false; let mDist = 0;

                while (queue.length > 0) {
                    let curr = queue.shift()!; let key = `${curr.y},${curr.x}`;
                    if (visited.has(key)) continue; visited.add(key);

                    let tile = this.grid[curr.y][curr.x];
                    tile.dist = curr.dist; pathTiles.push({y: curr.y, x: curr.x});
                    mDist = Math.max(mDist, curr.dist);

                    if (curr.y === GRID_SIZE-1 && curr.x === GRID_SIZE-1) { won = true; break; }

                    let conns = tile.getCurrentConnections();
                    let checks = [ {dy:-1, dx:0, myS:0, nS:2}, {dy:0, dx:1, myS:1, nS:3}, {dy:1, dx:0, myS:2, nS:0}, {dy:0, dx:-1, myS:3, nS:1} ];

                    for (let c of checks) {
                        let ny = curr.y + c.dy, nx = curr.x + c.dx;
                        if (ny >= 0 && ny < GRID_SIZE && nx >= 0 && nx < GRID_SIZE) {
                            let nc = this.grid[ny][nx].getCurrentConnections();
                            if (conns[c.myS] && nc[c.nS] && !visited.has(`${ny},${nx}`)) queue.push({y:ny, x:nx, dist: curr.dist + 1});
                        }
                    }
                }
                if (won) { for (let p of pathTiles) this.grid[p.y][p.x].isConnected = true; }
                return { isWon: won, maxPathDist: mDist };
            }

            autoSolve(count: number = -1) {
                let solved = 0; let incorrect = [];
                for (let y = 0; y < GRID_SIZE; y++) {
                    for (let x = 0; x < GRID_SIZE; x++) {
                        let t = this.grid[y][x];
                        if ((t.type === "gerade" || t.type === "kurve") && t.logicalRot !== this.correctRotations[y][x]) incorrect.push(t);
                    }
                }
                incorrect.sort(() => Math.random() - 0.5);
                let toSolve = count === -1 ? incorrect.length : Math.min(count, incorrect.length);
                
                for(let i=0; i<toSolve; i++) {
                    let tile = incorrect[i];
                    let diff = (this.correctRotations[tile.y][tile.x] - tile.logicalRot);
                    if (diff < 0) diff += 4;
                    tile.logicalRot = this.correctRotations[tile.y][tile.x];
                    tile.targetAngle += diff * 90;
                    solved++;
                }
                if(solved > 0) playSound('bing');
                return solved;
            }
        }

        // --- HILFSFUNKTIONEN ---
        function playSound(name: string) {
            if(sounds[name]) {
                if (name !== 'bg' && name !== 'water') {
                    let clone = sounds[name].cloneNode(true) as HTMLAudioElement;
                    clone.play().catch(()=>{});
                } else {
                    sounds[name].play().catch(()=>{});
                }
            }
        }

        async function loadAssets() {
            const imgPromises = Object.keys(ASSETS).map(key => {
                return new Promise((resolve) => {
                    const img = new Image(); img.onload = () => { images[key] = img; resolve(true); };
                    img.onerror = () => { resolve(false); }; img.src = ASSETS[key];
                });
            });
            Object.keys(AUDIO_URLS).forEach(key => {
                const audio = new Audio(AUDIO_URLS[key]);
                if (key === 'bg' || key === 'water') audio.loop = true;
                if (key === 'bg') audio.volume = 0.2;
                sounds[key] = audio;
            });

            await Promise.all(imgPromises);
            board = new GameBoard();
            animationFrameId = requestAnimationFrame(gameLoop);
        }

        // --- ZEICHNEN (RENDER) ---
        function drawBackground(ctx: CanvasRenderingContext2D) {
            if (images.bg) ctx.drawImage(images.bg, 0, 0, SCREEN_W, SCREEN_H);
            else { ctx.fillStyle = "#1e1e23"; ctx.fillRect(0, 0, SCREEN_W, SCREEN_H); }
        }

        function drawParticles(ctx: CanvasRenderingContext2D) {
            ctx.fillStyle = "white";
            particles.forEach(p => {
                p.y += p.vy;
                if(p.y < -10) { p.y = SCREEN_H + 10; p.x = Math.random() * SCREEN_W; }
                ctx.globalAlpha = p.a;
                ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, Math.PI*2); ctx.fill();
            });
            ctx.globalAlpha = 1.0;
        }

        function drawHUD(ctx: CanvasRenderingContext2D) {
            let grad = ctx.createLinearGradient(0, 0, 0, UI_H);
            grad.addColorStop(0, "rgba(15, 15, 20, 1)"); grad.addColorStop(1, "rgba(25, 25, 32, 0.95)");
            ctx.fillStyle = grad; ctx.fillRect(0, 0, SCREEN_W, UI_H);
            ctx.shadowColor = "#ff8c00"; ctx.shadowBlur = 8;
            ctx.beginPath(); ctx.moveTo(0, UI_H - 2); ctx.lineTo(SCREEN_W, UI_H - 2);
            ctx.strokeStyle = "#ff8c00"; ctx.lineWidth = 3; ctx.stroke(); ctx.shadowBlur = 0; 

            ctx.fillStyle = "white"; ctx.font = "bold 34px 'Segoe UI', Arial";
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText(`Level ${saveGame.level}`, SCREEN_W / 2, 35); 

            if (displayScore < saveGame.score) displayScore += Math.ceil((saveGame.score - displayScore) * 0.1);
            ctx.textAlign = "left"; ctx.fillStyle = "#e0e0e0"; ctx.font = "bold 22px Arial";
            ctx.fillText(`Score: ${displayScore}`, 20, 75); 

            let timeStr = "0:00";
            if (!isWon && state === "PLAYING") timeElapsed = Math.floor((Date.now() - levelStartTime) / 1000);
            let m = Math.floor(timeElapsed / 60); let s = timeElapsed % 60;
            timeStr = `${m}:${s < 10 ? '0' : ''}${s}`;
            ctx.textAlign = "center";
            ctx.fillStyle = timeElapsed > (10 + GRID_SIZE*3) ? "#ff5555" : "#aaaaaa";
            ctx.fillText(`⏱️ ${timeStr}`, SCREEN_W / 2, 85);

            if (displayCoins < saveGame.coins) displayCoins += Math.ceil((saveGame.coins - displayCoins) * 0.1);
            ctx.fillStyle = "#ffd700"; ctx.textAlign = "right"; ctx.font = "bold 24px Arial";
            ctx.fillText(`${displayCoins} Münzen`, SCREEN_W - 20, 75);
        }

        function drawBottomBar(ctx: CanvasRenderingContext2D) {
            ctx.fillStyle = "rgba(15, 15, 20, 0.95)";
            ctx.fillRect(0, SCREEN_H - BOTTOM_H, SCREEN_W, BOTTOM_H);
            ctx.beginPath(); ctx.moveTo(0, SCREEN_H - BOTTOM_H + 2); ctx.lineTo(SCREEN_W, SCREEN_H - BOTTOM_H + 2);
            ctx.strokeStyle = "#ff8c00"; ctx.lineWidth = 2; ctx.stroke();

            const powerups = [
                { id: 'hint', name: '1 Rohr', icon: '🔍', cost: 20, rect: {x: 30, y: SCREEN_H - BOTTOM_H + 10, w: 160, h: 40} },
                { id: 'time', name: '+15 Sek', icon: '⏱️', cost: 40, rect: {x: 220, y: SCREEN_H - BOTTOM_H + 10, w: 160, h: 40} },
                { id: 'solve3', name: 'Magie', icon: '✨', cost: 100, rect: {x: 410, y: SCREEN_H - BOTTOM_H + 10, w: 160, h: 40} }
            ];

            powerups.forEach(p => {
                let isHover = mouseX > p.rect.x && mouseX < p.rect.x + p.rect.w && mouseY > p.rect.y && mouseY < p.rect.y + p.rect.h;
                let canAfford = saveGame.coins >= p.cost && !isWon;
                let grad = ctx.createLinearGradient(0, p.rect.y, 0, p.rect.y + p.rect.h);
                if (canAfford) { grad.addColorStop(0, isHover ? "#ffad33" : "#ff8c00"); grad.addColorStop(1, isHover ? "#e67e00" : "#cc7000"); } 
                else { grad.addColorStop(0, "#444"); grad.addColorStop(1, "#222"); }

                ctx.fillStyle = grad;
                ctx.shadowColor = canAfford ? "rgba(255,140,0,0.4)" : "transparent"; ctx.shadowBlur = 8;
                ctx.beginPath(); ctx.roundRect(p.rect.x, p.rect.y, p.rect.w, p.rect.h, 15); ctx.fill(); ctx.shadowBlur = 0;
                ctx.lineWidth = 1; ctx.strokeStyle = canAfford ? "rgba(255,255,255,0.3)" : "#555"; ctx.stroke();
                
                ctx.fillStyle = canAfford ? "white" : "#777";
                ctx.font = "bold 16px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
                ctx.fillText(`${p.icon} ${p.name} (${p.cost} M)`, p.rect.x + p.rect.w/2, p.rect.y + p.rect.h/2 + 2);
            });
        }

        function drawMenu(ctx: CanvasRenderingContext2D) {
            drawBackground(ctx);
            ctx.fillStyle = "rgba(10, 10, 15, 0.85)"; ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
            drawParticles(ctx);

            ctx.shadowColor = "#ff8c00"; ctx.shadowBlur = 25;
            ctx.fillStyle = "white"; ctx.font = "bold 45px Arial"; ctx.textAlign = "center";
            ctx.fillText("Für die Maus", SCREEN_W/2, 180);
            ctx.fillStyle = "#ff8c00"; ctx.font = "bold 70px 'Segoe UI', Arial";
            ctx.fillText("ROHR-PUZZLE", SCREEN_W/2, 250);
            ctx.shadowBlur = 0;

            ctx.fillStyle = "#c8c8c8"; ctx.font = "bold 24px Arial";
            ctx.fillText(`Highscore: ${saveGame.score}  |  Münzen: ${saveGame.coins}`, SCREEN_W/2, 330);
            if (saveGame.streak > 1) { ctx.fillStyle = "#ff5555"; ctx.fillText(`🔥 Winstreak: ${saveGame.streak}x`, SCREEN_W/2, 370); }

            // Spielen Button
            let btnPlay = {x: SCREEN_W/2 - 150, y: 450, w: 300, h: 80};
            let isPlayHover = mouseX > btnPlay.x && mouseX < btnPlay.x + btnPlay.w && mouseY > btnPlay.y && mouseY < btnPlay.y + btnPlay.h;
            ctx.fillStyle = isPlayHover ? "#ffa01e" : "#ff8c00";
            ctx.shadowColor = "rgba(255,140,0,0.6)"; ctx.shadowBlur = 20; 
            ctx.beginPath(); ctx.roundRect(btnPlay.x, btnPlay.y, btnPlay.w, btnPlay.h, 40); ctx.fill();
            ctx.lineWidth = 4; ctx.strokeStyle = "white"; ctx.stroke(); ctx.shadowBlur = 0; 
            ctx.fillStyle = "white"; ctx.font = "bold 36px Arial"; ctx.fillText("SPIELEN", SCREEN_W/2, btnPlay.y + 52);

            // Shop Button
            let btnShop = {x: SCREEN_W/2 - 150, y: 560, w: 300, h: 60};
            let isShopHover = mouseX > btnShop.x && mouseX < btnShop.x + btnShop.w && mouseY > btnShop.y && mouseY < btnShop.y + btnShop.h;
            ctx.fillStyle = isShopHover ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.1)";
            ctx.beginPath(); ctx.roundRect(btnShop.x, btnShop.y, btnShop.w, btnShop.h, 30); ctx.fill();
            ctx.lineWidth = 2; ctx.strokeStyle = "rgba(255,255,255,0.3)"; ctx.stroke();
            ctx.fillStyle = "#ffd700"; ctx.font = "bold 32px Arial"; ctx.fillText("SHOP", SCREEN_W/2, btnShop.y + 40);

            // Gekaufte Items anzeigen
            let decoY = 120;
            if (saveGame.shop.balloons) { ctx.font = "80px Arial"; ctx.fillText("🎈", 80, decoY); ctx.fillText("🎈", SCREEN_W-80, decoY); }
            if (saveGame.shop.cake) { ctx.font = "100px Arial"; ctx.fillText("🎂", SCREEN_W/2, SCREEN_H - 80); }
            if (saveGame.shop.crown) { ctx.font = "60px Arial"; ctx.fillText("👑", SCREEN_W/2, 110); }
            if (saveGame.shop.trophy) { ctx.font = "70px Arial"; ctx.fillText("🏆", 80, SCREEN_H - 80); }
            if (saveGame.shop.presents) { ctx.font = "70px Arial"; ctx.fillText("🎁", SCREEN_W - 80, SCREEN_H - 80); }
        }

        function drawShop(ctx: CanvasRenderingContext2D) {
            drawBackground(ctx);
            ctx.fillStyle = "rgba(10, 10, 15, 0.95)"; ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
            drawParticles(ctx);

            ctx.fillStyle = "white"; ctx.font = "bold 45px 'Segoe UI', Arial";
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText("SHOP", SCREEN_W/2, 80);
            ctx.fillStyle = "#ffd700"; ctx.font = "bold 26px Arial";
            ctx.fillText(`Deine Münzen: ${saveGame.coins}`, SCREEN_W/2, 130);

            // Zurück Button
            let btnBack = {x: 20, y: 20, w: 120, h: 45};
            let isBackHover = mouseX > btnBack.x && mouseX < btnBack.x + btnBack.w && mouseY > btnBack.y && mouseY < btnBack.y + btnBack.h;
            ctx.fillStyle = isBackHover ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.1)";
            ctx.beginPath(); ctx.roundRect(btnBack.x, btnBack.y, btnBack.w, btnBack.h, 10); ctx.fill();
            ctx.lineWidth = 2; ctx.strokeStyle = "rgba(255,255,255,0.3)"; ctx.stroke();
            ctx.fillStyle = "white"; ctx.font = "bold 18px Arial"; ctx.fillText("◀ ZURÜCK", btnBack.x + btnBack.w/2, btnBack.y + btnBack.h/2);

            let startY = 190;
            SHOP_ITEMS.forEach((item, index) => {
                let rect = {x: 40, y: startY + index * 90, w: SCREEN_W - 80, h: 75};
                let isHover = mouseX > rect.x && mouseX < rect.x + rect.w && mouseY > rect.y && mouseY < rect.y + rect.h;
                let isBought = saveGame.shop[item.id as keyof typeof saveGame.shop];
                let canAfford = saveGame.coins >= item.cost && !isBought;

                ctx.fillStyle = isBought ? "rgba(76, 175, 80, 0.15)" : (isHover && canAfford ? "rgba(255,140,0,0.2)" : "rgba(255,255,255,0.05)");
                ctx.beginPath(); ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 15); ctx.fill();
                ctx.strokeStyle = isBought ? "#4caf50" : (canAfford ? "#ff8c00" : "#444");
                ctx.lineWidth = 2; ctx.stroke();

                ctx.font = "40px Arial"; ctx.textAlign = "left"; 
                ctx.fillText(item.icon, rect.x + 20, rect.y + rect.h/2 + 2);
                ctx.fillStyle = "white"; ctx.font = "bold 22px Arial";
                ctx.fillText(item.name, rect.x + 80, rect.y + rect.h/2 + 2);

                ctx.textAlign = "right"; ctx.font = "bold 24px Arial";
                if (isBought) { ctx.fillStyle = "#4caf50"; ctx.fillText("GEKAUFT", rect.x + rect.w - 20, rect.y + rect.h/2 + 2); } 
                else { ctx.fillStyle = canAfford ? "#ffd700" : "#666"; ctx.fillText(`${item.cost} M`, rect.x + rect.w - 20, rect.y + rect.h/2 + 2); }
            });
        }

        // --- GAME LOOP ---
        function gameLoop() {
            if (!ctx || !board) return;
            ctx.clearRect(0, 0, SCREEN_W, SCREEN_H);

            if (state === "MENU") { drawMenu(ctx); }
            else if (state === "SHOP") { drawShop(ctx); }
            else if (state === "PLAYING") {
                drawBackground(ctx);

                let res = board.updateConnections();
                isWon = res.isWon; maxPathDist = res.maxPathDist;

                if (isWon && flowFront === 0 && !flowFinished) {
                    winTime = Date.now(); playSound('water'); 
                    if (!usedCheat) { saveGame.score += 100; saveGame.coins += 20; saveGame.streak++; } 
                    else { saveGame.streak = 0; }
                }

                if (isWon) {
                    flowFront = (Date.now() - winTime) / 1000 * 6.0;
                    if (flowFront >= maxPathDist && !flowFinished) {
                        flowFinished = true; if(sounds['water']) sounds['water'].pause(); 
                        playSound('win'); saveProgress();
                    }
                }

                for (let y = 0; y < GRID_SIZE; y++) {
                    for (let x = 0; x < GRID_SIZE; x++) { board.grid[y][x].draw(ctx); }
                }

                drawHUD(ctx);
                drawBottomBar(ctx);

                if (isWon && flowFinished) {
                    ctx.fillStyle = "rgba(0,0,0,0.8)"; ctx.fillRect(0,0, SCREEN_W, SCREEN_H);
                    let bannerY = SCREEN_H / 2 - 120; let bannerH = 240;
                    ctx.save();
                    let bGrad = ctx.createLinearGradient(0, bannerY, 0, bannerY+bannerH);
                    bGrad.addColorStop(0, "#ff9d00"); bGrad.addColorStop(1, "#e65c00");
                    ctx.shadowColor = "rgba(0,0,0,0.8)"; ctx.shadowBlur = 30; ctx.fillStyle = bGrad;
                    ctx.beginPath(); ctx.roundRect(40, bannerY, SCREEN_W-80, bannerH, 25); ctx.fill(); ctx.shadowBlur = 0;
                    ctx.strokeStyle = "white"; ctx.lineWidth = 5; ctx.strokeRect(40, bannerY, SCREEN_W-80, bannerH);
                    
                    // Schließen/Home Button im Banner
                    ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.roundRect(SCREEN_W - 90, bannerY + 15, 35, 35, 8); ctx.fill();
                    ctx.fillStyle = "white"; ctx.font = "bold 20px Arial"; ctx.textAlign="center"; ctx.fillText("X", SCREEN_W - 72, bannerY + 33);

                    ctx.fillStyle = "white"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
                    ctx.font = "bold 55px 'Segoe UI', Arial"; 
                    if (usedCheat) {
                        ctx.fillText("GESCHUMMELT!", SCREEN_W/2, bannerY + 80);
                        ctx.font = "bold 24px Arial"; ctx.fillStyle = "#ffcccc";
                        ctx.fillText("Cheat genutzt! Keine Münzen.", SCREEN_W/2, bannerY + 140);
                    } else {
                        ctx.fillText("GESCHAFFT!", SCREEN_W/2, bannerY + 80);
                        ctx.font = "bold 28px Arial"; ctx.fillStyle = "#fff064";
                        ctx.fillText(`+100 Score  |  +20 Münzen`, SCREEN_W/2, bannerY + 140);
                    }
                    ctx.font = "22px Arial"; ctx.fillStyle = "rgba(255,255,255,0.9)";
                    ctx.fillText(`(Klicken für nächstes Level)`, SCREEN_W/2, bannerY + 195);
                    ctx.restore();
                }
            }

            animationFrameId = requestAnimationFrame(gameLoop);
        }

        // --- INPUT HANDLING ---
        function handleClick(e: MouseEvent) {
            if (!audioStarted) { audioStarted = true; playSound('bg'); }

            let rect = canvas!.getBoundingClientRect();
            let scaleX = canvas!.width / rect.width;
            let scaleY = canvas!.height / rect.height;
            mouseX = (e.clientX - rect.left) * scaleX;
            mouseY = (e.clientY - rect.top) * scaleY;

            if (state === "MENU") {
                let btnPlay = {x: SCREEN_W/2 - 150, y: 450, w: 300, h: 80};
                if (mouseX > btnPlay.x && mouseX < btnPlay.x + btnPlay.w && mouseY > btnPlay.y && mouseY < btnPlay.y + btnPlay.h) {
                    playSound('bing'); board = new GameBoard(); levelStartTime = Date.now(); state = "PLAYING";
                }
                let btnShop = {x: SCREEN_W/2 - 150, y: 560, w: 300, h: 60};
                if (mouseX > btnShop.x && mouseX < btnShop.x + btnShop.w && mouseY > btnShop.y && mouseY < btnShop.y + btnShop.h) {
                    playSound('bing'); state = "SHOP";
                }
            } 
            else if (state === "SHOP") {
                let btnBack = {x: 20, y: 20, w: 120, h: 45};
                if (mouseX > btnBack.x && mouseX < btnBack.x + btnBack.w && mouseY > btnBack.y && mouseY < btnBack.y + btnBack.h) {
                    playSound('bing'); state = "MENU"; return;
                }
                let startY = 190;
                SHOP_ITEMS.forEach((item, index) => {
                    let rect = {x: 40, y: startY + index * 90, w: SCREEN_W - 80, h: 75};
                    if (mouseX > rect.x && mouseX < rect.x + rect.w && mouseY > rect.y && mouseY < rect.y + rect.h) {
                        let isBought = saveGame.shop[item.id as keyof typeof saveGame.shop];
                        if (saveGame.coins >= item.cost && !isBought) {
                            saveGame.coins -= item.cost;
                            (saveGame.shop as any)[item.id] = true;
                            playSound('win'); saveProgress();
                        }
                    }
                });
            }
            else if (state === "PLAYING") {
                if (isWon && flowFinished) {
                    let bannerY = SCREEN_H / 2 - 120;
                    // Zurück zum Menü Button (X)
                    if (mouseX > SCREEN_W - 90 && mouseX < SCREEN_W - 55 && mouseY > bannerY + 15 && mouseY < bannerY + 50) {
                        state = "MENU";
                    } else {
                        saveGame.level++; saveProgress(); board = new GameBoard(); levelStartTime = Date.now();
                    }
                    if(sounds['water']) { sounds['water'].pause(); sounds['water'].currentTime = 0; }
                    isWon = false; flowFinished = false; flowFront = 0; usedCheat = false;
                    return;
                }

                // Powerups Klicken
                if (!isWon) {
                    let p_used = false;
                    const powerups = [
                        { id: 'hint', cost: 20, rect: {x: 30, y: SCREEN_H - BOTTOM_H + 10, w: 160, h: 40} },
                        { id: 'time', cost: 40, rect: {x: 220, y: SCREEN_H - BOTTOM_H + 10, w: 160, h: 40} },
                        { id: 'solve3', cost: 100, rect: {x: 410, y: SCREEN_H - BOTTOM_H + 10, w: 160, h: 40} }
                    ];
                    powerups.forEach(p => {
                        if (mouseX > p.rect.x && mouseX < p.rect.x + p.rect.w && mouseY > p.rect.y && mouseY < p.rect.y + p.rect.h) {
                            if (saveGame.coins >= p.cost) {
                                if (p.id === 'hint' && board!.autoSolve(1) > 0) { saveGame.coins -= p.cost; p_used = true; }
                                else if (p.id === 'solve3' && board!.autoSolve(3) > 0) { saveGame.coins -= p.cost; p_used = true; }
                                else if (p.id === 'time') { saveGame.coins -= p.cost; levelStartTime += 15000; p_used = true; playSound('bing'); }
                                if(p_used) saveProgress();
                            }
                        }
                    });
                    if(p_used) return;
                }

                let gridMy = mouseY - UI_H;
                let cx = Math.floor(mouseX / TILE_SIZE); let cy = Math.floor(gridMy / TILE_SIZE);
                if (!isWon && cx >= 0 && cx < GRID_SIZE && cy >= 0 && cy < GRID_SIZE && gridMy >= 0 && gridMy < GRID_H) {
                    board?.grid[cy][cx].rotate();
                }
            }
        }

        function handleMouseMove(e: MouseEvent) {
            let rect = canvas!.getBoundingClientRect();
            mouseX = (e.clientX - rect.left) * (canvas!.width / rect.width);
            mouseY = (e.clientY - rect.top) * (canvas!.height / rect.height);
        }

        // --- CHEAT CODE (Strg + Alt + Shift + S) ---
        function handleKeyDown(e: KeyboardEvent) {
            if (e.key.toLowerCase() === 's' && e.altKey && e.ctrlKey && e.shiftKey) {
                if (board && !isWon && state === "PLAYING") { board.autoSolve(); usedCheat = true; }
            }
        }

        canvas.addEventListener('mousedown', handleClick);
        canvas.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('keydown', handleKeyDown);
        
        loadAssets();

        return () => {
            canvas.removeEventListener('mousedown', handleClick);
            canvas.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('keydown', handleKeyDown);
            cancelAnimationFrame(animationFrameId);
            if(sounds['bg']) sounds['bg'].pause();
            if(sounds['water']) sounds['water'].pause();
        };
    }, []);

    return (
        <div style={{
            display: 'flex', justifyContent: 'center', alignItems: 'center', 
            height: '100vh', backgroundColor: '#0f0f13', 
            background: 'radial-gradient(circle at center, #23232f 0%, #050508 100%)'
        }}>
            <div style={{
                position: 'relative', width: '100%', maxWidth: '600px', 
                aspectRatio: '6 / 7.6', borderRadius: '20px', overflow: 'hidden',
                boxShadow: '0 30px 80px rgba(0,0,0,0.9), 0 0 40px rgba(255, 140, 0, 0.2) inset'
            }}>
                <canvas ref={canvasRef} width="600" height="760" style={{ width: '100%', height: '100%', display: 'block', cursor: 'pointer' }} />
            </div>
        </div>
    );
}