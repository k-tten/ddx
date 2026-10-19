import { HEIGHT, WIDTH } from "./constants";
import { controller, resolveCollision } from "./controller";
import { Enemy } from "./enemy";
import { ExplosionParticle } from "./explosion";
import { setup } from "./setup";
import { sounds } from "./sounds";

const { canvas, ctx } = setup();

function createInitialEnemies() {
    return [new Enemy("x^4", { x: 250, y: -150 })];
}

let enemies = createInitialEnemies();
const explosionParticles: ExplosionParticle[] = [];

let lastFrameTime: number | undefined;
let frameRequested = false;
let gameState: "ready" | "playing" | "gameover" = "ready";
let gameOverSound: AudioBufferSourceNode | null = null;
let gameTrack: AudioBufferSourceNode | null = null;
let gameStartSoundPending = false;

void sounds.suspend();

function stopGameTrack() {
    const track = gameTrack;
    gameTrack = null;
    track?.stop();
}

function startGameTrack() {
    if (gameState !== "playing" || document.hidden || gameStartSoundPending || gameTrack) return;

    gameTrack = sounds.play("gametrack", 0, true);
    if (gameTrack) {
        const track = gameTrack;
        sounds.fadeIn(track, 2, 0.25);
        track.addEventListener("ended", () => {
            if (gameTrack === track) gameTrack = null;
        }, { once: true });
    }
}

function playGameStartSequence() {
    gameStartSoundPending = true;
    const startSound = sounds.play("gamestart", 0.5);

    if (!startSound) {
        gameStartSoundPending = false;
        startGameTrack();
        return;
    }

    startSound.addEventListener("ended", () => {
        gameStartSoundPending = false;
        startGameTrack();
    }, { once: true });
}

function drawOverlay(gameOver: boolean) {
    ctx.save();
    ctx.fillStyle = gameOver ? "rgba(0, 0, 0, 0.75)" : "rgba(0, 0, 0, 0.55)";
    ctx.fillRect(-WIDTH / 2, -HEIGHT / 2, WIDTH, HEIGHT);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    ctx.font = "600 42px Arial, sans-serif";
    ctx.fillText(gameOver ? "Game over" : "Click to start", 0, -42);

    const buttonWidth = 240;
    const buttonHeight = 64;
    const buttonY = 32;
    ctx.fillStyle = "#5269ff";
    ctx.fillRect(-buttonWidth / 2, buttonY, buttonWidth, buttonHeight);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.strokeRect(-buttonWidth / 2, buttonY, buttonWidth, buttonHeight);
    ctx.fillStyle = "#fff";
    ctx.font = "600 28px Arial, sans-serif";
    ctx.fillText(gameOver ? "Restart" : "Start game", 0, buttonY + buttonHeight / 2);
    ctx.restore();
}

drawOverlay(false);

