import * as cheerio from "cheerio";

function absolutizeUrls(html, base) {
  const $ = cheerio.load(html);

  $("img").each((_, el) => {
    const src = $(el).attr("src");
    if (!src) return;
    try {
      $(el).attr("src", new URL(src, base).toString());
    } catch {
      return;
    }
  });

  $("a").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    try {
      const abs = new URL(href, base).toString();
      $(el).attr("href", abs);
      $(el).attr("target", "_blank");
      $(el).attr("rel", "noreferrer");
    } catch {
      return;
    }
  });

  return $.html();
}

function normalizeMath(html) {
  if (!html) return html;
  let out = html;
  out = out.replace(/\\\((.*?)\\\)/gs, "$1");
  out = out.replace(/\\\[(.*?)\\\]/gs, "$1");
  out = out.replace(/\$([^$]+)\$/g, "$1");
  out = out.replace(/\\le/g, "≤");
  out = out.replace(/\\ge/g, "≥");
  out = out.replace(/\\times/g, "×");
  out = out.replace(/\\cdot/g, "·");
  out = out.replace(/\\,/g, "");
  out = out.replace(/\\;/g, " ");
  return out;
}

export async function fetchProblemPage(problemId) {
  const url = `https://www.acmicpc.net/problem/${problemId}`;

  const res = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Referer: "https://www.acmicpc.net/",
    },
  });

  if (!res.ok) throw new Error(`BOJ page fetch error: ${res.status} ${res.statusText}`);

  const html = await res.text();
  const $ = cheerio.load(html);

  const titleNode = $("#problem_title");
  const descNode = $("#problem_description");
  const inputNode = $("#problem_input");
  const outputNode = $("#problem_output");

  if (titleNode.length === 0 || descNode.length === 0 || inputNode.length === 0 || outputNode.length === 0) {
    throw new Error("BOJ page parse failed (missing sections).");
  }

  const title = (titleNode.text() || `BOJ ${problemId}`).trim();
  const desc = descNode.html();
  const input = inputNode.html();
  const output = outputNode.html();

  if (!desc || !input || !output) throw new Error("BOJ problem sections not found.");

  const samples = [];
  for (let i = 1; i <= 30; i++) {
    const sin = $(`#sample-input-${i}`).text();
    const sout = $(`#sample-output-${i}`).text();
    if (!sin && !sout) break;
    samples.push({ input: sin ?? "", output: sout ?? "" });
  }

  return {
    problemId,
    title,
    url,
    descHtml: normalizeMath(absolutizeUrls(desc, url)),
    inputHtml: normalizeMath(absolutizeUrls(input, url)),
    outputHtml: normalizeMath(absolutizeUrls(output, url)),
    samples,
  };
}
