#!/usr/bin/env python
import os
import requests
from subprocess import check_output

RB_ENDPOINT = 'http://admin:admin@localhost:8080/api'
RB_REPOSITORY = 1

def get_changesets(node):
  """Returns the list of changesets by node ID"""
  cmd = ["hg", "log",
    "--rev",  node + ":",
    "--template", '{node}\n']
  output = check_output(cmd)
  return output.splitlines()

def get_diff(changeset):
  """Returns the diff of the given changeset"""
  cmd = ["hg", "export", "--git", "--rev", changeset]
  return check_output(cmd)

def find_or_create_review_request(changeset):
  """Finds the review request by changeset via RB API.
  If the review request is not found, creates one.
  """
  review_request = api_find_review_request_by_commit_id(changeset)
  if review_request is None:
    review_request = api_create_review_request(changeset)
  return review_request

def api_find_review_request_by_commit_id(commit_id):
  """Finds review request by commit ID"""
  url = RB_ENDPOINT + '/review-requests/'
  params = {
    'repository': RB_REPOSITORY,
    'commit-id': commit_id,
    'max-results': 1,
  }
  r = requests.get(url, params=params)
  r.raise_for_status()
  response = r.json()
  return (response['total_results'] and response['review_requests'][0]) or None

def api_create_review_request(commit_id):
  """Creates review request for the given commit ID"""
  url = RB_ENDPOINT + '/review-requests/'
  params = {
    'repository': RB_REPOSITORY,
    'commit_id': commit_id,
  }
  r = requests.post(url, data=params)
  r.raise_for_status()
  response = r.json()
  return response['review_request']

def api_upload_diff(review_request_id, diff):
  """Uploads diff for the given review request"""
  url = RB_ENDPOINT + '/review-requests/' + str(review_request_id) + '/draft/diffs/'
  files = {
    'path': diff
  }
  r = requests.post(url, files=files)
  r.raise_for_status()
  return r.json()

def main():
  node = os.environ['HG_NODE']
  changesets = get_changesets(node)
  for changeset in changesets:
    review_request = find_or_create_review_request(changeset)
    diff = get_diff(changeset)
    api_upload_diff(review_request['id'], diff)

    print "Review request: %s" % review_request['absolute_url']

if __name__ == '__main__':
  main()
