// Generated from lib/hook-expansion.ts. Do not edit by hand.
import { clean } from "./guards.js";
import { applyResolvedHookCase } from "./hook-casing.js";
import { isRuntimeHookVariable, runtimeHookVariableValue, wordCollectionVariableName, } from "./hook-variables.js";
const slotPattern = /\[\[([a-zA-Z0-9_-]+)\]\]|\{([a-zA-Z0-9_-]+)\}/g;
const properTitleCaseSlots = new Set(["zodiac"]);
export function hookTemplateMatchesRenderedText(template, renderedText) {
    const normalizedTemplate = normalizeHookMatchText(template);
    const normalizedRenderedText = normalizeHookMatchText(renderedText);
    if (!normalizedTemplate || !normalizedRenderedText)
        return false;
    // An all-slot template matches everything and is never evidence of identity.
    if (hookTextHasSlots(normalizedTemplate) &&
        hookTemplateLiteralLength(normalizedTemplate) === 0) {
        return false;
    }
    slotPattern.lastIndex = 0;
    let literalStart = 0;
    let pattern = "^";
    for (const match of normalizedTemplate.matchAll(slotPattern)) {
        pattern += escapeRegExp(normalizedTemplate.slice(literalStart, match.index));
        pattern += ".+?";
        literalStart = (match.index ?? 0) + match[0].length;
    }
    pattern += escapeRegExp(normalizedTemplate.slice(literalStart));
    pattern += "$";
    return new RegExp(pattern, "i").test(normalizedRenderedText);
}
/** Whether a hook text still carries unexpanded `[[SLOT]]` / `{slot}` tokens. */
export function hookTextHasSlots(text) {
    slotPattern.lastIndex = 0;
    return slotPattern.test(text);
}
/**
 * Length of a template's literal (non-slot) text. This is the evidence a
 * template carries when matched against a rendered hook: a template that is
 * nothing but slots (e.g. `[[ZODIAC_CUSP]]`) compiles to `^.+?$` and matches
 * every hook ever rendered, so it proves nothing and must never win a match.
 */
