# Security maintenance

This repository uses a pull-request security workflow. It scans the current source with secret values redacted and runs supported local application checks without production credentials. It does not run data ingestion, dbt transformations, migrations or deployments.

Do not commit passwords, private keys, certificates containing private keys, access tokens, production settings or personal data. Keep examples fictitious and use approved secret storage. A successful scan does not prove that history contains no secrets. Historical exposures require separate credential revocation and coordinated cleanup.

Report suspected exposures privately to the designated IT/security owner; do not put secret values in issues, comments or logs. The named owner and reporting route must be assigned before this policy is considered complete.

## Production changes

Use pull requests and passing checks before merging. Deployment workflow changes in this proposal limit automatic SWA deployment to pushes to main; pull requests validate code without deploying previews. Existing preview environments are not deleted.

Required reviewers, branch protection and a narrowly scoped emergency bypass must be configured after the checks have passed and the organisation/plan supports them. Emergency bypass is for recovery when normal review/checks are unavailable; record the reason and review the change afterwards. It should not be the routine merge path.

## Outstanding ownership

- Business owner: to be assigned
- Technical maintainer: to be assigned
- Security contact: to be assigned
- Lifecycle and production status: to be confirmed
- Deployment/recovery instructions: to be verified by the maintainer
