export async function fetchCandidates(handles, minTier, maxTier) {
  const excludes = (handles || []).map((h) => `-@${h}`).join(" ");
  const query = `*${minTier}..${maxTier} s#5000.. ${excludes}`.trim();
  const url = new URL("https://solved.ac/api/v3/search/problem");
  url.searchParams.set("query", query);
  url.searchParams.set("page", "1");

  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`solved.ac API error: ${res.status} ${res.statusText} query="${query}"`);
  }

  const data = await res.json();
  return (data.items || []).map((p) => ({
    problemId: p.problemId,
    title: (p.titleKo || "").trim() || `BOJ ${p.problemId}`,
  }));
}

export function pickN(arr, n) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

export async function validateHandles(handles) {
  const list = Array.from(new Set((handles || []).map((h) => String(h).trim()).filter(Boolean)));
  const invalid = [];

  await Promise.all(
    list.map(async (handle) => {
      const url = new URL("https://solved.ac/api/v3/user/show");
      url.searchParams.set("handle", handle);
      const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
      if (!res.ok) {
        invalid.push(handle);
      }
    })
  );

  return { invalid };
}
