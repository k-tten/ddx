import type { ConstantNode, MathNode, ParenthesisNode } from "mathjs/number";
import { OperatorNode, derivative, parse, simplify } from "mathjs/number";
import { CURVE_TOLERANCE, HEIGHT, INITIAL_STEP, MAX_DEPTH, MAX_JUMP, MIN_STEP, RESOLUTION, WIDTH } from "./constants";
import { texsvg } from "./setup";
import { sounds } from "./sounds";

type Point = { x: number; y: number };

function isOperatorNode(node: MathNode): node is OperatorNode {
    return node.type === "OperatorNode";
}

function unwrapParentheses(node: MathNode): MathNode {
    while (node.type === "ParenthesisNode")
        node = (node as ParenthesisNode).content;

    return node;
}

function splitTerms(node: MathNode): string[] {
    const terms: string[] = [];

    const visit = (current: MathNode, sign: 1 | -1) => {
        if (isOperatorNode(current)) {
            if (current.op === "+" && current.args.length === 2) {
                visit(current.args[0], sign);
                visit(current.args[1], sign);
                return;
            }

            if (current.op === "-" && current.args.length === 2) {
                visit(current.args[0], sign);
                visit(current.args[1], sign === 1 ? -1 : 1);
                return;
            }

            if (current.op === "-" && current.args.length === 1) {
                visit(current.args[0], sign === 1 ? -1 : 1);
                return;
            }
        }

        const expression = current.toString();
        terms.push(sign === 1 ? expression : `-(${expression})`);
    };

    visit(node, 1);
    return terms;
}

function scalarValue(node: MathNode): number | undefined {
    const unwrapped = unwrapParentheses(node);
    if (unwrapped.type === "ConstantNode") {
        const value = (unwrapped as ConstantNode).value;
        return typeof value === "number" ? value : undefined;
    }

    if (isOperatorNode(unwrapped) && unwrapped.op === "-" && unwrapped.args.length === 1) {
        const value = scalarValue(unwrapped.args[0]);
        return value === undefined ? undefined : -value;
    }

    return undefined;
}

function scalarProduct(
    node: MathNode,
): { coefficient: number; functionNode: MathNode } | undefined {
    const unwrapped = unwrapParentheses(node);

    if (isOperatorNode(unwrapped) && unwrapped.op === "-" && unwrapped.args.length === 1) {
        const product = scalarProduct(unwrapped.args[0]);

        return product
            ? { coefficient: -product.coefficient, functionNode: product.functionNode }
            : undefined;
    }

    if (!isOperatorNode(unwrapped) || unwrapped.op !== "*" || unwrapped.args.length !== 2)
        return undefined;

    const leftScalar = scalarValue(unwrapped.args[0]);
    const rightScalar = scalarValue(unwrapped.args[1]);

    if (leftScalar !== undefined)
        return { coefficient: leftScalar, functionNode: unwrapped.args[1] };

    if (rightScalar !== undefined)
        return { coefficient: rightScalar, functionNode: unwrapped.args[0] };

    return undefined;
}

function derivativeChildren(node: MathNode): string[] | undefined {
    const product = scalarProduct(node);

    if (!product || !Number.isInteger(product.coefficient)) return undefined;

    const count = Math.abs(product.coefficient);

    if (count === 0) return [];

    const expression = product.functionNode.toString();
    const childExpression = product.coefficient < 0 ? `-(${expression})` : expression;

    return Array.from({ length: count }, () => childExpression);
}

function simplifyForDisplay(node: MathNode): MathNode {
    const simplified = simplify(node);

    return simplified.transform((current) => {
        if (!isOperatorNode(current) || current.op !== "/") return current;

        let numerator: MathNode = current;
        const denominatorFactors: MathNode[] = [];

        while (isOperatorNode(numerator) && numerator.op === "/") {
            denominatorFactors.unshift(numerator.args[1]);
            numerator = numerator.args[0];
        }

        if (denominatorFactors.length < 2) return current;

        const denominator = denominatorFactors.reduce((product, factor) => (
            new OperatorNode("*", "multiply", [product, factor])
        ));

        return new OperatorNode("/", "divide", [numerator, denominator]);
    });
}

