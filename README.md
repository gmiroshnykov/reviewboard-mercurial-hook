reviewboard-mercurial-hook
==========================

This Mercurial `pushkey` hook creates Review Board review requests.


Usage
-----

1. Install requirements via pip:

        pip install -r requirements.txt

2. Add the following lines to your Mercurial server's `.hg/hgrc`:

        [hooks]
        pushkey = /path/to/reviewboard-mercurial-hook/pushkey.py

3. Copy `config.example.py` to `config.py` and customize it

4. Create a `master` bookmark in your Mercurial repository and push it upstream:

        $ hg bookmark master
        $ hg push -B master
        pushing to http://localhost:8000/
        searching for changes
        no changes found
        exporting bookmark master

5. Create a feature bookmark and make a couple of commits:

        $ hg bookmark feature_123

6. Make a commit and push

        $ hg push -B feature_123
        pushing to http://localhost:8000/
        searching for changes
        remote: adding changesets
        remote: adding manifests
        remote: adding file changes
        remote: added 1 changesets with 1 changes to 1 files
        remote: Code Review Request: http://localhost:8080/r/2/
        updating bookmark feature_1234
        exporting bookmark feature_1234

7. Observe a code review request URL in the output above

8. Add another commit and push

        $ hg push -B feature_123
        pushing to http://localhost:8000/
        searching for changes
        remote: adding changesets
        remote: adding manifests
        remote: adding file changes
        remote: added 1 changesets with 1 changes to 1 files
        remote: Code Review Request: http://localhost:8080/r/2/
        updating bookmark feature_1234
        exporting bookmark feature_1234

9. The code review URL leading to a squashed commit does not change.

TODO
----

1. Do not squash a single commit
2. Extract bug ID from bookmark name or commit message
3. Submit review requests on author's behalf using `submit_as`
