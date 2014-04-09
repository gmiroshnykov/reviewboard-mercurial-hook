var Repository = require('./repository'),
    ReviewBoard = require('./reviewboard'),
    Bugzilla = require('./bugzilla');

var config = require('../config');

var requiredKeys = [
  'REPOSITORY',
  'REVIEWBOARD_URL',
  'BUGZILLA_URL'
];

requiredKeys.forEach(function(key) {
  if (!config[key]) {
    console.error('ERROR: %s not set', key);
    process.exit(1);
  }
});

exports.repository = function() {
  return new Repository(config.REPOSITORY);
};

exports.reviewboard = function(username, password) {
  var rbOptions = {
    username: username,
    password: password,
    url: config.REVIEWBOARD_URL,
    repository: config.REVIEWBOARD_REPOSITORY
  };
  return new ReviewBoard(rbOptions);
};

exports.bugzilla = function() {
  var bzOptions = {
    url: config.BUGZILLA_URL
  };
  return new Bugzilla(bzOptions);
};