export class Enemy {
    static RADIUS = 18;
    static MAX_RADIUS = 32;
    static RADIUS_PER_EXTRA_CHARACTER = 0.65;
    static HIT_RADIUS_SHRINK = 2;
    static SPLIT_RADIUS = 16;
    static HIT_INVULNERABILITY_DURATION = 0.25;
    static SPAWN_INVULNERABILITY_DURATION = 0.25;
    static MASS = 400;
    static ROTATION_SPEED = 0.6;
    static DRAG = 2;
    static PREFERRED_DISTANCE = 300;
    static ORBIT_DISTANCE_VARIATION = 100;
    static DISTANCE_TOLERANCE = 24;
    static ORBIT_SPEED = 75;
    static DISTANCE_RESPONSE = 0.8;
    static MAX_RADIAL_SPEED = 140;
    static MOVEMENT_RESPONSE = 3;
    static AVOIDANCE_DISTANCE = 140;
    static AVOIDANCE_SPEED = 180;
    static ORBIT_SWITCH_MIN = 4;
    static ORBIT_SWITCH_MAX = 9;
    static OFF_DURATION_MIN = 1.5;
    static OFF_DURATION_MAX = 3.5;
    static WARNING_DURATION = 0.8;
    static LASER_DURATION_MIN = 0.5;
    static LASER_DURATION_MAX = 2;
    static LASER_FADE_DURATION = 0.25;
    static LASER_WIDTH = 3;
    static LASER_SOUND_VOLUME = 0.05;

    readonly expression: string;
    readonly position: Point;
    readonly pos: Point;
    readonly vel = { x: 0, y: 0 };
    radius: number;
    readonly colour: string;
    readonly #baseOffDuration = Enemy.OFF_DURATION_MIN + Math.random() * (Enemy.OFF_DURATION_MAX - Enemy.OFF_DURATION_MIN);
    #cycleOffDuration = this.#baseOffDuration;
    readonly laserDuration = Enemy.LASER_DURATION_MIN + Math.random() * (Enemy.LASER_DURATION_MAX - Enemy.LASER_DURATION_MIN);
    readonly preferredDistance = Enemy.PREFERRED_DISTANCE + (Math.random() * 2 - 1) * Enemy.ORBIT_DISTANCE_VARIATION;
    rotation = Math.random() * Math.PI * 2;

    readonly #fn: MathNode;
    readonly #isConstantFunction: boolean;
    readonly #expressionImage: HTMLImageElement;
    readonly #rotationDirection = Math.random() < 0.5 ? -1 : 1;
    #orbitDirection = Math.random() < 0.5 ? -1 : 1;
    #orbitSwitchTimer = this.#nextOrbitSwitchTime();
    #invulnerabilityTime = Enemy.SPAWN_INVULNERABILITY_DURATION;
    #hitFlashTime = 0;
    #laserChargeSound: AudioBufferSourceNode | null = null;
    #laserHumSound: AudioBufferSourceNode | null = null;
    #bulletContacts = new Set<object>();
    #currentBulletContacts = new Set<object>();
    #laserBulletContacts = new Set<object>();
    #currentLaserBulletContacts = new Set<object>();
    #cycleTime: number;
    #laserPointsCache: (Point | undefined)[] | null = null;
    #hitFlashElapsed = 0;

