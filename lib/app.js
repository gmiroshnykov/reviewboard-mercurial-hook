var _ = require('lodash'),
    async = require('async');

var config = require('../config');
var services = require('./services'),
    repository = services.repository,
    reviewboard = services.reviewboard,
    bugzilla = services.bugzilla;

function validate(params, callback) {
  return async.parallel([
    validateBugId.bind(null, params.bugId),
    validateAuth.bind(null, params.auth)
  ], callback);
}
exports.validate = validate;

function validateBugId(bugId, callback) {
  return bugzilla.getBug(bugId, function(err, bug) {
    if (err) return callback(err);
    if (!bug) return callback(new Error('bug not found'));
    return callback();
  });
}

function validateAuth(auth, callback) {
  var options = {
    auth: auth
  };
  return reviewboard.getSession(options, function(err, session) {
    if (err) return callback(err);
    if (!session || !session.authenticated) {
      return callback(new Error('invalid credentials'));
    }

    return callback();
  });
}

/**
 * This is the main function that handles incoming changegroup during push.
 * @param  auth     authentication credentials - object with two keys: `username` and `password`
 * @param  bugId    Bugzilla bug number
 * @param  node     ID of the first incoming changeset (see Mercurial docs on pretxnchangegroup hook)
 */
function processChangegroup(auth, bugId, node, callback) {
  // console.log('auth:', auth);
  // console.log('Bug ID:', bugId);
  // console.log('Node:', node);

  return async.auto({
    bug: getBugzillaInfo.bind(null, bugId),
    parentReviewRequest: getOrCreateParentReviewRequest.bind(null, auth, bugId),
    oldReviewRequests: ['parentReviewRequest', function(cb, results) {
      getReviewRequestsByParentReviewRequest(auth, results.parentReviewRequest, cb);
    }],
    oldChangesets: ['oldReviewRequests', function(cb, results) {
      getChangesetsByReviewRequests(results.oldReviewRequests, cb);
    }],
    newChangesets: getIncomingChangesets.bind(null, node),
    newReviewRequests: ['newChangesets', function(cb, results) {
      getOrCreateReviewRequests(auth, results.newChangesets, cb);
    }]
  }, function(err, results) {
    if (err) return callback(err);

    return updateParentReviewRequest(auth, results, function(err, parentReviewRequest) {
      if (err) return callback(err);

      return callback(null, parentReviewRequest);
    });
  });
}
exports.processChangegroup = processChangegroup;

function getIncomingChangesets(node, callback) {
  var revset = node + ':';
  return getChangesetsByRevset(revset, callback);
}

function getBugzillaInfo(bugId, callback) {
  var options = {
    includeFields: ['id', 'summary']
  };
  return bugzilla.getBug(bugId, options, function(err, bug) {
    if (err) return callback(err);
    if (!bug) {
      var msg = 'Bug ' + bugId + ' not found';
      return callback(new Error(msg));
    }

    return callback(null, bug);
  });
}

function getOrCreateReviewRequests(auth, changesets, callback) {
  return async.mapLimit(changesets,
    config.ASYNC_LIMIT,
    getOrCreateReviewRequest.bind(null, auth),
    callback);
}

function getOrCreateReviewRequest(auth, changeset, callback) {
  return getReviewRequestByChangeset(auth, changeset, function(err, reviewRequest) {
    if (err) return callback(err);
    if (reviewRequest) return callback(null, reviewRequest);
    return createReviewRequest(auth, changeset, callback);
  });
}

function getReviewRequestByChangeset(auth, changeset, callback) {
  var options = {
    auth: auth,
    commitId: changeset.node
  };
  return reviewboard.findReviewRequest(options, callback);
}

function createReviewRequest(auth, changeset, callback) {
  var options = {
    auth: auth,
    commitId: changeset.node
  };
  return reviewboard.createReviewRequest(options, function(err, reviewRequest) {
    if (err) return callback(err);

    return createReviewRequestDraft(auth, reviewRequest.id, changeset, callback);
  });
}

