var request = require('request');

function ReviewBoard(options) {
  this.url = options.url;
  this.username = options.username;
  this.password = options.password;
  this.repository = options.repository;
}
module.exports = ReviewBoard;

ReviewBoard.prototype.getReviewRequest = function(reviewRequestId, callback) {
  var url = '/api/review-requests/' + reviewRequestId + '/';
  var req = {
    url: url,
    json: true
  };
  return this._request(req, function(err, body) {
    if (err) return callback(err);
    return callback(null, body.review_request);
  });
};

ReviewBoard.prototype.findReviewRequest = function(options, callback) {
  var query = {
    repository: this.repository,
    'max-results': 1,
    status: 'all'
  };

  if (options.commitId) {
    query['commit-id'] = options.commitId;
  }

  var req = {
    url: '/api/review-requests/',
    json: true,
    qs: query
  };
  return this._request(req, function(err, body) {
    if (err) return callback(err);
    if (body.total_results === 0) {
      return callback(null, null);
    }
    return callback(null, body.review_requests[0]);
  });
};

ReviewBoard.prototype.findUsers = function(query, callback) {
  var req = {
    url: '/api/users/',
    json: true,
    qs: query
  };
  return this._request(req, function(err, body) {
    if (err) return callback(err);
    return callback(null, body.users);
  });
};

ReviewBoard.prototype.createReviewRequest = function(options, callback) {
  var form = {repository: this.repository};
  if (options.commitId) {
    form.commit_id = options.commitId
  }

  var req = {
    url: '/api/review-requests/',
    method: 'POST',
    json: true,
    form: form
  };
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
  var requestOptions = {
    url: url,
    method: 'POST',
    json: true
  };
  var req = this._request(requestOptions, function(err, body) {
    if (err) return callback(err);
    return callback(null, body.diff);
  });
  var form = req.form();
  form.append('path', options.path, {filename: 'patch.diff'});

  if (options.baseCommitId) {
    form.append('base_commit_id', options.baseCommitId);
  }
};

ReviewBoard.prototype.createReviewRequestDraft = function(reviewRequestId, options, callback) {
  var url = '/api/review-requests/' + reviewRequestId + '/draft/';

  var form = {public: 'true'};
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

  var req = {
    url: url,
    method: 'POST',
    json: true,
    form: form
  };
  return this._request(req, function(err, body) {
    if (err) return callback(err);
    return callback(null, body.draft);
  });
};

ReviewBoard.prototype.updateReviewRequest = function(reviewRequestId, options, callback) {
  var url = '/api/review-requests/' + reviewRequestId + '/';
  var req = {
    url: url,
    method: 'PUT',
    json: true,
    form: options
  };
  return this._request(req, function(err, body) {
    if (err) return callback(err);
    return callback(null, body.review_request);
  });
};

ReviewBoard.prototype.deleteReviewRequest = function(reviewRequestId, callback) {
  var url = '/api/review-requests/' + reviewRequestId + '/';
  var req = {
    url: url,
    method: 'DELETE',
    json: true
  };
  return this._request(req, callback);
};

ReviewBoard.prototype._request = function(options, callback) {
  options.url = this.url + options.url;
  options.auth = {
    username: this.username,
    password: this.password
  };
  return request(options, function(err, res, body) {
    if (err) return callback(err);
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

function commify(list) {
  return Array.isArray(list) ? list.join(',') : list;
}
