import { DEBUG, HEIGHT, WIDTH } from "./constants";
import { texsvg } from "./setup";
import { sounds } from "./sounds";

const ddxsvg = texsvg(String.raw`\frac{\mathrm{d}}{\mathrm{d}x}`);
const ddximg = new Image();
ddximg.src = ddxsvg;

ddximg.onerror = console.error;

await new Promise((res) => ddximg.onload = res);

class Bullet {
    static RADIUS = 4;
    static SPEED = 500;
    static LIFETIME = 3;
    static RESTITUTION = 0.8;

    pos = { x: 0, y: 0 };
    vel = { x: 0, y: 0 };

    age = 0;
    opacity = 1;

    radius = Bullet.RADIUS;
    mass = this.radius * this.radius;

    constructor (x: number, y: number, direction: number) {
        this.pos.x = x;
        this.pos.y = y;

        this.vel.x = Math.cos(direction) * Bullet.SPEED;
        this.vel.y = Math.sin(direction) * Bullet.SPEED;
    }

    get dead() {
        return this.age >= Bullet.LIFETIME;
    }

    reduceLifetime(seconds: number) {
        this.age = Math.min(Bullet.LIFETIME, this.age + seconds);
    }

    update(dt: number) {
        this.age += dt;

        const t = Math.min(this.age / Bullet.LIFETIME, 1);
        this.opacity = 1 - Math.pow(t, 4);

        if (this.dead) return;

        this.pos.x += this.vel.x * dt;
        this.pos.y += this.vel.y * dt;

        const halfW = WIDTH / 2;
        const halfH = HEIGHT / 2;
        const r = this.radius;
        const bounce = Bullet.RESTITUTION;

        if (this.pos.x + r > halfW) {
            this.pos.x = halfW - r;
            this.vel.x = -Math.abs(this.vel.x) * bounce;
            sounds.playRandom("collide", 0.02);
        } else if (this.pos.x - r < -halfW) {
            this.pos.x = -halfW + r;
            this.vel.x = Math.abs(this.vel.x) * bounce;
            sounds.playRandom("collide", 0.02);
        }

        if (this.pos.y + r > halfH) {
            this.pos.y = halfH - r;
            this.vel.y = -Math.abs(this.vel.y) * bounce;
            sounds.playRandom("collide", 0.02);
        } else if (this.pos.y - r < -halfH) {
            this.pos.y = -halfH + r;
            this.vel.y = Math.abs(this.vel.y) * bounce;
            sounds.playRandom("collide", 0.02);
        }
    }

    render(ctx: CanvasRenderingContext2D) {
        ctx.save();
        ctx.globalAlpha = this.opacity;

        ctx.beginPath();
        ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = "#0398fc";
        ctx.fill();

        ctx.restore();
    }
}

