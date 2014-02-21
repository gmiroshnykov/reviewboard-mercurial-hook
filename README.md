reviewboard-mercurial-hook
==========================

This Mercurial `changegroup` hook creates Review Board review requests.


Usage
-----

1. Install requirements via pip:

        pip install -r requirements.txt

2. Add the following lines to your Mercurial server's `.hg/hgrc`:

        [hooks]
        changegroup = /path/to/reviewboard-mercurial-hook/changegroup.py

3. Make some local commits and push them like this:

        $ hg push -v
        pushing to http://localhost:8000/
        searching for changes
        2 changesets found
        remote: adding changesets
        remote: adding manifests
        remote: adding file changes
        remote: added 2 changesets with 2 changes to 1 files
        remote: Review request: http://localhost:8080/r/26/
        remote: Review request: http://localhost:8080/r/27/

TODO
----

1. Figure out a way to map changesets to named branches / bookmarks / mqs?
2. Automatically generate squashed commit and dependency relations
(like https://github.com/mikeconley/rb-repo)
3. Submit review requests on author's behalf using `submit_as`
4. Extract hardcoded config vars
5. Use `$HG` instead of relying on `hg` binary being present in `$PATH`
