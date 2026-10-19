const tiltEffectSettings = {
    max: 2,
    perspective: 2000,
    scale: 1,
    speed: 500,
    easing: "cubic-bezier(.03,.98,.52,.99)",

    shadow: true,
    shadowOffset: 10,
    shadowBlur: 10,
    shadowOpacity: 0.1,

    defaultShadow: "0px 10px 30px rgba(0, 0, 0, 0.1)"
};

export function tiltreg(element: HTMLElement, ...copies: string[]) {
    element.addEventListener("mouseenter", cardMouseEnter);
    element.addEventListener("mousemove", cardMouseMove);
    element.addEventListener("mouseleave", cardMouseLeave);

    element.dataset.copies = copies.join(",");
}

export function tiltdereg(element: HTMLElement) {
    element.removeEventListener("mouseenter", cardMouseEnter);
    element.removeEventListener("mousemove", cardMouseMove);
    element.removeEventListener("mouseleave", cardMouseLeave);

    delete element.dataset.copies;
    delete element.dataset.transitionTimeoutId;
}

function cardMouseEnter(event: MouseEvent) {
    setTransition(event);
}

function cardMouseMove(event: MouseEvent) {
    const card = event.currentTarget as HTMLElement;

    const cardWidth = card.offsetWidth;
    const cardHeight = card.offsetHeight;

    const rect = card.getBoundingClientRect();
    const centerX = rect.left + cardWidth / 2;
    const centerY = rect.top + cardHeight / 2;

    const mouseX = event.clientX - centerX;
    const mouseY = event.clientY - centerY;

    const rotateXUncapped =
        tiltEffectSettings.max * mouseY / (cardHeight / 2);

    const rotateYUncapped =
        -tiltEffectSettings.max * mouseX / (cardWidth / 2);

    const rotateX = Math.max(
        -tiltEffectSettings.max,
        Math.min(tiltEffectSettings.max, rotateXUncapped)
    );

    const rotateY = Math.max(
        -tiltEffectSettings.max,
        Math.min(tiltEffectSettings.max, rotateYUncapped)
    );

    const transform = `
        perspective(${tiltEffectSettings.perspective}px)
        rotateX(${rotateX}deg)
        rotateY(${rotateY}deg)
        scale3d(
            ${tiltEffectSettings.scale},
            ${tiltEffectSettings.scale},
            ${tiltEffectSettings.scale}
        )
    `;

    const shadowX = -rotateY * tiltEffectSettings.shadowOffset;
    const shadowY = rotateX * tiltEffectSettings.shadowOffset;

    const shadow = tiltEffectSettings.shadow
        ? `${shadowX}px ${shadowY}px ${tiltEffectSettings.shadowBlur}px rgba(0, 0, 0, ${tiltEffectSettings.shadowOpacity})`
        : "none";

    for (const copy of card.dataset.copies?.split(",") ?? []) {
        const el = document.getElementById(copy);

        if (!el) continue;

        el.style.transform = transform;
        el.style.boxShadow = shadow;
    }

    card.style.transform = transform;
    card.style.boxShadow = shadow;
}

function cardMouseLeave(event: MouseEvent) {
    const card = event.currentTarget as HTMLElement;

    const transform = `
        perspective(${tiltEffectSettings.perspective}px)
        rotateX(0deg)
        rotateY(0deg)
        scale3d(1, 1, 1)
    `;

    const shadow = tiltEffectSettings.shadow
        ? tiltEffectSettings.defaultShadow
        : "none";

    for (const copy of card.dataset.copies?.split(",") ?? []) {
        const el = document.getElementById(copy);

        if (!el) continue;

        el.style.transform = transform;
        el.style.boxShadow = shadow;
    }

    card.style.transform = transform;
    card.style.boxShadow = shadow;

    setTransition(event);
}

function setTransition(event: MouseEvent) {
    const card = event.currentTarget as HTMLElement;

    clearTimeout(+(card.dataset.transitionTimeoutId || 0));

    const transition = `
        transform ${tiltEffectSettings.speed}ms ${tiltEffectSettings.easing},
        box-shadow ${tiltEffectSettings.speed}ms ${tiltEffectSettings.easing}
    `;

    for (const copy of card.dataset.copies?.split(",") ?? []) {
        const el = document.getElementById(copy);

        if (!el) continue;

        el.style.transition = transition;
    }

    card.style.transition = transition;

    card.dataset.transitionTimeoutId = String(
        setTimeout(() => {
            card.style.transition = "";

            for (const copy of card.dataset.copies?.split(",") ?? []) {
                const el = document.getElementById(copy);

                if (!el) continue;

                el.style.transition = "";
            }
        }, tiltEffectSettings.speed)
    );
}