export const controller = {
    MAX_VEL: 300,
    VELOCITY_RESPONSE: 10,
    MAX_ACC: 1200,
    DEAD_ZONE: 2,

    radius: 20,
    mass: 67_999_420,
    MAX_HEALTH: 100,
    LASER_DAMAGE: 10,
    HIT_INVULNERABILITY_DURATION: 1,
    health: 100,
    invulnerabilityTime: 0,
    hitFlashTime: 0,
    hitVignetteTime: 0,
    HIT_VIGNETTE_DURATION: 0.4,

    SHOW_RETICLE: true,
    RETICLE_SPACING: 50,
    RETICLE_RADIUS: 6,

    pos: { x: 0, y: 0 },
    vel: { x: 0, y: 0 },
    acc: { x: 0, y: 0 },

    bullets: [] as Bullet[],

    SHOT_COOLDOWN: 0.25,
    shotCooldown: 0,
    SHOT_RECOIL: 200,

    takeLaserDamage() {
        if (this.invulnerabilityTime > 0) return false;

        this.health -= this.LASER_DAMAGE;
        this.invulnerabilityTime = this.HIT_INVULNERABILITY_DURATION;
        this.hitFlashTime = this.HIT_INVULNERABILITY_DURATION;
        this.hitVignetteTime = this.HIT_VIGNETTE_DURATION;
        return true;
    },

    heal(amount: number) {
        this.health = Math.min(this.MAX_HEALTH, this.health + amount);
    },

    reset() {
        this.health = this.MAX_HEALTH;
        this.invulnerabilityTime = 0;
        this.hitFlashTime = 0;
        this.hitVignetteTime = 0;
        this.pos.x = 0;
        this.pos.y = 0;
        this.vel.x = 0;
        this.vel.y = 0;
        this.acc.x = 0;
        this.acc.y = 0;
        this.bullets.length = 0;
        this.shotCooldown = 0;
    },

    render(ctx: CanvasRenderingContext2D) {
        const dx = mouse.x - this.pos.x;
        const dy = mouse.y - this.pos.y;
        const distance = Math.hypot(dx, dy);

        if (this.SHOW_RETICLE) {
            const dirX = dx / (distance || 1);
            const dirY = dy / (distance || 1);

            const halfW = WIDTH / 2;
            const halfH = HEIGHT / 2;

            let x = this.pos.x;
            let y = this.pos.y;

            let vx = dirX;
            let vy = dirY;

            ctx.fillStyle = "#000";

            ctx.globalAlpha = 0.1;
            ctx.beginPath();
            ctx.arc(mouse.x, mouse.y, this.RETICLE_RADIUS, 0, 2 * Math.PI);
            ctx.fill();

            ctx.globalAlpha = 0.075;

            let remaining = distance;
            let travelled = 0;

            while (travelled < remaining) {
                const step = Math.min(this.RETICLE_SPACING, remaining - travelled);

                const tx = vx > 0
                    ? (halfW - x) / vx
                    : vx < 0
                        ? (-halfW - x) / vx
                        : Infinity;

                const ty = vy > 0
                    ? (halfH - y) / vy
                    : vy < 0
                        ? (-halfH - y) / vy
                        : Infinity;

                const wallDistance = Math.min(tx, ty);

                if (wallDistance <= step) {
                    x += vx * wallDistance;
                    y += vy * wallDistance;
                    travelled += wallDistance;

                    if (tx <= ty) vx *= -1;
                    if (ty <= tx) vy *= -1;

                    continue;
                }

                x += vx * step;
                y += vy * step;
                travelled += step;

                ctx.beginPath();
                ctx.arc(x, y, this.RETICLE_RADIUS * 0.75, 0, 2 * Math.PI);
                ctx.fill();
            }

            ctx.globalAlpha = 1;
        }

        //

        const a = Math.atan2(dy, dx);

        ctx.save();

        ctx.translate(this.pos.x, this.pos.y);
        ctx.rotate(a);

        ctx.fillStyle = "#555";
        ctx.fillRect(16, -6, 6, 12)

        ctx.restore();

        ctx.beginPath();
        ctx.arc(this.pos.x, this.pos.y, this.radius, 0, 2 * Math.PI);
        ctx.closePath();
        ctx.fillStyle = "#5269ff";
        ctx.fill();

        ctx.beginPath();
        ctx.arc(this.pos.x, this.pos.y, this.radius - 2, 0, 2 * Math.PI);
        ctx.closePath();
        const flashing = this.hitFlashTime > 0
            && Math.sin((this.HIT_INVULNERABILITY_DURATION - this.hitFlashTime) * Math.PI * 2 * 12) > 0;
        ctx.fillStyle = flashing ? "rgba(255, 255, 255, 0.75)" : "#52a3ff";
        ctx.fill();

        ctx.drawImage(ddximg, this.pos.x - this.radius / 2, this.pos.y - this.radius / 2 - 4, this.radius, this.radius + 8);

        const healthBarWidth = this.radius * 1.5;
        const healthBarHeight = 3;
        const healthBarX = this.pos.x - healthBarWidth / 2;
        const healthBarY = this.pos.y + this.radius + 4;
        const healthRatio = Math.max(0, this.health / this.MAX_HEALTH);

        ctx.fillStyle = "#333";
        ctx.fillRect(healthBarX, healthBarY, healthBarWidth, healthBarHeight);
        ctx.fillStyle = "#20b85a";
        ctx.fillRect(healthBarX, healthBarY, healthBarWidth * healthRatio, healthBarHeight);

        //

        const barWidth = 18;
        const barHeight = 1;

        const progress = this.shotCooldown / this.SHOT_COOLDOWN;

        const x = this.pos.x - barWidth / 2;
        const y = this.pos.y;

        ctx.fillStyle = "#000";
        ctx.fillRect(x, y, barWidth, barHeight);

        ctx.fillStyle = "#fff";
        ctx.fillRect(
            x + barWidth * (1 - progress),
            y,
            barWidth * progress,
            barHeight
        );

        //

        if (DEBUG) {
            ctx.beginPath();
            ctx.moveTo(this.pos.x, this.pos.y);
            ctx.lineTo(this.pos.x + this.vel.x, this.pos.y + this.vel.y);
            ctx.closePath();
            ctx.strokeStyle = "#0f0";
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(this.pos.x, this.pos.y);
            ctx.lineTo(this.pos.x + this.acc.x, this.pos.y + this.acc.y);
            ctx.closePath();
            ctx.strokeStyle = "#ff0";
            ctx.stroke();
        }

        for (const bullet of this.bullets) {
            bullet.render(ctx);
        }
    },

    renderHitVignette(ctx: CanvasRenderingContext2D) {
        if (this.hitVignetteTime <= 0) return;

        const progress = this.hitVignetteTime / this.HIT_VIGNETTE_DURATION;
        const halfWidth = WIDTH / 2;
        const halfHeight = HEIGHT / 2;
        const horizontalBand = WIDTH * 0.07;
        const verticalBand = HEIGHT * 0.07;
        const edgeColour = `rgba(200, 0, 0, ${0.22 * progress})`;
        const clear = "rgba(200, 0, 0, 0)";

        ctx.save();
        let gradient = ctx.createLinearGradient(-halfWidth, 0, -halfWidth + horizontalBand, 0);
        gradient.addColorStop(0, edgeColour);
        gradient.addColorStop(1, clear);
        ctx.fillStyle = gradient;
        ctx.fillRect(-halfWidth, -halfHeight, horizontalBand, HEIGHT);

        gradient = ctx.createLinearGradient(halfWidth, 0, halfWidth - horizontalBand, 0);
        gradient.addColorStop(0, edgeColour);
        gradient.addColorStop(1, clear);
        ctx.fillStyle = gradient;
        ctx.fillRect(halfWidth - horizontalBand, -halfHeight, horizontalBand, HEIGHT);

        gradient = ctx.createLinearGradient(0, -halfHeight, 0, -halfHeight + verticalBand);
        gradient.addColorStop(0, edgeColour);
        gradient.addColorStop(1, clear);
        ctx.fillStyle = gradient;
        ctx.fillRect(-halfWidth, -halfHeight, WIDTH, verticalBand);

        gradient = ctx.createLinearGradient(0, halfHeight, 0, halfHeight - verticalBand);
        gradient.addColorStop(0, edgeColour);
        gradient.addColorStop(1, clear);
        ctx.fillStyle = gradient;
        ctx.fillRect(-halfWidth, halfHeight - verticalBand, WIDTH, verticalBand);
        ctx.restore();
    },

    update(dt: number) {
        this.invulnerabilityTime = Math.max(0, this.invulnerabilityTime - dt);
        this.hitFlashTime = Math.max(0, this.hitFlashTime - dt);
        this.hitVignetteTime = Math.max(0, this.hitVignetteTime - dt);

        const dx = mouse.x - this.pos.x;
        const dy = mouse.y - this.pos.y;
        const distance = Math.hypot(dx, dy);

        const targetSpeed = distance > this.DEAD_ZONE
            ? Math.min(
                this.MAX_VEL,
                Math.sqrt(2 * this.MAX_ACC * (distance - this.DEAD_ZONE)),
            )
            : 0;
        const targetVelX = distance > 0 ? dx / distance * targetSpeed : 0;
        const targetVelY = distance > 0 ? dy / distance * targetSpeed : 0;

        this.acc.x = (targetVelX - this.vel.x) * this.VELOCITY_RESPONSE;
        this.acc.y = (targetVelY - this.vel.y) * this.VELOCITY_RESPONSE;

        const accMag = Math.hypot(this.acc.x, this.acc.y);
        if (accMag > this.MAX_ACC) {
            this.acc.x *= this.MAX_ACC / accMag;
            this.acc.y *= this.MAX_ACC / accMag;
        }

        this.vel.x += this.acc.x * dt;
        this.vel.y += this.acc.y * dt;

        const speed = Math.hypot(this.vel.x, this.vel.y);
        if (speed > this.MAX_VEL) {
            this.vel.x *= this.MAX_VEL / speed;
            this.vel.y *= this.MAX_VEL / speed;
        }

        this.pos.x += this.vel.x * dt;
        this.pos.y += this.vel.y * dt;

        const bounce = 0.6;
        const r = this.radius;

        const halfW = WIDTH / 2;
        const halfH = HEIGHT / 2;

        if (this.pos.x + r > halfW) {
            this.pos.x = halfW - r;
            this.vel.x = -Math.abs(this.vel.x) * bounce;

            if (Math.abs(this.vel.x) > 5) sounds.playRandom("collide", 0.02);
        } else if (this.pos.x - r < -halfW) {
            this.pos.x = -halfW + r;
            this.vel.x = Math.abs(this.vel.x) * bounce;
            if (Math.abs(this.vel.x) > 5) sounds.playRandom("collide", 0.02);
        }

        if (this.pos.y + r > halfH) {
            this.pos.y = halfH - r;
            this.vel.y = -Math.abs(this.vel.y) * bounce;
            if (Math.abs(this.vel.y) > 5) sounds.playRandom("collide", 0.02);
        } else if (this.pos.y - r < -halfH) {
            this.pos.y = -halfH + r;
            this.vel.y = Math.abs(this.vel.y) * bounce;
            if (Math.abs(this.vel.y) > 5) sounds.playRandom("collide", 0.02);
        }

        //

        this.shotCooldown = Math.max(0, this.shotCooldown - dt);

        this.bullets = this.bullets.filter((bullet) => {
            bullet.update(dt);
            return !bullet.dead;
        });

        for (const bullet of this.bullets) {
            resolveCollision(this, bullet, 0.8);
        }

        for (let i = 0; i < this.bullets.length; i++) {
            for (let j = i + 1; j < this.bullets.length; j++) {
                resolveCollision(
                    this.bullets[i],
                    this.bullets[j],
                    0.8
                );
            }
        }
    },

    get heading() {
        return Math.atan2(this.vel.y, this.vel.x);
    },

    Bullet,
};

