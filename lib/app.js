var _ = require('lodash'),
    async = require('async');

var config = require('../config');
var services = require('./services'),
    repository = services.repository(),
    bugzilla = services.bugzilla(),
    reviewboard = null;

/**
 * This is the main function that handles incoming changegroup during push.
 * @param  bugId    Bugzilla bug number
 * @param  node     ID of the first incoming changeset (see Mercurial docs on pretxnchangegroup hook)
 */
function processChangegroup(username, password, bugId, node, callback) {
  console.log('username:', username);
  console.log('password:', password);
  console.log('Bug ID:', bugId);
  console.log('Node:', node);

  reviewboard = services.reviewboard(username, password);

  return async.auto({
    bug: getBugzillaInfo.bind(null, bugId),
    baseChangeset: getParentChangeset.bind(null, node),
    parentReviewRequest: getOrCreateParentReviewRequest.bind(null, bugId),
    oldReviewRequests: ['parentReviewRequest', function(cb, results) {
      getReviewRequestsByParentReviewRequest(results.parentReviewRequest, cb);
    }],
    oldChangesets: ['oldReviewRequests', function(cb, results) {
      getChangesetsByReviewRequests(results.oldReviewRequests, cb);
    }],
    newChangesets: getIncomingChangesets.bind(null, node),
    newReviewRequests: ['baseChangeset', 'newChangesets', function(cb, results) {
      updateReviewRequests(results.baseChangeset, results.newChangesets, cb);
    }]
  }, function(err, results) {
    if (err) return callback(err);

    return updateParentReviewRequest(results, function(err, parentReviewRequest) {
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

function updateReviewRequests(baseChangeset, changesets, callback) {
  return async.mapLimit(changesets,
    config.ASYNC_LIMIT,
    updateReviewRequest.bind(null, baseChangeset),
    callback);
}

function updateReviewRequest(baseChangeset, changeset, callback) {
  return getOrCreateReviewRequest(changeset, function(err, reviewRequest) {
    if (err) return callback(err);

    var reviewRequestId = reviewRequest.id;
    return createReviewRequestDiff(reviewRequestId,
      baseChangeset, changeset,
      function(err) {
        if (err) return callback(err);

        return createReviewRequestDraft(reviewRequestId, changeset,
          function(err) {
            if (err) return callback(err);

            // read back fresh review request details
            return reviewboard.getReviewRequest(reviewRequestId, callback);
          }
        );
      }
    );
  });
}

function getOrCreateReviewRequest(changeset, callback) {
  return getReviewRequest(changeset, function(err, reviewRequest) {
    if (err) return callback(err);
    if (reviewRequest) return callback(null, reviewRequest);

    var options = {
      commitId: changeset.node
    };
    return reviewboard.createReviewRequest(options, callback);
  });
}

function getReviewRequest(changeset, callback) {
  var options = {
    commitId: changeset.node
  };
  return reviewboard.findReviewRequest(options, callback);
}

function createReviewRequestDiff(reviewRequestId, baseChangeset,
  changeset, callback)
{
  // get the parent diff
  return getParentDiff(baseChangeset, changeset, function(err, parentDiff) {
    if (err) return callback(err);

    // get the changeset diff
    var options = {
      rev: changeset.node
    };
    return repository.export(options, function(err, diff) {
      if (err) return callback(err);

      // attach changeset diff to review request
      var options = {
        baseCommitId: baseChangeset.node,
        parentDiffPath: parentDiff,
        path: diff
      };
      return reviewboard.uploadDiff(reviewRequestId, options, function(err) {
        if (err) {
          console.log('options:', options);
        }
        return callback(err);
      });
    });
  });
}

function getParentDiff(baseChangeset, changeset, callback) {
  return getParentChangeset(changeset.node, function(err, parentChangeset) {
    if (err) return callback(err);

    var options = {
      rev: baseChangeset.node + '::' + parentChangeset.node
    };
    return repository.diff(options, callback);
  });
}

function createReviewRequestDraft(reviewRequestId, changeset, callback) {
  var options = {
    commitId: changeset.node,
    summary: changeset.summary,
    description: changeset.spillover
  };
  return reviewboard.createReviewRequestDraft(reviewRequestId, options, callback);
}

function getOrCreateParentReviewRequest(bugId, callback) {
  return getParentReviewRequest(bugId, function(err, parentReviewRequest) {
    if (err) return callback(err);
    if (parentReviewRequest) return callback(null, parentReviewRequest);

    // FIXME: RB API won't allow us to search for existing review requests
    // by bug number, so we have to abuse commit_id field instead
    var options = {
      commitId: 'bug-' + bugId
    };
    return reviewboard.createReviewRequest(options, callback);
  });
}

function getParentReviewRequest(bugId, callback) {
  // FIXME: RB API won't allow us to search for existing review requests
  // by bug number, so we have to abuse commit_id field instead
  var options = {
    commitId: 'bug-' + bugId
  };
  return reviewboard.findReviewRequest(options, callback);
}

function getReviewRequestsByParentReviewRequest(parentReviewRequest, callback) {
  if (!parentReviewRequest || !parentReviewRequest.depends_on) {
    return callback(null, []);
  }

  var reviewRequestIds = parentReviewRequest.depends_on.map(extractIdFromUrl);
  return getReviewRequests(reviewRequestIds, callback);
}

function getReviewRequests(ids, callback) {
  var getReviewRequest = reviewboard.getReviewRequest.bind(reviewboard);
  return async.mapLimit(ids, config.ASYNC_LIMIT, getReviewRequest, callback);
}

function updateParentReviewRequest(context, callback) {
  var parentReviewRequestId = context.parentReviewRequest.id;
  var changesets = context.oldChangesets.concat(context.newChangesets);
  return createParentReviewRequestDiff(parentReviewRequestId, changesets,
    function(err) {
      if (err) return callback(err);

      var reviewRequests = _(context.oldReviewRequests)
        .concat(context.newReviewRequests)
        .uniq('id').value();
      var bug = context.bug;
      return createParentReviewRequestDraft(parentReviewRequestId,
        reviewRequests, bug, function(err) {
          if (err) return callback(err);

          // read back fresh review request details
          return reviewboard.getReviewRequest(parentReviewRequestId, callback);
        }
      );
    }
  );
}

function createParentReviewRequestDiff(parentReviewRequestId, changesets,
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
        path: diff,
        baseCommitId: parentChangeset.node
      };

      return reviewboard.uploadDiff(parentReviewRequestId, options, callback);
    });
  });
}

function createParentReviewRequestDraft(parentReviewRequestId, reviewRequests,
  bug, callback)
{
  reviewRequests = _.sortBy(reviewRequests, 'id');

  var summary = 'Bug ' + bug.id + ': ' + bug.summary;
  var description = _.map(reviewRequests, function(reviewRequest) {
    return '/r/' + reviewRequest.id + ' - ' + reviewRequest.summary;
  }).join("\n");

  var options = {
    summary: summary,
    description: description,
    bugsClosed: bug.id,
    dependsOn: _.map(reviewRequests, 'id')
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
