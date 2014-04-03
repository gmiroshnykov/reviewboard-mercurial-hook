var config = exports;

config.REPOSITORY = process.env.REPOSITORY || process.cwd();

config.REVIEWBOARD_URL = process.env.REVIEWBOARD_URL;
config.REVIEWBOARD_USERNAME = process.env.REVIEWBOARD_USERNAME;
config.REVIEWBOARD_PASSWORD = process.env.REVIEWBOARD_PASSWORD;
config.REVIEWBOARD_REPOSITORY = process.env.REVIEWBOARD_REPOSITORY || 1;

config.BUGZILLA_URL = process.env.BUGZILLA_URL || 'https://bugzilla.mozilla.org';
config.BUGZILLA_API_URL = process.env.BUGZILLA_API_URL || 'https://api-dev.bugzilla.mozilla.org/1.3';

// avoid async spamming
var asyncLimit = process.env.ASYNC_LIMIT || '5';
config.ASYNC_LIMIT = parseInt(asyncLimit, 10);
