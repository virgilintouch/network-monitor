const packageInfo = require('./package');

const LEVELS = {
    trace: 10,
    debug: 20,
    info: 30,
    warn: 40,
    error: 50,
    fatal: 60,
};

function configuredLevel() {
    const value = String(process.env.LOGLEVEL || 'warn').toLowerCase();
    return LEVELS[value] || LEVELS.warn;
}

function serialize(value) {
    if (value instanceof Error) {
        return {
            name: value.name,
            message: value.message,
            stack: value.stack,
        };
    }

    if (Array.isArray(value)) {
        return value.map(serialize);
    }

    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).map(([key, entry]) => [key, serialize(entry)])
        );
    }

    return value;
}

function normalizeArguments(fieldsOrMessage, message) {
    if (typeof fieldsOrMessage === 'string') {
        return { fields: {}, message: fieldsOrMessage };
    }

    return {
        fields: fieldsOrMessage && typeof fieldsOrMessage === 'object' ? fieldsOrMessage : {},
        message: message || '',
    };
}

function log(level, fieldsOrMessage, message) {
    if (LEVELS[level] < configuredLevel()) {
        return;
    }

    const { fields, message: text } = normalizeArguments(fieldsOrMessage, message);
    const entry = {
        name: packageInfo.name,
        level,
        msg: text,
        ...serialize(fields),
    };
    const output = JSON.stringify(entry);

    if (LEVELS[level] >= LEVELS.error) {
        console.error(output);
        return;
    }

    console.log(output);
}

const logger = Object.fromEntries(
    Object.keys(LEVELS).map((level) => [
        level,
        (fieldsOrMessage, message) => log(level, fieldsOrMessage, message),
    ])
);

module.exports = logger;
