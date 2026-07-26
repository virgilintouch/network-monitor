const state = {
    loginSuccess: 0,
    loginFailure: 0,
    apiErrors: 0,
    scrapeErrors: 0,
    lastScrapeDurationSeconds: 0,
    lastScrapeSuccessTimestamp: 0,
};

function snapshot() {
    return { ...state };
}

function incrementLoginSuccess() {
    state.loginSuccess += 1;
}

function incrementLoginFailure() {
    state.loginFailure += 1;
}

function incrementApiErrors() {
    state.apiErrors += 1;
}

function incrementScrapeErrors() {
    state.scrapeErrors += 1;
}

function recordScrapeSuccess(durationSeconds, timestampSeconds = Math.floor(Date.now() / 1000)) {
    state.lastScrapeDurationSeconds = durationSeconds;
    state.lastScrapeSuccessTimestamp = timestampSeconds;
}

module.exports = {
    snapshot,
    incrementLoginSuccess,
    incrementLoginFailure,
    incrementApiErrors,
    incrementScrapeErrors,
    recordScrapeSuccess,
};
