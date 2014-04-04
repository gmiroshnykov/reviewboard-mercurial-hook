var config = exports;

config.REPOSITORY = process.env.REPOSITORY || process.cwd();

config.REVIEWBOARD_URL = process.env.REVIEWBOARD_URL;
config.REVIEWBOARD_REPOSITORY = process.env.REVIEWBOARD_REPOSITORY || 1;

config.BUGZILLA_URL = process.env.BUGZILLA_URL || 'https://bugzilla.mozilla.org';

// avoid async spamming
var asyncLimit = process.env.ASYNC_LIMIT || '5';
config.ASYNC_LIMIT = parseInt(asyncLimit, 10);
