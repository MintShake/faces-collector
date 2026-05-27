const gallery = document.querySelector("#gallery");
const summary = document.querySelector("#summary");
const search = document.querySelector("#search");
const refresh = document.querySelector("#refresh");
const empty = document.querySelector("#empty");
const drawer = document.querySelector("#drawer");
const drawerContent = document.querySelector("#drawerContent");
const closeDrawer = document.querySelector("#closeDrawer");

let data = { totalFids: 0, totalImages: 0, fids: [] };

refresh.addEventListener("click", load);
search.addEventListener("input", render);
closeDrawer.addEventListener("click", () => {
  drawer.hidden = true;
});

await load();

async function load() {
  refresh.disabled = true;

  try {
    const response = await fetch("/api/pfps");

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    data = await response.json();
    render();
  } catch (error) {
    summary.textContent = error instanceof Error ? error.message : "Could not load gallery.";
  } finally {
    refresh.disabled = false;
  }
}

function render() {
  const query = search.value.trim();
  const fids = query
    ? data.fids.filter((item) => String(item.fid).includes(query))
    : data.fids;

  summary.textContent = `${data.totalFids.toLocaleString()} FIDs, ${data.totalImages.toLocaleString()} saved PFP images`;
  empty.hidden = fids.length > 0;
  gallery.replaceChildren(...fids.map(renderFidCard));
}

function renderFidCard(item) {
  const card = document.createElement("article");
  card.className = "fid-card";

  const button = document.createElement("button");
  button.className = "fid-button";
  button.type = "button";
  button.addEventListener("click", () => openDrawer(item));

  const stack = document.createElement("div");
  stack.className = "stack";

  for (const image of item.images.slice(0, 3)) {
    stack.append(imageElement(image, `FID ${item.fid} PFP`));
  }

  const meta = document.createElement("div");
  meta.className = "fid-meta";
  meta.append(textElement("strong", "fid", `FID ${item.fid}`));
  meta.append(textElement("span", "count", `${item.images.length} saved image${item.images.length === 1 ? "" : "s"}`));
  meta.append(textElement("span", "date", formatDate(item.latest?.storedAt ?? item.images[0]?.storedAt)));

  button.append(stack, meta);

  const strip = document.createElement("div");
  strip.className = "strip";

  for (const image of item.images.slice(0, 12)) {
    strip.append(imageElement(image, `FID ${item.fid} history thumbnail`));
  }

  card.append(button, strip);
  return card;
}

function openDrawer(item) {
  drawerContent.replaceChildren();
  drawerContent.append(textElement("h2", "", `FID ${item.fid}`));
  drawerContent.append(textElement("p", "", `${item.images.length} saved PFP image${item.images.length === 1 ? "" : "s"}`));

  if (item.latest?.sha256) {
    drawerContent.append(textElement("p", "", `Latest hash ${item.latest.sha256.slice(0, 16)}`));
  }

  const timeline = document.createElement("div");
  timeline.className = "timeline";

  for (const image of item.images) {
    const link = document.createElement("a");
    link.href = image.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.append(imageElement(image, `FID ${item.fid} PFP logged ${formatDate(image.storedAt)}`));
    link.append(textElement("span", "stamp", formatDate(image.storedAt)));
    timeline.append(link);
  }

  drawerContent.append(timeline);
  drawer.hidden = false;
}

function imageElement(image, alt) {
  const img = document.createElement("img");
  img.src = image.url;
  img.alt = alt;
  img.loading = "lazy";
  img.decoding = "async";
  return img;
}

function textElement(tag, className, text) {
  const element = document.createElement(tag);

  if (className) {
    element.className = className;
  }

  element.textContent = text ?? "";
  return element;
}

function formatDate(value) {
  if (!value) {
    return "Unknown time";
  }

  const date = new Date(value);

  if (Number.isNaN(date.valueOf())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}
