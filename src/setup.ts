import { RegisterHTMLHandler } from "@mathjax/src/cjs/handlers/html.js";
import { TeX } from "@mathjax/src/cjs/input/tex.js";
import { mathjax } from "@mathjax/src/cjs/mathjax.js";
import { SVG } from "@mathjax/src/cjs/output/svg.js";
import { HTMLAdaptor } from "@mathjax/src/js/adaptors/HTMLAdaptor.js";
import { HEIGHT, RESOLUTION, WIDTH } from "./constants";
import { tiltreg } from "./tilt";

import "./sounds.loader";

const adaptor = new HTMLAdaptor(window as any);
RegisterHTMLHandler(adaptor)

const jaxdoc = mathjax.document("", {
    InputJax: new TeX(),
    OutputJax: new SVG(),
});

const xmlser = new XMLSerializer();
export const texsvg = (tex: string) => "data:image/svg+xml;base64," + btoa(xmlser.serializeToString(jaxdoc.convert(tex).children[0]));

export function setup() {
    const bg = document.createElement("canvas");
    bg.id = "bg";
    const btx = bg.getContext("2d")!;

    const canvas = document.createElement("canvas");
    canvas.id = "canvas";
    const ctx = canvas.getContext("2d")!;

    tiltreg(canvas, "bg");

    btx.canvas.width = ctx.canvas.width = WIDTH;
    btx.canvas.height = ctx.canvas.height = HEIGHT;
    btx.canvas.style.width = ctx.canvas.style.width = WIDTH + "px";
    btx.canvas.style.height = ctx.canvas.style.height = HEIGHT + "px";

    document.body.appendChild(btx.canvas);
    document.body.appendChild(ctx.canvas);

    btx.translate(WIDTH / 2, HEIGHT / 2);
    ctx.translate(WIDTH / 2, HEIGHT / 2);

    btx.lineWidth = 0.5;

    btx.fillStyle = "#aaa";

    btx.font = "8px Arial";
    btx.textAlign = "end";

    for (let x = -WIDTH / 2; x < WIDTH / 2; x += RESOLUTION / 4) {
        if (x % RESOLUTION === 0) {
            btx.strokeStyle = "#aaa";
            btx.beginPath();
            btx.moveTo(x, -HEIGHT / 2);
            btx.lineTo(x, HEIGHT / 2);
            btx.closePath();
            btx.stroke();

            btx.fillText((x / RESOLUTION).toString(), x - 3, 10);
        } else if (x % (RESOLUTION / 2) === 0) {
            btx.strokeStyle = "#ccc";
            btx.beginPath();
            btx.moveTo(x, -HEIGHT / 2);
            btx.lineTo(x, HEIGHT / 2);
            btx.closePath();
            btx.stroke();
        } else {
            btx.strokeStyle = "#ccc";
            btx.beginPath();
            btx.moveTo(x, -3);
            btx.lineTo(x, 3);
            btx.closePath();
            btx.stroke();
        }
    }

    for (let y = -HEIGHT / 2; y < HEIGHT / 2; y += RESOLUTION / 4) {
        if (y === 0) continue;

        if (y % RESOLUTION === 0) {
            btx.strokeStyle = "#aaa";
            btx.beginPath();
            btx.moveTo(-WIDTH / 2, y);
            btx.lineTo(WIDTH / 2, y);
            btx.closePath();
            btx.stroke();

            btx.fillText((-y / RESOLUTION).toString(), -3, y + 10);
        } else if (y % (RESOLUTION / 2) === 0) {
            btx.strokeStyle = "#ccc";
            btx.beginPath();
            btx.moveTo(-WIDTH / 2, y);
            btx.lineTo(WIDTH / 2, y);
            btx.closePath();
            btx.stroke();
        } else {
            btx.strokeStyle = "#ccc";
            btx.beginPath();
            btx.moveTo(-3, y);
            btx.lineTo(3, y);
            btx.closePath();
            btx.stroke();
        }
    }

    btx.strokeStyle = "#999";
    btx.lineWidth = 0.5;

    btx.beginPath();
    btx.moveTo(-WIDTH / 2, 0);
    btx.lineTo(WIDTH / 2, 0);
    btx.moveTo(0, -HEIGHT / 2);
    btx.lineTo(0, HEIGHT / 2);
    btx.closePath();
    btx.stroke();

    //

    //

    return { bg, canvas, btx, ctx };
}