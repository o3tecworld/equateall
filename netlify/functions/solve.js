// EquateAll fallback solver — queries Wolfram Alpha when the app's own
// built-in parser can't handle an equation (tensors, unusual notation,
// anything outside plain algebra).
//
// The Wolfram Alpha AppID is read from the WOLFRAM_APPID environment
// variable set in Netlify's dashboard — it is never present in this
// file or in any client-side code, so it stays out of the public
// GitHub repo entirely.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS"
};

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  const appId = process.env.WOLFRAM_APPID;
  if (!appId) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Server is missing its Wolfram Alpha key (WOLFRAM_APPID not set)." })
    };
  }

  const input = (event.queryStringParameters && event.queryStringParameters.input) || "";
  if (!input.trim()) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "No equation was sent." })
    };
  }

  try {
    // First try the Short Answers API — fastest, returns plain text directly.
    const shortUrl =
      "https://api.wolframalpha.com/v1/result?appid=" + encodeURIComponent(appId) +
      "&i=" + encodeURIComponent(input);
    const shortRes = await fetch(shortUrl);

    if (shortRes.ok) {
      const text = await shortRes.text();
      return {
        statusCode: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ source: "wolframalpha", type: "short", answer: text })
      };
    }

    // Short Answers returned 501 (no short answer) or similar — fall back
    // to the Full Results API and pull out the first few readable pods.
    const fullUrl =
      "https://api.wolframalpha.com/v2/query?appid=" + encodeURIComponent(appId) +
      "&input=" + encodeURIComponent(input) + "&output=JSON&format=plaintext";
    const fullRes = await fetch(fullUrl);
    const fullData = await fullRes.json();

    const pods = (fullData && fullData.queryresult && fullData.queryresult.pods) || [];
    const readable = pods
      .filter(function (p) { return p.subpods && p.subpods.length; })
      .slice(0, 4)
      .map(function (p) {
        const text = p.subpods.map(function (sp) { return sp.plaintext; }).filter(Boolean).join(" ");
        return text ? p.title + ": " + text : null;
      })
      .filter(Boolean);

    if (readable.length === 0) {
      return {
        statusCode: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ source: "wolframalpha", type: "none", answer: null })
      };
    }

    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ source: "wolframalpha", type: "full", answer: readable.join("\n") })
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Couldn't reach Wolfram Alpha: " + err.message })
    };
  }
};
