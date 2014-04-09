reviewboard-mercurial-hook
==========================

This Mercurial `pretxnchangegroup` hook creates Review Board review requests.


Requirements
------------

* Node.js v0.10+
* Mercurial (tested on v2.9)
* ReviewBoard 2.0+ (tested on v2.0rc1)


Setup
-----

1. Apply [the patch](https://gist.github.com/laggyluke/a7f9b082ad7db95ab564)
    to your Review Board instance.
2. Create (or clone) a Mercurial repository in the local filesystem.
    This will be a "review" repository.
3. Add the review repository to ReviewBoard using local filesystem (not SSH or HTTPS!)
4. [optional] Install rbbz extension and configure Buzilla authentication:
    * XMLRPC URL: `https://bugzilla.mozilla.org/xmlrpc.cgi`
4. Run `npm install`.
5. Add the following hook to the `.hg/hgrc` file in the review repository:

        [hooks]
        pretxnchangegroup = /usr/bin/env \
          REVIEWBOARD_URL=http://rb.dev \
          REVIEWBOARD_REPOSITORY=1 \
          /path/to/reviewboard-mercurial-hook/bin/pretxnchangegroup

6. Add the following line to `/etc/ssh/sshd_config`:

        AcceptEnv RT_*

7. Restart SSH service:

        sudo restart ssh


Usage
-----

* Clone the review repository via SSH.

* Make a commit and push using special command:

        $ RT_BUG=31337 RT_USERNAME=admin RT_PASSWORD=admin hg push -e 'ssh -o SendEnv=RT_*'
        pushing to ssh://rb.dev//path/to/repository
        searching for changes
        remote: adding changesets
        remote: adding manifests
        remote: adding file changes
        remote: added 1 changesets with 1 changes to 1 files
        remote: Review Request: http://rb.dev/r/42/

* Observe a code review URL in the output above

* Add another commit and push again:

        $ RT_BUG=31337 RT_USERNAME=admin RT_PASSWORD=admin hg push -e 'ssh -o SendEnv=RT_*'
        pushing to ssh://rb.dev//path/to/repository
        searching for changes
        remote: adding changesets
        remote: adding manifests
        remote: adding file changes
        remote: added 1 changesets with 1 changes to 1 files
        remote: Review Request: http://rb.dev/r/42/

* The code review will be updated, but the URL will remain the same.


TODO
----

* Hide the ugly push dance behind `mach` command.