function createReviewRequestDraft(auth, reviewRequestId, changeset, callback) {
  // get the changeset diff
  var options = {
    rev: changeset.node
  };
  return repository.export(options, function(err, diff) {
    if (err) return callback(err);

    // attach changeset diff to review request
    var options = {
      auth: auth,
      path: diff
    };
    return reviewboard.uploadDiff(reviewRequestId, options, function(err) {
      if (err) return callback(err);

      // set review request details by creating review request draft
      var options = {
        auth: auth,
        commitId: changeset.node,
        summary: changeset.summary,
        description: changeset.spillover
      };
      return reviewboard.createReviewRequestDraft(reviewRequestId, options,
        function(err) {
          if (err) return callback(err);

          // read back fresh review request details
          var options = {
            auth: auth
          };
          return reviewboard.getReviewRequest(reviewRequestId, options, callback);
        }
      );
    });
  });
}

function getOrCreateParentReviewRequest(auth, bugId, callback) {
  return getParentReviewRequest(auth, bugId, function(err, parentReviewRequest) {
    if (err) return callback(err);
    if (parentReviewRequest) return callback(null, parentReviewRequest);

    // FIXME: RB API won't allow us to search for existing review requests
    // by bug number, so we have to abuse commit_id field instead
    var options = {
      auth: auth,
      commitId: 'bug-' + bugId
    };
    return reviewboard.createReviewRequest(options, callback);
  });
}

function getParentReviewRequest(auth, bugId, callback) {
  // FIXME: RB API won't allow us to search for existing review requests
  // by bug number, so we have to abuse commit_id field instead
  var options = {
    auth: auth,
    commitId: 'bug-' + bugId
  };
  return reviewboard.findReviewRequest(options, callback);
}

function getReviewRequestsByParentReviewRequest(auth, parentReviewRequest, callback) {
  if (!parentReviewRequest || !parentReviewRequest.depends_on) {
    return callback(null, []);
  }

  var reviewRequestIds = parentReviewRequest.depends_on.map(extractIdFromUrl);
  return getReviewRequests(auth, reviewRequestIds, callback);
}

function getReviewRequests(auth, ids, callback) {
  return async.mapLimit(ids,
    config.ASYNC_LIMIT,
    getReviewRequest.bind(null, auth),
    callback);
}

function getReviewRequest(auth, id, callback) {
  var options = {
    auth: auth
  };
  return reviewboard.getReviewRequest(id, options, callback);
}

function updateParentReviewRequest(auth, context, callback) {
  var parentReviewRequestId = context.parentReviewRequest.id;
  var changesets = context.oldChangesets.concat(context.newChangesets);
  return createParentReviewRequestDiff(auth, parentReviewRequestId, changesets,
    function(err) {
      if (err) return callback(err);

      var reviewRequests = _(context.oldReviewRequests)
        .concat(context.newReviewRequests)
        .uniq('id').value();
      var bug = context.bug;
      return createParentReviewRequestDraft(auth, parentReviewRequestId,
        reviewRequests, bug, function(err) {
          if (err) return callback(err);

          // read back fresh review request details
          var options = {
            auth: auth
          };
          return reviewboard.getReviewRequest(parentReviewRequestId, options, callback);
        }
      );
    }
  );
}

function createParentReviewRequestDiff(auth, parentReviewRequestId, changesets,
  callback)
{
  // FIXME: not sure simply sorting by 'rev' is the right way to do it
  changesets = _.sortBy(changesets, 'rev');
  firstChangeset = _.first(changesets);
  lastChangeset = _.last(changesets);

  return getParentChangeset(firstChangeset.node, function(err, parentChangeset) {
    if (err) return callback(err);
    if (!parentChangeset) {
      var msg = 'could not find parent changeset of ' + firstChangeset.node;
      return callback(new Error(msg));
    }

    var options = {
      rev: parentChangeset.node + '::' + lastChangeset.node
    };
    return repository.diff(options, function(err, diff) {
      if (err) return callback(err);

      var options = {
        auth: auth,
        path: diff,
        baseCommitId: parentChangeset.node
      };

      return reviewboard.uploadDiff(parentReviewRequestId, options, callback);
    });
  });
}