export function hookTemplateLiteralLength(template) {
    return normalizeHookMatchText(template.replace(slotPattern, " ")).trim()
        .length;
}
export function uniqueHookTemplateMatch(items, input) {
    const normalizedTemplate = normalizeHookMatchText(input.hookTemplate ?? "").toLowerCase();
    if (normalizedTemplate) {
        const exact = items.filter((item) => normalizeHookMatchText(item.text).toLowerCase() === normalizedTemplate);
        return exact.length === 1 ? exact[0] : undefined;
    }
    const matches = items.filter((item) => hookTemplateMatchesRenderedText(item.text, input.renderedHook));
    // A legacy pool entry whose text IS the rendered hook matches itself, which
    // would otherwise defeat the uniqueness rule and leave the run attributed to
    // the duplicate. Prefer a tokenized template when exactly one qualifies.
    const templated = matches.filter((item) => hookTextHasSlots(item.text) && hookTemplateLiteralLength(item.text) > 0);
    if (templated.length === 1)
        return templated[0];
    // Two or more substantive templates fitting the same rendered hook is real
    // ambiguity. Leave it unattributed and let the caller report it rather than
    // picking a winner on a heuristic.
    if (templated.length > 1)
        return undefined;
    return matches.length === 1 ? matches[0] : undefined;
}
export function expandHook(hook, slots, collections, random = Math.random, options = {}) {
    const template = clean(hook);
    const slotMap = slots ?? {};
    const collectionsById = new Map(collections.flatMap((collection) => {
        const keys = [
            collection.id,
            collection.name,
            wordCollectionVariableName(collection),
            collection.id.toLowerCase(),
            collection.name.toLowerCase(),
            wordCollectionVariableName(collection).toLowerCase(),
        ];
        return keys.map((key) => [key, collection]);
    }));
    const substitutions = {};
    const usedWordsByCollection = new Map();
    const occurrenceCounts = new Map();
    const expandedText = template.replace(slotPattern, (match, bracketSlot, braceSlot) => {
        const baseSlotName = clean(bracketSlot || braceSlot);
        if (!baseSlotName) {
            return match;
        }
        const count = (occurrenceCounts.get(baseSlotName.toLowerCase()) ?? 0) + 1;
        occurrenceCounts.set(baseSlotName.toLowerCase(), count);
        // With noDuplicates each repeat of the variable is a fresh draw from the
        // words that remain, keyed zodiac, zodiac_2, ... so combination usage
        // keys stay stable.
        const slotName = options.noDuplicates && count > 1
            ? `${baseSlotName}_${count}`
            : baseSlotName;
        if (!substitutions[slotName]) {
            const runtimeValue = runtimeHookVariableValue(baseSlotName, {
                now: options.now,
                timeZone: options.timeZone,
                slideCount: options.slideCount,
            });
            if (runtimeValue !== undefined) {
                substitutions[slotName] = runtimeValue;
                return runtimeValue;
            }
            if (isRuntimeHookVariable(baseSlotName)) {
                throw new Error(`Runtime hook variable ${baseSlotName.toUpperCase()} could not be resolved for this run`);
            }
            const collectionId = resolveSlotCollectionId(baseSlotName, slotMap);
            const collection = collectionId
                ? (collectionsById.get(collectionId) ??
                    collectionsById.get(collectionId.toLowerCase()))
                : null;
            const allWords = collection?.words.filter(Boolean) ?? [];
            if (allWords.length === 0) {
                throw new Error(`Hook slot ${slotName} has no words in database collection ${collectionId}`);
            }
            // Distinct slots backed by the same collection (e.g. [[zodiac]] vs
            // [[zodiac_2]]) should not repeat the same word within one hook.
            const usedKey = (collection?.id ?? collectionId).toLowerCase();
            const used = usedWordsByCollection.get(usedKey) ?? new Set();
            const freshWords = allWords.filter((word) => !used.has(word));
            const words = freshWords.length > 0 ? freshWords : allWords;
            const index = Math.min(words.length - 1, Math.max(0, Math.floor(random() * words.length)));
            used.add(words[index]);
            usedWordsByCollection.set(usedKey, used);
            substitutions[slotName] = formatSlotSubstitution(slotName, words[index], collectionId);
        }
        return substitutions[slotName] || match;
    });
    const correctedText = correctIndefiniteArticles(correctPluralSuffixes(expandedText, substitutions));
    const text = applyResolvedHookCase(correctedText, options.caseMode ?? "mixed");
    const casedSubstitutions = caseSubstitutions(substitutions, options.caseMode);
    return { text, template, substitutions: casedSubstitutions };
}
export function expandAllHookCombinations(hook, slots, collections, options = {}) {
    const template = clean(hook);
    const slotMap = slots ?? {};
    const collectionsById = new Map(collections.flatMap((collection) => [
        collection.id,
        collection.name,
        wordCollectionVariableName(collection),
        collection.id.toLowerCase(),
        collection.name.toLowerCase(),
        wordCollectionVariableName(collection).toLowerCase(),
    ].map((key) => [key, collection])));
    // Occurrence names: with noDuplicates each repeat of a variable becomes its
    // own draw (zodiac, zodiac_2, ...) so "[[ZODIAC]] VERSUS [[ZODIAC]]" yields
    // two different signs. Without it, repeats share one substitution.
    const occurrenceNames = [];
    const seenCounts = new Map();
    for (const match of template.matchAll(slotPattern)) {
        const slotName = clean(match[1] || match[2]);
        if (!slotName)
            continue;
        const count = (seenCounts.get(slotName.toLowerCase()) ?? 0) + 1;
        seenCounts.set(slotName.toLowerCase(), count);
        occurrenceNames.push(options.noDuplicates && count > 1 ? `${slotName}_${count}` : slotName);
    }
    const slotNames = occurrenceNames.filter((slotName, index, values) => values.indexOf(slotName) === index);
    if (slotNames.length === 0) {
        return [{ text: template, template, substitutions: {} }];
    }
    const valuesBySlot = slotNames.map((slotName) => {
        // A synthetic occurrence name (zodiac_2) resolves against its base
        // variable's collection.
        const baseName = options.noDuplicates
            ? slotName.replace(/_\d+$/, "")
            : slotName;
        const runtimeValue = runtimeHookVariableValue(baseName, {
            now: options.now,
            timeZone: options.timeZone,
            slideCount: options.slideCount,
        });
        if (runtimeValue !== undefined) {
            return {
                slotName,
                collectionKey: `runtime:${baseName.toLowerCase()}`,
                enforceDistinct: false,
                hasWords: true,
                values: [runtimeValue],
            };
        }
        if (isRuntimeHookVariable(baseName)) {
            throw new Error(`Runtime hook variable ${baseName.toUpperCase()} could not be resolved for this run`);
        }
        const collectionId = resolveSlotCollectionId(slotName, slotMap) === slotName
            ? resolveSlotCollectionId(baseName, slotMap)
            : resolveSlotCollectionId(slotName, slotMap);
        const collection = collectionsById.get(collectionId) ??
            collectionsById.get(collectionId.toLowerCase());
        const words = collection?.words.filter(Boolean) ?? [];
        if (words.length === 0) {
            throw new Error(`Hook slot ${slotName} has no words in database collection ${collectionId}`);
        }
        return {
            slotName,
            collectionKey: (collection?.id ?? collectionId).toLowerCase(),
            enforceDistinct: true,
            hasWords: true,
            values: words.map((word) => formatSlotSubstitution(slotName, word, collectionId)),
        };
    });
    const expansions = [];
    function visit(index, substitutions) {
        if (index >= valuesBySlot.length) {
            let occurrence = -1;
            const expandedText = template.replace(slotPattern, (match) => {
                occurrence += 1;
                return substitutions[occurrenceNames[occurrence]] || match;
            });
            expansions.push({
                text: applyResolvedHookCase(correctIndefiniteArticles(correctPluralSuffixes(expandedText, substitutions)), options.caseMode ?? "mixed"),
                template,
                substitutions: caseSubstitutions(substitutions, options.caseMode),
            });
            return;
        }
        const slot = valuesBySlot[index];
        const usedFromSameCollection = new Set(valuesBySlot
            .slice(0, index)
            .filter((other) => slot.enforceDistinct &&
            other.enforceDistinct &&
            slot.hasWords &&
            other.collectionKey === slot.collectionKey)
            .map((other) => substitutions[other.slotName]));
        for (const value of slot.values) {
            if (usedFromSameCollection.has(value)) {
                continue;
            }
            visit(index + 1, { ...substitutions, [slot.slotName]: value });
        }
    }
    visit(0, {});
    return expansions;
}
function caseSubstitutions(substitutions, mode) {
    if (!mode || mode === "mixed")
        return substitutions;
    const substitutionMode = mode === "sentence" ? "lowercase" : mode;
    return Object.fromEntries(Object.entries(substitutions).map(([key, value]) => [
        key,
        applyResolvedHookCase(value, substitutionMode),
    ]));
}
function resolveSlotCollectionId(slotName, slotMap) {
    const mapped = clean(slotMap[slotName]) ||
        clean(Object.entries(slotMap).find(([key]) => key.toLowerCase() === slotName.toLowerCase())?.[1] ?? "");
    return mapped || slotName;
}
function formatSlotSubstitution(slotName, value, collectionId) {
    const normalized = clean(value);
    if (properTitleCaseSlots.has(slotName.toLowerCase()) ||
        (collectionId && properTitleCaseSlots.has(collectionId.toLowerCase()))) {
        return titleCase(normalized);
    }
    return normalized;
}
function correctPluralSuffixes(value, substitutions) {
    return Object.values(substitutions).reduce((result, substitution) => {
        if (!/s$/i.test(substitution))
            return result;
        return result.replace(new RegExp(`\\b${escapeRegExp(substitution)}s\\b`, "g"), substitution);
    }, value);
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function normalizeHookMatchText(value) {
    return clean(value).replace(/\s+/g, " ");
}
function correctIndefiniteArticles(value) {
    return value.replace(/\b(a|an)\s+([A-Za-z][A-Za-z'-]*)/g, (match, article, word) => {
        const nextArticle = /^[aeiou]/i.test(word) ? "an" : "a";
        if (article.toLowerCase() === nextArticle) {
            return match;
        }
        const corrected = article[0] === article[0]?.toUpperCase()
            ? `${nextArticle[0].toUpperCase()}${nextArticle.slice(1)}`
            : nextArticle;
        return `${corrected} ${word}`;
    });
}
function titleCase(value) {
    return value.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}