    constructor (
        expression: string,
        position: Point = { x: 0, y: 0 },
        colour = "#e34b4b",
    ) {
        this.expression = expression;
        this.radius = Math.min(
            Enemy.MAX_RADIUS,
            Enemy.RADIUS + Math.max(0, expression.length - 3) * Enemy.RADIUS_PER_EXTRA_CHARACTER,
        );
        this.position = { ...position };
        this.pos = this.position;
        this.colour = colour;
        this.#cycleTime = Math.random() * this.offDuration;
        this.#fn = parse(expression);
        this.#isConstantFunction = simplify(derivative(this.#fn, "x")).toString() === "0";
        this.#expressionImage = new Image();
        const displayExpression = simplifyForDisplay(this.#fn)
            .toTex()
            .replace(/\\cdot\s*/g, "");
        this.#expressionImage.src = texsvg(displayExpression);
    }

    get mass() {
        return Enemy.MASS * (this.radius / Enemy.RADIUS) ** 2;
    }

    get offDuration() {
        return this.#cycleOffDuration;
    }

    beginBulletCollisionFrame() {
        this.#currentBulletContacts = new Set<object>();
        this.#currentLaserBulletContacts = new Set<object>();
    }

    endBulletCollisionFrame() {
        this.#bulletContacts = this.#currentBulletContacts;
        this.#laserBulletContacts = this.#currentLaserBulletContacts;
    }

    shouldReduceBulletLifetime(bullet: object): boolean {
        this.#currentLaserBulletContacts.add(bullet);
        return !this.#laserBulletContacts.has(bullet);
    }

    takeBulletHit(bullet: object): Enemy[] | null {
        this.#currentBulletContacts.add(bullet);
        if (this.#bulletContacts.has(bullet) || this.#invulnerabilityTime > 0) return null;

        this.radius = Math.max(0, this.radius - Enemy.HIT_RADIUS_SHRINK);
        this.#invulnerabilityTime = Enemy.HIT_INVULNERABILITY_DURATION;
        this.#hitFlashTime = Enemy.HIT_INVULNERABILITY_DURATION;
        this.#hitFlashElapsed = 0;
        if (this.radius > Enemy.SPLIT_RADIUS) return null;

        return this.#split();
    }

    #split(): Enemy[] {
        const deriv = simplify(derivative(this.#fn, "x"));
        if (deriv.toString() === "0") return [];

        const node = unwrapParentheses(this.#fn);
        let expressions = splitTerms(node);

        if (expressions.length <= 1) {
            expressions = [];
            const product = scalarProduct(node);

            if (product && Number.isInteger(product.coefficient)) {
                const count = Math.abs(product.coefficient);
                const isGroupedFunction = product.functionNode.type === "ParenthesisNode";
                const groupedFunction = isGroupedFunction
                    ? (product.functionNode as ParenthesisNode).content.toString()
                    : undefined;
                let childExpression = deriv.toString();
                if (groupedFunction !== undefined) {
                    childExpression = product.coefficient < 0
                        ? `-(${groupedFunction})`
                        : groupedFunction;
                }

                if (count === 0) return [];
                for (let i = 0; i < count; i++) {
                    expressions.push(childExpression);
                }
            }

            if (expressions.length === 0) {
                expressions = derivativeChildren(deriv)
                    ?? [deriv.toString()];
            }
        }

        if (expressions.length === 1 && expressions[0] === "0") return [];

        const children = expressions.map((expression) => new Enemy(
            expression,
            this.position,
            this.colour,
        ));

        const angleOffset = Math.random() * Math.PI * 2;
        const maxChildRadius = Math.max(...children.map((child) => child.radius));
        const spreadRadius = Math.max(
            this.radius + maxChildRadius + 4,
            children.length * maxChildRadius / Math.PI,
        );

        children.forEach((child, index) => {
            const angle = angleOffset
                + (Math.PI * 2 * index) / children.length
                + (Math.random() - 0.5) * 0.25;
            const directionX = Math.cos(angle);
            const directionY = Math.sin(angle);
            const speed = 90 + Math.random() * 40;

            child.position.x += directionX * spreadRadius;
            child.position.y += directionY * spreadRadius;
            child.vel.x = this.vel.x * 0.35 + directionX * speed;
            child.vel.y = this.vel.y * 0.35 + directionY * speed;
        });

        return children;
    }

    #nextOrbitSwitchTime() {
        return Enemy.ORBIT_SWITCH_MIN
            + Math.random() * (Enemy.ORBIT_SWITCH_MAX - Enemy.ORBIT_SWITCH_MIN);
    }

    #getOffDuration(enemyCount: number) {
        return this.#baseOffDuration * (1 + Math.log10(Math.max(1, enemyCount)));
    }

    #syncLaserSounds() {
        const warningStart = this.offDuration;
        const laserStart = warningStart + Enemy.WARNING_DURATION;
        const warning = this.#cycleTime >= warningStart && this.#cycleTime < laserStart;
        const laserActive = this.#cycleTime >= laserStart;

        if (warning && !this.#laserChargeSound) {
            this.#laserChargeSound = sounds.playRandom(
                "lasercharge",
                Enemy.LASER_SOUND_VOLUME,
                true,
                0.7,
            );
        } else if (!warning && this.#laserChargeSound) {
            this.#laserChargeSound.stop();
            this.#laserChargeSound = null;
        }

        if (laserActive && !this.#laserHumSound) {
            this.#laserHumSound = sounds.playRandom("laserhum", Enemy.LASER_SOUND_VOLUME, true, 0.95);
        } else if (!laserActive && this.#laserHumSound) {
            this.#laserHumSound.stop();
            this.#laserHumSound = null;
        }
    }

