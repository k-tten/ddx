import fs from "fs";

fs.writeFileSync(
    "src/sounds.loader.ts",
    `\
import { sounds } from "./sounds";

await sounds.loadAll({
${fs
    .readdirSync("sounds")
    .map(
        (name) => `\
    ${name.slice(0, -".wav".length)}: {
        src: "./sounds/${name}",
        volume: 0.6,
        voices: 4,
    },`,
    )
    .join("\n")}
});`,
);
