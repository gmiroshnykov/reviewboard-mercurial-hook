var request = require('request'),
    _ = require('lodash');

function Bugzilla(options) {
  this.url = options.url;
  this.apiUrl = options.apiUrl;
}
module.exports = Bugzilla;

Bugzilla.prototype.getBug = function(id, options, callback) {
  if (typeof(options) === 'function') {
    callback = options;
    options = {};
  }

  var query = {};
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
    if (!body) return callback();

    body.url = self._getBugUrl(id);
    return callback(null, body);
  });
};

Bugzilla.prototype._getBugUrl = function(id, callback) {
  return this.url + '/show_bug.cgi?id=' + encodeURIComponent(id);
};

Bugzilla.prototype._request = function(options, callback) {
  options.url = this.apiUrl + options.url;
  return request(options, function(err, res, body) {
    if (err) return callback(err);

    if (res.statusCode === 400) {
      if (body.code === 100) {
        // no such bug
        return callback();
      }
    }

    if (res.statusCode < 200 || res.statusCode >= 300) {
      var msg = 'Invalid HTTP status code: ' + res.statusCode;
      msg += "\nURL: " + options.url;
      if (typeof(body) === 'object') {
        msg += "\n" + JSON.stringify(body, null, 4);
      } else {
        msg += "\n" + body;
      }
      return callback(new Error(msg));
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
