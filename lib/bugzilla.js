var request = require('request'),
    _ = require('lodash');

function Bugzilla(options) {
  this.url = options.url;
  this.apiUrl = this.url + '/rest';
}
module.exports = Bugzilla;

Bugzilla.prototype.getUser = function(id, options, callback) {
  if (typeof(options) === 'function') {
    callback = options;
    options = {};
  }

  var query = {};
  if (options.token) {
    query.token = options.token;
  }

  var url = '/user/' + encodeURIComponent(id);
  var req = {
    url: url,
    qs: query,
    json: true
  }
  return this._request(req, function(err, body) {
    if (err) return callback(err);

    return callback(null, body.users[0]);
  });
};

Bugzilla.prototype.getBug = function(id, options, callback) {
  if (typeof(options) === 'function') {
    callback = options;
    options = {};
  }

  var query = {};
  if (options.token) {
    query.token = options.token;
  }
  if (options.includeFields) {
    query.include_fields = processIncludeFields(options.includeFields);
  }

  var url = '/bug/' + encodeURIComponent(id);
  var req = {
    url: url,
    qs: query,
    json: true
  };
  var self = this;
  return self._request(req, function(err, body) {
    if (err) return callback(err);

    var bug = body.bugs[0];
    bug.url = self._getBugUrl(id);
    return callback(null, bug);
  });
};

Bugzilla.prototype._getBugUrl = function(id) {
  return this.url + '/show_bug.cgi?id=' + encodeURIComponent(id);
};

Bugzilla.prototype._request = function(options, callback) {
  options.url = this.apiUrl + options.url;
  return request(options, function(err, res, body) {
    if (err) return callback(err);

    if (res.statusCode !== 200) {
      if (body.error && body.code && body.message) {
        return callback(new Error(body.message));
      }
    }

    return callback(null, body);
  });
};

function processIncludeFields(includeFields) {
  if (!Array.isArray(includeFields)) {
    includeFields = includeFields.split(',');
  }

  includeFields.push('code', 'error', 'message');

  return _.uniq(includeFields).join(',');
}

function error(res, body) {
  var msg = 'Invalid HTTP status code: ' + res.statusCode;
  msg += "\nURL: " + res.req.path;
  if (typeof(body) === 'object') {
    msg += "\n" + JSON.stringify(body, null, 4);
  } else {
    msg += "\n" + body;
  }
  return new Error(msg);
}
