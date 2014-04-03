var execFile = require('child_process').execFile;
var _ = require('lodash');

function Repository(path) {
  this.path = path;
  this.bin = 'hg';
}
module.exports = Repository;

Repository.prototype.log = function(options, callback) {
  var self = this;
  return self.logRaw(options, function(err, output) {
    if (err) return callback(err);

    try {
      var changesets = parseChangesets(output);
    } catch (e) {
      return callback(e);
    }

    return callback(null, changesets);
  });
};

Repository.prototype.logRaw = function(options, callback) {
  if (typeof(options) === 'function') {
    callback = options;
    options = {};
  }

  var cmd = ['log'];

  if (options.template) {
    cmd.push('--template', options.template);
  }

  if (options.rev) {
    cmd.push('--rev', options.rev);
  }

  if (!options.limit) {
    options.limit = 100;
  }
  cmd.push('--limit', options.limit);

  return this._exec(cmd, callback);
};

Repository.prototype.diff = function(options, callback) {
  if (typeof(options) === 'function') {
    callback = options;
    options = {};
  }

  var cmd = ['diff'];

  if (options.rev) {
    cmd.push('--rev', options.rev);
  }

  cmd.push('--git');

  return this._exec(cmd, callback);
};

Repository.prototype.export = function(options, callback) {
  if (typeof(options) === 'function') {
    callback = options;
    options = {};
  }

  var cmd = ['export']

  if (options.rev) {
    cmd.push('--rev', options.rev);
  }

  cmd.push('--git');

  return this._exec(cmd, callback);
};

Repository.prototype._exec = function(cmd, callback) {
  var options = {
    cwd: this.path
  };
  return execFile(this.bin, cmd, options, function(err, stdout, stderr) {
    if (err) return callback(err);
    stdout = stdout.trim();
    return callback(null, stdout);
  });
};

function parseChangesets(output) {
  var rawChangesets = output.split("\n\n");
  rawChangesets = _.filter(rawChangesets);
  return rawChangesets.map(parseChangeset);
}

function parseChangeset(rawChangeset) {
  var changeset = {};
  var lines = rawChangeset.split("\n");
  var tuples = lines.forEach(function(line) {
    var tuple = parseChangesetLine(line);
    changeset[tuple[0]] = tuple[1];
  });

  if (changeset.changeset) {
    var parts = parseChangesetName(changeset.changeset);
    changeset.id = parts[1];
    changeset.rev = parts[0];
  }

  return changeset;
}

function parseChangesetLine(line) {
  var offset = line.indexOf(':');
  if (offset === -1) {
    throw new Error('Invalid changeset line: ' + line);
  }

  var key = line.substr(0, offset).trim();
  var value = line.substr(offset + 1).trim();
  return [key, value];
}

function parseChangesetName(name) {
  return name.split(':');
}
