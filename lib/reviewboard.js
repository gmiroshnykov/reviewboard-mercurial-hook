var request = require('request');

function ReviewBoard(options) {
  this.url = options.url;
  this.repository = options.repository;
}
module.exports = ReviewBoard;

ReviewBoard.prototype.getSession = function(options, callback) {
  var req = this._req('GET', '/api/session/', options);
  return this._request(req, function(err, body) {
    if (err) return callback(err);
    return callback(null, body.session);
  });
};

ReviewBoard.prototype.getReviewRequest = function(reviewRequestId, options, callback) {
  var url = '/api/review-requests/' + reviewRequestId + '/';
  var req = this._req('GET', url, options);
  return this._request(req, function(err, body) {
    if (err) return callback(err);
    return callback(null, body.review_request);
  });
};

ReviewBoard.prototype.findReviewRequest = function(options, callback) {
  var req = this._req('GET', '/api/review-requests/', options);

  var query = {
    repository: this.repository,
    'max-results': 1,
    status: 'all'
  };

  if (options.commitId) {
    query['commit-id'] = options.commitId;
  }

  req.qs = query;

  return this._request(req, function(err, body) {
    if (err) return callback(err);
    if (body.total_results === 0) {
      return callback(null, null);
    }
    return callback(null, body.review_requests[0]);
  });
};

ReviewBoard.prototype.createReviewRequest = function(options, callback) {
  var req = this._req('POST', '/api/review-requests/', options);

  var form = {
    repository: this.repository
  };

  if (options.commitId) {
    form.commit_id = options.commitId
  }

  req.form = form;

  return this._request(req, function(err, body) {
    if (err) return callback(err);
    return callback(null, body.review_request);
  });
};

ReviewBoard.prototype.uploadDiff = function(reviewRequestId, options, callback) {
  if (!options.path) {
    return callback(new Error('no path'));
  }

  var url = '/api/review-requests/' + reviewRequestId + '/diffs/';
  var req = this._req('POST', url, options);
  var r = this._request(req, function(err, body) {
    if (err) return callback(err);
    return callback(null, body.diff);
  });
  var form = r.form();
  form.append('path', options.path, {filename: 'patch.diff'});

  if (options.baseCommitId) {
    form.append('base_commit_id', options.baseCommitId);
  }
};

ReviewBoard.prototype.createReviewRequestDraft = function(reviewRequestId, options, callback) {
  var url = '/api/review-requests/' + reviewRequestId + '/draft/';
  var req = this._req('POST', url, options);

  var form = {
    public: 'true'
  };
  if (options.commitId !== undefined) {
    form['commit_id'] = options.commitId;
  }
  if (options.summary !== undefined) {
    form['summary'] = options.summary;
  }
  if (options.description !== undefined) {
    form['description'] = options.description;
  }
  if (options.targetPeople !== undefined) {
    form['target_people'] = commify(options.targetPeople);
  }
  if (options.bugsClosed !== undefined) {
    form['bugs_closed'] = commify(options.bugsClosed);
  }
  if (options.dependsOn !== undefined) {
    form['depends_on'] = commify(options.dependsOn);
  }

  req.form = form;

  return this._request(req, function(err, body) {
    if (err) return callback(err);
    return callback(null, body.draft);
  });
};

ReviewBoard.prototype._req = function(method, url, options) {
  var req = {
    method: method,
    url: this.url + url,
    json: true
  };

  if (options.auth) {
    req.auth = options.auth;
  }

  return req;
}

ReviewBoard.prototype._request = function(options, callback) {
  return request(options, function(err, res, body) {
    if (err) return callback(err);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      var msg = 'Invalid HTTP status code: ' + res.statusCode;
      msg += "\nMethod: " + options.method;
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

function commify(list) {
  return Array.isArray(list) ? list.join(',') : list;
}
