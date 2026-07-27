// Generated from lib/hook-variables.ts. Do not edit by hand.
export const runtimeHookVariables = [
    {
        name: "slide_count",
        label: "Body slide count",
        description: "The actual number of body slides selected for the current run.",
    },
    {
        name: "current_year",
        label: "Current year",
        description: "Four-digit year for the scheduled run date.",
    },
    {
        name: "next_year",
        label: "Next year",
        description: "Four-digit year after the scheduled run date's year.",
    },
    {
        name: "current_sign",
        label: "Current zodiac sign",
        description: "Zodiac season active on the scheduled run date.",
    },
    {
        name: "current_sign_cusp",
        label: "Current sign cusp",
        description: "The two month-specific versions of the active sign, such as july leo vs august leo.",
    },
    {
        name: "current_month",
        label: "Current month",
        description: "Full month name for the scheduled run date.",
    },
    {
        name: "current_month_number",
        label: "Current month number",
        description: "Two-digit month number for the scheduled run date.",
    },
    {
        name: "current_day",
        label: "Current day",
        description: "Day of the month for the scheduled run date.",
    },
    {
        name: "current_weekday",
        label: "Current weekday",
        description: "Full weekday name for the scheduled run date.",
    },
    {
        name: "current_date",
        label: "Current date",
        description: "Readable scheduled run date.",
    },
    {
        name: "current_iso_date",
        label: "Current ISO date",
        description: "Scheduled run date in YYYY-MM-DD format.",
    },
    {
        name: "current_time",
        label: "Current time",
        description: "Scheduled run time with hours and minutes.",
    },
];
const runtimeHookVariableNames = new Set(runtimeHookVariables.map((variable) => variable.name));
function canonicalRuntimeHookVariableName(name) {
    return name.trim().toLowerCase();
}
export function isRuntimeHookVariable(name) {
    return runtimeHookVariableNames.has(canonicalRuntimeHookVariableName(name));
}
export function runtimeHookVariableValue(name, input = {}) {
    const variable = canonicalRuntimeHookVariableName(name);
    if (!isRuntimeHookVariable(variable))
        return undefined;
    const now = validDate(input.now) ? input.now : new Date();
    const timeZone = validTimeZone(input.timeZone) ? input.timeZone : undefined;
    const format = (options) => new Intl.DateTimeFormat("en-US", { ...options, timeZone }).format(now);
    switch (variable) {
        case "slide_count": {
            const slideCount = Math.round(Number(input.slideCount));
            return Number.isFinite(slideCount) && slideCount > 0
                ? String(slideCount)
                : undefined;
        }
        case "current_year":
            return format({ year: "numeric" });
        case "next_year":
            return String(Number(format({ year: "numeric" })) + 1);
        case "current_sign":
            return zodiacSeason(now, timeZone).sign;
        case "current_sign_cusp": {
            const season = zodiacSeason(now, timeZone);
            return `${season.months[0]} ${season.sign.toLowerCase()} vs ${season.months[1]} ${season.sign.toLowerCase()}`;
        }
        case "current_month":
            return format({ month: "long" });
        case "current_month_number":
            return format({ month: "2-digit" });
        case "current_day":
            return format({ day: "numeric" });
        case "current_weekday":
            return format({ weekday: "long" });
        case "current_date":
            return format({ year: "numeric", month: "long", day: "numeric" });
        case "current_iso_date":
            return isoDate(now, timeZone);
        case "current_time":
            return format({ hour: "numeric", minute: "2-digit" });
        default:
            return undefined;
    }
}
export function hookVariableNameFromLabel(value) {
    return String(value ?? "")
        .trim()
        .replace(/^\[\[|\]\]$/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}
export function wordCollectionVariableName(collection) {
    const id = collection.id.trim();
    if (!legacyWordCollectionId(id) && /^[a-zA-Z0-9_-]+$/.test(id)) {
        return id;
    }
    return (hookVariableNameFromLabel(collection.name) ||
        `variable_${id.replace(/^word-collection-/i, "").slice(0, 8)}`);
}
export function migrateLegacyHookVariableReferences(input) {
    const hookSlots = { ...(input.hookSlots ?? {}) };
    let changed = false;
    for (const [slot, collectionId] of Object.entries(hookSlots)) {
        if (slot.trim().toLowerCase() === "year" ||
            collectionId.trim().toLowerCase() === "year") {
            delete hookSlots[slot];
            changed = true;
        }
    }
    const collectionsById = new Map(input.collections.map((collection) => [
        collection.id.toLowerCase(),
        collection,
    ]));
    const text = input.text.replace(/\[\[([a-zA-Z0-9_-]+)\]\]|\{([a-zA-Z0-9_-]+)\}/g, (token, bracketSlot, braceSlot) => {
        const slot = String(bracketSlot || braceSlot || "");
        if (slot.toLowerCase() === "year") {
            changed = true;
            return token.startsWith("{") ? "{current_year}" : "[[current_year]]";
        }
        const collection = collectionsById.get(slot.toLowerCase());
        if (!collection || !legacyWordCollectionId(collection.id))
            return token;
        const readableName = wordCollectionVariableName(collection);
        if (!readableName || readableName.toLowerCase() === slot.toLowerCase()) {
            return token;
        }
        changed = true;
        for (const key of Object.keys(hookSlots)) {
            if (key.toLowerCase() === slot.toLowerCase())
                delete hookSlots[key];
        }
        hookSlots[readableName] = collection.id;
        return token.startsWith("{") ? `{${readableName}}` : `[[${readableName}]]`;
    });
    return { text, hookSlots, changed };
}
function legacyWordCollectionId(value) {
    return /^word-collection-[0-9a-f-]{20,}$/i.test(value);
}
function validDate(value) {
    return Boolean(value && Number.isFinite(value.getTime()));
}
function validTimeZone(value) {
    if (!value)
        return false;
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
        return true;
    }
    catch {
        return false;
    }
}
function isoDate(now, timeZone) {
    const parts = new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        timeZone,
    }).formatToParts(now);
    const part = (type) => parts.find((item) => item.type === type)?.value ?? "";
    return `${part("year")}-${part("month")}-${part("day")}`;
}
function zodiacSeason(now, timeZone) {
    const parts = new Intl.DateTimeFormat("en-US", {
        month: "numeric",
        day: "numeric",
        timeZone,
    }).formatToParts(now);
    const number = (type) => Number(parts.find((item) => item.type === type)?.value);
    const month = number("month");
    const day = number("day");
    const key = month * 100 + day;
    if (key >= 1222 || key <= 119) {
        return { sign: "Capricorn", months: ["december", "january"] };
    }
    if (key <= 218) {
        return { sign: "Aquarius", months: ["january", "february"] };
    }
    if (key <= 320) {
        return { sign: "Pisces", months: ["february", "march"] };
    }
    if (key <= 419) {
        return { sign: "Aries", months: ["march", "april"] };
    }
    if (key <= 520) {
        return { sign: "Taurus", months: ["april", "may"] };
    }
    if (key <= 620) {
        return { sign: "Gemini", months: ["may", "june"] };
    }
    if (key <= 722) {
        return { sign: "Cancer", months: ["june", "july"] };
    }
    if (key <= 822) {
        return { sign: "Leo", months: ["july", "august"] };
    }
    if (key <= 922) {
        return { sign: "Virgo", months: ["august", "september"] };
    }
    if (key <= 1022) {
        return { sign: "Libra", months: ["september", "october"] };
    }
    if (key <= 1121) {
        return { sign: "Scorpio", months: ["october", "november"] };
    }
    return { sign: "Sagittarius", months: ["november", "december"] };
}