export const mouse = { x: 0, y: 0 };

document.addEventListener("mousemove", (event) => {
    mouse.x = event.clientX - window.innerWidth / 2;
    mouse.y = event.clientY - window.innerHeight / 2;
});

document.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    if (controller.shotCooldown > 0) return;

    controller.shotCooldown = controller.SHOT_COOLDOWN;

    mouse.x = event.clientX - window.innerWidth / 2;
    mouse.y = event.clientY - window.innerHeight / 2;

    const dx = mouse.x - controller.pos.x;
    const dy = mouse.y - controller.pos.y;
    const distance = Math.hypot(dx, dy);

    if (distance < 1e-8) return;

    const dirX = dx / distance;
    const dirY = dy / distance;

    const spawnDistance =
        controller.radius + Bullet.RADIUS + 1;

    const bullet = new Bullet(
        controller.pos.x + dirX * spawnDistance,
        controller.pos.y + dirY * spawnDistance,
        Math.atan2(dy, dx)
    );

    bullet.vel.x += controller.vel.x;
    bullet.vel.y += controller.vel.y;

    controller.bullets.push(bullet);

    controller.vel.x -= dirX * controller.SHOT_RECOIL;
    controller.vel.y -= dirY * controller.SHOT_RECOIL;

    sounds.playRandom("bulletshoot", 0.1);
});