function raf(t: number) {
    frameRequested = false;

    if (gameState !== "playing") return;

    if (document.hidden) {
        lastFrameTime = undefined;
        return;
    }

    const dt = lastFrameTime === undefined ? 0 : (t - lastFrameTime) / 1000;
    lastFrameTime = t;

    for (const particle of explosionParticles)
        particle.update(dt);

    for (let i = explosionParticles.length - 1; i >= 0; i--)
        if (!explosionParticles[i].alive) explosionParticles.splice(i, 1);

    ctx.clearRect(-WIDTH / 2, -HEIGHT / 2, WIDTH, HEIGHT);

    controller.update(dt);
    controller.render(ctx);

    const splitEnemies = new Set<Enemy>();
    const spawnedEnemies: Enemy[] = [];

    for (const enemy of enemies) {
        enemy.update(dt, controller.pos, enemies);
        if (enemy.isBulletHitByLaser(controller.pos, controller.radius)
            && controller.takeLaserDamage()) {
            sounds.play("hurt", 0.5, false, 0.5);

            if (controller.health <= 0) {
                gameState = "gameover";
                stopGameTrack();
                sounds.stopAll();
                gameOverSound = sounds.play("gamelost", 0.2, false, 0.5);
                if (gameOverSound) {
                    gameOverSound.addEventListener("ended", () => {
                        gameOverSound = null;
                        void sounds.suspend();
                    }, { once: true });
                } else {
                    void sounds.suspend();
                }
                ctx.clearRect(-WIDTH / 2, -HEIGHT / 2, WIDTH, HEIGHT);
                drawOverlay(true);
                return;
            }
        }

        resolveCollision(controller, enemy);
        enemy.beginBulletCollisionFrame();
        for (let bulletIndex = controller.bullets.length - 1; bulletIndex >= 0; bulletIndex--) {
            const bullet = controller.bullets[bulletIndex];
            if (enemy.isBulletHitByLaser(bullet.pos, bullet.radius)) {
                if (enemy.shouldReduceBulletLifetime(bullet)) {
                    bullet.reduceLifetime(3);
                }

                if (bullet.dead) {
                    sounds.playRandom("bulletdead", 0.05);
                    for (let i = 0; i < 8; i++) {
                        explosionParticles.push(new ExplosionParticle(bullet.pos, "#0398fc"));
                    }

                    controller.bullets.splice(bulletIndex, 1);
                    continue;
                }
            }

            if (!resolveCollision(enemy, bullet, 0.8, "hit", 0.2)) continue;

            const children = enemy.takeBulletHit(bullet);

            if (children !== null) {
                controller.heal(2);

                splitEnemies.add(enemy);
                spawnedEnemies.push(...children);
                enemy.dispose();

                for (let i = 0; i < 16; i++)
                    explosionParticles.push(new ExplosionParticle(enemy.position, enemy.colour));

                sounds.playRandom("explosion", 0.2);
                break;
            }
        }

        enemy.endBulletCollisionFrame();
    }

    const remainingEnemies = enemies.filter((enemy) => !splitEnemies.has(enemy));

    for (let i = 0; i < remainingEnemies.length; i++) {
        for (let j = i + 1; j < remainingEnemies.length; j++) {
            resolveCollision(remainingEnemies[i], remainingEnemies[j]);
        }
    }

    enemies.splice(0, enemies.length, ...remainingEnemies, ...spawnedEnemies);

    for (const enemy of enemies) {
        enemy.updateLaserSoundVolume(enemies.length);
    }

    for (const particle of explosionParticles)
        particle.render(ctx);

    for (const enemy of enemies)
        enemy.render(ctx);

    controller.renderHitVignette(ctx);

    scheduleFrame();
}

function scheduleFrame() {
    if (gameState !== "playing" || document.hidden || frameRequested) return;
    frameRequested = true;
    requestAnimationFrame(raf);
}

function restartGame() {
    for (const enemy of enemies) {
        enemy.dispose();
    }
    enemies = createInitialEnemies();
    explosionParticles.length = 0;
    controller.reset();
    lastFrameTime = undefined;
    ctx.clearRect(-WIDTH / 2, -HEIGHT / 2, WIDTH, HEIGHT);
    gameState = "playing";
    void sounds.resume();
    playGameStartSequence();
    scheduleFrame();
}

canvas.addEventListener("mousedown", (event) => {
    if (gameState !== "playing") event.stopPropagation();
});

canvas.addEventListener("click", () => {
    if (gameState === "gameover") {
        restartGame();
    } else if (gameState === "ready") {
        gameState = "playing";
        void sounds.resume();
        playGameStartSequence();
        scheduleFrame();
    }
});

document.addEventListener("visibilitychange", () => {
    lastFrameTime = undefined;
    if (document.hidden) {
        stopGameTrack();
        void sounds.suspend();
    } else if (gameState === "playing" || gameOverSound) {
        void sounds.resume();
        startGameTrack();
    }
    scheduleFrame();
});