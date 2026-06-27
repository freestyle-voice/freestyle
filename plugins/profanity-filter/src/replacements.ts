export type ReplacementMap = Record<string, string[]>;

export const DEFAULT_REPLACEMENTS: ReplacementMap = {
  "son of a bitch": ["son of a biscuit", "son of a gun"],
  "god damn it": ["gosh darn it"],
  "goddamn it": ["gosh darn it"],
  "damn it": ["dang it", "darn it"],
  "god damn": ["gosh darn"],
  motherfucker: ["mother-flipper", "mother-trucker"],
  goddamn: ["gosh-darn"],
  goddammit: ["gosh-darn-it"],
  dammit: ["dang it", "darn it"],
  bullshit: ["baloney", "bologna", "hogwash"],
  jackass: ["jackrabbit", "jabroni"],
  dumbass: ["dummy", "dingus"],
  asshole: ["butthead", "wingnut"],
  dickhead: ["doofus", "noodle-head"],
  douchebag: ["doofus"],
  douche: ["doofus"],
  fucking: ["fricking", "flipping", "freaking"],
  fucked: ["fudged", "borked"],
  fucker: ["fudger", "rascal"],
  fuck: ["fudge", "frick", "flip"],
  shitty: ["crummy", "cruddy"],
  shit: ["shoot", "sugar", "shucks"],
  bitchy: ["grumpy"],
  bitch: ["biscuit", "meanie"],
  bastard: ["buttercup", "scallywag"],
  ass: ["butt", "badonkadonk"],
  damn: ["dang", "darn"],
  hell: ["heck"],
  crap: ["crud", "crumbs"],
  pissed: ["peeved", "ticked"],
  piss: ["tinkle"],
  dick: ["doofus", "noodle"],
  cock: ["rooster"],
  prick: ["pickle"],
  cunt: ["cinnamon roll"],
  twat: ["twit"],
  wanker: ["wally"],
  bollocks: ["baloney"],
  bugger: ["bother"],
  bloody: ["blooming"],
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tokenCount(key: string): number {
  return key.trim().split(/\s+/).length;
}

function matchCase(replacement: string, matched: string): string {
  if (/[a-z]/i.test(matched) && matched === matched.toUpperCase()) {
    return replacement.toUpperCase();
  }
  const first = matched.charAt(0);
  if (first && first === first.toUpperCase() && first !== first.toLowerCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

interface Matcher {
  re: RegExp;
  alts: string[];
}

export function buildMatchers(map: ReplacementMap): Matcher[] {
  return Object.entries(map)
    .filter(([key, alts]) => key.trim() && alts.length > 0)
    .sort((a, b) => tokenCount(b[0]) - tokenCount(a[0]))
    .map(([key, alts]) => {
      const words = key.trim().split(/\s+/).map(escapeRegExp).join("\\s+");
      return { re: new RegExp(`\\b${words}\\b`, "gi"), alts };
    });
}

export function clean(
  text: string,
  matchers: Matcher[],
  preserveCase = true,
): string {
  let out = text;
  for (const { re, alts } of matchers) {
    let i = 0;
    out = out.replace(re, (matched) => {
      const alt = alts[i % alts.length] ?? matched;
      i += 1;
      return preserveCase ? matchCase(alt, matched) : alt;
    });
  }
  return out;
}
