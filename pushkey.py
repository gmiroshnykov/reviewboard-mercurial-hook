#!/usr/bin/env python
import os
import sys
import hglib
from rbtools.api.client import RBClient

MASTER_BOOKMARK = 'master'
try:
    RB_URL = os.environ['RB_URL']
    RB_USERNAME = os.environ['RB_USERNAME']
    RB_PASSWORD = os.environ['RB_PASSWORD']
    RB_REPOSITORY = int(os.environ['RB_REPOSITORY'])
except KeyError:
    print "ERROR: the following environment variables must be set:"
    print "RB_URL, RB_USERNAME, RB_PASSWORD, RB_REPOSITORY"
    sys.exit(1)

rb_client = RBClient(RB_URL,
    username=RB_USERNAME,
    password=RB_PASSWORD)
rb_root = rb_client.get_root()
hg_client = hglib.open(os.getcwd())

def refresh_review_request(bookmark):
    log_revset = get_log_revset(bookmark)
    changesets = hg_client.log(log_revset)
    if not changesets:
        # brand new bookmark - no commits yet
        return

    review_requests = [refresh_changeset(bookmark, c) for c in changesets]
    if len(review_requests) == 1:
        # do not create a squashed commit when there's only one commit in the bookmark
        return review_requests[0]

    diff_revset = get_diff_revset(bookmark)
    squashed = refresh_squashed(bookmark, diff_revset, review_requests)
    return squashed

def refresh_changeset(bookmark, changeset):
    response = rb_root.get_review_requests(commit_id=changeset.node)
    if response.total_results:
        # review request for this changeset already exists
        return response[0]

    review_request = response.create(repository=RB_REPOSITORY)

    # upload the diff
    diff = hg_client.export(changeset.node)
    rb_diffs = review_request.get_diffs()
    rb_diff = rb_diffs.upload_diff(diff)

    # update draft
    description = changeset.desc
    summary = description.splitlines()[0]

    rb_draft = review_request.get_draft()
    rb_draft.update(
        commit_id=changeset.node,
        summary=summary,
        description=description,
        branch=bookmark,
        bugs_closed="TODO-BUG-HERE",
        public=True)

    # re-read review request
    review_request = rb_root.get_review_requests(commit_id=changeset.node)[0]
    return review_request

def refresh_squashed(bookmark, revset, review_requests):
    squashed_review_request = None
    response = rb_root.get_review_requests(commit_id=bookmark)
    if response.total_results:
        # squashed review request for this changeset already exists
        squashed_review_request = response[0]
    else:
        squashed_review_request = response.create(repository=RB_REPOSITORY)

    # find base changeset
    base = hg_client.log(revset)[0]

    # upload the diff
    diff = hg_client.diff(revs=revset)
    rb_diffs = squashed_review_request.get_diffs()
    rb_diff = rb_diffs.upload_diff(diff, base_commit_id=base.node)

    # update draft
    summary = "Squashed commits for %s" % bookmark
    description = []
    for request in review_requests:
        description.append("/r/%s - %s" % (request['id'], request['summary']))
    description = '\n'.join(description)

    rb_draft = squashed_review_request.get_draft()
    rb_draft.update(
        commit_id=bookmark,
        summary=summary,
        description=description,
        branch=bookmark,
        depends_on=','.join([str(r.id) for r in review_requests]),
        bugs_closed="TODO-BUG-HERE",
        public=True)

    return squashed_review_request

def get_log_revset(bookmark):
    return '::"%s" and not ::"%s"' % (bookmark, MASTER_BOOKMARK)

def get_diff_revset(bookmark):
    return '"%s":"%s"' % (MASTER_BOOKMARK, bookmark)

def extract_summary(changeset):
    return changeset.desc()

def main():
    namespace = os.environ['HG_NAMESPACE']
    if namespace != 'bookmarks':
        # we're only interested in bookmarks
        return

    new = os.environ['HG_NEW']
    old = os.environ['HG_OLD']
    if new == old:
        # we're only interested if bookmark has changed
        return

    key = os.environ['HG_KEY']
    if key == MASTER_BOOKMARK:
        # we're not interested in master bookmark
        return

    squashed = refresh_review_request(key)
    if squashed:
        print "Code Review Request: %s" % squashed.absolute_url

if __name__ == '__main__':
    main()