    get isLaserWarning() {
        const warningStart = this.offDuration;
        const laserStart = warningStart + Enemy.WARNING_DURATION;
        return this.#cycleTime >= warningStart && this.#cycleTime < laserStart;
    }

    updateLaserSoundVolume(enemyCount: number) {
        if (enemyCount <= 0) return;

        const perceivedDoublings = Math.log10(enemyCount);
        const volume = Enemy.LASER_SOUND_VOLUME / Math.pow(2, perceivedDoublings);

        if (this.#laserChargeSound) {
            sounds.setPlaybackVolume(this.#laserChargeSound, volume);
        }
        if (this.#laserHumSound) {
            sounds.setPlaybackVolume(this.#laserHumSound, volume);
        }
    }

    dispose() {
        if (this.#laserChargeSound) {
            this.#laserChargeSound.stop();
            this.#laserChargeSound = null;
        }
        if (this.#laserHumSound) {
            this.#laserHumSound.stop();
            this.#laserHumSound = null;
        }
    }

    update(dt: number, target: Point, otherEnemies: readonly Enemy[] = []) {
        this.#laserPointsCache = null;
        this.#invulnerabilityTime = Math.max(0, this.#invulnerabilityTime - dt);
        this.#hitFlashTime = Math.max(0, this.#hitFlashTime - dt);
        this.#hitFlashElapsed += dt;

        const enemyCount = Math.max(1, otherEnemies.length);
        if (this.#cycleTime < this.offDuration) {
            const offProgress = this.#cycleTime / this.offDuration;
            this.#cycleOffDuration = this.#getOffDuration(enemyCount);
            this.#cycleTime = offProgress * this.#cycleOffDuration;
        }

        this.#orbitSwitchTimer -= dt;
        if (this.#orbitSwitchTimer <= 0) {
            this.#orbitDirection *= -1;
            this.#orbitSwitchTimer = this.#nextOrbitSwitchTime();
        }

        const dx = this.position.x - target.x;
        const dy = this.position.y - target.y;
        const distance = Math.hypot(dx, dy);
        const radialX = distance > 0 ? dx / distance : 1;
        const radialY = distance > 0 ? dy / distance : 0;
        const distanceError = this.preferredDistance - distance;
        const radialSpeed = Math.abs(distanceError) <= Enemy.DISTANCE_TOLERANCE
            ? 0
            : Math.max(
                -Enemy.MAX_RADIAL_SPEED,
                Math.min(Enemy.MAX_RADIAL_SPEED, distanceError * Enemy.DISTANCE_RESPONSE),
            );
        const tangentX = -radialY * this.#orbitDirection;
        const tangentY = radialX * this.#orbitDirection;
        let targetVelX = radialX * radialSpeed + tangentX * Enemy.ORBIT_SPEED;
        let targetVelY = radialY * radialSpeed + tangentY * Enemy.ORBIT_SPEED;

        let avoidanceX = 0;
        let avoidanceY = 0;
        for (const other of otherEnemies) {
            if (other === this) continue;

            const awayX = this.position.x - other.position.x;
            const awayY = this.position.y - other.position.y;
            const separation = Math.hypot(awayX, awayY);
            if (separation >= Enemy.AVOIDANCE_DISTANCE) continue;

            const strength = 1 - separation / Enemy.AVOIDANCE_DISTANCE;
            const inverseDistance = 1 / (separation || 1);
            avoidanceX += awayX * inverseDistance * strength;
            avoidanceY += awayY * inverseDistance * strength;
        }

        const avoidanceMagnitude = Math.hypot(avoidanceX, avoidanceY);
        if (avoidanceMagnitude > 0) {
            const avoidanceStrength = Math.min(1, avoidanceMagnitude);
            targetVelX += avoidanceX / avoidanceMagnitude
                * Enemy.AVOIDANCE_SPEED * avoidanceStrength;
            targetVelY += avoidanceY / avoidanceMagnitude
                * Enemy.AVOIDANCE_SPEED * avoidanceStrength;
        }

        this.vel.x += (targetVelX - this.vel.x) * Math.min(1, Enemy.MOVEMENT_RESPONSE * dt);
        this.vel.y += (targetVelY - this.vel.y) * Math.min(1, Enemy.MOVEMENT_RESPONSE * dt);

        this.position.x += this.vel.x * dt;
        this.position.y += this.vel.y * dt;

        const damping = Math.exp(-Enemy.DRAG * dt);
        this.vel.x *= damping;
        this.vel.y *= damping;

        const halfW = WIDTH / 2;
        const halfH = HEIGHT / 2;
        const r = this.radius;

        if (this.position.x + r > halfW) {
            this.position.x = halfW - r;
            this.vel.x = -Math.abs(this.vel.x) * 0.6;
        } else if (this.position.x - r < -halfW) {
            this.position.x = -halfW + r;
            this.vel.x = Math.abs(this.vel.x) * 0.6;
        }

        if (this.position.y + r > halfH) {
            this.position.y = halfH - r;
            this.vel.y = -Math.abs(this.vel.y) * 0.6;
        } else if (this.position.y - r < -halfH) {
            this.position.y = -halfH + r;
            this.vel.y = Math.abs(this.vel.y) * 0.6;
        }

        this.rotation = (this.rotation
            + this.#rotationDirection * Enemy.ROTATION_SPEED * dt) % (Math.PI * 2);

        const cycleDuration = this.offDuration
            + Enemy.WARNING_DURATION
            + this.laserDuration;
        this.#cycleTime += dt;
        let currentCycleDuration = cycleDuration;
        while (this.#cycleTime >= currentCycleDuration) {
            this.#cycleTime -= currentCycleDuration;
            this.#cycleOffDuration = this.#getOffDuration(enemyCount);
            currentCycleDuration = this.offDuration
                + Enemy.WARNING_DURATION
                + this.laserDuration;
        }
        this.#syncLaserSounds();
    }

    #getLaserPoints(): (Point | undefined)[] {
        if (this.#laserPointsCache) return this.#laserPointsCache;

        const evaluateAt = (x: number): Point | undefined => {
            const value = this.#isConstantFunction ? 0 : this.#fn.evaluate({ x });
            if (typeof value !== "number" || !Number.isFinite(value)) return undefined;

            const y = -value * RESOLUTION;
            if (!Number.isFinite(y)) return undefined;

            return { x: x * RESOLUTION, y };
        };

        const points: (Point | undefined)[] = [];

        const drawAdaptive = (
            startX: number,
            endX: number,
            a: Point | undefined,
            b: Point | undefined,
            depth: number,
        ) => {
            const width = endX - startX;
            const midX = (startX + endX) / 2;
            const mid = evaluateAt(midX);
            const allValid = a !== undefined && b !== undefined && mid !== undefined;

            let subdivide = !allValid;

            if (allValid) {
                const error = Math.abs(mid.y - (a.y + b.y) / 2);
                const jump = Math.max(
                    Math.abs(a.y - mid.y),
                    Math.abs(mid.y - b.y),
                );
                subdivide = error > CURVE_TOLERANCE || jump > MAX_JUMP;
            }

            if (subdivide && depth < MAX_DEPTH && width * RESOLUTION > MIN_STEP) {
                drawAdaptive(startX, midX, a, mid, depth + 1);
                drawAdaptive(midX, endX, mid, b, depth + 1);
                return;
            }

            if (!allValid) {
                points.push(undefined);
                if (b) points.push(b);
                return;
            }

            if (subdivide) {
                points.push(undefined, b);
                return;
            }

            points.push(b);
        };

        const cos = Math.cos(this.rotation);
        const sin = Math.sin(this.rotation);
        const projectedCorners = [
            { x: -WIDTH / 2, y: -HEIGHT / 2 },
            { x: WIDTH / 2, y: -HEIGHT / 2 },
            { x: -WIDTH / 2, y: HEIGHT / 2 },
            { x: WIDTH / 2, y: HEIGHT / 2 },
        ].map(({ x, y }) => (
            (cos * (x - this.position.x) + sin * (y - this.position.y)) / RESOLUTION
        ));
        const start = Math.min(...projectedCorners);
        const end = Math.max(...projectedCorners);
        let previous = evaluateAt(start);
        points.push(previous);

        for (let x = start; x < end; x += INITIAL_STEP / RESOLUTION) {
            const nextX = Math.min(x + INITIAL_STEP / RESOLUTION, end);
            const next = evaluateAt(nextX);
            drawAdaptive(x, nextX, previous, next, 0);
            previous = next;
        }

        this.#laserPointsCache = points;
        return points;
    }

    isBulletHitByLaser(point: Point, radius: number): boolean {
        const laserStart = this.offDuration + Enemy.WARNING_DURATION;
        if (this.#cycleTime < laserStart) return false;

        const cos = Math.cos(this.rotation);
        const sin = Math.sin(this.rotation);
        const localPoint = {
            x: cos * (point.x - this.position.x) + sin * (point.y - this.position.y),
            y: -sin * (point.x - this.position.x) + cos * (point.y - this.position.y),
        };
        const hitDistance = radius + Enemy.LASER_WIDTH / 2;
        const hitDistanceSq = hitDistance * hitDistance;
        let previous: Point | undefined;

        for (const current of this.#getLaserPoints()) {
            if (!current) {
                previous = undefined;
                continue;
            }

            if (previous) {
                const dx = current.x - previous.x;
                const dy = current.y - previous.y;
                const segmentLengthSq = dx * dx + dy * dy;
                const t = segmentLengthSq === 0
                    ? 0
                    : Math.max(0, Math.min(
                        1,
                        ((localPoint.x - previous.x) * dx
                            + (localPoint.y - previous.y) * dy) / segmentLengthSq,
                    ));
                const nearestX = previous.x + t * dx;
                const nearestY = previous.y + t * dy;
                const distanceX = localPoint.x - nearestX;
                const distanceY = localPoint.y - nearestY;

                if (distanceX * distanceX + distanceY * distanceY <= hitDistanceSq) {
                    return true;
                }
            }

            previous = current;
        }

        return false;
    }

    render(ctx: CanvasRenderingContext2D) {
        const warningStart = this.offDuration;
        const laserStart = warningStart + Enemy.WARNING_DURATION;
        const warning = this.#cycleTime >= warningStart && this.#cycleTime < laserStart;
        const laserActive = this.#cycleTime >= laserStart;
        const hitFlashing = this.#hitFlashTime > 0
            && Math.sin(this.#hitFlashElapsed * Math.PI * 2 * 12) > 0;

        ctx.save();
        ctx.translate(this.position.x, this.position.y);
        ctx.rotate(this.rotation);

        if (warning || laserActive) {
            const points = this.#getLaserPoints();

            if (warning) {
                const warningProgress = (this.#cycleTime - warningStart) / Enemy.WARNING_DURATION;
                const flashRate = 3 + warningProgress * 9;
                ctx.globalAlpha = 0.2 + (Math.sin(this.#cycleTime * Math.PI * 2 * flashRate) + 1) * 0.25;
                ctx.setLineDash([8, 7]);
            } else {
                const fadeStart = laserStart + this.laserDuration - Enemy.LASER_FADE_DURATION;
                if (this.#cycleTime > fadeStart) {
                    const fadeProgress = (this.#cycleTime - fadeStart) / Enemy.LASER_FADE_DURATION;
                    ctx.globalAlpha = 1 - fadeProgress;
                }
            }

            ctx.beginPath();
            let drawing = false;
            for (const point of points) {
                if (!point) {
                    drawing = false;
                    continue;
                }

                if (!drawing) {
                    ctx.moveTo(point.x, point.y);
                    drawing = true;
                } else {
                    ctx.lineTo(point.x, point.y);
                }
            }

            ctx.strokeStyle = this.colour;
            ctx.lineWidth = warning ? 2 : Enemy.LASER_WIDTH;
            ctx.shadowColor = hitFlashing ? "#fff" : this.colour;
            ctx.shadowBlur = warning ? 0 : 12;
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;
            ctx.shadowBlur = 0;
        }

        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = "#b42335";
        ctx.fill();

        ctx.beginPath();
        ctx.arc(0, 0, this.radius - 2, 0, Math.PI * 2);
        ctx.fillStyle = hitFlashing ? "rgba(255, 255, 255, 0.75)" : "#f06473";
        ctx.fill();

        if (this.#expressionImage.complete && this.#expressionImage.naturalWidth > 0) {
            const maxImageSize = (this.radius - 2) * Math.SQRT2;
            const scale = Math.min(
                maxImageSize / this.#expressionImage.naturalWidth,
                maxImageSize / this.#expressionImage.naturalHeight,
            );
            const imageWidth = this.#expressionImage.naturalWidth * scale;
            const imageHeight = this.#expressionImage.naturalHeight * scale;

            ctx.drawImage(
                this.#expressionImage,
                -imageWidth / 2,
                -imageHeight / 2,
                imageWidth,
                imageHeight,
            );
        }

        ctx.restore();
    }
}
