(async () => {
  "use strict";

  const data = window.PROTOTYPE_DATA;
  const root = document.getElementById("prototype");
  const stage = document.getElementById("stage");
  const screen = document.getElementById("screen");
  const hotspotLayer = document.getElementById("hotspots");
  const status = document.getElementById("status");
  const error = document.getElementById("error");

  if (!data?.slides?.length) {
    error.hidden = false;
    return;
  }

  const params = new URLSearchParams(window.location.search);
  root.classList.toggle("debug", params.get("debug") === "1");

  let current = 1;
  let transitionTimer = null;
  const assetEntries = new Map();
  const objectUrls = new Map();

  const getSlide = (number) => data.slides[number - 1];

  const loadAssetPack = async () => {
    const partNames = Array.from({ length: 9 }, (_, index) => `./screens.pack.${String(index).padStart(2, "0")}`);
    const parts = await Promise.all(partNames.map(async (partName) => {
      const response = await fetch(partName);
      if (!response.ok) throw new Error(`Asset pack request failed: ${partName} (${response.status})`);
      return new Uint8Array(await response.arrayBuffer());
    }));
    const totalLength = parts.reduce((total, part) => total + part.length, 0);
    const combined = new Uint8Array(totalLength);
    let writeOffset = 0;
    parts.forEach((part) => {
      combined.set(part, writeOffset);
      writeOffset += part.length;
    });
    const bytes = combined.buffer;
    const view = new DataView(bytes);
    const headerLength = view.getUint32(0, true);
    const headerBytes = new Uint8Array(bytes, 4, headerLength);
    const header = JSON.parse(new TextDecoder().decode(headerBytes));
    const dataOffset = 4 + headerLength;
    header.entries.forEach((entry) => {
      assetEntries.set(entry.name, {
        bytes,
        start: dataOffset + entry.offset,
        end: dataOffset + entry.offset + entry.length,
        type: entry.type,
      });
    });
  };

  const getImageSource = (imagePath) => {
    const name = imagePath.split("/").pop();
    if (objectUrls.has(name)) return objectUrls.get(name);
    const asset = assetEntries.get(name);
    if (!asset) throw new Error(`Missing packed image: ${name}`);
    const url = URL.createObjectURL(new Blob([asset.bytes.slice(asset.start, asset.end)], { type: asset.type }));
    objectUrls.set(name, url);
    return url;
  };

  const prefetchTargets = (slide) => {
    const uniqueTargets = new Set(slide.hotspots.map((hotspot) => hotspot.target));
    uniqueTargets.forEach((target) => {
      const image = new Image();
      image.src = getImageSource(getSlide(target).image);
    });
  };

  const renderHotspots = (slide) => {
    const fragment = document.createDocumentFragment();

    slide.hotspots.forEach((hotspot, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "hotspot";
      button.dataset.target = String(hotspot.target);
      button.setAttribute("aria-label", `Перейти к экрану ${hotspot.target}`);
      button.style.left = `${hotspot.x}%`;
      button.style.top = `${hotspot.y}%`;
      button.style.width = `${hotspot.width}%`;
      button.style.height = `${hotspot.height}%`;
      button.style.zIndex = String(index + 1);
      if (hotspot.caption) {
        button.classList.add("hotspot--caption");
        button.textContent = hotspot.caption;
      }
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        navigate(hotspot.target);
      });
      fragment.appendChild(button);
    });

    hotspotLayer.replaceChildren(fragment);
  };

  const show = (number, announce = true) => {
    const slide = getSlide(number);
    current = number;
    error.hidden = true;
    screen.alt = `Экран мобильного приложения ${number}`;
    screen.src = getImageSource(slide.image);
    renderHotspots(slide);
    prefetchTargets(slide);
    if (announce) status.textContent = `Открыт экран ${number}`;
  };

  const navigate = (target) => {
    if (!Number.isInteger(target) || !getSlide(target) || target === current) return;
    if (transitionTimer) window.clearTimeout(transitionTimer);

    hotspotLayer.style.pointerEvents = "none";
    stage.classList.add("is-changing");
    transitionTimer = window.setTimeout(() => {
      show(target);
      window.requestAnimationFrame(() => {
        stage.classList.remove("is-changing");
        hotspotLayer.style.pointerEvents = "auto";
      });
    }, 150);
  };

  screen.addEventListener("error", () => {
    error.hidden = false;
  });

  document.addEventListener("dragstart", (event) => event.preventDefault());
  window.addEventListener("keydown", (event) => {
    const navigationKeys = new Set([
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "PageUp",
      "PageDown",
      "Home",
      "End",
    ]);
    const isButton = event.target instanceof HTMLButtonElement;
    if (navigationKeys.has(event.key) || (event.key === " " && !isButton)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

  window.addEventListener("pagehide", () => {
    objectUrls.forEach((url) => URL.revokeObjectURL(url));
  });

  try {
    await loadAssetPack();
    show(1, false);
  } catch (packError) {
    console.error(packError);
    error.hidden = false;
  }
})();
