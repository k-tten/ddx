type SoundOptions = {
    volume?: number;
    voices?: number;
};

type Sound = {
    buffer: AudioBuffer;
    voices: number;
    volume: number;
    nextVoice: number;
    active: Set<AudioBufferSourceNode>;
};

class SoundManager {
    #context = new AudioContext();
    #masterGain = this.#context.createGain();

    #sounds = new Map<string, Sound>();
    #loading = new Map<string, Promise<void>>();
    #randomizable = new Map<string, number>();
    #voiceGains = new WeakMap<AudioBufferSourceNode, { gain: GainNode; sound: Sound }>();

    constructor () {
        this.#masterGain.connect(this.#context.destination);
    }

    async load(
        name: string,
        src: string,
        options: SoundOptions = {}
    ): Promise<void> {
        if (this.#sounds.has(name)) return;

        const existing = this.#loading.get(name);
        if (existing) return existing;

        const { volume = 1, voices = 8 } = options;

        const promise = (async () => {
            const response = await fetch(src);

            if (!response.ok) {
                throw new Error(
                    `sounds: failed to load '${name}' (${response.status})`
                );
            }

            const buffer = await this.#context.decodeAudioData(
                await response.arrayBuffer()
            );

            this.#sounds.set(name, {
                buffer,
                voices: Math.max(1, Math.floor(voices)),
                volume: Math.max(0, Math.min(1, volume)),
                nextVoice: 0,
                active: new Set(),
            });

            const matches = name.match(/^(\w+)(\d+)$/);

            if (matches) {
                const [, base, num] = matches;
                this.#randomizable.set(
                    base,
                    Math.max(
                        +num,
                        this.#randomizable.get(base) ?? 0
                    )
                );
            }
        })();

        this.#loading.set(name, promise);

        try {
            await promise;
        } finally {
            this.#loading.delete(name);
        }
    }

    async loadAll(
        entries: Record<string, string | {
            src: string;
            volume?: number;
            voices?: number;
        }>
    ): Promise<void> {
        await Promise.all(
            Object.entries(entries).map(([name, entry]) =>
                typeof entry === "string"
                    ? this.load(name, entry)
                    : this.load(name, entry.src, entry)
            )
        );
    }

    playRandom(
        name: string,
        volume = 1,
        loop = false,
        playbackRate = 1,
    ): AudioBufferSourceNode | null {
        const count = this.#randomizable.get(name);

        if (!count) {
            throw new ReferenceError(
                `sounds: '${name}' is not randomizable`
            );
        }

        const available = Array.from(
            { length: count },
            (_, i) => `${name}${i + 1}`
        ).filter((key) => this.#sounds.has(key));

        if (available.length === 0) {
            console.warn(`sounds: no loaded variations for '${name}'`);
            return null;
        }

        const selected =
            available[Math.floor(Math.random() * available.length)];

        return this.play(selected, volume, loop, playbackRate);
    }

    play(
        name: string,
        volume = 1,
        loop = false,
        playbackRate = 1,
    ): AudioBufferSourceNode | null {
        const sound = this.#sounds.get(name);

        if (!sound) return null;

        if (this.#context.state === "suspended") {
            void this.#context.resume();
        }

        let source: AudioBufferSourceNode | undefined;

        if (sound.active.size >= sound.voices) {
            source = [...sound.active][sound.nextVoice % sound.active.size];
            sound.nextVoice++;
            source.stop();
        }

        const voiceGain = this.#context.createGain();
        const newSource = this.#context.createBufferSource();

        newSource.buffer = sound.buffer;
        newSource.loop = loop;
        newSource.playbackRate.value = playbackRate;
        voiceGain.gain.value = Math.max(
            0,
            Math.min(1, sound.volume * volume)
        );

        newSource.connect(voiceGain);
        voiceGain.connect(this.#masterGain);

        sound.active.add(newSource);
        this.#voiceGains.set(newSource, { gain: voiceGain, sound });

        newSource.addEventListener("ended", () => {
            sound.active.delete(newSource);
            newSource.disconnect();
            voiceGain.disconnect();
        }, { once: true });

        newSource.start();

        return newSource;
    }

    setPlaybackVolume(source: AudioBufferSourceNode, volume: number): void {
        const voice = this.#voiceGains.get(source);
        if (!voice) return;

        voice.gain.gain.setTargetAtTime(
            voice.sound.volume * Math.max(0, Math.min(1, volume)),
            this.#context.currentTime,
            0.03,
        );
    }

    fadeIn(source: AudioBufferSourceNode, duration: number, volume = 1): void {
        const voice = this.#voiceGains.get(source);
        if (!voice) return;

        const gain = voice.gain.gain;
        const now = this.#context.currentTime;
        const targetVolume = voice.sound.volume * Math.max(0, Math.min(1, volume));

        gain.cancelScheduledValues(now);
        gain.setValueAtTime(0, now);
        gain.linearRampToValueAtTime(targetVolume, now + Math.max(0, duration));
    }

    setVolume(name: string, volume: number): void {
        const sound = this.#sounds.get(name);
        const value = Math.max(0, Math.min(1, volume));

        if (sound) {
            sound.volume = value;
        }
    }

    stopAll(): void {
        for (const sound of this.#sounds.values()) {
            for (const source of sound.active) {
                source.stop();
            }
        }
    }

    setMasterVolume(volume: number): void {
        this.#masterGain.gain.setTargetAtTime(
            Math.max(0, Math.min(1, volume)),
            this.#context.currentTime,
            0.01
        );
    }

    async resume(): Promise<void> {
        if (this.#context.state === "suspended") {
            await this.#context.resume();
        }
    }

    async suspend(): Promise<void> {
        if (this.#context.state === "running") {
            await this.#context.suspend();
        }
    }

    getDuration(name: string): number {
        const sound = this.#sounds.get(name);

        if (!sound)
            throw new ReferenceError(`sounds: '${name}' is not loaded`);

        return sound.buffer.duration;
    }
}

export const sounds = new SoundManager();
