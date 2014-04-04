var Repository = require('./repository'),
    ReviewBoard = require('./reviewboard'),
    Bugzilla = require('./bugzilla');

var config = require('../config');

var requiredKeys = [
  'REPOSITORY',
  'REVIEWBOARD_URL', 'REVIEWBOARD_USERNAME', 'REVIEWBOARD_PASSWORD',
  'BUGZILLA_URL'
];
requiredKeys.forEach(function(key) {
  if (!config[key]) {
    console.error('ERROR: %s not set', key);
    process.exit(1);
  }
});

exports.repository = new Repository(config.REPOSITORY);

var rbOptions = {
  url: config.REVIEWBOARD_URL,
  username: config.REVIEWBOARD_USERNAME,
  password: config.REVIEWBOARD_PASSWORD,
  repository: config.REVIEWBOARD_REPOSITORY
};
exports.reviewboard = new ReviewBoard(rbOptions);

var bzOptions = {
  url: config.BUGZILLA_URL
};
exports.bugzilla = new Bugzilla(bzOptions);
