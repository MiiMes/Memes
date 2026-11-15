export function reactionKey(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function findReactionPreview(reaction, items) {
  const key = reactionKey(reaction);
  const aliases = {
    crying: ["cry"],
    cry: ["crying"],
    dance: ["dancing"],
    dancing: ["dance"],
    hugs: ["hug"],
    hug: ["hugs"],
  };
  const targets = new Set([key, ...(aliases[key] ?? [])]);
  return items.find((item) =>
    [item.title, item.query].some((value) => targets.has(reactionKey(value))),
  )?.imageUrl;
}
