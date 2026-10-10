// PageMT — config & shared constants (ES module)

export const DEFAULT_SETTINGS = {
  baseUrl: "http://localhost:1234",
  model: "hy-mt2-1.8b-mlx",
  apiKey: "",
  sourceLang: "auto",
  targetLang: "Chinese (Simplified)",
  concurrency: 6,
  batchSize: 24,
  maxSegChars: 2400,
  temperature: 0.3,
  showOriginal: false,  // show original on hover
};

export const LANGS = [
  "auto",
  "Chinese (Simplified)",
  "Chinese (Traditional)",
  "English",
  "Japanese",
  "Korean",
  "French",
  "German",
  "Spanish",
  "Portuguese",
  "Italian",
  "Russian",
  "Arabic",
  "Hindi",
  "Thai",
  "Vietnamese",
  "Indonesian",
  "Turkish",
  "Dutch",
  "Polish",
  "Ukrainian",
];

// HY-MT2 official prompt formats
export const SEP = "<SEP>";

export function buildPrompt(segments, sourceLang, targetLang) {
  const src = segments.join(SEP);
  const head = sourceLang && sourceLang !== "auto"
    ? `Translate the following text from ${sourceLang} into ${targetLang}.`
    : `Translate the following text into ${targetLang}.`;
  return `${head} You must retain an equal number of ${SEP} delimiters in the translation. Do not omit, escape, or translate this symbol, and pay attention to the delimiter positions.\n${src}`;
}

export function buildSinglePrompt(text, sourceLang, targetLang) {
  if (sourceLang && sourceLang !== "auto") {
    return `Translate the following text from ${sourceLang} into ${targetLang}. Note that you should only output the translated result without any additional explanation:\n${text}`;
  }
  return `Translate the following text into ${targetLang}. Note that you should only output the translated result without any additional explanation:\n${text}`;
}