export type CircularMassAffectable = {
    pos: { x: number; y: number };
    vel: { x: number; y: number };
    radius: number;
    mass: number;
}

export function resolveCollision(
    a: CircularMassAffectable,
    b: CircularMassAffectable,
    restitution = 0.8,
    sound = "collide",
    volume = 0.02,
): boolean {
    let dx = b.pos.x - a.pos.x;
    let dy = b.pos.y - a.pos.y;

    const distanceSq = dx * dx + dy * dy;
    const minDistance = a.radius + b.radius;

    if (distanceSq >= minDistance * minDistance) return false;

    let distance = Math.sqrt(distanceSq);

    if (distance < 1e-8) {
        dx = 1;
        dy = 0;
        distance = 1;
    }

    const nx = dx / distance;
    const ny = dy / distance;

    const invMassA = 1 / a.mass;
    const invMassB = 1 / b.mass;
    const invMassSum = invMassA + invMassB;

    const overlap = minDistance - distance;
    const correction = overlap / invMassSum;

    a.pos.x -= nx * correction * invMassA;
    a.pos.y -= ny * correction * invMassA;
    b.pos.x += nx * correction * invMassB;
    b.pos.y += ny * correction * invMassB;

    const rvx = b.vel.x - a.vel.x;
    const rvy = b.vel.y - a.vel.y;
    const velAlongNormal = rvx * nx + rvy * ny;

    if (velAlongNormal >= 0) return true;

    const impulse = -(1 + restitution) * velAlongNormal
        / invMassSum;

    a.vel.x -= impulse * invMassA * nx;
    a.vel.y -= impulse * invMassA * ny;

    b.vel.x += impulse * invMassB * nx;
    b.vel.y += impulse * invMassB * ny;

    sounds.playRandom(sound, volume);
    return true;
}