function createParentReviewRequestDraft(auth, parentReviewRequestId, reviewRequests,
  bug, callback)
{
  reviewRequests = _.sortBy(reviewRequests, 'id');

  var summary = 'Bug ' + bug.id + ': ' + bug.summary;
  var description = _.map(reviewRequests, function(reviewRequest) {
    return '/r/' + reviewRequest.id + ' - ' + reviewRequest.summary;
  }).join("\n");

  var options = {
    auth: auth,
    summary: summary,
    description: description,
    bugsClosed: bug.id,
    dependsOn: _.map(reviewRequests, 'id').sort()
  };
  return reviewboard.createReviewRequestDraft(parentReviewRequestId,
    options, callback);
}

function getParentChangeset(node, callback) {
  var revset = node + '^';
  return getChangesetsByRevset(revset, function(err, changesets) {
    if (err) return callback(err);
    if (changesets.lenght === 0) return callback();
    return callback(null, changesets[0]);
  });
}

function getChangesetsByReviewRequests(reviewRequests, callback) {
  var nodes = _.pluck(reviewRequests, 'commit_id');
  return getChangesetsByNodes(nodes, callback);
}

function getChangesetsByNodes(nodes, callback) {
  return async.map(nodes, getChangesetByNode, callback);
}

function getChangesetByNode(node, callback) {
  return getChangesetsByRevset(node, function(err, changesets) {
    if (err) return callback(err);
    if (changesets.lenght === 0) return callback();
    return callback(null, changesets[0]);
  });
}

function getChangesetsByRevset(revset, callback) {
  var fields = {
    id: 'node|short',
    node: 'node',
    rev: 'rev',
    author: 'author',
    user: 'author|user',
    date: 'date|isodatesec',
    description: 'desc|urlescape'
  };

  var template = '';
  for (var k in fields) {
    template += k + ':{' + fields[k] + '}\n';
  }
  template += '\n';

  var logOptions = {
    rev: revset,
    template: template
  };
  return repository.logRaw(logOptions, function(err, output) {
    if (err) return callback(err);

    var commits = output
      .split("\n\n")
      .map(parseCommitFromLines);

    commits = commits.map(_.compose(mapCommitSummary, mapCommitRev));
    return callback(null, commits);
  });
}

function parseCommitFromLines(rawLines) {
  var lines = rawLines.split("\n");
  return _.reduce(lines, reduceCommitLine, {});
}

function reduceCommitLine(commit, line) {
  var offset = line.indexOf(':');
  if (offset === -1) {
    throw new Error('invalid commit line: ' + line);
  }

  var key = line.substr(0, offset);
  var value = decodeURIComponent(line.substr(offset + 1));
  commit[key] = value;
  return commit;
}

function mapCommitSummary(commit) {
  if (commit.description) {
    var parts = parseCommitDescription(commit.description);
    commit.summary = parts[0];
    commit.spillover = parts[1];
  }
  return commit;
}

function mapCommitRev(commit) {
  if (commit.rev) {
    commit.rev = parseInt(commit.rev, 10);
  }
  return commit;
}

/**
 * Split commit description into summary (first line)
 * and spillover (the rest of the lines)
 */
function parseCommitDescription(description) {
  var offset = description.indexOf("\n");
  if (offset === -1) {
    return [description, ""];
  }

  var summary = description.substr(0, offset).trim();
  var spillover = description.substr(offset + 1).trim();
  return [summary, spillover];
}

/**
 * Extracts ID from the API resource link
 *
 * Example:
 * Input: {href: "http://reviewboard.example.org/api/review-requests/42/"}
 * Output: 42
 *
 * @param  string link
 * @return number
 */
function extractIdFromUrl(link) {
  var parts = link.href.split('/');
  var id = _(parts).compact().last();
  return parseInt(id, 10);
}
