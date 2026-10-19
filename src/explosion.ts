export class ExplosionParticle {
    #age = 0;
    readonly #lifetime = 0.3 + Math.random() * 0.25;
    readonly #radius = 1.5 + Math.random() * 2.5;
    readonly #velocity: { x: number; y: number };
    readonly pos: { x: number; y: number };

    constructor (position: { x: number; y: number }, readonly colour: string) {
        this.pos = { ...position };
        const angle = Math.random() * Math.PI * 2;
        const speed = 50 + Math.random() * 130;
        this.#velocity = {
            x: Math.cos(angle) * speed,
            y: Math.sin(angle) * speed,
        };
    }

    get alive() {
        return this.#age < this.#lifetime;
    }

    update(dt: number) {
        this.#age += dt;
        this.pos.x += this.#velocity.x * dt;
        this.pos.y += this.#velocity.y * dt;
    }

    render(ctx: CanvasRenderingContext2D) {
        ctx.globalAlpha = Math.max(0, 1 - this.#age / this.#lifetime);
        ctx.fillStyle = this.colour;
        ctx.beginPath();
        ctx.arc(this.pos.x, this.pos.y, this.#radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }
}